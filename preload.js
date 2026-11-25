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
  registrarPedido: (clientes) => ipcRenderer.invoke('pedidos:registrar', clientes),
  guardarDocumento: (datos) => ipcRenderer.invoke('pedidos:guardarDoc', datos),
  copiarArchivo: (numero, formato) => ipcRenderer.invoke('pedidos:copiar', numero, formato),
  reenviar: (numero, formato) => ipcRenderer.invoke('pedidos:reenviar', numero, formato),
  abrirArchivo: (numero, formato) => ipcRenderer.invoke('pedidos:abrir', numero, formato),
  mostrarCarpeta: (numero, formato) => ipcRenderer.invoke('pedidos:carpeta', numero, formato),
  arrastrarArchivo: (numero, formato) => ipcRenderer.send('pedidos:arrastrar', numero, formato),
  abrirDrive: (id) => ipcRenderer.invoke('drive:abrir', id),
});
