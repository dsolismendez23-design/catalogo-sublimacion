const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  esMovil: false,
  miniatura: (id, sz) => `miniatura://img/${id}?sz=${sz}`,
  generarMovil: () => ipcRenderer.invoke('movil:generar'),
  leerCatalogo: () => ipcRenderer.invoke('catalogo:leer'),
  actualizarCatalogo: () => ipcRenderer.invoke('catalogo:actualizar'),
  alProgreso: (fn) => ipcRenderer.on('catalogo:progreso', (_e, p) => fn(p)),
  leerConfig: () => ipcRenderer.invoke('config:leer'),
  guardarConfig: (cambios) => ipcRenderer.invoke('config:guardar', cambios),
  abrirDrive: (id) => ipcRenderer.invoke('drive:abrir', id),
});
