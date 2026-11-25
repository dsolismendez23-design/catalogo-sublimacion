const { app, BrowserWindow, ipcMain, shell, protocol, net, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const drive = require('./drive');
const { generarMovil } = require('./movil');

// Datos de la app (AppData\Roaming\Catalogo Sublimacion): índice del catálogo, configuración y miniaturas
const DATOS = app.getPath('userData');
const ARCH_CATALOGO = path.join(DATOS, 'catalogo.json');
const ARCH_CONFIG = path.join(DATOS, 'config.json');
const DIR_MINIATURAS = path.join(DATOS, 'miniaturas');

const CONFIG_INICIAL = {
  enlaceDrive: drive.ENLACE_RAIZ,
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
      // La pantalla lee la imagen con fetch para armar la versión con código al compartir: necesita permiso CORS
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

// Versión para celular: un solo HTML en Documentos\Catalogo Sublimacion celular
ipcMain.handle('movil:generar', () => {
  const cat = leerJSON(ARCH_CATALOGO, null);
  if (cat) cat.disenos = cat.disenos.filter((d) => d.ruta[0] !== 'MOCKUPS');
  const r = generarMovil(cat, path.join(app.getPath('documents'), 'Catalogo Sublimacion celular', 'CatalogoSublimacion.html'));
  shell.showItemInFolder(r.archivo);
  return { archivo: path.basename(r.archivo), disenos: r.disenos };
});

// Compartir un diseño: la imagen (con su código impreso) queda en el portapapeles y se abre WhatsApp con
// "Código ####" escrito; en el chat se pega con Ctrl+V. No se envía ningún enlace.
ipcMain.handle('imagen:compartir', async (_e, bytes, texto) => {
  clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(bytes)));
  const t = encodeURIComponent(texto || '');
  if (app.getApplicationNameForProtocol('whatsapp://')) await shell.openExternal(`whatsapp://send?text=${t}`);
  else await shell.openExternal(`https://wa.me/?text=${t}`);
  return { via: 'copiado' };
});

ipcMain.handle('drive:abrir', (_e, id) => shell.openExternal(
  id ? `https://drive.google.com/file/d/${id}/view` : leerConfig().enlaceDrive));
