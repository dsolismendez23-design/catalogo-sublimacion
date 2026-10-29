# Catálogo Sublimación — Guía rápida

## Instalar en la computadora (Windows)
Ejecute `dist\CatalogoSublimacion-Instalador-1.1.0.exe` (crea ícono en el Escritorio).
También está `dist\CatalogoSublimacion-Portable-1.1.0.exe`, que se abre sin instalar (sirve para llevar en una memoria USB).

## Usar en el celular (sin internet de por medio para la app, sin publicar nada)
El celular no puede abrir un .exe. La versión para celular es **un solo archivo**: `CatalogoSublimacion.html` (unos 0,7 MB), con la app y todo el catálogo adentro.

1. En la app de la computadora: **Configuración → Generar archivo para celular**. Se crea en `Documentos\Catalogo Sublimacion celular\`.
2. Páselo al celular: por WhatsApp (a usted misma), con cable USB o por Google Drive.
3. **Android:** toque el archivo y ábralo con **Chrome**. Para tenerlo a mano, ábralo desde la app *Archivos* (en Descargas) o deje fijado el chat donde lo recibió.
4. Funciona igual que en la computadora: búsqueda por código o por tema (botón **☰ Temas**) y el botón morado **Pedido (n)** abajo a la derecha.
5. **Hacer pedido** arma el PDF dentro del celular. Luego **Enviar por WhatsApp** abre el menú Compartir: elija WhatsApp y el chat, y el PDF va adjunto.

- Las imágenes se ven con internet (datos o wifi), porque se toman del Google Drive.
- Los diseños nuevos que suban a Drive **no** aparecen solos en el celular: genere el archivo otra vez en la computadora y reemplace el del celular.
- Los pedidos hechos en el celular se guardan en el navegador del celular. Su numeración es independiente de la de la computadora.
- **iPhone:** iOS no ejecuta archivos HTML guardados en el teléfono (la app Archivos solo los muestra como texto). Para usarla en iPhone habría que publicarla en internet.

## De dónde salen los diseños
Del Google Drive **CATALOGO MODATELAS**:
https://drive.google.com/drive/folders/1UswdTNur0HFNMGvHxOR00U9_NrrzANbN

- Cada carpeta y subcarpeta es un **tema** (NAVIDAD › COLECCION 2026 › ALMOHADONES…).
- El **nombre de la imagen es el código** (`5050.png` → código 5050; `2550 UNICORNIOS.jpg` → código 2550, nombre UNICORNIOS).
- La carpeta MOCKUPS no se muestra porque no tiene diseños para pedir.
- La carpeta tiene que seguir compartida como "Cualquier persona con el enlace". No hace falta usuario ni contraseña.

Cada vez que se abre la app, se revisa el Drive en segundo plano (tarda unos 40 segundos) para traer los diseños nuevos. Mientras tanto se usa la copia guardada, así que se puede consultar de una vez. El botón **Actualizar catálogo** hace lo mismo a mano.
Las miniaturas que ya se vieron quedan guardadas en la computadora y cargan más rápido la siguiente vez.

## Consultar
- **Por código**: escriba el número en el buscador (`5050`). Para ver varios a la vez, sepárelos con coma (`5050, 5052, 152`).
- **Por tema**: elija el tema en la lista de la izquierda o escriba la palabra (`navidad`, `mickey`, `almohadones`). Se pueden combinar: elija un tema y busque dentro de él.
- Haga clic en una imagen para verla grande. Con las flechas ‹ › pasa a la siguiente, y **Ver original** la abre en Drive.

## Hacer un pedido
1. Escriba el **Nombre** (obligatorio). El teléfono y las notas son opcionales.
2. Presione **+ Agregar** en cada diseño. En el panel de la derecha ajusta la cantidad o quita diseños.
3. Presione **Hacer pedido**. La app:
   - genera el PDF con número consecutivo, las imágenes, los códigos, los temas y las cantidades;
   - lo guarda en `Documentos\Pedidos Sublimacion`;
   - lo deja **copiado** en el portapapeles;
   - abre WhatsApp con el resumen del pedido ya escrito.
4. En el chat de WhatsApp presione **Ctrl + V** para pegar el PDF (o arrástrelo desde la ventana de la app) y luego **Enviar**.

WhatsApp no deja que otro programa envíe archivos solo: el último clic de Enviar siempre lo hace la persona.

## Configuración
- **Número de WhatsApp** que recibe los pedidos, con código de país (ej. `506 8888 8888`). Si se deja vacío, WhatsApp se abre para que usted elija el contacto.
- **Nombre del negocio** que sale en el encabezado del PDF.
- **Carpeta de Google Drive**, por si algún día el catálogo se cambia de carpeta.

## Pedidos hechos
Lista de todos los pedidos, con búsqueda por nombre, número o código. Desde ahí se puede abrir el PDF otra vez o volver a enviarlo por WhatsApp.

## Datos
`%APPDATA%\Catalogo Sublimacion`: catalogo.json (copia del índice del Drive), config.json, pedidos.json y miniaturas\.

## Para programar
`npm start` abre la app; `npm run dist` genera los .exe en `dist\`; `npm run movil` genera `celular\CatalogoSublimacion.html` con el catálogo guardado (`npm run movil -- --drive` lo lee del Drive primero).
El código de la pantalla (`src\`) es el mismo para las dos versiones: en Windows lo conecta `preload.js` y en el celular `src\api-web.js` (catálogo incrustado, PDF con jsPDF, Compartir del navegador). `movil.js` mete todo en un solo HTML.
