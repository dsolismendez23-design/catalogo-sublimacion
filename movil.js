// Arma la versión para celular: UN SOLO archivo HTML con la app, jsPDF y el catálogo incrustados,
// para abrirlo sin internet de por medio para la app (solo las imágenes se bajan de Google Drive).
// Uso desde la app de Windows (Configuración → Generar archivo para celular) o con `npm run movil`.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf-8');
// Evita que un "</script" dentro del código cierre la etiqueta antes de tiempo
const seguro = (js) => js.replace(/<\/script/gi, '<\\/script');

function catalogoCompacto(cat) {
  const rutas = [];
  const indice = new Map();
  const disenos = cat.disenos.map((d) => {
    const r = d.ruta.join('/');
    if (!indice.has(r)) { indice.set(r, rutas.length); rutas.push(r); }
    return [d.id, d.codigo, d.nombre, indice.get(r)];
  });
  return { fecha: cat.fecha, rutas, disenos };
}

// Etiquetas para que el iPhone (Safari → Agregar a pantalla de inicio) y Android la instalen con ícono propio
const CABECERA_WEB = `
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" href="icono-192.png">
  <link rel="apple-touch-icon" href="icono-180.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Catálogo">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">`;

const MANIFIESTO = {
  name: 'Catálogo Sublimación',
  short_name: 'Catálogo',
  description: 'Catálogo de diseños de sublimación y pedidos por WhatsApp',
  lang: 'es',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f5f3f8',
  theme_color: '#7b3fa0',
  icons: [
    { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// opciones.web = true → versión publicada en internet (se actualiza sola), con manifiesto e íconos
function generarMovil(catalogo, archivoDestino, opciones = {}) {
  if (!catalogo?.disenos?.length) throw new Error('Todavía no hay catálogo: presione "Actualizar catálogo" primero');
  const datos = JSON.stringify(catalogoCompacto(catalogo)).replace(/</g, '\\u003c');
  // Antes de app.js van el catálogo y api-web.js, que en Windows reemplaza preload.js
  const antesDeApp = [
    `<script>window.CATALOGO_EMBEBIDO=${datos};window.CATALOGO_PUBLICADO=${!!opciones.web};</script>`,
    `<script>${seguro(leer('api-web.js'))}</script>`,
  ].join('\n');

  // Se usan funciones en replace() para que los "$" del código no se tomen como patrones
  const html = leer('index.html')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, () => '')
    .replace('<link rel="stylesheet" href="styles.css">', () => (opciones.web ? CABECERA_WEB + '\n  ' : '') + `<style>${leer('styles.css')}</style>`)
    .replace('<script src="app.js"></script>', () => antesDeApp + '\n<script src="app.js"></script>')
    // Cada <script src> (jsPDF, ExcelJS, documentos.js, app.js) se mete dentro del archivo
    .replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>${seguro(leer(f))}</script>`);

  const dir = path.dirname(archivoDestino);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(archivoDestino, html, 'utf-8');
  if (opciones.web) {
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify(MANIFIESTO, null, 2), 'utf-8');
    for (const f of ['icono-180.png', 'icono-192.png', 'icono-512.png']) {
      fs.copyFileSync(path.join(__dirname, 'build', 'web', f), path.join(dir, f));
    }
  }
  return { archivo: archivoDestino, disenos: catalogo.disenos.length, bytes: Buffer.byteLength(html) };
}

module.exports = { generarMovil };

// npm run movil → usa el catálogo guardado por la app (o lee el Drive si no hay) y deja el archivo en celular\
// node movil.js --drive --web publicar → lo usa la tarea diaria de GitHub: lee el Drive y arma la página publicada
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const iWeb = args.indexOf('--web');
    const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
    const guardado = path.join(appData, 'Catalogo Sublimacion', 'catalogo.json');
    let cat = fs.existsSync(guardado) ? JSON.parse(fs.readFileSync(guardado, 'utf-8')) : null;
    if (args.includes('--drive') || !cat) {
      console.log('Leyendo Google Drive…');
      cat = await require('./drive').recorrerCatalogo({});
      if (cat.errores.length) console.log(`Carpetas con error: ${cat.errores.length}`, cat.errores.slice(0, 5));
      if (!cat.disenos.length) throw new Error('El Drive no devolvió diseños');
    }
    cat.disenos = cat.disenos.filter((d) => d.ruta[0] !== 'MOCKUPS');
    const destino = iWeb >= 0
      ? path.resolve(args[iWeb + 1] || 'publicar', 'index.html')
      : path.join(__dirname, 'celular', 'CatalogoSublimacion.html');
    const r = generarMovil(cat, destino, { web: iWeb >= 0 });
    console.log(`${r.archivo}\n${r.disenos} diseños, ${(r.bytes / 1024 / 1024).toFixed(2)} MB`);
    // Lista de códigos por tema: es lo que se guarda en el repositorio para ver qué cambió cada día
    const iLista = args.indexOf('--lista');
    if (iLista >= 0) {
      const lineas = cat.disenos.map((d) => `${d.codigo}\t${d.ruta.join(' / ')}\t${d.id}`).sort();
      fs.writeFileSync(path.resolve(args[iLista + 1]), lineas.join('\n') + '\n', 'utf-8');
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
