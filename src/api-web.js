// Versión celular: reemplaza a preload.js cuando la app se abre como un solo archivo HTML en el navegador.
// El catálogo viene incrustado (window.CATALOGO_EMBEBIDO, lo pone movil.js), los pedidos se guardan en el
// navegador y el PDF se arma con jsPDF y se comparte con el menú "Compartir" del celular (WhatsApp).
(function () {
  const CLAVE_PEDIDOS = 'catalogoSublimacion_pedidos';
  const CLAVE_CONFIG = 'catalogoSublimacion_config';
  const ENLACE_DRIVE = 'https://drive.google.com/drive/folders/1UswdTNur0HFNMGvHxOR00U9_NrrzANbN';
  const urlImagen = (id, sz) => `https://lh3.googleusercontent.com/d/${id}=w${sz}`;

  const leer = (clave, defecto) => { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch { return defecto; } };
  const guardar = (clave, v) => { try { localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  const leerConfig = () => ({ negocio: 'MODATEX Sublimado', whatsapp: '', ...leer(CLAVE_CONFIG, {}) });
  const leerPedidos = () => leer(CLAVE_PEDIDOS, { consecutivo: 0, lista: [] });

  // El catálogo viene compacto: rutas una sola vez y cada diseño como [id, código, nombre, índice de ruta]
  function expandirCatalogo() {
    const c = window.CATALOGO_EMBEBIDO;
    if (!c) return null;
    const rutas = c.rutas.map((r) => (r ? r.split('/') : []));
    return { fecha: c.fecha, disenos: c.disenos.map(([id, codigo, nombre, r]) => ({ id, codigo, nombre, ruta: rutas[r], archivo: '' })) };
  }

  // ---------- PDF ----------
  async function imagenJPEG(id) {
    try {
      const r = await fetch(urlImagen(id, 400));
      if (!r.ok) return null;
      const bmp = await createImageBitmap(await r.blob());
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(bmp, 0, 0);
      return { data: c.toDataURL('image/jpeg', 0.85), w: bmp.width, h: bmp.height };
    } catch { return null; }
  }

  const num4 = (n) => String(n).padStart(4, '0');
  const nombrePDF = (p) => `Pedido ${num4(p.numero)} - ${p.cliente.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)} - ${p.fecha.slice(0, 10)}.pdf`;

  async function crearPDF(p) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const morado = [123, 63, 160], gris = [107, 100, 120], negro = [31, 26, 43];
    const M = 30, ANCHO = 612 - 2 * M, ALTO = 792;
    const negocio = leerConfig().negocio;
    const imagenes = await Promise.all(p.items.map((it) => imagenJPEG(it.id)));

    // Encabezado
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(negocio.toUpperCase(), M, 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...morado);
    doc.text('Pedido de diseños', M, 66);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text('Pedido N.º', 612 - M, 36, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...negro);
    doc.text(num4(p.numero), 612 - M, 56, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' }), 612 - M, 70, { align: 'right' });
    doc.setDrawColor(...morado); doc.setLineWidth(2.5); doc.line(M, 80, 612 - M, 80);

    // Datos de quien pide
    doc.setFontSize(10); // las notas se miden con el mismo tamaño con que se escriben
    const notas = p.notas ? doc.splitTextToSize(p.notas, ANCHO - 24) : [];
    const altoCliente = 46 + (notas.length ? 14 + notas.length * 12 : 0);
    doc.setFillColor(243, 238, 248); doc.roundedRect(M, 92, ANCHO, altoCliente, 6, 6, 'F');
    doc.setFontSize(8); doc.setTextColor(...gris);
    doc.text('Nombre', M + 12, 108); doc.text('Teléfono', M + ANCHO / 2, 108);
    doc.setFontSize(11); doc.setTextColor(...negro);
    doc.setFont('helvetica', 'bold'); doc.text(p.cliente, M + 12, 124);
    doc.setFont('helvetica', 'normal'); doc.text(p.telefono || '—', M + ANCHO / 2, 124);
    if (notas.length) {
      doc.setFontSize(8); doc.setTextColor(...gris); doc.text('Notas', M + 12, 142);
      doc.setFontSize(10); doc.setTextColor(...negro); doc.text(notas, M + 12, 155);
    }

    // Tarjetas de diseños, 3 por fila
    const GAP = 10, COL = (ANCHO - 2 * GAP) / 3, FOTO = 130, ALTO_T = FOTO + 76;
    let y = 92 + altoCliente + 14;
    p.items.forEach((it, n) => {
      const col = n % 3;
      if (col === 0 && n > 0) y += ALTO_T + GAP;
      if (col === 0 && y + ALTO_T > ALTO - M) { doc.addPage(); y = M; }
      const x = M + col * (COL + GAP);
      doc.setDrawColor(221, 213, 230); doc.setLineWidth(0.8); doc.roundedRect(x, y, COL, ALTO_T, 6, 6, 'S');
      doc.setFillColor(250, 248, 252); doc.rect(x + 1, y + 1, COL - 2, FOTO, 'F');
      const img = imagenes[n];
      if (img) {
        const k = Math.min((COL - 8) / img.w, (FOTO - 8) / img.h);
        const w = img.w * k, h = img.h * k;
        doc.addImage(img.data, 'JPEG', x + (COL - w) / 2, y + 1 + (FOTO - h) / 2, w, h);
      } else {
        doc.setFontSize(8); doc.setTextColor(170, 170, 170); doc.text('Sin imagen', x + COL / 2, y + FOTO / 2, { align: 'center' });
      }
      let ty = y + FOTO + 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...morado);
      doc.text(`${n + 1}.`, x + 8, ty);
      doc.setTextColor(...negro); doc.text(`Código ${it.codigo}`, x + 8 + doc.getTextWidth(`${n + 1}. `), ty);
      doc.setFont('helvetica', 'normal');
      if (it.nombre) { ty += 11; doc.setFontSize(8.5); doc.text(doc.splitTextToSize(it.nombre, COL - 16)[0], x + 8, ty); }
      ty += 11; doc.setFontSize(7.5); doc.setTextColor(...gris);
      const ruta = doc.splitTextToSize(it.ruta.join(' / '), COL - 16).slice(0, 2);
      doc.text(ruta, x + 8, ty);
      doc.setFontSize(10); doc.setTextColor(...negro);
      doc.text(`Cantidad: ${it.cantidad}`, x + 8, y + ALTO_T - 9);
    });
    y += ALTO_T + 20;

    // Resumen y tabla
    const filaTabla = (cols, yy, negrita, fondo) => {
      if (fondo) { doc.setFillColor(243, 238, 248); doc.rect(M, yy - 11, ANCHO, 16, 'F'); }
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(...negro);
      doc.text(cols[0], M + 6, yy);
      doc.text(cols[1], M + 30, yy);
      doc.text(doc.splitTextToSize(cols[2], 300)[0], M + 160, yy);
      doc.text(cols[3], 612 - M - 10, yy, { align: 'right' });
      doc.setDrawColor(230, 224, 236); doc.setLineWidth(0.6); doc.line(M, yy + 5, 612 - M, yy + 5);
    };
    if (y + 60 > ALTO - M) { doc.addPage(); y = M + 10; }
    const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...negro);
    doc.text(`Diseños: ${p.items.length}      Unidades: ${unidades}`, M, y);
    y += 22;
    filaTabla(['#', 'Código', 'Tema', 'Cantidad'], y, true, true);
    p.items.forEach((it, n) => {
      y += 17;
      if (y > ALTO - M) { doc.addPage(); y = M + 10; filaTabla(['#', 'Código', 'Tema', 'Cantidad'], y, true, true); y += 17; }
      filaTabla([String(n + 1), `${it.codigo}${it.nombre ? ' ' + it.nombre : ''}`.slice(0, 26), it.ruta.join(' / '), String(it.cantidad)], y);
    });

    return new File([doc.output('blob')], nombrePDF(p), { type: 'application/pdf' });
  }

  // PDF ya armados en esta sesión, para compartir al instante (el menú Compartir exige un toque reciente)
  const pdfs = new Map();
  async function archivoPDF(p) {
    if (!pdfs.has(p.numero)) pdfs.set(p.numero, await crearPDF(p));
    return pdfs.get(p.numero);
  }

  function textoWhatsApp(p) {
    return [
      `*PEDIDO #${num4(p.numero)}*`, `Cliente: ${p.cliente}`, p.telefono ? `Teléfono: ${p.telefono}` : null,
      `Diseños: ${p.items.length} · Unidades: ${p.items.reduce((s, i) => s + i.cantidad, 0)}`, '',
      ...p.items.map((i) => `• ${i.codigo} x${i.cantidad} (${i.ruta.join(' / ')})`),
      p.notas ? `\nNotas: ${p.notas}` : null,
    ].filter((l) => l !== null).join('\n');
  }

  function descargar(archivo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(archivo);
    a.download = archivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // Comparte el PDF (Android/iPhone muestran WhatsApp en el menú). Si el navegador no deja compartir archivos,
  // se descarga el PDF y se abre WhatsApp con el resumen para adjuntarlo a mano.
  async function compartir(p) {
    const archivo = await archivoPDF(p);
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: archivo.name, text: textoWhatsApp(p) });
        return { via: 'compartido' };
      } catch (e) {
        if (e.name === 'AbortError') return { via: 'cancelado' };
        if (e.name === 'NotAllowedError') return { via: 'pendiente' };
      }
    }
    descargar(archivo);
    const numero = String(leerConfig().whatsapp || '').replace(/\D/g, '');
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(textoWhatsApp(p) + '\n\n(Adjunto el PDF del pedido)')}`, '_blank');
    return { via: 'descargado' };
  }

  const buscarPedido = (numero) => leerPedidos().lista.find((p) => p.numero === numero);

  window.api = {
    esMovil: true,
    miniatura: urlImagen,
    leerCatalogo: async () => expandirCatalogo(),
    actualizarCatalogo: async () => ({ ok: false, error: 'En el celular el catálogo se actualiza generando un archivo nuevo desde la computadora.' }),
    alProgreso: () => {},
    leerConfig: async () => leerConfig(),
    guardarConfig: async (cambios) => { const c = { ...leerConfig(), ...cambios }; guardar(CLAVE_CONFIG, c); return c; },
    leerPedidos: async () => leerPedidos().lista,
    hacerPedido: async (datos) => {
      const reg = leerPedidos();
      const pedido = {
        numero: reg.consecutivo + 1,
        fecha: new Date().toISOString(),
        cliente: String(datos.cliente || '').trim(),
        telefono: String(datos.telefono || '').trim(),
        notas: String(datos.notas || '').trim(),
        items: datos.items.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre || '', ruta: i.ruta, cantidad: Math.max(1, parseInt(i.cantidad, 10) || 1) })),
      };
      if (!pedido.cliente) throw new Error('Falta el nombre');
      if (!pedido.items.length) throw new Error('El pedido no tiene diseños');
      const archivo = await archivoPDF(pedido);
      pedido.pdf = archivo.name;
      reg.consecutivo = pedido.numero;
      reg.lista.unshift(pedido);
      guardar(CLAVE_PEDIDOS, reg);
      return { pedido, via: 'listo' };
    },
    enviarPedido: async (numero) => compartir(buscarPedido(numero)),
    prepararPDF: async (numero) => { await archivoPDF(buscarPedido(numero)); },
    copiarPDF: async () => false,
    abrirPDF: async (numero) => {
      const archivo = await archivoPDF(buscarPedido(numero));
      const url = URL.createObjectURL(archivo);
      if (!window.open(url, '_blank')) descargar(archivo);
    },
    descargarPDF: async (numero) => descargar(await archivoPDF(buscarPedido(numero))),
    mostrarPDF: async () => {},
    arrastrarPDF: () => {},
    abrirDrive: async (id) => { window.open(id ? `https://drive.google.com/file/d/${id}/view` : ENLACE_DRIVE, '_blank'); },
  };
})();
