// Catálogo Sublimación — visor del catálogo de Google Drive, solo para consultar (sin pedidos)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// En Windows las miniaturas pasan por la caché local (miniatura://); en el celular se piden directo a Google
const mini = (id, sz = 400) => window.api.miniatura(id, sz);
const WEB = !!window.api.esMovil;
const angosta = () => matchMedia('(max-width: 760px)').matches;
if (WEB) document.body.classList.add('modo-web');

// Carpetas del Drive que no son diseños del catálogo
const TEMAS_OCULTOS = ['MOCKUPS'];
const POR_PAGINA = 120;

let disenos = [];          // [{ id, codigo, nombre, archivo, ruta: [], _txt }]
let filtroRuta = [];       // tema seleccionado en el árbol
let resultado = [];
let mostrados = 0;
let visorIdx = -1;

// ---------- Utilidades de diálogo (no se usan alert/confirm nativos) ----------
function toast(txt) {
  const t = $('#toast');
  t.textContent = txt;
  t.classList.add('ver');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('ver'), 2200);
}
function preguntar(texto, { soloAviso = false, si = 'Aceptar' } = {}) {
  return new Promise((resolve) => {
    $('#avisoTexto').textContent = texto;
    $('#avisoSi').textContent = si;
    $('#avisoNo').classList.toggle('oculto', soloAviso);
    $('#aviso').classList.remove('oculto');
    $('#avisoSi').focus();
    const fin = (v) => { $('#aviso').classList.add('oculto'); $('#avisoSi').onclick = $('#avisoNo').onclick = null; resolve(v); };
    $('#avisoSi').onclick = () => fin(true);
    $('#avisoNo').onclick = () => fin(false);
  });
}
const aviso = (texto) => preguntar(texto, { soloAviso: true });

// ---------- Catálogo ----------
function cargarCatalogo(cat) {
  disenos = (cat?.disenos || [])
    .filter((d) => !TEMAS_OCULTOS.includes(d.ruta[0]))
    .map((d) => ({ ...d, _txt: norm(`${d.codigo} ${d.nombre} ${d.ruta.join(' ')} ${d.archivo || ''}`) }));
  pintarArbol();
  buscar();
  if (cat?.fecha) {
    const f = new Date(cat.fecha);
    $('#estadoCatalogo').textContent = `${disenos.length.toLocaleString('es-CR')} diseños · ${WEB ? 'catálogo del' : 'actualizado'} ${f.toLocaleDateString('es-CR')}${WEB ? '' : ' ' + f.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

async function actualizar(silencioso) {
  const btn = $('#btnActualizar');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  $('#progreso').classList.remove('oculto');
  const r = await window.api.actualizarCatalogo();
  btn.disabled = false;
  btn.textContent = '⟳ Actualizar catálogo';
  $('#progreso').classList.add('oculto');
  if (r.ok) {
    cargarCatalogo(r.catalogo);
    if (!silencioso) toast(`Catálogo actualizado: ${disenos.length.toLocaleString('es-CR')} diseños`);
    if (r.catalogo.errores?.length) toast(`Atención: ${r.catalogo.errores.length} carpeta(s) no se pudieron leer`);
  } else if (!disenos.length) {
    $('#vacio').classList.remove('oculto');
    $('#vacio').textContent = 'No se pudo leer el catálogo de Google Drive. Revise la conexión a internet y presione "Actualizar catálogo".';
  } else if (!silencioso) {
    aviso('No se pudo actualizar desde Google Drive (¿sin internet?). Se sigue mostrando el catálogo guardado.');
  }
}

window.api.alProgreso((p) => {
  const total = p.carpetas + p.pendientes;
  $('#progreso i').style.width = `${Math.round((p.carpetas / Math.max(total, 1)) * 100)}%`;
  $('#progreso span').textContent = `Leyendo Google Drive… ${p.carpetas} carpetas, ${p.disenos.toLocaleString('es-CR')} diseños`;
});

// ---------- Árbol de temas ----------
function construirArbol() {
  const raiz = { hijos: new Map(), total: 0 };
  for (const d of disenos) {
    let n = raiz;
    n.total++;
    for (const parte of d.ruta) {
      if (!n.hijos.has(parte)) n.hijos.set(parte, { hijos: new Map(), total: 0 });
      n = n.hijos.get(parte);
      n.total++;
    }
  }
  return raiz;
}

const abiertos = new Set();
function pintarArbol() {
  const raiz = construirArbol();
  const pinta = (nodo, ruta) => [...nodo.hijos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([nombre, hijo]) => {
      const r = [...ruta, nombre];
      const clave = r.join('\u0001');
      const tieneHijos = hijo.hijos.size > 0;
      const abierto = abiertos.has(clave);
      const sel = clave === filtroRuta.join('\u0001');
      return `<div class="nodo${sel ? ' sel' : ''}" data-ruta="${esc(clave)}">
          <span class="flecha" data-flecha>${tieneHijos ? (abierto ? '▾' : '▸') : ''}</span>
          <span class="nom" title="${esc(nombre)}">${esc(nombre)}</span><span class="cnt">${hijo.total}</span>
        </div>${tieneHijos && abierto ? `<div class="hijos">${pinta(hijo, r)}</div>` : ''}`;
    }).join('');
  $('#arbol').innerHTML = `<div class="nodo${filtroRuta.length ? '' : ' sel'}" data-ruta="">
      <span class="flecha"></span><span class="nom">Todos los temas</span><span class="cnt">${raiz.total}</span></div>${pinta(raiz, [])}`;
}

$('#arbol').addEventListener('click', (e) => {
  const nodo = e.target.closest('.nodo');
  if (!nodo) return;
  const clave = nodo.dataset.ruta;
  const ruta = clave ? clave.split('\u0001') : [];
  if (e.target.closest('[data-flecha]') && clave) {
    abiertos.has(clave) ? abiertos.delete(clave) : abiertos.add(clave);
  } else {
    filtroRuta = ruta;
    if (clave) abiertos.add(clave);
    buscar();
    if (angosta()) cerrarPaneles();
  }
  pintarArbol();
});

// Celular: los temas se abren como panel encima del catálogo
function cerrarPaneles() { document.body.classList.remove('ver-temas'); }
$('#btnTemas').onclick = () => document.body.classList.add('ver-temas');
document.querySelectorAll('[data-cerrar-panel]').forEach((b) => b.addEventListener('click', cerrarPaneles));

function elegirTema(ruta) {
  filtroRuta = ruta;
  for (let i = 1; i <= ruta.length; i++) abiertos.add(ruta.slice(0, i).join('\u0001'));
  pintarArbol();
  buscar();
}

// ---------- Búsqueda ----------
function buscar() {
  const q = $('#buscar').value.trim();
  let lista = disenos;
  if (filtroRuta.length) lista = lista.filter((d) => filtroRuta.every((p, i) => d.ruta[i] === p));

  if (q) {
    const codigos = q.split(/[\s,;]+/).filter(Boolean);
    if (codigos.every((c) => /^\d+$/.test(c))) {
      // Búsqueda por código: varios códigos = coincidencia exacta; uno solo = exactos primero y luego los que empiezan igual
      if (codigos.length > 1) {
        const set = new Set(codigos.map((c) => c.replace(/^0+(?=\d)/, '')));
        lista = lista.filter((d) => set.has(d.codigo.replace(/^0+(?=\d)/, '')));
      } else {
        const c = codigos[0].replace(/^0+(?=\d)/, '');
        const cod = (d) => d.codigo.replace(/^0+(?=\d)/, '');
        lista = [...lista.filter((d) => cod(d) === c), ...lista.filter((d) => cod(d) !== c && cod(d).startsWith(c))];
      }
    } else {
      const palabras = norm(q).split(/\s+/).filter(Boolean);
      lista = lista.filter((d) => palabras.every((p) => d._txt.includes(p)));
    }
  }
  resultado = lista;
  mostrados = 0;
  $('#grilla').innerHTML = '';
  $('.resultados').scrollTop = 0;
  pintarMigas(q);
  $('#vacio').classList.toggle('oculto', resultado.length > 0 || !disenos.length);
  $('#vacio').innerHTML = q
    ? `No hay diseños que coincidan con "${esc(q)}"${filtroRuta.length ? ' en este tema.<br><br><button class="sec" data-todos>Buscar en todos los temas</button>' : '.'}`
    : 'Este tema no tiene diseños.';
  masResultados();
}
$('#vacio').addEventListener('click', (e) => { if (e.target.closest('[data-todos]')) elegirTema([]); });

function pintarMigas(q) {
  const partes = ['Todos', ...filtroRuta];
  $('#migas').innerHTML = partes.map((p, i) => `<span data-nivel="${i}">${esc(p)}</span>`).join('<i>›</i>');
  $('#conteo').textContent = `${resultado.length.toLocaleString('es-CR')} diseño${resultado.length === 1 ? '' : 's'}${q ? ' encontrados' : ''}`;
}
$('#migas').addEventListener('click', (e) => {
  const s = e.target.closest('[data-nivel]');
  if (s) elegirTema(filtroRuta.slice(0, +s.dataset.nivel));
});

function htmlTarjeta(d, idx) {
  return `<div class="tarjeta" data-idx="${idx}" data-id="${d.id}">
    <div class="img" data-ver><img loading="lazy" src="${mini(d.id)}" alt="${esc(d.codigo)}"></div>
    <div class="info">
      <div class="cod">${esc(d.codigo)}</div>
      ${d.nombre ? `<div class="nom">${esc(d.nombre)}</div>` : ''}
      <div class="ruta" title="${esc(d.ruta.join(' › '))}">${esc(d.ruta.join(' › '))}</div>
    </div></div>`;
}

function masResultados() {
  if (mostrados >= resultado.length) return;
  const trozo = resultado.slice(mostrados, mostrados + POR_PAGINA);
  $('#grilla').insertAdjacentHTML('beforeend', trozo.map((d, i) => htmlTarjeta(d, mostrados + i)).join(''));
  mostrados += trozo.length;
}
new IntersectionObserver((ent) => { if (ent[0].isIntersecting) masResultados(); }, { root: $('.resultados'), rootMargin: '600px' })
  .observe($('#centinela'));

$('#grilla').addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') { e.target.parentElement.classList.add('error'); e.target.remove(); }
}, true);

$('#grilla').addEventListener('click', (e) => {
  const t = e.target.closest('.tarjeta');
  if (!t) return;
  if (e.target.closest('[data-ver]')) abrirVisor(+t.dataset.idx);
});

let tBuscar;
$('#buscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(buscar, 180); });
$('#buscar').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(tBuscar); buscar(); }
  if (e.key === 'Escape') { $('#buscar').value = ''; buscar(); }
});

// ---------- Visor ----------
function abrirVisor(idx) {
  visorIdx = idx;
  const d = resultado[idx];
  if (!d) return;
  $('#visorImg').src = mini(d.id, 400);
  const grande = new Image();
  grande.onload = () => { if (resultado[visorIdx] === d) $('#visorImg').src = grande.src; };
  grande.src = mini(d.id, 1200);
  $('#visorCodigo').textContent = `Código ${d.codigo}${d.nombre ? ' · ' + d.nombre : ''}`;
  $('#visorRuta').textContent = d.ruta.join(' › ');
  $('#visorAnt').disabled = idx <= 0;
  $('#visorSig').disabled = idx >= resultado.length - 1;
  $('#visor').classList.remove('oculto');
}
$('#visorAnt').onclick = () => abrirVisor(visorIdx - 1);
$('#visorSig').onclick = () => abrirVisor(visorIdx + 1);
$('#visorDrive').onclick = () => window.api.abrirDrive(resultado[visorIdx].id);
document.addEventListener('keydown', (e) => {
  if ($('#visor').classList.contains('oculto')) return;
  if (e.key === 'Escape') $('#visor').classList.add('oculto');
  if (e.key === 'ArrowLeft' && visorIdx > 0) abrirVisor(visorIdx - 1);
  if (e.key === 'ArrowRight' && visorIdx < resultado.length - 1) abrirVisor(visorIdx + 1);
});

document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
  if (e.target === m && m.id !== 'espera' && m.id !== 'aviso') m.classList.add('oculto');
  if (e.target.closest('[data-cerrar]')) m.classList.add('oculto');
}));

// ---------- Configuración ----------
async function pintarConfig() {
  const c = await window.api.leerConfig();
  $('#cfgDrive').value = c.enlaceDrive;
}
$('#cfgGuardar').onclick = async () => {
  const antes = await window.api.leerConfig();
  try {
    const c = await window.api.guardarConfig({ enlaceDrive: $('#cfgDrive').value.trim() });
    toast('Configuración guardada');
    if (c.enlaceDrive !== antes.enlaceDrive) { mostrarVista('catalogo'); filtroRuta = []; actualizar(); }
  } catch {
    aviso('El enlace de Google Drive no es válido. Copie el enlace de la carpeta desde Drive (https://drive.google.com/drive/folders/…).');
  }
};
// Versión publicada en GitHub Pages (la actualiza cada 4 horas .github/workflows/publicar.yml)
const ENLACE_WEB = 'https://dsolismendez23-design.github.io/catalogo-sublimacion/';
$('#cfgEnlaceWeb').textContent = ENLACE_WEB;
$('#cfgCopiarEnlace').onclick = async () => {
  try { await navigator.clipboard.writeText(ENLACE_WEB); toast('Enlace copiado'); } catch { toast('No se pudo copiar'); }
};
$('#cfgAbrirEnlace').onclick = () => window.open(ENLACE_WEB, '_blank');
$('#cfgMovil').onclick = async () => {
  $('#esperaTexto').textContent = 'Generando el archivo para celular…';
  $('#espera').classList.remove('oculto');
  try {
    const r = await window.api.generarMovil();
    aviso(`Listo: se creó "${r.archivo}" con ${r.disenos.toLocaleString('es-CR')} diseños (se abrió la carpeta). Páselo al celular y ábralo con Chrome.`);
  } catch (err) {
    aviso('No se pudo generar el archivo: ' + String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  } finally {
    $('#espera').classList.add('oculto');
  }
};
// ---------- Pestañas ----------
function mostrarVista(v) {
  document.querySelectorAll('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === v));
  document.querySelectorAll('.vista').forEach((s) => s.classList.toggle('activa', s.id === `vista-${v}`));
  $('.buscador').style.visibility = v === 'catalogo' ? '' : 'hidden';
  if (v === 'config') pintarConfig();
}
document.querySelectorAll('.pestanas button').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));
$('#btnActualizar').onclick = () => actualizar(false);
$('#btnDrive').onclick = () => window.api.abrirDrive();

// ---------- Inicio ----------
(async function iniciar() {
  const cat = await window.api.leerCatalogo();
  if (cat) cargarCatalogo(cat);
  else $('#estadoCatalogo').textContent = 'Primera carga desde Google Drive…';
  // Siempre se refresca al abrir para traer los diseños nuevos; mientras tanto se usa la copia guardada.
  // En el celular el catálogo viene dentro del archivo y no se puede leer el Drive directamente.
  if (!WEB) actualizar(!!cat);
  if (!angosta()) $('#buscar').focus();
})();
