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
let envio = { clientes: [{ cliente: '', telefono: '', notas: '', items: [] }], actual: 0 }; // pedido en curso, con uno o varios clientes
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

// "En el pedido" se refiere al cliente que se está armando
const enPedido = (id) => cli().items.some((i) => i.id === id);

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

// ---------- Pedido (uno o varios clientes) ----------
const clienteVacio = () => ({ cliente: '', telefono: '', notas: '', items: [] });
const cli = () => envio.clientes[envio.actual];
const unid = (items) => items.reduce((s, i) => s + i.cantidad, 0);
const vacio = (c) => !c.cliente.trim() && !c.items.length && !c.telefono.trim() && !c.notas.trim();

function guardarBorrador() {
  try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(envio)); } catch { /* sin almacenamiento */ }
}

function alternar(d) {
  const c = cli();
  const i = c.items.findIndex((x) => x.id === d.id);
  if (i >= 0) c.items.splice(i, 1);
  else c.items.push({ id: d.id, codigo: d.codigo, nombre: d.nombre, ruta: d.ruta, cantidad: 1 });
  if (i < 0) toast(`Código ${d.codigo} agregado${c.cliente.trim() ? ` a ${c.cliente.trim()}` : ' al pedido'}`);
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
// Al cambiar de cliente cambian las marcas "En el pedido" de todas las tarjetas visibles
const refrescarTarjetas = () => document.querySelectorAll('.tarjeta').forEach((t) => refrescarTarjeta(t.dataset.id));

function pintarClientes() {
  const varios = envio.clientes.length > 1;
  $('#clientesTabs').innerHTML = !varios ? '' : envio.clientes.map((c, k) => `
    <span class="cli-tab${k === envio.actual ? ' activo' : ''}" data-k="${k}" role="button" title="${esc(c.cliente || 'Sin nombre')}">
      <span class="t">${k + 1}. ${esc(c.cliente.trim() || 'Sin nombre')}</span><span class="n">(${c.items.length})</span>
      <button class="x" data-quitar-cli title="Quitar este cliente">×</button>
    </span>`).join('');
  const total = envio.clientes.reduce((s, c) => s + c.items.length, 0);
  $('#pedResumen').textContent = varios
    ? `Pedido con ${envio.clientes.length} clientes · ${total} diseños · ${envio.clientes.reduce((s, c) => s + unid(c.items), 0)} unid.` : '';
  $('#btnVerPedido').textContent = varios ? `Pedido (${envio.clientes.length} cl. · ${total})` : `Pedido (${total})`;
}

function pintarPedido() {
  const c = cli();
  $('#pedLista').innerHTML = c.items.map((it, n) => `
    <li class="ped-item" data-n="${n}">
      <img src="${mini(it.id, 200)}" alt="">
      <div class="d"><b>${esc(it.codigo)}</b><small title="${esc(it.ruta.join(' › '))}">${esc(it.ruta.join(' › '))}</small></div>
      <div class="cant"><button data-menos>−</button><input data-cant type="text" inputmode="numeric" value="${it.cantidad}"><button data-mas>+</button></div>
      <button class="quitar" data-quitar title="Quitar">×</button>
    </li>`).join('');
  $('#pedConteo').textContent = c.items.length
    ? `${c.items.length} diseño${c.items.length === 1 ? '' : 's'} · ${unid(c.items)} unid.` : 'Sin diseños';
  pintarClientes();
  guardarBorrador();
}

// Pasa a otro cliente del pedido (el panel muestra sus datos y sus diseños)
function elegirCliente(k) {
  envio.actual = k;
  const c = cli();
  $('#pedCliente').value = c.cliente;
  $('#pedTelefono').value = c.telefono;
  $('#pedNotas').value = c.notas;
  pintarPedido();
  refrescarTarjetas();
}

$('#clientesTabs').addEventListener('click', async (e) => {
  const tab = e.target.closest('.cli-tab');
  if (!tab) return;
  const k = +tab.dataset.k;
  if (e.target.closest('[data-quitar-cli]')) {
    const c = envio.clientes[k];
    if (!vacio(c) && !(await preguntar(`¿Quitar a "${c.cliente.trim() || 'Sin nombre'}" y sus ${c.items.length} diseños del pedido?`, { si: 'Quitar' }))) return;
    envio.clientes.splice(k, 1);
    elegirCliente(Math.min(envio.actual > k ? envio.actual - 1 : envio.actual, envio.clientes.length - 1));
    return;
  }
  elegirCliente(k);
});

$('#btnOtroCliente').onclick = async () => {
  const c = cli();
  if (!c.cliente.trim()) { await aviso('Escriba el nombre de este cliente antes de agregar otro.'); $('#pedCliente').focus(); return; }
  if (!c.items.length) { await aviso(`Agregue al menos un diseño para ${c.cliente.trim()} antes de pasar al siguiente cliente.`); return; }
  envio.clientes.push(clienteVacio());
  elegirCliente(envio.clientes.length - 1);
  toast(`Cliente ${envio.clientes.length}: escriba el nombre y elija sus diseños`);
  $('#pedCliente').focus();
};

$('#pedLista').addEventListener('click', (e) => {
  const li = e.target.closest('.ped-item');
  if (!li) return;
  const c = cli();
  const it = c.items[+li.dataset.n];
  if (e.target.closest('[data-quitar]')) { c.items.splice(+li.dataset.n, 1); refrescarTarjeta(it.id); }
  else if (e.target.closest('[data-mas]')) it.cantidad++;
  else if (e.target.closest('[data-menos]')) it.cantidad = Math.max(1, it.cantidad - 1);
  else return;
  pintarPedido();
});
$('#pedLista').addEventListener('change', (e) => {
  if (!e.target.matches('[data-cant]')) return;
  const it = cli().items[+e.target.closest('.ped-item').dataset.n];
  it.cantidad = Math.max(1, parseInt(e.target.value, 10) || 1);
  pintarPedido();
});
for (const [sel, campo] of [['#pedCliente', 'cliente'], ['#pedTelefono', 'telefono'], ['#pedNotas', 'notas']]) {
  $(sel).addEventListener('input', () => { cli()[campo] = $(sel).value; pintarClientes(); guardarBorrador(); });
}
$('#pedVaciar').onclick = async () => {
  const c = cli();
  if (!c.items.length) return;
  if (!(await preguntar(`¿Quitar todos los diseños${c.cliente.trim() ? ` de ${c.cliente.trim()}` : ''}?`, { si: 'Vaciar' }))) return;
  const ids = c.items.map((i) => i.id);
  c.items = [];
  ids.forEach(refrescarTarjeta);
  pintarPedido();
};

// ---------- Archivo del pedido: PDF o Excel ----------
const CLAVE_FORMATO = 'formatoPedido';
const NOMBRE_FORMATO = { pdf: 'PDF', xlsx: 'Excel' };

// Pregunta el formato; devuelve 'pdf', 'xlsx' o null si se cancela
function elegirFormato(resumen) {
  return new Promise((resolve) => {
    let previo = 'pdf';
    try { previo = localStorage.getItem(CLAVE_FORMATO) || 'pdf'; } catch { /* sin almacenamiento */ }
    $('#formatoResumen').textContent = resumen;
    document.querySelectorAll('[data-formato]').forEach((b) => b.classList.toggle('sugerido', b.dataset.formato === previo));
    $('#formato').classList.remove('oculto');
    const fin = (f) => {
      $('#formato').classList.add('oculto');
      $('#formato').onclick = null;
      if (f) try { localStorage.setItem(CLAVE_FORMATO, f); } catch { /* sin almacenamiento */ }
      resolve(f);
    };
    $('#formato').onclick = (e) => {
      const b = e.target.closest('[data-formato]');
      if (b) fin(b.dataset.formato);
      else if (e.target.closest('[data-cancelar]') || e.target === $('#formato')) fin(null);
    };
  });
}

// Arma el archivo en esta pantalla y lo entrega a Windows o al celular (enviar=false: solo guardarlo y abrirlo)
async function generarArchivo(p, formato, enviar = true) {
  const cfg = await window.api.leerConfig();
  const archivo = await window.Documentos.generar(p, formato, mini, cfg.negocio || 'MODATEX Sublimado');
  return window.api.guardarDocumento({
    numero: p.numero, formato, nombre: archivo.name, bytes: await archivo.arrayBuffer(),
    texto: window.Documentos.textoWhatsApp(p), enviar,
  });
}

function limpiarError(err) {
  return String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

let ultimo = null; // { pedido, formato } del diálogo "Pedido listo"
$('#btnHacerPedido').onclick = async () => {
  // Los clientes que quedaron vacíos no cuentan; los demás necesitan nombre y al menos un diseño
  const clientes = envio.clientes.filter((c) => !vacio(c));
  if (!clientes.length) { await aviso('Escriba el nombre del cliente y agregue al menos un diseño.'); $('#pedCliente').focus(); return; }
  for (const c of clientes) {
    const k = envio.clientes.indexOf(c);
    if (!c.cliente.trim()) { await aviso(`Falta el nombre del cliente ${k + 1}.`); elegirCliente(k); $('#pedCliente').focus(); return; }
    if (!c.items.length) { await aviso(`${c.cliente.trim()} no tiene diseños. Agréguele diseños o quítelo del pedido.`); elegirCliente(k); return; }
  }
  const datos = clientes.map((c) => ({
    cliente: c.cliente.trim(), telefono: c.telefono.trim(), notas: c.notas.trim(),
    items: c.items.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre || '', ruta: i.ruta, cantidad: Math.max(1, parseInt(i.cantidad, 10) || 1) })),
  }));
  const t = { d: datos.reduce((s, c) => s + c.items.length, 0), u: datos.reduce((s, c) => s + unid(c.items), 0) };
  const formato = await elegirFormato(`${datos.length} cliente${datos.length === 1 ? '' : 's'} · ${t.d} diseños · ${t.u} unidades`);
  if (!formato) return;

  $('#esperaTexto').textContent = `Generando el ${NOMBRE_FORMATO[formato]} del pedido…`;
  $('#espera').classList.remove('oculto');
  try {
    const p = await window.api.registrarPedido(datos);
    const r = await generarArchivo(p, formato);
    const ids = envio.clientes.flatMap((c) => c.items.map((i) => i.id));
    envio = { clientes: [clienteVacio()], actual: 0 };
    elegirCliente(0);
    ids.forEach(refrescarTarjeta);
    cerrarPaneles();
    mostrarListo(p, formato, r);
  } catch (err) {
    aviso('No se pudo hacer el pedido: ' + limpiarError(err));
  } finally {
    $('#espera').classList.add('oculto');
  }
};

function mostrarListo(p, formato, r) {
  ultimo = { pedido: p, formato };
  const nombre = NOMBRE_FORMATO[formato];
  $('#listoNum').textContent = '#' + String(p.numero).padStart(4, '0');
  $('#listoArchivo').textContent = r.archivo;
  $('#listoIco').className = `doc-ico ${formato}`;
  $('#listoIco').textContent = formato === 'xlsx' ? 'XLS' : 'PDF';
  $('#listoClientes').textContent = `Clientes: ${window.Documentos.nombresClientes(p)}`;
  if (WEB) {
    $('#listoTexto').textContent = `El ${nombre} está listo. Presione "Enviar por WhatsApp", elija WhatsApp en el menú de compartir y luego el chat.`;
    $('#listoPasos').classList.add('oculto');
  } else if (r.via) {
    $('#listoTexto').textContent = (r.via === 'web'
      ? 'Se abrió WhatsApp Web en el navegador con el resumen del pedido. '
      : 'Se abrió WhatsApp con el resumen del pedido. ')
      + (r.copiado ? `El ${nombre} ya está copiado: solo péguelo en el chat.` : `Arrastre el ${nombre} de abajo al chat.`);
  }
  $('#listo').classList.remove('oculto');
}
if (!WEB) $('#listoPDF').draggable = true;
$('#listoPDF').addEventListener('dragstart', (e) => { e.preventDefault(); window.api.arrastrarArchivo(ultimo.pedido.numero, ultimo.formato); });
// Celular: compartir necesita un toque directo, por eso se hace con este botón y no automáticamente
$('#listoCompartir').onclick = async () => {
  const r = await window.api.compartir(ultimo.pedido.numero, ultimo.formato);
  if (r.via === 'compartido') { $('#listo').classList.add('oculto'); toast('Pedido compartido'); }
  if (r.via === 'pendiente') toast('Toque "Enviar por WhatsApp" otra vez');
  if (r.via === 'descargado') aviso('Este navegador no permite compartir este archivo. Se descargó y se abrió WhatsApp: adjúntelo desde Descargas (clip 📎 → Documento).');
};
$('#listoDescargar').onclick = () => window.api.descargarArchivo(ultimo.pedido.numero, ultimo.formato);
$('#listoAbrir').onclick = () => window.api.abrirArchivo(ultimo.pedido.numero, ultimo.formato);
$('#listoCopiar').onclick = async () => toast((await window.api.copiarArchivo(ultimo.pedido.numero, ultimo.formato)) ? 'Archivo copiado: péguelo con Ctrl + V' : 'No se pudo copiar el archivo');
$('#listoWhats').onclick = () => window.api.reenviar(ultimo.pedido.numero, ultimo.formato);

// ---------- Pedidos hechos ----------
let pedidosHechos = [];
async function pintarPedidos() {
  pedidosHechos = (await window.api.leerPedidos()).map(window.Documentos.normalizar);
  const q = norm($('#buscarPedido').value.trim());
  const lista = pedidosHechos.filter((p) => !q
    || p.clientes.some((c) => norm(c.cliente).includes(q) || c.items.some((i) => norm(i.codigo) === q))
    || String(p.numero) === q.replace(/^0+/, ''));
  $('#tablaPedidos').innerHTML = lista.map((p) => {
    const t = window.Documentos.totales(p);
    const codigos = p.clientes.flatMap((c) => c.items.map((i) => i.codigo));
    return `
    <tr data-num="${p.numero}">
      <td><b>${String(p.numero).padStart(4, '0')}</b></td>
      <td>${new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${p.clientes.map((c) => `${esc(c.cliente)}${c.telefono ? ` <small>${esc(c.telefono)}</small>` : ''}`).join('<br>')}</td>
      <td title="${esc(codigos.join(', '))}">${t.disenos}: ${esc(codigos.slice(0, 6).join(', '))}${codigos.length > 6 ? '…' : ''}</td>
      <td>${t.unidades}</td>
      <td class="acc">
        <button class="sec" data-acc="abrir">Abrir</button>
        <button class="sec solo-escritorio" data-acc="carpeta">Carpeta</button>
        <button class="pri" data-acc="enviar">Enviar por WhatsApp</button>
      </td>
    </tr>`;
  }).join('');
  $('#sinPedidos').classList.toggle('oculto', lista.length > 0);
}
$('#buscarPedido').addEventListener('input', pintarPedidos);
$('#tablaPedidos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acc]');
  if (!b) return;
  const p = pedidosHechos.find((x) => x.numero === +b.closest('tr').dataset.num);
  if (b.dataset.acc === 'carpeta') { window.api.mostrarCarpeta(p.numero); return; }
  // Abrir y Enviar vuelven a armar el archivo en el formato que se elija
  const t = window.Documentos.totales(p);
  const formato = await elegirFormato(`Pedido ${String(p.numero).padStart(4, '0')} · ${t.clientes} cliente${t.clientes === 1 ? '' : 's'} · ${t.disenos} diseños`);
  if (!formato) return;
  const enviar = b.dataset.acc === 'enviar';
  $('#esperaTexto').textContent = `Generando el ${NOMBRE_FORMATO[formato]}…`;
  $('#espera').classList.remove('oculto');
  try {
    // En el celular el envío lo hace el botón del diálogo (exige un toque reciente)
    const r = await generarArchivo(p, formato, enviar && !WEB);
    if (enviar || WEB) mostrarListo(p, formato, r);
  } catch (err) {
    aviso('No se pudo generar el archivo: ' + limpiarError(err));
  } finally {
    $('#espera').classList.add('oculto');
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
$('#cfgCarpetaPDF').onclick = () => window.api.mostrarCarpeta(0);
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
    if (b?.clientes?.length) envio = { clientes: b.clientes.map((c) => ({ ...clienteVacio(), ...c })), actual: Math.min(b.actual || 0, b.clientes.length - 1) };
    else if (b?.items) envio = { clientes: [{ ...clienteVacio(), ...b }], actual: 0 }; // borrador de la versión de un solo cliente
  } catch { /* borrador dañado: se ignora */ }
  elegirCliente(envio.actual);

  const cat = await window.api.leerCatalogo();
  if (cat) cargarCatalogo(cat);
  else $('#estadoCatalogo').textContent = 'Primera carga desde Google Drive…';
  // Siempre se refresca al abrir para traer los diseños nuevos; mientras tanto se usa la copia guardada.
  // En el celular el catálogo viene dentro del archivo y no se puede leer el Drive directamente.
  if (!WEB) actualizar(!!cat);
  if (!angosta()) $('#buscar').focus();
})();
