// Documentos del pedido (PDF con jsPDF y Excel con ExcelJS), iguales en Windows y en el celular.
// Un pedido puede traer varios clientes: { numero, fecha, clientes: [{ cliente, telefono, notas, items: [...] }] }
(function () {
  const num4 = (n) => String(n).padStart(4, '0');
  const unidades = (items) => items.reduce((s, i) => s + i.cantidad, 0);
  const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  // Pedidos guardados antes de que existieran varios clientes: { cliente, telefono, notas, items }
  function normalizar(p) {
    if (p.clientes) return p;
    return { ...p, clientes: [{ cliente: p.cliente, telefono: p.telefono || '', notas: p.notas || '', items: p.items || [] }] };
  }

  function nombresClientes(p) {
    const n = p.clientes.map((c) => c.cliente);
    if (n.length === 1) return n[0];
    if (n.length === 2) return `${n[0]} y ${n[1]}`;
    return `${n[0]} y ${n.length - 1} más`;
  }

  function nombreArchivo(p, formato) {
    const quien = nombresClientes(p).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `Pedido ${num4(p.numero)} - ${quien} - ${p.fecha.slice(0, 10)}.${formato}`;
  }

  function totales(p) {
    const items = p.clientes.flatMap((c) => c.items);
    return { clientes: p.clientes.length, disenos: items.length, unidades: unidades(items) };
  }

  function textoWhatsApp(p) {
    const t = totales(p);
    const lineas = [
      `*PEDIDO #${num4(p.numero)}*`,
      `Fecha: ${new Date(p.fecha).toLocaleString('es-CR')}`,
      `Clientes: ${t.clientes} · Diseños: ${t.disenos} · Unidades: ${t.unidades}`,
    ];
    for (const c of p.clientes) {
      lineas.push('', `*${c.cliente}*${c.telefono ? ` (${c.telefono})` : ''}`);
      for (const i of c.items) lineas.push(`• ${i.codigo} x${i.cantidad} (${i.ruta.join(' / ')})`);
      if (c.notas) lineas.push(`Notas: ${c.notas}`);
    }
    lineas.push('', 'Adjunto el archivo del pedido.');
    return lineas.join('\n');
  }

  // Miniaturas como JPEG sobre fondo blanco (las PNG transparentes se verían negras en el PDF)
  async function cargarImagenes(p, urlImagen) {
    const ids = [...new Set(p.clientes.flatMap((c) => c.items.map((i) => i.id)))];
    const imgs = new Map();
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(urlImagen(id, 400));
        if (!r.ok) throw new Error(r.status);
        const bmp = await createImageBitmap(await r.blob());
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(bmp, 0, 0);
        imgs.set(id, { data: c.toDataURL('image/jpeg', 0.85), w: bmp.width, h: bmp.height });
      } catch { imgs.set(id, null); }
    }));
    return imgs;
  }

  // ---------- PDF ----------
  function crearPDF(p, imgs, negocio) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const morado = [123, 63, 160], gris = [107, 100, 120], negro = [31, 26, 43], lila = [243, 238, 248];
    const M = 30, W = 612, H = 792, ANCHO = W - 2 * M;
    const GAP = 10, COL = (ANCHO - 2 * GAP) / 3, FOTO = 130, ALTO_T = FOTO + 76;
    const t = totales(p);
    let y;
    const nuevaPagina = () => { doc.addPage(); y = M; };

    // Encabezado
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(negocio.toUpperCase(), M, 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...morado);
    doc.text('Pedido de diseños', M, 66);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text('Pedido N.º', W - M, 36, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...negro);
    doc.text(num4(p.numero), W - M, 56, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' }), W - M, 70, { align: 'right' });
    doc.setDrawColor(...morado); doc.setLineWidth(2.5); doc.line(M, 80, W - M, 80);
    doc.setFontSize(10); doc.setTextColor(...negro);
    doc.text(`Clientes: ${t.clientes}      Diseños: ${t.disenos}      Unidades: ${t.unidades}`, M, 98);
    y = 112;

    p.clientes.forEach((c, k) => {
      // Recuadro del cliente; si no cabe junto con la primera fila de diseños, va a la página siguiente
      doc.setFontSize(10);
      const notas = c.notas ? doc.splitTextToSize(c.notas, ANCHO - 24) : [];
      const alto = 46 + (notas.length ? 14 + notas.length * 12 : 0);
      if (y + alto + ALTO_T > H - M) nuevaPagina();
      doc.setFillColor(...lila); doc.roundedRect(M, y, ANCHO, alto, 6, 6, 'F');
      doc.setFillColor(...morado); doc.rect(M, y, 4, alto, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gris);
      doc.text(`Cliente ${k + 1} de ${t.clientes}`, M + 14, y + 15);
      doc.text('Teléfono', M + ANCHO / 2, y + 15);
      doc.text(`${c.items.length} diseño${c.items.length === 1 ? '' : 's'} · ${unidades(c.items)} unid.`, W - M - 12, y + 15, { align: 'right' });
      doc.setFontSize(12); doc.setTextColor(...negro);
      doc.setFont('helvetica', 'bold'); doc.text(c.cliente, M + 14, y + 32);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(c.telefono || '—', M + ANCHO / 2, y + 32);
      if (notas.length) {
        doc.setFontSize(8); doc.setTextColor(...gris); doc.text('Notas', M + 14, y + 50);
        doc.setFontSize(10); doc.setTextColor(...negro); doc.text(notas, M + 14, y + 63);
      }
      y += alto + 10;

      c.items.forEach((it, n) => {
        const col = n % 3;
        if (col === 0 && n > 0) y += ALTO_T + GAP;
        if (col === 0 && y + ALTO_T > H - M) nuevaPagina();
        const x = M + col * (COL + GAP);
        doc.setDrawColor(221, 213, 230); doc.setLineWidth(0.8); doc.roundedRect(x, y, COL, ALTO_T, 6, 6, 'S');
        doc.setFillColor(250, 248, 252); doc.rect(x + 1, y + 1, COL - 2, FOTO, 'F');
        const img = imgs.get(it.id);
        if (img) {
          const k2 = Math.min((COL - 8) / img.w, (FOTO - 8) / img.h);
          const w = img.w * k2, h = img.h * k2;
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
        doc.text(doc.splitTextToSize(it.ruta.join(' / '), COL - 16).slice(0, 2), x + 8, ty);
        doc.setFontSize(10); doc.setTextColor(...negro);
        doc.text(`Cantidad: ${it.cantidad}`, x + 8, y + ALTO_T - 9);
      });
      y += ALTO_T + 22;
    });

    // Resumen: todas las líneas agrupadas por cliente
    const ENCABEZADO = ['Cliente', 'Código', 'Tema', 'Cantidad'];
    const fila = (cols, negrita, fondo) => {
      if (y + 16 > H - M) { nuevaPagina(); y += 10; if (cols !== ENCABEZADO) fila(ENCABEZADO, true, lila); }
      if (fondo) { doc.setFillColor(...fondo); doc.rect(M, y - 11, ANCHO, 16, 'F'); }
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(...negro);
      doc.text(doc.splitTextToSize(cols[0], 125)[0] || '', M + 6, y);
      doc.text(doc.splitTextToSize(cols[1], 120)[0] || '', M + 136, y);
      doc.text(doc.splitTextToSize(cols[2], 245)[0] || '', M + 262, y);
      doc.text(cols[3], W - M - 10, y, { align: 'right' });
      doc.setDrawColor(230, 224, 236); doc.setLineWidth(0.6); doc.line(M, y + 5, W - M, y + 5);
      y += 17;
    };
    // Si la tabla completa no cabe aquí pero sí en una página nueva, empieza en la página nueva
    const altoTabla = 20 + 17 * (t.disenos + t.clientes + 2);
    if (y + 80 > H - M || (y + altoTabla > H - M && altoTabla <= H - 2 * M)) nuevaPagina();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...morado);
    doc.text('Resumen del pedido', M, y); y += 20;
    fila(ENCABEZADO, true, lila);
    for (const c of p.clientes) {
      c.items.forEach((it, n) => fila([n === 0 ? c.cliente : '', `${it.codigo}${it.nombre ? ' ' + it.nombre : ''}`, it.ruta.join(' / '), String(it.cantidad)]));
      fila(['', '', `Total ${c.cliente}`, String(unidades(c.items))], true);
    }
    fila(['TOTAL GENERAL', `${t.disenos} diseños`, `${t.clientes} cliente${t.clientes === 1 ? '' : 's'}`, String(t.unidades)], true, lila);
    return doc.output('blob');
  }

  // ---------- Excel ----------
  async function crearExcel(p, imgs, negocio) {
    const wb = new window.ExcelJS.Workbook();
    wb.creator = negocio;
    wb.created = new Date(p.fecha);
    const t = totales(p);
    const morado = 'FF7B3FA0', lila = 'FFF3EEF8', borde = { bottom: { style: 'thin', color: { argb: 'FFDDD5E6' } } };
    const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

    // Hoja 1: el pedido con imágenes, cliente por cliente
    const ws = wb.addWorksheet('Pedido', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    });
    ws.columns = [{ width: 5 }, { width: 17 }, { width: 11 }, { width: 22 }, { width: 42 }, { width: 10 }];
    ws.mergeCells('A1:F1'); ws.getCell('A1').value = negocio.toUpperCase();
    ws.getCell('A1').font = { size: 9, color: { argb: 'FF6B6478' } };
    ws.mergeCells('A2:D2'); ws.getCell('A2').value = 'Pedido de diseños';
    ws.getCell('A2').font = { size: 18, bold: true, color: { argb: morado } };
    ws.mergeCells('E2:F2'); ws.getCell('E2').value = `Pedido N.º ${num4(p.numero)}`;
    ws.getCell('E2').font = { size: 14, bold: true }; ws.getCell('E2').alignment = { horizontal: 'right' };
    ws.mergeCells('A3:F3'); ws.getCell('A3').value = new Date(p.fecha).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' });
    ws.getCell('A3').font = { color: { argb: 'FF6B6478' } };
    ws.mergeCells('A4:F4'); ws.getCell('A4').value = `Clientes: ${t.clientes}    Diseños: ${t.disenos}    Unidades: ${t.unidades}`;
    ws.getCell('A4').font = { bold: true };
    ws.getRow(2).height = 26;

    let r = 6;
    p.clientes.forEach((c, k) => {
      ws.mergeCells(`A${r}:F${r}`);
      const cab = ws.getCell(`A${r}`);
      cab.value = `Cliente ${k + 1}: ${c.cliente}${c.telefono ? `   ·   Tel. ${c.telefono}` : ''}`;
      cab.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      cab.fill = relleno(morado);
      cab.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(r).height = 22;
      r++;
      if (c.notas) {
        ws.mergeCells(`A${r}:F${r}`);
        ws.getCell(`A${r}`).value = `Notas: ${c.notas}`;
        ws.getCell(`A${r}`).font = { italic: true };
        ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(r).height = Math.min(60, 15 * Math.ceil(c.notas.length / 95));
        r++;
      }
      const enc = ws.getRow(r);
      enc.values = ['#', 'Imagen', 'Código', 'Nombre', 'Tema', 'Cantidad'];
      enc.font = { bold: true, color: { argb: morado } };
      enc.eachCell((cell) => { cell.fill = relleno(lila); cell.border = borde; });
      enc.getCell(6).alignment = { horizontal: 'center' };
      r++;
      const primera = r;
      c.items.forEach((it, n) => {
        const row = ws.getRow(r);
        row.values = [n + 1, '', it.codigo, it.nombre || '', it.ruta.join(' / '), it.cantidad];
        row.height = 72;
        row.alignment = { vertical: 'middle', wrapText: true };
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(3).font = { bold: true, size: 12 };
        row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(6).font = { bold: true, size: 12 };
        row.eachCell({ includeEmpty: true }, (cell) => { cell.border = borde; });
        const img = imgs.get(it.id);
        if (img) {
          // Columna B ≈ 124 px de ancho; fila de 72 pt ≈ 96 px de alto
          const k2 = Math.min(116 / img.w, 88 / img.h);
          const w = img.w * k2, h = img.h * k2;
          const id = wb.addImage({ base64: img.data, extension: 'jpeg' });
          // Centrada en la celda: el desplazamiento va como fracción de la columna y de la fila
          ws.addImage(id, { tl: { col: 1 + (124 - w) / 2 / 124, row: r - 1 + (96 - h) / 2 / 96 }, ext: { width: w, height: h }, editAs: 'oneCell' });
        }
        r++;
      });
      const tot = ws.getRow(r);
      tot.getCell(5).value = `Total ${c.cliente}`;
      tot.getCell(5).alignment = { horizontal: 'right' };
      tot.getCell(6).value = { formula: `SUM(F${primera}:F${r - 1})`, result: unidades(c.items) };
      tot.getCell(6).alignment = { horizontal: 'center' };
      tot.font = { bold: true };
      r += 3;
    });

    // Hoja 2: resumen por cliente
    const rs = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    rs.columns = [{ header: 'Cliente', width: 30 }, { header: 'Teléfono', width: 16 }, { header: 'Diseños', width: 10 }, { header: 'Unidades', width: 10 }, { header: 'Notas', width: 50 }];
    rs.getRow(1).font = { bold: true, color: { argb: morado } };
    rs.getRow(1).eachCell((cell) => { cell.fill = relleno(lila); cell.border = borde; });
    p.clientes.forEach((c) => rs.addRow([c.cliente, c.telefono || '', c.items.length, unidades(c.items), c.notas || '']));
    const n = p.clientes.length + 1;
    const total = rs.addRow(['TOTAL', '', { formula: `SUM(C2:C${n})`, result: t.disenos }, { formula: `SUM(D2:D${n})`, result: t.unidades }, '']);
    total.font = { bold: true };

    // Hoja 3: todas las líneas en una tabla, para filtrar u ordenar
    const dt = wb.addWorksheet('Detalle');
    dt.columns = [
      { header: 'Pedido', width: 8 }, { header: 'Cliente', width: 26 }, { header: 'Teléfono', width: 14 },
      { header: 'Código', width: 10 }, { header: 'Nombre', width: 22 }, { header: 'Tema', width: 44 }, { header: 'Cantidad', width: 10 },
    ];
    dt.getRow(1).font = { bold: true };
    for (const c of p.clientes) {
      for (const it of c.items) dt.addRow([num4(p.numero), c.cliente, c.telefono || '', it.codigo, it.nombre || '', it.ruta.join(' / '), it.cantidad]);
    }
    dt.autoFilter = { from: 'A1', to: 'G1' };
    dt.views = [{ state: 'frozen', ySplit: 1 }];

    return new Blob([await wb.xlsx.writeBuffer()], { type: MIME.xlsx });
  }

  // Arma el archivo del formato elegido ('pdf' o 'xlsx') y lo devuelve como File
  async function generar(p, formato, urlImagen, negocio) {
    const imgs = await cargarImagenes(p, urlImagen);
    const blob = formato === 'xlsx' ? await crearExcel(p, imgs, negocio) : crearPDF(p, imgs, negocio);
    return new File([blob], nombreArchivo(p, formato), { type: MIME[formato] });
  }

  window.Documentos = { generar, normalizar, nombresClientes, nombreArchivo, textoWhatsApp, totales, MIME };
})();
