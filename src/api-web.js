// Versión celular: reemplaza a preload.js cuando la app se abre como página (archivo HTML o enlace publicado).
// El catálogo viene incrustado (window.CATALOGO_EMBEBIDO, lo pone movil.js), los pedidos se guardan en el
// navegador y el archivo (PDF o Excel, lo arma documentos.js) se comparte con el menú "Compartir" del celular.
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

  // Archivos ya armados en esta sesión ("numero.formato" → { archivo, texto }), para compartir al instante:
  // el menú Compartir del celular exige un toque reciente, así que no puede esperar a que se arme el archivo
  const archivos = new Map();

  function descargar(archivo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(archivo);
    a.download = archivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // Comparte el archivo (Android/iPhone muestran WhatsApp en el menú). Si el navegador no deja compartir ese
  // archivo, se descarga y se abre WhatsApp con el resumen para adjuntarlo a mano.
  async function compartir(numero, formato) {
    const g = archivos.get(`${numero}.${formato}`);
    if (!g) return { via: 'falta' };
    if (navigator.canShare && navigator.canShare({ files: [g.archivo] })) {
      try {
        await navigator.share({ files: [g.archivo], title: g.archivo.name, text: g.texto });
        return { via: 'compartido' };
      } catch (e) {
        if (e.name === 'AbortError') return { via: 'cancelado' };
        if (e.name === 'NotAllowedError') return { via: 'pendiente' };
      }
    }
    descargar(g.archivo);
    const numeroWA = String(leerConfig().whatsapp || '').replace(/\D/g, '');
    window.open(`https://wa.me/${numeroWA}?text=${encodeURIComponent(g.texto)}`, '_blank');
    return { via: 'descargado' };
  }

  window.api = {
    esMovil: true,
    miniatura: urlImagen,
    leerCatalogo: async () => expandirCatalogo(),
    actualizarCatalogo: async () => ({ ok: false, error: 'En el celular el catálogo viene dentro de la página.' }),
    alProgreso: () => {},
    leerConfig: async () => leerConfig(),
    guardarConfig: async (cambios) => { const c = { ...leerConfig(), ...cambios }; guardar(CLAVE_CONFIG, c); return c; },
    leerPedidos: async () => leerPedidos().lista,

    // Le da número y fecha al pedido y lo guarda en el historial
    registrarPedido: async (clientes) => {
      const reg = leerPedidos();
      const pedido = { numero: reg.consecutivo + 1, fecha: new Date().toISOString(), clientes };
      reg.consecutivo = pedido.numero;
      reg.lista.unshift(pedido);
      guardar(CLAVE_PEDIDOS, reg);
      return pedido;
    },
    // Guarda en memoria el archivo ya armado; el envío lo hace compartir() con el toque del botón
    guardarDocumento: async ({ numero, formato, nombre, bytes, texto }) => {
      archivos.set(`${numero}.${formato}`, { archivo: new File([bytes], nombre, { type: window.Documentos.MIME[formato] }), texto });
      return { via: 'listo', archivo: nombre };
    },
    compartir,
    abrirArchivo: async (numero, formato) => {
      const g = archivos.get(`${numero}.${formato}`);
      if (!g) return;
      // El PDF se ve en el navegador; el Excel se descarga para abrirlo con la app de hojas de cálculo
      if (formato === 'pdf' && window.open(URL.createObjectURL(g.archivo), '_blank')) return;
      descargar(g.archivo);
    },
    descargarArchivo: async (numero, formato) => { const g = archivos.get(`${numero}.${formato}`); if (g) descargar(g.archivo); },
    abrirDrive: async (id) => { window.open(id ? `https://drive.google.com/file/d/${id}/view` : ENLACE_DRIVE, '_blank'); },
  };
})();
