// Lectura de la carpeta pública de Google Drive sin credenciales.
// Usa la vista "embeddedfolderview" (la misma que Drive usa para incrustar carpetas compartidas
// "cualquier persona con el enlace"), recorre las subcarpetas y arma el índice de diseños.
// Cada subcarpeta es un tema; el nombre del archivo es el código del diseño (ej. "5050.png").

const CARPETA_RAIZ = '1UswdTNur0HFNMGvHxOR00U9_NrrzANbN';
const ENLACE_RAIZ = `https://drive.google.com/drive/folders/${CARPETA_RAIZ}`;
const EXT_IMAGEN = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/i;
const SIMULTANEAS = 6;

function decodificar(txt) {
  return txt
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

// Devuelve [{ id, titulo, carpeta: bool }] de una carpeta
async function listarCarpeta(id, fetchFn) {
  let ultimoError;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetchFn(`https://drive.google.com/embeddedfolderview?id=${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const items = [];
      const re = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
      let m;
      while ((m = re.exec(html))) {
        items.push({ id: m[1], titulo: decodificar(m[3]), carpeta: m[2].includes('/folders/') });
      }
      return items;
    } catch (e) {
      ultimoError = e;
      await new Promise(res => setTimeout(res, 800 * (intento + 1)));
    }
  }
  throw ultimoError;
}

// "5050.png" → { codigo: "5050", nombre: "" } ; "2550 UNICORNIOS.jpg" → { codigo: "2550", nombre: "UNICORNIOS" }
function separarCodigo(archivo) {
  const base = archivo.replace(/\.[^.]+$/, '').trim();
  const m = base.match(/^([A-Za-z]{0,3}-?\d+[A-Za-z]?)\s*[-_ ]?\s*(.*)$/);
  if (m) return { codigo: m[1].toUpperCase(), nombre: m[2].trim() };
  return { codigo: base.toUpperCase(), nombre: '' };
}

// Acepta el enlace completo de la carpeta o solo su id
function idDesdeEnlace(enlace) {
  const txt = String(enlace || '').trim();
  const m = txt.match(/folders\/([\w-]{10,})/) || txt.match(/[?&]id=([\w-]{10,})/) || txt.match(/^([\w-]{10,})$/);
  return m ? m[1] : null;
}

async function recorrerCatalogo({ raiz = CARPETA_RAIZ, fetchFn = fetch, progreso = () => {} } = {}) {
  const disenos = [];
  const errores = [];
  const pendientes = [{ id: raiz, ruta: [] }];
  let carpetasLeidas = 0;
  let activas = 0;

  await new Promise(resolver => {
    const siguiente = () => {
      if (!pendientes.length && !activas) return resolver();
      while (activas < SIMULTANEAS && pendientes.length) {
        const { id, ruta } = pendientes.shift();
        activas++;
        listarCarpeta(id, fetchFn)
          .then(items => {
            for (const it of items) {
              if (it.carpeta) pendientes.push({ id: it.id, ruta: [...ruta, it.titulo] });
              else if (EXT_IMAGEN.test(it.titulo)) {
                const { codigo, nombre } = separarCodigo(it.titulo);
                disenos.push({ id: it.id, archivo: it.titulo, codigo, nombre, ruta });
              }
            }
          })
          .catch(e => errores.push({ ruta: ruta.join(' / ') || 'CATÁLOGO', error: String(e.message || e) }))
          .finally(() => {
            activas--;
            carpetasLeidas++;
            progreso({ carpetas: carpetasLeidas, disenos: disenos.length, pendientes: pendientes.length + activas });
            siguiente();
          });
      }
    };
    siguiente();
  });

  disenos.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) || a.ruta.join('/').localeCompare(b.ruta.join('/'), 'es'));
  return { disenos, errores, carpetas: carpetasLeidas, fecha: new Date().toISOString() };
}

module.exports = { CARPETA_RAIZ, ENLACE_RAIZ, recorrerCatalogo, separarCodigo, idDesdeEnlace };
