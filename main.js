const { app, BrowserWindow, ipcMain, shell, protocol, net, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const drive = require('./drive');
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
      return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*' } });
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
// La pantalla arma el archivo (PDF o Excel, src/documentos.js); aquí solo se guarda, se copia y se abre WhatsApp.

// Copia el archivo al portapapeles (igual que "Copiar" en el Explorador) para pegarlo en WhatsApp con Ctrl+V
function copiarArchivo(file) {
  return new Promise((resolve) => {
    const ps = `Set-Clipboard -LiteralPath '${file.replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true },
      (err) => resolve(!err));
  });
}

async function abrirWhatsApp(textoPlano) {
  const numero = String(leerConfig().whatsapp || '').replace(/D/g, '');
  const texto = encodeURIComponent(textoPlano || '');
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

// Le da número y fecha al pedido (con todos sus clientes) y lo guarda en el historial
ipcMain.handle('pedidos:registrar', (_e, clientes) => {
  const reg = leerJSON(ARCH_PEDIDOS, { consecutivo: 0, lista: [] });
  const pedido = { numero: reg.consecutivo + 1, fecha: new Date().toISOString(), clientes, archivos: {} };
  reg.consecutivo = pedido.numero;
  reg.lista.unshift(pedido);
  guardarJSON(ARCH_PEDIDOS, reg);
  return pedido;
});

function buscarPedido(numero) {
  return leerJSON(ARCH_PEDIDOS, { lista: [] }).lista.find((p) => p.numero === numero);
}
function archivoDe(numero, formato) {
  const p = buscarPedido(numero);
  const f = p?.archivos?.[formato] || (formato === 'pdf' ? p?.pdf : null); // p.pdf: pedidos de la versión 1.x
  return f && fs.existsSync(f) ? f : null;
}

// Guarda el archivo en DocumentosPedidos Sublimacion; con enviar=true además lo copia y abre WhatsApp
ipcMain.handle('pedidos:guardarDoc', async (_e, { numero, formato, nombre, bytes, texto, enviar }) => {
  fs.mkdirSync(DIR_PDF, { recursive: true });
  const file = path.join(DIR_PDF, path.basename(nombre));
  fs.writeFileSync(file, Buffer.from(bytes));
  const reg = leerJSON(ARCH_PEDIDOS, { consecutivo: 0, lista: [] });
  const p = reg.lista.find((x) => x.numero === numero);
  if (p) { p.archivos = { ...p.archivos, [formato]: file }; p.texto = texto; guardarJSON(ARCH_PEDIDOS, reg); }
  if (!enviar) { await shell.openPath(file); return { archivo: nombre }; }
  const copiado = await copiarArchivo(file);
  const via = await abrirWhatsApp(texto);
  return { archivo: nombre, copiado, via };
});
ipcMain.handle('pedidos:copiar', async (_e, numero, formato) => {
  const f = archivoDe(numero, formato);
  return f ? copiarArchivo(f) : false;
});
ipcMain.handle('pedidos:reenviar', async (_e, numero, formato) => {
  const f = archivoDe(numero, formato);
  const copiado = f ? await copiarArchivo(f) : false;
  const via = await abrirWhatsApp(buscarPedido(numero)?.texto);
  return { copiado, via };
});
ipcMain.handle('pedidos:abrir', (_e, numero, formato) => {
  const f = archivoDe(numero, formato);
  return f ? shell.openPath(f) : 'No se encontró el archivo';
});
ipcMain.handle('pedidos:carpeta', (_e, numero, formato) => {
  const f = numero ? archivoDe(numero, formato || 'pdf') || archivoDe(numero, 'xlsx') : null;
  if (f) shell.showItemInFolder(f);
  else { fs.mkdirSync(DIR_PDF, { recursive: true }); shell.openPath(DIR_PDF); }
});
// Arrastrar el archivo desde la app hasta la conversación de WhatsApp
ipcMain.on('pedidos:arrastrar', (e, numero, formato) => {
  const f = archivoDe(numero, formato);
  if (!f) return;
  e.sender.startDrag({ file: f, icon: nativeImage.createFromPath(path.join(__dirname, 'build', formato === 'xlsx' ? 'xlsx.png' : 'pdf.png')) });
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
