# Catálogo Sublimación — Guía rápida

App **solo para consultar** el catálogo de diseños: búsqueda por código o por tema, vista ampliada y compartir un diseño por WhatsApp (solo la imagen con su código). No hace pedidos (desde la versión 2.0.0).

## Instalar en la computadora (Windows)
Ejecute `dist\CatalogoSublimacion-Instalador-2.1.0.exe` (crea ícono en el Escritorio).
También está `dist\CatalogoSublimacion-Portable-2.1.0.exe`, que se abre sin instalar (sirve para llevar en una memoria USB).

## Celulares iPhone y Android: enlace publicado (recomendado)
**https://dsolismendez23-design.github.io/catalogo-sublimacion/**

- En la app de Windows: Configuración → **Copiar enlace**, y envíelo por WhatsApp a quien vaya a consultar el catálogo.
- **iPhone:** abrir el enlace en **Safari** → botón Compartir (cuadro con flecha) → **Agregar a pantalla de inicio**. Queda el ícono "Catálogo".
- **Android:** abrir en **Chrome** → menú ⋮ → **Agregar a pantalla principal** (o **Instalar app**).
- **Se actualiza solo**: cada 4 horas (6:00 y 10:00 a. m., 2:00 y 6:00 p. m., etc.) GitHub lee el Google Drive y publica los diseños nuevos. GitHub a veces atrasa estas corridas un par de horas. Para actualizar al momento: en https://github.com/dsolismendez23-design/catalogo-sublimacion/actions → *Publicar catálogo* → **Run workflow**.
- Si GitHub manda un correo diciendo que la tarea se desactivó, entre a esa misma página y presione **Enable workflow**.
- Es público: cualquiera con el enlace ve el catálogo (las imágenes ya eran públicas en Drive).

## Archivo para celular Android (sin publicar nada)
El celular no puede abrir un .exe. La versión para celular es **un solo archivo**: `CatalogoSublimacion.html` (unos 0,3 MB), con la app y todo el catálogo adentro.

1. En la app de la computadora: **Configuración → Generar archivo para celular**. Se crea en `Documentos\Catalogo Sublimacion celular\`.
2. Páselo al celular: por WhatsApp (a usted misma), con cable USB o por Google Drive.
3. **Android:** toque el archivo y ábralo con **Chrome**. Para tenerlo a mano, ábralo desde la app *Archivos* (en Descargas) o deje fijado el chat donde lo recibió.
4. Funciona igual que en la computadora: búsqueda por código o por tema (botón **☰ Temas**).

- Las imágenes se ven con internet (datos o wifi), porque se toman del Google Drive.
- Los diseños nuevos que suban a Drive **no** aparecen solos en este archivo: genérelo otra vez en la computadora y reemplace el del celular.
- **iPhone:** iOS no ejecuta archivos HTML guardados en el teléfono. En iPhone use el enlace publicado (sección anterior).

## De dónde salen los diseños
Del Google Drive **CATALOGO MODATELAS**:
https://drive.google.com/drive/folders/1UswdTNur0HFNMGvHxOR00U9_NrrzANbN

- Cada carpeta y subcarpeta es un **tema** (NAVIDAD › COLECCION 2026 › ALMOHADONES…).
- El **nombre de la imagen es el código** (`5050.png` → código 5050; `2550 UNICORNIOS.jpg` → código 2550, nombre UNICORNIOS).
- La carpeta MOCKUPS no se muestra porque no tiene diseños del catálogo.
- La carpeta tiene que seguir compartida como "Cualquier persona con el enlace". No hace falta usuario ni contraseña.

Cada vez que se abre la app de Windows, se revisa el Drive en segundo plano (tarda unos 40 segundos) para traer los diseños nuevos. Mientras tanto se usa la copia guardada, así que se puede consultar de una vez. El botón **Actualizar catálogo** hace lo mismo a mano.
Las miniaturas que ya se vieron quedan guardadas en la computadora y cargan más rápido la siguiente vez.

## Consultar
- **Por código**: escriba el número en el buscador (`5050`). Para ver varios a la vez, sepárelos con coma (`5050, 5052, 152`).
- **Por tema**: elija el tema en la lista de la izquierda (en el celular, botón **☰ Temas**) o escriba la palabra (`navidad`, `mickey`, `almohadones`). Se pueden combinar: elija un tema y busque dentro de él.
- Toque una imagen para verla grande. Con las flechas ‹ › pasa a la siguiente, y **Ver original** la abre en Drive.

## Compartir un diseño por WhatsApp
En la vista grande, presione **Compartir por WhatsApp**. Se comparte **solo la imagen**, con una franja morada abajo que dice **"Código ####"**, más el texto "Código ####". No se manda ningún enlace a la página.
- **Celular:** se abre el menú Compartir; elija WhatsApp y el chat. Si la imagen todavía se estaba preparando, la app avisa "toque otra vez" y al segundo toque sale de una vez.
- **Windows:** la imagen queda copiada y se abre WhatsApp con el código escrito: en el chat presione **Ctrl + V** y **Enviar**.

## Configuración (solo en Windows)
- **Carpeta de Google Drive**, por si algún día el catálogo se cambia de carpeta.
- **Enlace para celulares**, para copiarlo y enviarlo.
- **Generar archivo para celular** (Android, sin publicar nada).

## Datos
`%APPDATA%\Catalogo Sublimacion`: catalogo.json (copia del índice del Drive), config.json y miniaturas\.
Los pedidos hechos con versiones anteriores (1.x) siguen guardados en `pedidos.json` y en `Documentos\Pedidos Sublimacion`; la app ya no los usa, pero no se borraron.

## Para programar
`npm start` abre la app; `npm run dist` genera los .exe en `dist\`; `npm run movil` genera `celular\CatalogoSublimacion.html` con el catálogo guardado (`npm run movil -- --drive` lo lee del Drive primero).
El código de la pantalla (`src\`) es el mismo para las dos versiones: en Windows lo conecta `preload.js` y en el celular `src\api-web.js` (catálogo incrustado, imágenes directo de Google). `movil.js` mete todo en un solo HTML.
La versión con pedidos (varios clientes, PDF/Excel por WhatsApp) quedó en el historial de git hasta el commit "Excel en Android" (versión 1.3.0).
