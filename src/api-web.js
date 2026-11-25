// Versión celular: reemplaza a preload.js cuando la app se abre como página (archivo HTML o enlace publicado).
// El catálogo viene incrustado (window.CATALOGO_EMBEBIDO, lo pone movil.js) y las imágenes se piden a Google.
(function () {
  const ENLACE_DRIVE = 'https://drive.google.com/drive/folders/1UswdTNur0HFNMGvHxOR00U9_NrrzANbN';
  const urlImagen = (id, sz) => `https://lh3.googleusercontent.com/d/${id}=w${sz}`;

  // El catálogo viene compacto: rutas una sola vez y cada diseño como [id, código, nombre, índice de ruta]
  function expandirCatalogo() {
    const c = window.CATALOGO_EMBEBIDO;
    if (!c) return null;
    const rutas = c.rutas.map((r) => (r ? r.split('/') : []));
    return { fecha: c.fecha, disenos: c.disenos.map(([id, codigo, nombre, r]) => ({ id, codigo, nombre, ruta: rutas[r], archivo: '' })) };
  }

  window.api = {
    esMovil: true,
    miniatura: urlImagen,
    leerCatalogo: async () => expandirCatalogo(),
    actualizarCatalogo: async () => ({ ok: false, error: 'En el celular el catálogo viene dentro de la página.' }),
    alProgreso: () => {},
    abrirDrive: async (id) => { window.open(id ? `https://drive.google.com/file/d/${id}/view` : ENLACE_DRIVE, '_blank'); },
  };
})();
