// Catálogo Sublimación — visor del catálogo de Google Drive y pedidos en PDF por WhatsApp
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// En Windows las miniaturas pasan por la caché local (miniatura://); en el celular se piden directo a Google
const mini = (id, sz = 400) => window.api.miniatura(id, sz);
const WEB = !!window.api.esMovil;
const angosta = () => matchMedia('(max-width: 760px)').matches;
if (WEB) document.body.classList.add('modo-web');

// Carpetas del Drive que no son diseños para pedir
const TEMAS_OCULTOS = ['MOCKUPS'];
const POR_PAGINA = 120;
const CLAVE_BORRADOR = 'pedidoEnCurso';

let disenos = [];          // [{ id, codigo, nombre, archivo, ruta: [], _txt }]
let filtroRuta = [];       // tema seleccionado en el árbol
let resultado = [];
let mostrados = 0;
let pedido = { cliente: '', telefono: '', notas: '', items: [] };
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

// Celular: los temas y el pedido se abren como paneles encima del catálogo
function cerrarPaneles() { document.body.classList.remove('ver-temas', 'ver-pedido'); }
$('#btnTemas').onclick = () => document.body.classList.add('ver-temas');
$('#btnVerPedido').onclick = () => document.body.classList.add('ver-pedido');
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

const enPedido = (id) => pedido.items.some((i) => i.id === id);

function htmlTarjeta(d, idx) {
  const dentro = enPedido(d.id);
  return `<div class="tarjeta${dentro ? ' en-pedido' : ''}" data-idx="${idx}" data-id="${d.id}">
    <div class="img" data-ver><img loading="lazy" src="${mini(d.id)}" alt="${esc(d.codigo)}"></div>
    <div class="info">
      <div class="cod">${esc(d.codigo)}</div>
      ${d.nombre ? `<div class="nom">${esc(d.nombre)}</div>` : ''}
      <div class="ruta" title="${esc(d.ruta.join(' › '))}">${esc(d.ruta.join(' › '))}</div>
      <button class="sec" data-agregar>${dentro ? '✓ En el pedido' : '+ Agregar'}</button>
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
  const d = resultado[+t.dataset.idx];
  if (e.target.closest('[data-agregar]')) alternar(d);
  else if (e.target.closest('[data-ver]')) abrirVisor(+t.dataset.idx);
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
  $('#visorAgregar').textContent = enPedido(d.id) ? '✓ En el pedido (quitar)' : 'Agregar al pedido';
  $('#visorAnt').disabled = idx <= 0;
  $('#visorSig').disabled = idx >= resultado.length - 1;
  $('#visor').classList.remove('oculto');
}
$('#visorAnt').onclick = () => abrirVisor(visorIdx - 1);
$('#visorSig').onclick = () => abrirVisor(visorIdx + 1);
$('#visorAgregar').onclick = () => { alternar(resultado[visorIdx]); abrirVisor(visorIdx); };
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

// ---------- Pedido ----------
function guardarBorrador() {
  try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(pedido)); } catch { /* sin almacenamiento */ }
}

function alternar(d) {
  const i = pedido.items.findIndex((x) => x.id === d.id);
  if (i >= 0) pedido.items.splice(i, 1);
  else pedido.items.push({ id: d.id, codigo: d.codigo, nombre: d.nombre, ruta: d.ruta, cantidad: 1 });
  if (i < 0) toast(`Código ${d.codigo} agregado al pedido`);
  refrescarTarjeta(d.id);
  pintarPedido();
}

function refrescarTarjeta(id) {
  document.querySelectorAll(`.tarjeta[data-id="${CSS.escape(id)}"]`).forEach((t) => {
    const dentro = enPedido(id);
    t.classList.toggle('en-pedido', dentro);
    t.querySelector('[data-agregar]').textContent = dentro ? '✓ En el pedido' : '+ Agregar';
  });
}

function pintarPedido() {
  $('#pedLista').innerHTML = pedido.items.map((it, n) => `
    <li class="ped-item" data-n="${n}">
      <img src="${mini(it.id, 200)}" alt="">
      <div class="d"><b>${esc(it.codigo)}</b><small title="${esc(it.ruta.join(' › '))}">${esc(it.ruta.join(' › '))}</small></div>
      <div class="cant"><button data-menos>−</button><input data-cant type="text" inputmode="numeric" value="${it.cantidad}"><button data-mas>+</button></div>
      <button class="quitar" data-quitar title="Quitar">×</button>
    </li>`).join('');
  const unidades = pedido.items.reduce((s, i) => s + i.cantidad, 0);
  $('#pedConteo').textContent = pedido.items.length
    ? `${pedido.items.length} diseño${pedido.items.length === 1 ? '' : 's'} · ${unidades} unid.` : 'Sin diseños';
  $('#btnVerPedido').textContent = `Pedido (${pedido.items.length})`;
  guardarBorrador();
}

$('#pedLista').addEventListener('click', (e) => {
  const li = e.target.closest('.ped-item');
  if (!li) return;
  const it = pedido.items[+li.dataset.n];
  if (e.target.closest('[data-quitar]')) { pedido.items.splice(+li.dataset.n, 1); refrescarTarjeta(it.id); }
  else if (e.target.closest('[data-mas]')) it.cantidad++;
  else if (e.target.closest('[data-menos]')) it.cantidad = Math.max(1, it.cantidad - 1);
  else return;
  pintarPedido();
});
$('#pedLista').addEventListener('change', (e) => {
  if (!e.target.matches('[data-cant]')) return;
  const it = pedido.items[+e.target.closest('.ped-item').dataset.n];
  it.cantidad = Math.max(1, parseInt(e.target.value, 10) || 1);
  pintarPedido();
});
for (const [sel, campo] of [['#pedCliente', 'cliente'], ['#pedTelefono', 'telefono'], ['#pedNotas', 'notas']]) {
  $(sel).addEventListener('input', () => { pedido[campo] = $(sel).value; guardarBorrador(); });
}
$('#pedVaciar').onclick = async () => {
  if (!pedido.items.length) return;
  if (!(await preguntar('¿Quitar todos los diseños del pedido?', { si: 'Vaciar' }))) return;
  const ids = pedido.items.map((i) => i.id);
  pedido.items = [];
  ids.forEach(refrescarTarjeta);
  pintarPedido();
};

let ultimoPedido = null;
$('#btnHacerPedido').onclick = async () => {
  pedido.cliente = $('#pedCliente').value.trim();
  if (!pedido.cliente) { await aviso('Escriba el nombre de quien hace el pedido.'); $('#pedCliente').focus(); return; }
  if (!pedido.items.length) { await aviso('Agregue al menos un diseño al pedido.'); return; }
  $('#esperaTexto').textContent = 'Generando el PDF del pedido…';
  $('#espera').classList.remove('oculto');
  try {
    const r = await window.api.hacerPedido(pedido);
    ultimoPedido = r.pedido;
    const ids = pedido.items.map((i) => i.id);
    pedido = { cliente: '', telefono: '', notas: '', items: [] };
    $('#pedCliente').value = $('#pedTelefono').value = $('#pedNotas').value = '';
    ids.forEach(refrescarTarjeta);
    pintarPedido();
    cerrarPaneles();
    mostrarListo(r);
  } catch (err) {
    aviso('No se pudo hacer el pedido: ' + String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  } finally {
    $('#espera').classList.add('oculto');
  }
};

function mostrarListo(r) {
  const p = r.pedido;
  $('#listoNum').textContent = '#' + String(p.numero).padStart(4, '0');
  $('#listoArchivo').textContent = p.pdf.split(/[\\/]/).pop();
  if (WEB) {
    $('#listoTexto').textContent = 'El PDF está listo. Presione "Enviar por WhatsApp", elija WhatsApp en el menú de compartir y luego el chat.';
    $('#listoPasos').classList.add('oculto');
  } else {
    $('#listoTexto').textContent = (r.via === 'web'
      ? 'Se abrió WhatsApp Web en el navegador con el resumen del pedido. '
      : 'Se abrió WhatsApp con el resumen del pedido. ')
      + (r.copiado ? 'El PDF ya está copiado: solo péguelo en el chat.' : 'Arrastre el PDF de abajo al chat.');
  }
  $('#listo').classList.remove('oculto');
}
if (!WEB) $('#listoPDF').draggable = true;
$('#listoPDF').addEventListener('dragstart', (e) => { e.preventDefault(); window.api.arrastrarPDF(ultimoPedido.numero); });
// Celular: compartir necesita un toque directo, por eso se hace con este botón y no automáticamente
$('#listoCompartir').onclick = async () => {
  const r = await window.api.enviarPedido(ultimoPedido.numero);
  if (r.via === 'compartido') { $('#listo').classList.add('oculto'); toast('Pedido compartido'); }
  if (r.via === 'pendiente') toast('Toque "Enviar por WhatsApp" otra vez');
  if (r.via === 'descargado') aviso('Este navegador no permite compartir archivos. El PDF se descargó y se abrió WhatsApp: adjunte el PDF desde Descargas (clip 📎 → Documento).');
};
$('#listoDescargar').onclick = () => window.api.descargarPDF(ultimoPedido.numero);
$('#listoAbrir').onclick = () => window.api.abrirPDF(ultimoPedido.numero);
$('#listoCopiar').onclick = async () => toast((await window.api.copiarPDF(ultimoPedido.numero)) ? 'PDF copiado: péguelo con Ctrl + V' : 'No se pudo copiar el PDF');
$('#listoWhats').onclick = () => window.api.enviarPedido(ultimoPedido.numero);

// ---------- Pedidos hechos ----------
let pedidosHechos = [];
async function pintarPedidos() {
  pedidosHechos = await window.api.leerPedidos();
  const q = norm($('#buscarPedido').value.trim());
  const lista = pedidosHechos.filter((p) => !q
    || norm(p.cliente).includes(q) || String(p.numero) === q.replace(/^0+/, '') || p.items.some((i) => norm(i.codigo) === q));
  $('#tablaPedidos').innerHTML = lista.map((p) => `
    <tr data-num="${p.numero}">
      <td><b>${String(p.numero).padStart(4, '0')}</b></td>
      <td>${new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${esc(p.cliente)}${p.telefono ? `<br><small>${esc(p.telefono)}</small>` : ''}</td>
      <td title="${esc(p.items.map((i) => i.codigo).join(', '))}">${p.items.length}: ${esc(p.items.slice(0, 6).map((i) => i.codigo).join(', '))}${p.items.length > 6 ? '…' : ''}</td>
      <td>${p.items.reduce((s, i) => s + i.cantidad, 0)}</td>
      <td class="acc">
        <button class="sec" data-acc="ver">Ver PDF</button>
        <button class="sec solo-escritorio" data-acc="carpeta">Carpeta</button>
        <button class="pri" data-acc="enviar">Enviar por WhatsApp</button>
      </td>
    </tr>`).join('');
  $('#sinPedidos').classList.toggle('oculto', lista.length > 0);
}
$('#buscarPedido').addEventListener('input', pintarPedidos);
$('#tablaPedidos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acc]');
  if (!b) return;
  const num = +b.closest('tr').dataset.num;
  if (b.dataset.acc === 'ver') window.api.abrirPDF(num);
  if (b.dataset.acc === 'carpeta') window.api.mostrarPDF(num);
  if (b.dataset.acc === 'enviar') {
    ultimoPedido = pedidosHechos.find((p) => p.numero === num);
    if (WEB) {
      // Primero se arma el PDF; el envío lo hace el botón del diálogo (el celular exige un toque reciente)
      $('#esperaTexto').textContent = 'Preparando el PDF…';
      $('#espera').classList.remove('oculto');
      try { await window.api.prepararPDF(num); } finally { $('#espera').classList.add('oculto'); }
      mostrarListo({ pedido: ultimoPedido });
      return;
    }
    const r = await window.api.enviarPedido(num);
    mostrarListo({ ...r, pedido: ultimoPedido });
  }
});

// ---------- Configuración ----------
async function pintarConfig() {
  const c = await window.api.leerConfig();
  $('#cfgNegocio').value = c.negocio;
  $('#cfgWhatsapp').value = c.whatsapp;
  $('#cfgDrive').value = c.enlaceDrive;
}
$('#cfgGuardar').onclick = async () => {
  const antes = await window.api.leerConfig();
  try {
    const c = await window.api.guardarConfig({
      negocio: $('#cfgNegocio').value.trim(),
      whatsapp: $('#cfgWhatsapp').value.trim(),
      enlaceDrive: $('#cfgDrive').value.trim(),
    });
    toast('Configuración guardada');
    if (c.enlaceDrive !== antes.enlaceDrive) { mostrarVista('catalogo'); filtroRuta = []; actualizar(); }
  } catch {
    aviso('El enlace de Google Drive no es válido. Copie el enlace de la carpeta desde Drive (https://drive.google.com/drive/folders/…).');
  }
};
$('#cfgCarpetaPDF').onclick = () => window.api.mostrarPDF(0);
// Versión publicada en GitHub Pages (la actualiza todos los días .github/workflows/publicar.yml)
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
if (WEB) {
  $('#cfgInfoMovil').textContent = window.CATALOGO_PUBLICADO
    ? 'El catálogo se actualiza solo una vez al día con los diseños nuevos del Google Drive. Para tenerlo como app: en iPhone, Safari → Compartir → Agregar a pantalla de inicio; en Android, Chrome → menú ⋮ → Agregar a pantalla principal. Los pedidos quedan guardados en este celular.'
    : 'Esta es la versión para celular: el catálogo viene dentro del archivo. Para ver diseños nuevos, genere un archivo nuevo desde la app de la computadora (Configuración → Generar archivo para celular). Los pedidos quedan guardados en este navegador.';
}

// ---------- Pestañas ----------
function mostrarVista(v) {
  document.querySelectorAll('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === v));
  document.querySelectorAll('.vista').forEach((s) => s.classList.toggle('activa', s.id === `vista-${v}`));
  $('.buscador').style.visibility = v === 'catalogo' ? '' : 'hidden';
  if (v === 'pedidos') pintarPedidos();
  if (v === 'config') pintarConfig();
}
document.querySelectorAll('.pestanas button').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));
$('#btnActualizar').onclick = () => actualizar(false);
$('#btnDrive').onclick = () => window.api.abrirDrive();

// ---------- Inicio ----------
(async function iniciar() {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null');
    if (b?.items) pedido = { cliente: '', telefono: '', notas: '', ...b };
  } catch { /* borrador dañado: se ignora */ }
  $('#pedCliente').value = pedido.cliente;
  $('#pedTelefono').value = pedido.telefono;
  $('#pedNotas').value = pedido.notas;
  pintarPedido();

  const cat = await window.api.leerCatalogo();
  if (cat) cargarCatalogo(cat);
  else $('#estadoCatalogo').textContent = 'Primera carga desde Google Drive…';
  // Siempre se refresca al abrir para traer los diseños nuevos; mientras tanto se usa la copia guardada.
  // En el celular el catálogo viene dentro del archivo y no se puede leer el Drive directamente.
  if (!WEB) actualizar(!!cat);
  if (!angosta()) $('#buscar').focus();
})();
