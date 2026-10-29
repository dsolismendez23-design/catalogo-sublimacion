// HTML del pedido que se imprime a PDF (tamaño carta). Las imágenes llegan ya incrustadas en base64.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function htmlPedido(p, imagenes, negocio) {
  const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
  const fecha = new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' });
  const tarjetas = p.items.map((it, n) => `
    <div class="item">
      <div class="foto">${imagenes[it.id] ? `<img src="${imagenes[it.id]}">` : '<span>Sin imagen</span>'}</div>
      <div class="dato">
        <div class="cod"><span class="n">${n + 1}.</span> Código ${esc(it.codigo)}</div>
        ${it.nombre ? `<div class="nom">${esc(it.nombre)}</div>` : ''}
        <div class="ruta">${esc(it.ruta.join(' › '))}</div>
        <div class="cant">Cantidad: <b>${it.cantidad}</b></div>
      </div>
    </div>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedido ${p.numero}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1f1a2b; margin: 0; font-size: 11pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #7b3fa0; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { margin: 0; font-size: 20pt; color: #7b3fa0; }
  .neg { font-size: 10pt; color: #6b6478; text-transform: uppercase; letter-spacing: .08em; }
  .num { text-align: right; font-size: 10pt; color: #6b6478; }
  .num b { display: block; font-size: 18pt; color: #1f1a2b; }
  .cliente { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; background: #f3eef8; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
  .cliente div span { color: #6b6478; font-size: 9pt; display: block; }
  .cliente .full { grid-column: 1 / -1; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .item { border: 1px solid #ddd5e6; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .foto { height: 170px; background: #faf8fc; display: flex; align-items: center; justify-content: center; }
  .foto img { max-width: 100%; max-height: 170px; object-fit: contain; }
  .foto span { color: #aaa; font-size: 9pt; }
  .dato { padding: 6px 9px 8px; }
  .cod { font-weight: 700; font-size: 12pt; }
  .cod .n { color: #7b3fa0; }
  .nom { font-size: 9.5pt; }
  .ruta { font-size: 8pt; color: #6b6478; margin: 2px 0 4px; }
  .cant { font-size: 10.5pt; }
  .resumen { margin-top: 16px; border-top: 1px solid #ddd5e6; padding-top: 10px; display: flex; gap: 30px; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 9.5pt; break-before: auto; }
  th, td { border-bottom: 1px solid #e6e0ec; padding: 4px 6px; text-align: left; }
  th { background: #f3eef8; }
  td.c { text-align: center; }
</style></head><body>
<header>
  <div><div class="neg">${esc(negocio)}</div><h1>Pedido de diseños</h1></div>
  <div class="num">Pedido N.º<b>${String(p.numero).padStart(4, '0')}</b>${esc(fecha)}</div>
</header>
<section class="cliente">
  <div><span>Nombre</span><b>${esc(p.cliente)}</b></div>
  <div><span>Teléfono</span>${esc(p.telefono || '—')}</div>
  ${p.notas ? `<div class="full"><span>Notas</span>${esc(p.notas)}</div>` : ''}
</section>
<div class="grid">${tarjetas}</div>
<div class="resumen"><div>Diseños: <b>${p.items.length}</b></div><div>Unidades: <b>${unidades}</b></div></div>
<table>
  <thead><tr><th>#</th><th>Código</th><th>Tema</th><th class="c">Cantidad</th></tr></thead>
  <tbody>${p.items.map((it, n) => `<tr><td>${n + 1}</td><td><b>${esc(it.codigo)}</b>${it.nombre ? ' ' + esc(it.nombre) : ''}</td><td>${esc(it.ruta.join(' › '))}</td><td class="c">${it.cantidad}</td></tr>`).join('')}</tbody>
</table>
</body></html>`;
}

module.exports = { htmlPedido };
