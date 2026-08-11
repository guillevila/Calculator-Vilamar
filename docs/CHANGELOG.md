# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [0.2.0] — 11/08/2026

Cambio de producto, no de ajuste. Salió de probar con un informe convertido a PDF
desde una imagen comprimida.

### El hallazgo

El reconocimiento de texto leyó **24.81 donde ponía 24.01, declarando un 93 % de
fiabilidad**. En el mismo documento, un 24.07 leído bien declaraba un 79 %.

**La fiabilidad del OCR no distingue lo correcto de lo incorrecto.** No sirve como
filtro, y por tanto el programa no puede saber si un número reconocido es bueno.
Peor: 24.81 está dentro de rango, así que ninguna validación lo detecta.

### Cambiado

- **Un dato leído por OCR ya no se enseña como «correcto».** Sale como
  «⚠ compruébalo», en ámbar, aunque el valor sea perfectamente normal.
- **«Confirmar datos» ya no acepta en bloque lo leído por OCR.** Hay que
  comprobar cada uno contra el informe y pulsar «Está bien». Lo escrito a mano y
  lo que viene del texto nativo de un PDF siguen confirmándose de una vez: son
  exactos.
- Se añade la **invariante 11** con sus tests: un dato leído por una máquina no
  se da por bueno solo, por mucha fiabilidad que declare.

### Corregido

- Se probó a dibujar las páginas de un PDF escaneado directamente a resolución de
  escaneo (300 ppp). **Sale peor**, y está medido con tabla en el código: de 10
  números se leen 7, frente a 10 dibujando a tamaño moderado y ampliando después.
  Se vuelve a lo medido, con la tabla escrita para que nadie lo «optimice» otra
  vez sin rehacerla.

232 tests y 8 pruebas de interfaz.

---

## [0.1.4] — 11/08/2026

Corrige un diagnóstico equivocado de la versión anterior y arregla lo que ese
error introdujo.

### Corregido

- **Los ficheros arrastrados volvían a rechazarse.** La 0.1.3 pasó a mandar solo
  la RUTA por IPC, dando por hecho que los bytes se perdían por el camino. **Se
  midió y no era verdad**: un `Uint8Array` atraviesa el IPC íntegro, con su
  tipo, su longitud y sus bytes. Pero `webUtils.getPathForFile` devuelve a veces
  una cadena vacía, y sin ruta el fichero se descartaba. Ahora se admiten los dos
  caminos: la ruta cuando la hay —es mejor, no copia nada— y el contenido cuando
  no.
- **Un PDF corto con texto perfecto se mandaba al OCR.** El criterio era «120
  caracteres», y un informe de un solo ojo no llega. Se leía peor y más despacio
  teniendo el texto exacto delante. Ahora lo que decide es si hay **números con
  decimales**, que es lo que distingue un informe de la cabecera suelta de un
  escaneo.

### Añadido

- Prueba de interfaz del camino por CONTENIDO, además del de ruta.
- Prueba de que un archivo de 0 bytes se dice como tal —«está vacío: tiene 0
  bytes»— y no como un error de imagen.

### Nota sobre el diagnóstico

La causa del fallo original sigue en pie: el fichero llegaba con 0 bytes. Pero
**no era el IPC**, como se dijo en la 0.1.3. Lo más probable es que el archivo
estuviera vacío en el disco. El programa ahora lo dice en cuanto lo abre.

227 tests y 8 pruebas de interfaz.

---

## [0.1.3] — 11/08/2026

La causa de verdad. Los dos arreglos anteriores atacaban síntomas: **el fichero
que subía el usuario llegaba VACÍO**, 0 bytes. Se descubrió mirando la copia que
la propia aplicación guarda de cada documento — su nombre era el hash de la
cadena vacía.

### Corregido

- **Los bytes de los ficheros ya no viajan por IPC.** Solo viaja la RUTA, y el
  proceso principal lee el fichero una vez, donde tiene acceso al disco. En el
  caso de «Elegir archivo» el contenido hacía un viaje absurdo —el proceso
  principal lo leía, lo mandaba a la pantalla y la pantalla lo devolvía— y en ese
  viaje se perdía. Los ficheros arrastrados usan `webUtils.getPathForFile`.
- **Un fichero vacío o ilegible se dice ahora al abrirlo**, no diez pasos más
  adelante disfrazado de «la imagen no se puede decodificar».
- **La frontera entre columnas volvía a estar mal.** Buscaba «el hueco más
  grande», y en la columna izquierda el espacio entre la etiqueta `K1` y su
  valor era MAYOR que el espacio entre columnas: la frontera partía la línea por
  dentro y el ojo derecho salía **sin ninguna K**, mientras el izquierdo salía
  perfecto. Ahora el rótulo de la columna derecha es la referencia y la frontera
  se coloca en el hueco real entre las dos.

### Añadido

- Una prueba de interfaz que **sube un informe de verdad** por el mismo camino
  que la aplicación y comprueba que llega con su contenido y se lee entero. Es la
  que faltaba: ninguna de las 221 anteriores tocaba ese camino.

### Resultado

Los tres caminos de lectura leen 8 de 8 campos en los dos ojos, y un informe
subido a la aplicación se lee completo: AL, K1, K1 eje, K2, K2 eje, ACD, LT y CCT
en OD y en OS.

222 tests y 6 pruebas de interfaz.

---

## [0.1.2] — 11/08/2026

Segunda ronda a partir del uso real: un JPEG fallaba con «Error attempting to
read image». La aplicación ya no se cerraba —la red de seguridad funcionó— pero
el documento no se leía.

### Corregido

- **Un JPEG podía no leerse.** Al preparar la imagen se construía la URL de datos
  con `image/png` **fijo**, también para un JPEG. Ahora el formato se reconoce
  por los primeros bytes del fichero, no por su extensión.
- **Las imágenes grandes se RECORTABAN en silencio.** Se ampliaba ×2 a ciegas y,
  al topar con el límite de captura, de una foto de 4032 px salía media foto sin
  que nadie se enterara. Ahora se lleva a un ancho objetivo, con tope de
  ampliación, y si no cabe se **reduce en proporción** en lugar de recortarse.
- **Un fallo al preparar la imagen ya no se traga.** Antes se devolvía la imagen
  original y el error aparecía después, dentro de tesseract, con un mensaje que
  no le dice nada a nadie. Ahora se explica aquí: «no se ha podido abrir esta
  imagen… prueba a guardarla como PNG o JPG, o escribe los datos a mano».
- **El PDF escaneado ya lee los dos ojos.** Su página rasterizada no pasaba por
  la misma preparación que una imagen subida; ahora el OCR solo ve una clase de
  entrada y reconoce bien los rótulos.

### Resultado

Los **tres** caminos de lectura leen 8 de 8 campos en los dos ojos, ejes
incluidos: PDF con texto, imagen (PNG y JPEG, de 900 a 4032 px) y PDF escaneado.
Fiabilidad del OCR entre 89 % y 91 %.

221 tests.

---

## [0.1.1] — 11/08/2026

Ronda de arreglos a partir del primer uso real: el dueño del proyecto subió un
documento y la aplicación se cerró.

### Corregido

- **La aplicación se cerraba** al leer un documento sin conexión. tesseract.js
  intentaba descargar sus datos de idioma y su fallo llegaba como evento del
  worker, no como promesa rechazada, así que se escapaba de todos los
  `try/catch` y Electron mataba el proceso. Ahora la descarga la hace el
  programa con `node:https`, el fallo se explica en una frase y **se puede
  seguir escribiendo los datos a mano**. Además, ninguna excepción no capturada
  vuelve a cerrar la ventana.
- **El OCR devolvía cero datos.** El segmentador unía los bloques con saltos de
  línea, y el OCR devuelve una palabra por bloque: cada palabra quedaba sola en
  su línea y las reglas no encontraban nada. La reconstrucción de líneas se ha
  movido al paquete de extracción, donde la usan el PDF y el OCR.
- **Datos de un ojo se leían como del otro.** La frontera entre columnas era el
  punto medio entre los rótulos, y el «@ 175» del ojo derecho caía al otro lado.
  Ahora se busca el hueco real entre las dos columnas.
- **Un PDF escaneado fallaba con `InvalidPDFException`**: pdfjs se queda con el
  array que se le pasa y lo deja vacío. Se le entrega una copia.
- **La aplicación guardaba en `%APPDATA%\@vilamar\desktop`**, distinto de lo
  documentado y de donde lo buscaban los scripts auxiliares.
- Un aviso que mentía: cuando los datos se leen pero no se sabe de qué ojo son,
  decía «no se ha podido leer ningún dato».

### Añadido

- `pnpm ocr:preparar` — deja el lector de texto listo para trabajar sin conexión.
- `pnpm probar:lectura` — comprueba los tres caminos de lectura.
- Escalado ×2 de la imagen antes del OCR: la fiabilidad pasa del 80 % al 92 %.
  Medido que con ×3 empeora.
- 8 tests de regresión, uno por fallo.

---

## [0.1.0] — 11/08/2026

Primera sesión de construcción. De carpeta vacía a prototipo funcional que habla
con dos calculadoras reales.

### Añadido

- **Modelo canónico de biometría** (`@vilamar/domain`) con las diez invariantes
  clínicas como tests ejecutables. Un dato ausente se representa por su
  ausencia: no existe ningún valor que signifique «no lo sé».
- **Validación de plausibilidad** con los rangos que declaran las propias
  calculadoras. Marca lo imposible, avisa de lo raro y **no corrige nada**.
- **Lectura de informes** (`@vilamar/extraction`) por capas y con proveedor
  sustituible: detección de aparato, separación por ojo y tablas de reglas por
  dispositivo. ANTERION, IOLMaster 700 y Pentacam.
- **Adaptadores de Playwright** (`@vilamar/integrations`) para EVO Toric,
  Barrett Toric y Kane, escritos mirando el HTML real de cada web.
- **Orquestador con aislamiento de fallos**: una calculadora que revienta no se
  lleva a las otras dos.
- **Informe PDF** (`@vilamar/report`) con procedencia de cada dato, comparativa,
  concordancias, discrepancias y lo que cada web dice haber recibido.
- **Aplicación Electron + React** con el flujo en cuatro pasos, pantalla de
  revisión obligatoria y selección de lente.
- **Lectura real de documentos**: texto nativo de PDF (pdfjs), OCR local
  (tesseract.js) y PDF escaneado rasterizado con el Chromium de Playwright.
- **Diagnóstico de adaptadores**: cada fallo deja fase, dirección, selector
  esperado y captura, en local.
- 205 tests, 5 pruebas de interfaz sobre la aplicación real, y una verificación
  vertical contra las webs de verdad.
- ESLint 9, Prettier, TypeScript estricto y CI.

### Comprobado de verdad

- **EVO Toric**: de punta a punta, 4–7 s.
- **Barrett Toric**: de punta a punta, 21–35 s.
- **Las dos coinciden** sobre el fixture sintético: 21,50 D, cilindro 1,00, eje 81°.
- **El producto entero**: datos → confirmar → dos webs reales → PDF en disco, 47 s.
- **Kane** detecta su acuerdo de licencia y pide intervención humana.

### Corregido durante la sesión

- `externalizeDepsPlugin` dejaba fuera los paquetes del monorepo: Electron
  intentaba importar TypeScript en ejecución y **la ventana no abría, sin error
  visible**.
- tesseract.js dejó un `eng.traineddata` de 5 MB **en la raíz del repositorio**.
  Ahora va a la carpeta de datos de la aplicación y está en `.gitignore`.
- Los patrones de lectura descartaban un número por tener más dígitos de la
  cuenta, así que un `240.7` mal leído **desaparecía** en vez de marcarse.
- El aviso de cookies de la ASCRS se daba por resuelto antes de que apareciera,
  y reaparecía a tiempo de comerse el primer clic.
- Con Kane esperando, no se podían ver los resultados de EVO y Barrett **que ya
  estaban hechos**.
- La tabla decía «no se ha lanzado» de una calculadora que estaba en marcha.
- Un test de las invariantes tenía una aserción dentro de un `if` que nunca se
  ejecutaba: pasaba con y sin la protección.

### Notas

- La lectura automática de informes **no se ha validado con informes reales**.
- El adaptador de Kane está escrito pero **no verificado** contra su formulario.
