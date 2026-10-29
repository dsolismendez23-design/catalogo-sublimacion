const { app, BrowserWindow, ipcMain, shell, protocol, net, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const drive = require('./drive');
const { htmlPedido } = require('./pdf');
const { generarMovil } = require('./movil');

// Datos de la app (AppData\Roaming\Catalogo Sublimacion): índice del catálogo, configuración, pedidos y miniaturas
const DATOS = app.getPath('userData');
const ARCH_CATALOGO = path.join(DATOS, 'catalogo.json');
const ARCH_CONFIG = path.join(DATOS, 'config.json');
const ARCH_PEDIDOS = path.join(DATOS, 'pedidos.json');
const DIR_MINIATURAS = path.join(DATOS, 'miniaturas');
// Los PDF de pedidos quedan en Documentos\Pedidos Sublimacion
const DIR_PDF = path.join(app.getPath('documents'), 'Pedidos Sublimacion');

const CONFIG_INICIAL = {
  enlaceDrive: drive.ENLACE_RAIZ,
  negocio: 'MODATEX Sublimado',
  whatsapp: '',
};

function leerJSON(file, defecto) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return defecto; }
}
function guardarJSON(file, datos) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(datos), 'utf-8');
  fs.renameSync(file + '.tmp', file);
}
const leerConfig = () => ({ ...CONFIG_INICIAL, ...leerJSON(ARCH_CONFIG, {}) });

// ---------- Miniaturas: miniatura://img/<id>?sz=400 se sirve desde disco o se baja de Drive y se guarda ----------
// (el id va en la ruta y no como "host", porque el host se pasa a minúsculas y los id de Drive distinguen mayúsculas)
protocol.registerSchemesAsPrivileged([
  { scheme: 'miniatura', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const descargando = new Map();
async function miniatura(id, sz) {
  const file = path.join(DIR_MINIATURAS, `${id}_${sz}.jpg`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const clave = `${id}_${sz}`;
  if (!descargando.has(clave)) {
    descargando.set(clave, (async () => {
      const r = await net.fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w${sz}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(DIR_MINIATURAS, { recursive: true });
      fs.writeFileSync(file, buf);
      return buf;
    })().finally(() => descargando.delete(clave)));
  }
  return descargando.get(clave);
}

function registrarMiniaturas() {
  protocol.handle('miniatura', async (req) => {
    const u = new URL(req.url);
    const id = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    const sz = [200, 400, 1200].includes(+u.searchParams.get('sz')) ? +u.searchParams.get('sz') : 400;
    if (!/^[\w-]+$/i.test(id)) return new Response('', { status: 400 });
    try {
      const buf = await miniatura(id, sz);
      return new Response(buf, { headers: { 'content-type': 'image/jpeg' } });
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

// ---------- Catálogo ----------
let actualizando = null;
function actualizarCatalogo(win) {
  if (actualizando) return actualizando;
  const raiz = drive.idDesdeEnlace(leerConfig().enlaceDrive) || drive.CARPETA_RAIZ;
  actualizando = drive.recorrerCatalogo({
    raiz,
    fetchFn: (url) => net.fetch(url),
    progreso: (p) => { if (!win.isDestroyed()) win.webContents.send('catalogo:progreso', p); },
  })
    .then((r) => {
      // Si Drive no respondió nada (sin internet), no se borra el catálogo guardado
      if (!r.disenos.length && r.errores.length) throw new Error(r.errores[0].error);
      guardarJSON(ARCH_CATALOGO, r);
      return r;
    })
    .finally(() => { actualizando = null; });
  return actualizando;
}

// ---------- Pedidos ----------
function nombreArchivo(txt) {
  return String(txt).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

async function crearPDF(pedido) {
  const imagenes = {};
  await Promise.all(pedido.items.map(async (it) => {
    try { imagenes[it.id] = 'data:image/jpeg;base64,' + (await miniatura(it.id, 400)).toString('base64'); }
    catch { imagenes[it.id] = null; }
  }));
  const html = htmlPedido(pedido, imagenes, leerConfig().negocio);
  const tmp = path.join(DATOS, 'pedido_tmp.html');
  fs.writeFileSync(tmp, html, 'utf-8');
  const w = new BrowserWindow({ show: false });
  try {
    await w.loadFile(tmp);
    const pdf = await w.webContents.printToPDF({
      pageSize: 'Letter', printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    fs.mkdirSync(DIR_PDF, { recursive: true });
    const file = path.join(DIR_PDF,
      `Pedido ${String(pedido.numero).padStart(4, '0')} - ${nombreArchivo(pedido.cliente)} - ${pedido.fecha.slice(0, 10)}.pdf`);
    fs.writeFileSync(file, pdf);
    return file;
  } finally {
    w.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

// Copia el PDF al portapapeles como archivo (igual que "Copiar" en el Explorador) para pegarlo en WhatsApp con Ctrl+V
function copiarArchivo(file) {
  return new Promise((resolve) => {
    const ps = `Set-Clipboard -LiteralPath '${file.replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true },
      (err) => resolve(!err));
  });
}

function textoWhatsApp(p) {
  const lineas = [
    `*PEDIDO #${String(p.numero).padStart(4, '0')}*`,
    `Cliente: ${p.cliente}`,
    p.telefono ? `Teléfono: ${p.telefono}` : null,
    `Fecha: ${new Date(p.fecha).toLocaleString('es-CR')}`,
    `Diseños: ${p.items.length} · Unidades: ${p.items.reduce((s, i) => s + i.cantidad, 0)}`,
    '',
    ...p.items.map((i) => `• ${i.codigo} x${i.cantidad} (${i.ruta.join(' / ')})`),
    p.notas ? `\nNotas: ${p.notas}` : null,
    '',
    'Adjunto el PDF del pedido.',
  ];
  return lineas.filter((l) => l !== null).join('\n');
}

async function abrirWhatsApp(p) {
  const numero = String(leerConfig().whatsapp || '').replace(/\D/g, '');
  const texto = encodeURIComponent(textoWhatsApp(p));
  // WhatsApp de escritorio si está instalado; si no, WhatsApp Web en el navegador
  if (app.getApplicationNameForProtocol('whatsapp://')) {
    await shell.openExternal(`whatsapp://send?${numero ? `phone=${numero}&` : ''}text=${texto}`);
    return 'escritorio';
  }
  await shell.openExternal(numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`);
  return 'web';
}

// ---------- Ventana ----------
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#f5f3f8',
    title: 'Catálogo Sublimación',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(() => { registrarMiniaturas(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('catalogo:leer', () => leerJSON(ARCH_CATALOGO, null));
ipcMain.handle('catalogo:actualizar', async (e) => {
  try { return { ok: true, catalogo: await actualizarCatalogo(BrowserWindow.fromWebContents(e.sender)) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});

ipcMain.handle('config:leer', () => leerConfig());
ipcMain.handle('config:guardar', (_e, cambios) => {
  const cfg = { ...leerConfig(), ...cambios };
  if (!drive.idDesdeEnlace(cfg.enlaceDrive)) throw new Error('El enlace de Google Drive no es válido');
  guardarJSON(ARCH_CONFIG, cfg);
  return cfg;
});

ipcMain.handle('pedidos:leer', () => leerJSON(ARCH_PEDIDOS, { consecutivo: 0, lista: [] }).lista);

ipcMain.handle('pedidos:hacer', async (_e, datos) => {
  const reg = leerJSON(ARCH_PEDIDOS, { consecutivo: 0, lista: [] });
  const pedido = {
    numero: reg.consecutivo + 1,
    fecha: new Date().toISOString(),
    cliente: String(datos.cliente || '').trim(),
    telefono: String(datos.telefono || '').trim(),
    notas: String(datos.notas || '').trim(),
    items: datos.items.map((i) => ({
      id: i.id, codigo: i.codigo, nombre: i.nombre || '', ruta: i.ruta, cantidad: Math.max(1, parseInt(i.cantidad, 10) || 1),
    })),
  };
  if (!pedido.cliente) throw new Error('Falta el nombre');
  if (!pedido.items.length) throw new Error('El pedido no tiene diseños');
  pedido.pdf = await crearPDF(pedido);
  reg.consecutivo = pedido.numero;
  reg.lista.unshift(pedido);
  guardarJSON(ARCH_PEDIDOS, reg);
  const copiado = await copiarArchivo(pedido.pdf);
  const via = await abrirWhatsApp(pedido);
  return { pedido, copiado, via };
});

function buscarPedido(numero) {
  return leerJSON(ARCH_PEDIDOS, { lista: [] }).lista.find((p) => p.numero === numero);
}
ipcMain.handle('pedidos:enviar', async (_e, numero) => {
  const p = buscarPedido(numero);
  if (!p) throw new Error('Pedido no encontrado');
  if (!fs.existsSync(p.pdf)) p.pdf = await crearPDF(p);
  const copiado = await copiarArchivo(p.pdf);
  const via = await abrirWhatsApp(p);
  return { copiado, via };
});
ipcMain.handle('pedidos:copiar', async (_e, numero) => {
  const p = buscarPedido(numero);
  return p && fs.existsSync(p.pdf) ? copiarArchivo(p.pdf) : false;
});
ipcMain.handle('pedidos:abrirPDF', (_e, numero) => {
  const p = buscarPedido(numero);
  if (p && fs.existsSync(p.pdf)) return shell.openPath(p.pdf);
  return 'No se encontró el PDF';
});
ipcMain.handle('pedidos:mostrarPDF', (_e, numero) => {
  const p = buscarPedido(numero);
  if (p && fs.existsSync(p.pdf)) shell.showItemInFolder(p.pdf);
  else { fs.mkdirSync(DIR_PDF, { recursive: true }); shell.openPath(DIR_PDF); }
});
// Arrastrar el PDF desde la app hasta la conversación de WhatsApp
ipcMain.on('pedidos:arrastrar', (e, numero) => {
  const p = buscarPedido(numero);
  if (!p || !fs.existsSync(p.pdf)) return;
  e.sender.startDrag({ file: p.pdf, icon: nativeImage.createFromPath(path.join(__dirname, 'build', 'pdf.png')) });
});

// Versión para celular: un solo HTML en Documentos\Catalogo Sublimacion celular
ipcMain.handle('movil:generar', () => {
  const cat = leerJSON(ARCH_CATALOGO, null);
  if (cat) cat.disenos = cat.disenos.filter((d) => d.ruta[0] !== 'MOCKUPS');
  const r = generarMovil(cat, path.join(app.getPath('documents'), 'Catalogo Sublimacion celular', 'CatalogoSublimacion.html'));
  shell.showItemInFolder(r.archivo);
  return { archivo: path.basename(r.archivo), disenos: r.disenos };
});

ipcMain.handle('drive:abrir', (_e, id) => shell.openExternal(
  id ? `https://drive.google.com/file/d/${id}/view` : leerConfig().enlaceDrive));
