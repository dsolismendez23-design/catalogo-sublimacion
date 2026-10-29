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
  leerPedidos: () => ipcRenderer.invoke('pedidos:leer'),
  hacerPedido: (datos) => ipcRenderer.invoke('pedidos:hacer', datos),
  enviarPedido: (numero) => ipcRenderer.invoke('pedidos:enviar', numero),
  copiarPDF: (numero) => ipcRenderer.invoke('pedidos:copiar', numero),
  abrirPDF: (numero) => ipcRenderer.invoke('pedidos:abrirPDF', numero),
  mostrarPDF: (numero) => ipcRenderer.invoke('pedidos:mostrarPDF', numero),
  arrastrarPDF: (numero) => ipcRenderer.send('pedidos:arrastrar', numero),
  abrirDrive: (id) => ipcRenderer.invoke('drive:abrir', id),
});
