# Lessons Learned — Log de lecciones aprendidas

> Este archivo es la memoria persistente del proyecto.
> Claude lo lee al inicio de cada sesión para no repetir errores.
> **No borrar entradas antiguas** — son el historial de aprendizaje.

---

## Cómo añadir una lección

Di a Claude: `/nueva-leccion`
O directamente: _"Anota esto como lección aprendida: [descripción]"_

## Formato estándar

```markdown
## YYYY-MM-DD HH:MM — [Título corto]

**Error o aprendizaje:** [Qué pasó]
**Causa raíz:** [Por qué ocurrió]
**Lección:** [Qué hacer diferente en el futuro]
**Contexto:** [Dónde aplica — siempre, en ciertos módulos, etc.]
```

---

<!-- Las lecciones se añaden debajo de esta línea -->

## 2026-08-27 — Electron arrancaba como Node puro dentro de VSCode

**Error o aprendizaje:** Al lanzar `pnpm dev` desde la terminal de este
entorno (VSCode), Electron arrancaba pero la ventana no llegaba a abrirse
—o abría y se comportaba como un proceso Node normal, sin `app`,
`BrowserWindow` ni el resto de la API—. El error visible era un fallo
interno del cargador de módulos ESM de Node al importar `electron`.

**Causa raíz:** VSCode es en sí mismo una aplicación Electron y propaga
`ELECTRON_RUN_AS_NODE=1` al entorno de sus terminales integradas — una
variable pensada para que procesos hijos de VSCode no abran ventanas
Electron completas por accidente. Cualquier `electron.exe` lanzado
heredando esa variable se ejecuta como Node puro, no como la aplicación.

**Lección:** Antes de `pnpm dev` (o cualquier arranque de Electron) en una
terminal de VSCode, comprobar y limpiar la variable:
`Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`. Sin
esto, el síntoma es confuso (parece un fallo de carga de módulos, no un
problema de entorno) y lleva a perder tiempo revisando el código en vez
del entorno.

**Contexto:** Siempre que se arranque la aplicación Electron desde una
terminal integrada de VSCode (o cualquier IDE basado en Electron).

---

## 2026-08-27 — Barrett Toric: activar «Measured PCA» cruza dos pestañas y dos botones distintos, ambos llamados «Calculate»

**Error o aprendizaje:** El adaptador de Barrett marcaba «Measured PCA»,
rellenaba el panel de córnea posterior y pulsaba «Calculate» — pero el
resultado salía siempre idéntico al de «Predicted PCA», como si los datos
nunca se hubieran usado. Diagnosticado en vivo con el dueño del proyecto
viendo el navegador real: la secuencia completa exige, en este orden,
pulsar «Calculate» del panel «K Calculator» (un botón físicamente distinto
del de la pestaña «Patient Data», aunque ambos se vean iguales y digan
«Calculate»), entrar en la pestaña «Toric IOL», pulsar «Calculate» otra
vez (ahí es un tercer botón, propio de esa pestaña) y entrar en «Toric
IOL» una segunda vez — solo entonces el resultado refleja de verdad la
córnea posterior medida.

**Causa raíz:** La web reutiliza el mismo texto de botón («Calculate») en
tres paneles distintos de un mismo iframe ASP.NET, cada uno con su propio
id de control (`Button1`, `Button4`, y otro `Button1` distinto dentro de
la pestaña Toric IOL). Mirar el HTML inicial, o incluso una captura de un
solo paso, no lo revela: hace falta volcar los botones reales en cada
pantalla intermedia y comparar el resultado numérico antes y después.

**Lección:** Cuando una web de terceros (ASP.NET con pestañas/paneles
antiguo) tiene un flujo de varios pasos que no está documentado, no basta
con probar que un selector existe: hay que verificar que el **resultado
numérico cambia de verdad** entre el antes y el después, con datos
sintéticos de prueba, antes de dar por buena una secuencia de clics. Un
selector que existe y un clic que «no falla» no prueban que el paso haya
tenido efecto.

**Contexto:** `packages/integrations/src/adapters/barrett.ts` — y en
general, cualquier adaptador de una web ajena con flujos multi-paso poco
documentados.

---

## 2026-08-11 — La carpeta estaba vacía y la plantilla no llegó a copiarse

**Error o aprendizaje:** La sesión empezó con la instrucción de leer, en orden,
`CLAUDE.md`, `.claude/CLAUDE.md`, `SYSTEM_VISION.md`, `PROJECT_STATUS.md`, el log
de lecciones y `docs/ARQUITECTURA.md`. **Ninguno existía: la carpeta estaba
completamente vacía** y ni siquiera era un repositorio de Git.

**Causa raíz:** Se dio por hecho que el proyecto «venía de la plantilla
habitual». Venía de la intención de copiarla.

**Lección:** Cuando el encargo dice «lee estos ficheros y respétalos», lo primero
es **comprobar que existen**, no empezar a leerlos. Y si no existen, eso no es un
bloqueo: la plantilla estaba en un proyecto hermano del mismo disco, a un `cp` de
distancia. Se instaló, se adaptó a este producto y se dejó como primer commit
para que la rama de trabajo enseñe solo lo nuevo.

**Contexto:** Al arrancar cualquier proyecto que diga proceder de una plantilla.

---

## 2026-08-11 — Un `if` alrededor de una aserción es una prueba que no prueba

**Error o aprendizaje:** Al escribir los tests de las diez invariantes clínicas
se comprobó, por prudencia, que fallaran de verdad: se rompieron las protecciones
a propósito. La del ojo equivocado saltó. **La de «nada sin confirmar llega a una
calculadora» NO saltó**, aunque la protección estaba anulada.

El test decía:

```ts
expect(r.ok).toBe(false)
if (!r.ok && r.motivo === 'FALTAN_DATOS') {
  expect(r.detalle.sinConfirmar).toContain('CCT') // ← nunca se ejecutaba
}
```

Con la protección rota, el motivo pasaba a ser otro, el `if` no entraba y la
aserción **se saltaba en silencio**. El test pasaba con y sin la protección.

Y detrás había un segundo problema, más de fondo: la comprobación campo por campo
era **inalcanzable**, porque otra anterior, a nivel de caso, ya rechazaba lo
mismo. Una protección que no se puede alcanzar no se puede probar.

**Causa raíz:** Un `if` que estrecha el tipo es cómodo para que TypeScript deje
escribir la aserción, y de paso convierte «esto tiene que cumplirse» en «esto se
comprueba si acaso». Son cosas distintas y se parecen mucho al leerlas.

**Lección:**

1. **Toda aserción que expresa el motivo de un fallo va fuera del `if`.**
   `expect(r.ok === false && r.motivo).toBe('FALTAN_DATOS')` se cae si el motivo
   cambia; el `if` solo se usa después, para llegar al detalle.
2. **Si dos comprobaciones tapan lo mismo, una sobra o hay que separarlas.** Aquí
   se separaron a propósito: la del caso mira el ESTADO (¿pulsó Confirmar?) y la
   de campos mira CADA CAMPO. Así la segunda es alcanzable —un dato añadido
   después de confirmar la dispara— y se puede probar.
3. Es la versión de test de una lección que ya está en este log: una salvaguarda
   sin una prueba que la dispare no es una salvaguarda, es un comentario. Aquí
   había prueba, y aun así no probaba nada.

**Contexto:** Todos los tests que comprueban por qué algo ha fallado, y cualquier
sitio con dos capas de validación encadenadas.

---

## 2026-08-11 — El filtro que descarta el dato malo esconde el error

**Error o aprendizaje:** Los patrones de lectura de informes pedían dos dígitos
antes de la coma para la longitud axial. Parecía razonable —una AL tiene dos
cifras— hasta que se probó con el caso que el pliego señalaba: un OCR que lee
`240.7` donde ponía `24.07`.

El patrón **no encajaba**, así que el dato no se leía y el usuario veía
`NO ENCONTRADO`. El error de lectura desaparecía en lugar de enseñarse.

**Causa raíz:** Se metió el criterio de plausibilidad dentro del patrón de
búsqueda. Son dos trabajos distintos: **el patrón LEE, el validador JUZGA**. Al
mezclarlos, un dato imposible se volvió indistinguible de un dato ausente — y
esas dos cosas piden acciones opuestas del usuario.

**Lección:** Un extractor no debe filtrar por plausibilidad. Lee lo que pone,
aunque sea imposible, y deja que la validación lo marque. Con los patrones
ensanchados, `240.7` se lee, sale en rojo y el programa dice «parece un punto
decimal mal leído: podría ser 24.07» — sin cambiarlo.

**Contexto:** Cualquier lectura de datos de fuera: OCR, parsers, importadores.

---

## 2026-08-11 — «He pulsado» no es «ya no está»

**Error o aprendizaje:** La web de la ASCRS tapa la página con un aviso de
cookies que se come todos los clics. El adaptador de Barrett lo rechazaba así:
esperar a que el botón fuera visible, pulsarlo, seguir.

Funcionó una vez. A la siguiente, Barrett falló con un tiempo de espera agotado
**treinta segundos más tarde y en otro sitio del código**, al rellenar el primer
campo. El registro de diagnóstico lo dijo en una línea:
`<div class="cky-overlay"> intercepts pointer events`.

Dos fallos encadenados, y el segundo peor:

1. El aviso **aparece unos segundos DESPUÉS de cargar la página**. Comprobar si
   estaba nada más cargar y no verlo se interpretó como «no hay aviso».
2. Se daba por bueno el clic sin mirar si la capa se había ido.

**Causa raíz:** Se comprobó el ESTADO en un instante («¿está el aviso?») en lugar
del EFECTO a lo largo del tiempo («¿ha dejado de tapar?»). Es la misma familia
que la lección de «lo que se lee al arrancar»: pensar en el estado y no en el
momento.

**Lección:**

1. Con un elemento que aparece tarde, **primero se espera a que aparezca**; no
   verlo al principio no significa nada.
2. Con una acción que quita un obstáculo, **se comprueba que el obstáculo ya no
   está**, y se reintenta si sigue. El éxito no es haber pulsado: es que la capa
   se haya ido.
3. Cuando un fallo aparece lejos de su causa, **el diagnóstico con captura vale
   más que el mensaje de error**. Aquí `intercepts pointer events` señaló al
   culpable directamente.

**Contexto:** Avisos de cookies, modales, capas de carga y todo lo que se
interponga entre Playwright y la página.

---

## 2026-08-11 — Empaquetar «todas las dependencias» incluye las que no son

**Error o aprendizaje:** La aplicación construía sin errores y no arrancaba. La
ventana no aparecía y **no salía ningún error** — salvo al mirar la salida de
error, donde ponía:

```
Unknown file extension ".ts" for .../packages/extraction/src/index.ts
```

`externalizeDepsPlugin()` de electron-vite deja fuera del bundle todas las
dependencias, que es lo correcto para las de node_modules. Pero los paquetes del
propio monorepo son **TypeScript sin compilar**: al dejarlos fuera, Electron
intentaba importar un `.ts` en tiempo de ejecución.

El mismo malentendido reapareció al empaquetar: `electron-builder` intentó meter
en el paquete los enlaces simbólicos de pnpm hacia `packages/` y falló.

**Causa raíz:** «Dependencia» significa dos cosas distintas en un monorepo: la
que se instala y la que se compila con nosotros. La herramienta solo entiende la
primera.

**Lección:**

1. En un monorepo, los paquetes propios se **excluyen de la externalización**
   (`externalizeDepsPlugin({ exclude: [...] })`) y van como **dependencias de
   compilación**, no de ejecución. Solo lo que se carga desde node_modules en
   caliente —Playwright, pdfjs, tesseract— es dependencia de ejecución.
2. Y la de siempre, otra vez: **esto no se ve leyendo el código ni compilando**.
   Se vio arrancando el binario a mano y **capturando la salida de error**, que
   es donde este proyecto ya ha encontrado varios fallos mudos.

**Contexto:** electron-vite, electron-builder y cualquier empaquetador en un
monorepo con paquetes en TypeScript.

---

## 2026-08-11 — Una librería puede dejarte 5 MB en la raíz del repositorio

**Error o aprendizaje:** Al comprobar que tesseract.js funcionaba en Node —una
prueba de treinta segundos, antes de escribir nada que dependiera de él— el
`git status` posterior enseñaba un fichero nuevo: `eng.traineddata`, **5 MB, en
la raíz del repositorio**. La librería descarga los datos del idioma la primera
vez y, por defecto, los deja **en la carpeta desde la que se ejecuta el
programa**.

**Causa raíz:** Se pensó en lo que la librería devuelve, no en lo que la librería
escribe. Descargar y cachear es un efecto secundario que casi nunca está en la
primera página de la documentación.

**Lección:**

1. De cualquier dependencia que descargue algo, hay que preguntarse **dónde lo
   deja** y ponerlo explícitamente donde toca. Aquí, `cachePath` a la carpeta de
   datos de la aplicación.
2. **Mirar `git status` después de probar una librería nueva**, no solo después
   de escribir código. En un proyecto con datos sanitarios, un fichero que
   aparece solo es exactamente lo que no puede pasar.
3. Se añadió `*.traineddata` al `.gitignore` y un control en el CI que rechaza
   documentos, imágenes, sesiones y claves fuera de los sitios declarados: la
   protección no puede depender de que alguien se fije.

**Contexto:** Cualquier dependencia que descargue modelos, datos o binarios: OCR,
modelos de visión, navegadores, fuentes.

---

## 2026-08-11 — Cuando hay que copiar algo, se copia de la fuente (otra vez, y salió bien)

**Error o aprendizaje:** Esta vez la lección ya estaba escrita en este log, de una
sesión anterior, y se aplicó desde el principio: **antes de escribir una línea de
los adaptadores, se abrieron las tres webs con un navegador real** y se volcó su
formulario.

Lo que dio, y que no se habría acertado de memoria:

- EVO **repite las entradas en su pantalla** tras calcular. Leerlas es lo que
  convierte el informe en auditable: se apunta lo que la web dice haber recibido,
  no lo que creemos haberle mandado.
- La calculadora de Barrett **no está en la web de la ASCRS**: está en un iframe
  de otro dominio que responde **403 al navegador sin ventana**.
- Barrett **imprime sus propios rangos válidos** al lado de cada campo
  (AL 12–38 mm, K 30–60 D, WTW 8–14 mm…). Se usaron como límites de validación:
  son mejores que cualquier criterio propio, porque son los de quien calcula.
- Kane no enseña su calculadora hasta aceptar un **acuerdo de licencia**.

**Lección:** Confirmada y ampliada. Y una segunda, sobre el orden: **mirar primero
costó veinte minutos y ahorró reescribir tres adaptadores**. La sonda de
reconocimiento (`pnpm reconocer`) se quedó en el proyecto, porque el día que una
web cambie hará falta otra vez.

**Contexto:** Toda integración con algo que no controlamos.

---

## 2026-08-11 (tarde) — Un fallo por evento se escapa del try/catch y mata la aplicación

**Error o aprendizaje:** El dueño del proyecto subió un documento y la aplicación
**se cerró** con el cuadro de diálogo de Electron «A JavaScript error occurred in
the main process» y una traza. Causa: sin conexión, tesseract.js intentaba
descargar sus datos de idioma y fallaba con `ENOTFOUND`.

El `try/catch` alrededor de `createWorker` no lo cogía, porque **el fallo no
llega como promesa rechazada**: lo emite el worker como evento de error, Node lo
convierte en excepción no capturada y Electron mata el proceso principal.

**Causa raíz:** La misma que ya está en este log con `spawn`: «un doble más
simple que el original no prueba el original». Se protegió la forma de fallar que
se esperaba —una promesa— y no la que la librería usa de verdad.

**Lección:**

1. Antes de confiar en un `try/catch` alrededor de una librería, preguntarse
   **cómo falla**: promesa rechazada, evento, excepción o código de salida. Si
   falla por evento, el `try/catch` no la ve.
2. Cuando una librería hace algo por su cuenta que puede fallar —descargar,
   abrir un puerto, escribir— **quitarle ese trabajo y hacerlo nosotros**. La
   descarga de los 5 MB se hace ahora con `node:https`, y así el fallo es un
   error normal que se puede explicar en una frase.
3. Una aplicación de escritorio **nunca** debe morirse por un fallo así. Hay una
   red de seguridad (`uncaughtException` / `unhandledRejection`) que avisa y
   sigue: para quien la usa en consulta, cerrarse significa perder el caso.

**Contexto:** Cualquier librería con workers, procesos hijos o descargas. Y todo
el proceso principal de Electron.

---

## 2026-08-11 (tarde) — Cuatro fallos que solo aparecen con un documento de verdad

**Error o aprendizaje:** Al probar la lectura con documentos generados —un PDF con
texto, una imagen y un PDF escaneado— salieron cuatro fallos que 205 tests en
verde no habían visto:

1. **El OCR devolvía cero datos.** El segmentador juntaba los bloques con saltos
   de línea, y el OCR devuelve **una palabra por bloque**: cada palabra quedaba
   en su propia línea y las reglas, que buscan etiqueta y valor en la MISMA
   línea, no encontraban nada. Parecía que el reconocimiento no funcionaba.
2. **La frontera entre columnas estaba mal puesta.** Era el punto medio entre los
   dos rótulos, pero el contenido de la columna izquierda se extiende más allá:
   el «@ 175» del ojo derecho caía en la mitad derecha y **se leía como dato del
   ojo izquierdo**.
3. **pdfjs se queda con el array que se le pasa.** Lo transfiere a su worker y
   deja el original con longitud cero. Al rasterizar después, el PDF ya no
   existía: `InvalidPDFException` sin ninguna pista.
4. **La aplicación guardaba en `%APPDATA%@vilamardesktop`.** Electron saca la
   carpeta del `name` del paquete, que era `@vilamar/desktop`. Los datos del OCR
   se descargaban en un sitio y se buscaban en otro.

**Causa raíz:** Todos los tests usaban texto ya en líneas. Ninguno partía de
bloques con posición, que es lo que devuelven de verdad pdfjs y el OCR. El doble
era más limpio que el original.

**Lección:**

1. **Probar con lo que devuelve la librería, no con lo que sería cómodo.** Si el
   proveedor devuelve trozos posicionados, los tests parten de trozos
   posicionados.
2. Cuando una librería recibe un buffer, **preguntarse si se lo queda**. Pasar
   una copia cuesta nada y evita un fallo mudo.
3. Al escribir un script de comprobación, **cuidado con el criterio de éxito**:
   el primero decía «✓ los tres caminos leen bien» con dos caminos rotos, porque
   un ojo ausente hacía `continue` sin contar como fallo. Es el mismo error del
   `if` alrededor de la aserción, cometido otra vez el mismo día.

**Y una que salió bien:** al detectar solo uno de los dos rótulos —el OCR leyó
«op os» y solo reconoció «os»— la guardia de «el rótulo tiene que estar al
principio de línea» impidió atribuir el informe entero al ojo izquierdo. Una
protección escrita por precaución hizo exactamente su trabajo.

**Contexto:** Toda la lectura de documentos. Y la forma de escribir los tests que
la cubren.

---

## 2026-08-11 (tarde) — Más resolución no es mejor

**Error o aprendizaje:** El OCR leía «Ki 41.220» y «Lr 4.53» sobre una captura de
pantalla normal. Antes de enseñarle al parser a aceptar esas variantes —que es la
tentación— se midió qué pasaba escalando la imagen:

| factor | fiabilidad | resultado                                                    |
| ------ | ---------- | ------------------------------------------------------------ |
| 1      | 80 %       | `Ki 41.220`, `Lr`, `cet`, `WW`, y **40.27 leído como 20.27** |
| **2**  | **92 %**   | **todas las etiquetas y todos los números correctos**        |
| 3      | 90 %       | `24.97` donde ponía 24.07, `490.27` donde ponía 40.27        |

**Lección:**

1. **Escalar ×2 antes del OCR, y no más.** Con 3 empeora, y empeora en la
   dirección peligrosa: números plausibles pero equivocados.
2. Antes de hacer el parser tolerante a la basura, **comprobar si se puede dejar
   de producir basura**. Enseñarle a aceptar «Ki» habría tapado el problema y
   habría dejado pasar el «20.27».
3. Y donde no hay remedio, **la asimetría es el peligro**: aceptar `0S` como OS
   sin aceptar `0D` como OD haría que un informe de dos ojos pareciera de uno.
   Los alias de rótulo se añaden en pareja o no se añaden.

**Contexto:** OCR, y en general cualquier decisión de «hacerlo tolerante».

---

## 2026-08-11 (noche) — Tres formas de perder datos sin que salte ningún error

**Error o aprendizaje:** El dueño del proyecto subió un JPEG y no se leyó: «Error
attempting to read image», de tesseract. La aplicación ya no se cerraba, pero el
documento tampoco se leía. Al buscarlo aparecieron tres cosas, y las tres fallaban
**en silencio**:

1. **Se le mentía al navegador sobre el formato.** La URL de datos decía
   `image/png` **fijo**, también para un JPEG. Con los JPEG normales Chromium lo
   adivina por el contenido y funciona; con otros, no. Un fallo que aparece solo a
   veces es peor que uno que aparece siempre.
2. **Las imágenes grandes se recortaban.** Se ampliaba ×2 a ciegas y luego se
   capturaba con el viewport limitado a 4000 px: de una foto de 4032 px salía
   media foto. **Sin error, sin aviso, sin nada** — solo la mitad de los datos.
3. **El fallo al preparar la imagen se tragaba.** Un `catch` devolvía la imagen
   original «para no caerse», y el error reaparecía después dentro de tesseract
   con un mensaje que no señala a nada.

**Causa raíz:** Las tres son la misma decisión mal tomada: **elegir seguir adelante
con algo dudoso en lugar de parar y decirlo**. El formato inventado, el recorte y
el `catch` que devuelve la entrada sin tocar son tres maneras de aplazar un fallo
hasta un sitio donde ya no se puede diagnosticar.

**Lección:**

1. **El formato de un fichero se mira en sus bytes, no en su nombre.** Un `.jpeg`
   puede ser cualquier cosa, y quien lo sube no tiene por qué saberlo.
2. **Un límite que se alcanza no puede resolverse recortando.** Si algo no cabe,
   se reduce en proporción —se pierde detalle, no contenido— o se avisa. Recortar
   es perder datos disimuladamente.
3. **Un `catch` que devuelve la entrada sin tocar casi nunca es lo correcto.** Si
   la preparación falla, el paso siguiente va a fallar igual, pero más lejos y
   peor explicado. Mejor fallar aquí con un mensaje que se entienda.
4. Y una que salió bien: **normalizar la entrada en un solo formato**. Ahora toda
   imagen —subida por el usuario o rasterizada de un PDF— pasa por el navegador y
   sale como PNG limpio del mismo tamaño. El navegador decodifica muchos más
   formatos que tesseract, así que eso solo arregló el JPEG **y**, de paso, hizo
   que el PDF escaneado pasara a leer los dos ojos. Cuando dos caminos distintos
   dan problemas parecidos, unificar la entrada arregla los dos.

**Contexto:** Toda entrada de fichero del usuario. Y cualquier `catch` que
«sigue adelante».

---

## 2026-08-11 (noche) — Dos rondas arreglando síntomas porque no comprobé la entrada

**Error o aprendizaje:** El dueño del proyecto subió un informe y no se leía.
Arreglé el OCR. Volvió a fallar. Arreglé el manejo de imágenes: el formato, el
recorte, el mensaje de error. Volvió a fallar, con «The source image cannot be
decoded».

La causa real era otra: **el fichero llegaba vacío, 0 bytes**. Nunca llegó a
haber una imagen que decodificar. Los bytes viajaban por IPC y —en el caso de
«Elegir archivo»— hacían un viaje de ida y vuelta absurdo: el proceso principal
leía el fichero, lo mandaba a la pantalla y la pantalla lo devolvía. En ese viaje
se perdía el contenido.

Se descubrió en diez segundos, cuando por fin miré el sitio correcto: **la copia
que la propia aplicación guarda de cada documento**. Pesaba 0 bytes y su nombre
era `e3b0c44298fc1c14`, que es el principio del hash SHA-256 de la cadena vacía.

**Causa raíz:** Empecé a depurar por donde salía el error —el OCR— en lugar de
por donde entraban los datos. Los dos arreglos anteriores eran correctos y
necesarios, pero ninguno era EL fallo, y cada uno me hizo creer que ya estaba.

**Lección:**

1. **Cuando algo no se lee, lo primero es comprobar que ha llegado.** Antes de
   mirar el reconocimiento, el formato o el tamaño: ¿cuántos bytes hay? Una
   comprobación de una línea al principio de la cadena habría ahorrado dos rondas.
2. **Y si el programa guarda una copia de lo que recibe, mírala.** Estaba ahí
   desde el primer intento. El rastro que se diseñó para auditar servía también
   para diagnosticar, y tardé dos rondas en abrirlo.
3. **Los datos grandes no viajan por IPC si se puede mandar una referencia.** Una
   ruta es una cadena: no se puede perder a medias. Y el viaje de ida y vuelta
   —leer en el proceso principal, mandar a la pantalla, devolver— no tenía
   ninguna razón de ser.
4. **Sospechar de la validación que falta, no solo de la que falla.** El programa
   aceptaba un fichero de 0 bytes sin decir nada y seguía adelante cuatro pasos.
   Ahora se dice al abrirlo: «está vacío: 0 bytes».
5. Y la de siempre, en su versión más cara: **ninguna de las 221 pruebas tocaba
   el camino por el que entra un fichero.** Probaban el motor de lectura con
   texto ya cargado. La prueba que faltaba —subir un fichero de verdad por el
   mismo camino que la aplicación— encontró el fallo a la primera, y ahora existe.

**Contexto:** Cualquier cosa que entre en el programa desde fuera. Y el orden en
que se depura: de la entrada hacia la salida, no al revés.

---

## 2026-08-11 (noche, 2) — Arreglé algo que no estaba roto, y rompí lo que funcionaba

**Error o aprendizaje:** Tras encontrar que el fichero subido llegaba con 0 bytes,
concluí que **los bytes se perdían al viajar por IPC** y reescribí la carga para
mandar solo la ruta. Se lo conté al dueño del proyecto con esa explicación.

Era falso. Al medirlo —un canal de diagnóstico que devolvía el tipo, la longitud
y los primeros bytes de lo que llegaba— resultó que un `Uint8Array` atraviesa el
IPC **perfectamente íntegro**. Nunca hubo nada roto ahí.

Y el cambio innecesario rompió algo que sí funcionaba: los ficheros arrastrados
dejaron de aceptarse, porque `webUtils.getPathForFile` devuelve a veces una
cadena vacía y sin ruta se descartaba el fichero.

**Causa raíz:** Tenía un síntoma real —0 bytes— y una hipótesis plausible, y
**actué sobre la hipótesis sin comprobarla**. El viaje de ida y vuelta que había
en el código era llamativo y encajaba con el síntoma, así que lo di por culpable.
La explicación más probable, con lo que se sabía, era mucho más aburrida: que el
archivo estuviera vacío en el disco.

**Lección:**

1. **Un síntoma no es un diagnóstico.** Antes de reescribir un camino entero,
   medir. El canal de diagnóstico que zanjó la duda costó cinco minutos, y los
   habría ahorrado con creces si lo hubiera hecho al principio.
2. **Cuidado con la hipótesis elegante.** «Los datos se pierden en un viaje de ida
   y vuelta absurdo» es una historia mejor que «el archivo está vacío», y por eso
   mismo hay que desconfiar de ella.
3. **Y con lo que se le cuenta al dueño del proyecto.** Le expliqué una causa que
   no era, con seguridad y con detalle. Corregirlo cuesta credibilidad; decir
   «esto es lo que veo, aún no sé por qué» no cuesta nada.
4. Del cambio se queda lo que sí mejora —mandar la ruta cuando la hay, no copiar
   datos de más— pero **admitiendo los dos caminos**, porque ninguno funciona
   siempre. Un cambio hecho sobre una hipótesis equivocada puede tener partes
   buenas: hay que separarlas, no defenderlo entero ni tirarlo entero.

**Contexto:** Todo diagnóstico. Y en particular el momento de decidir entre
«mirar un poco más» y «ya sé lo que es».

---

## 2026-08-11 (noche, 3) — Un umbral redondo tomado sin medir

**Error o aprendizaje:** Para decidir si un PDF trae texto o es un escaneo, el
criterio era «al menos 120 caracteres». Un informe de un solo ojo tiene unos 80,
así que se mandaba al reconocimiento de texto **teniendo el texto exacto
delante**: más lento, menos preciso, y perdiendo la marca del ojo.

**Causa raíz:** El 120 era un número redondo elegido a ojo, no medido. Y medía lo
que era fácil de contar —caracteres— en lugar de lo que distingue de verdad los
dos casos.

**Lección:** Cuando haya que separar dos situaciones, buscar **qué las distingue
de verdad**, no qué es fácil de contar. Aquí, un informe de biometría tiene
números con decimales (24.07, 41.22) y la cabecera suelta de un escaneo no. Con
eso, un informe corto se reconoce bien y un «Página 1 de 1» sigue yéndose al OCR.

Y si el umbral sobrevive, que sobreviva con una prueba que fije los dos lados: el
caso corto que debe pasar y el caso mínimo que no debe.

**Contexto:** Cualquier umbral numérico en el código.

---

## 2026-08-11 (noche, 4) — La fiabilidad del OCR no distingue lo correcto de lo incorrecto

**Error o aprendizaje:** Con un informe convertido a PDF desde una imagen
comprimida, el reconocimiento devolvió números **equivocados y creíbles**:

| Pone  | Leyó      | Fiabilidad |
| ----- | --------- | ---------- |
| 24.01 | **24.81** | **93 %**   |
| 24.07 | **24.87** | 80 %       |
| 40.27 | **48.27** | 68 %       |

Y en el mismo documento, un 24.07 leído BIEN declaraba un 79 %.

El plan era usar la fiabilidad como filtro: por debajo de un umbral, no rellenar.
**La medición lo tumbó**: el peor error tenía la fiabilidad más alta de todas.

**Causa raíz:** La fiabilidad del OCR mide lo seguro que está de haber
reconocido unos trazos, no lo parecido que es el resultado a lo que ponía. Un «8»
bien dibujado donde había un «0» es un 8 nítido: alta confianza, valor
equivocado. Dar por hecho que «confianza» significa «acierto» es la misma clase
de error que traducir el vocabulario de una herramienta ajena por parecido
fonético, que ya está en este log.

**Lección:**

1. **Antes de usar una métrica como filtro, comprobar que separa lo que dices que
   separa.** Cuesta veinte minutos: coger casos buenos y malos conocidos y mirar
   si la métrica los ordena. Aquí no los ordenaba en absoluto.
2. Cuando un dato no se puede verificar automáticamente, **el producto tiene que
   dejar de fingir que sí**. No hay umbral, no hay heurística: un número leído de
   una imagen se enseña como pendiente de comprobar, y punto. Es peor producto en
   apariencia y mucho mejor en la realidad.
3. **Ojo con las validaciones que dan falsa seguridad.** 24.81 pasa todos los
   rangos: es una longitud axial perfectamente normal. Una validación que no puede
   detectar el error más probable no debe presentarse como un visto bueno.
4. Y una de diseño: **la confirmación en bloque es un trámite**. «Confirmar todo»
   con un clic cumplía la letra de la invariante —nada sin confirmar sale— y se
   saltaba su intención. Ahora lo leído por máquina se comprueba uno a uno.

**Contexto:** El OCR, y cualquier fuente de datos que venga con una «puntuación
de confianza». Y toda pantalla de confirmación.

---

## 2026-08-11 (noche, 5) — Más resolución no es mejor, y ya van dos veces

**Error o aprendizaje:** Para mejorar el OCR sobre PDF escaneados, cambié el
dibujado de la página de «escala 2» (1190 px en A4) a 2480 px, que son los 300
puntos por pulgada estándar para digitalizar documentos. Razonamiento de manual.

Salió peor. Medido sobre el mismo documento, contando cuántos de diez números se
leen bien:

| cómo se dibuja                  | fiabilidad | aciertos  |
| ------------------------------- | ---------- | --------- |
| directo a 1200 px               | 82 %       | 9 / 10    |
| directo a 2000 px               | 89 %       | 7 / 10    |
| directo a 2480 px (300 ppp)     | 88 %       | 7 / 10    |
| directo a 3000 px               | 87 %       | 6 / 10    |
| **1190 y luego ampliar a 2200** | **90 %**   | **10/10** |

Dibujar grande reproduce a tamaño completo los defectos de compresión de la
imagen incrustada. Dibujar pequeño y ampliar con suavizado los difumina.

Es la **segunda vez** en la misma sesión: ya había medido que ampliar una imagen
×3 era peor que ×2.

**Lección:** «Más resolución, mejor OCR» es falso a partir de cierto punto, y ese
punto llega antes de lo que dice la intuición. Cualquier cambio de resolución se
mide contando aciertos sobre un documento conocido, nunca se razona.

Y la tabla se deja **en el código**, junto a la constante, con la frase «si
alguien vuelve a optimizar esto, que rehaga la tabla antes». Un número mágico sin
su medición al lado es una invitación a repetir el experimento.

**Contexto:** Todo el tratamiento de imagen previo al OCR.

---

## 2026-08-11 (noche, 6) — Un fichero de configuración que nadie lee

**Error o aprendizaje:** Añadí el lector de visión, que se activa poniendo
`ANTHROPIC_API_KEY` en un `.env`. Documenté cómo hacerlo. Iba a darlo por
terminado.

Y entonces comprobé si alguien leía ese `.env`. **Nadie.** Electron no lee
ficheros `.env` por su cuenta, y en todo el proyecto no había un solo `dotenv` ni
nada equivalente.

El fallo habría sido perfecto en su clase: el usuario pone la clave, guarda,
arranca la aplicación, y todo sigue funcionando **exactamente igual que antes**.
Sin error, sin aviso, sin nada que investigar. La conclusión natural sería «esto
no funciona» o, peor, «ya está usando el modelo bueno».

**Causa raíz:** Documenté una instrucción sin ejecutar la instrucción. Escribir
«pon ANTHROPIC_API_KEY en el .env» y comprobar que el código lee
`process.env['ANTHROPIC_API_KEY']` parecen la misma comprobación, y no lo son:
falta el eslabón que convierte el fichero en variable de entorno.

**Lección:**

1. **Toda instrucción de configuración se ejecuta antes de escribirla.** No se
   revisa el código que la consume: se hace lo que dice el documento, de
   principio a fin, y se mira si pasa lo prometido.
2. **Un interruptor que no enciende nada es peor que un interruptor que falla.**
   Un error se investiga; un silencio se interpreta. Cuando una función se activa
   por configuración, el camino que va del fichero al comportamiento tiene que
   estar probado entero.
3. Esta es la misma familia que «he pulsado el botón» ≠ «el aviso ya no está»,
   que ya está en este log: dar por hecho el efecto en vez de comprobarlo.

**Contexto:** Cualquier cosa que se active por configuración. Y toda
documentación que diga «pon X en Y».

---

## 2026-08-11 (noche, 7) — La respuesta de un modelo mejor sigue siendo la respuesta de una máquina

**Error o aprendizaje:** Al construir el lector de visión, la tentación era
tratarlo como una fuente mejor: acierta muchísimo más que el OCR, así que ¿por
qué no darlo por bueno y ahorrarle al usuario la comprobación?

Porque «se equivoca menos» y «no se equivoca» son cosas distintas, y aquí la
diferencia entre las dos es una lente equivocada. Un lector que acierta el 99 %
falla uno de cada cien informes, y ese uno no viene marcado.

Así que entra con procedencia `VISION`, que el dominio ya trataba igual que
`OCR`: ámbar, comprobación uno a uno. Cero excepciones por ser mejor.

**Causa raíz:** Confundir la calidad media de una fuente con la fiabilidad de un
dato concreto. Es el mismo error que usar la puntuación de confianza del OCR
como filtro (lección anterior), un nivel más arriba: allí era «este número tiene
93 %, luego es bueno»; aquí sería «este lector acierta mucho, luego este número
es bueno». Las dos son estadística aplicada a un caso individual donde no vale.

**Lección:**

1. **Las garantías del producto no se relajan porque mejore un componente.** Si
   la regla era «lo leído por una máquina se comprueba», sigue siendo eso con la
   máquina nueva. Cambiar la regla exige una razón nueva, no un componente nuevo.
2. Diseñar el dominio con `VISION` desde el primer día —antes de que existiera
   ningún modelo de visión— hizo que esto saliera gratis: la invariante 11 ya lo
   cubría sin tocar nada. Nombrar los casos que aún no existen es barato cuando
   los escribes y caro cuando los añades después.
3. **Lo que sí se puede mejorar sin discusión es la evidencia.** El modelo
   devuelve la línea literal del informe de donde sale cada número. Eso no
   ahorra la comprobación: la hace de un vistazo en vez de volver al papel.

**Contexto:** Toda sustitución de un componente por otro «mejor» detrás de una
garantía de seguridad.

---

## 2026-08-11 (noche, 8) — Un caso de prueba que faltaba y era el más probable

**Error o aprendizaje:** Llevaba toda la sesión midiendo el OCR sobre capturas de
pantalla, JPEG comprimidos y PDF escaneados. Al montar el comparador añadí un
caso que no se me había ocurrido antes: **una foto de la pantalla del aparato**,
con un giro de 2,4°, algo de perspectiva y un poco de desenfoque.

Resultado: **1 acierto de 20**. Y la imagen es perfectamente legible a simple
vista — la miré para asegurarme de que la prueba era justa, y lo era.

Los otros cinco documentos daban entre 13 y 20 sobre 20. Este daba 1.

**Causa raíz:** Mis casos de prueba salían de los fallos que me habían reportado,
no de cómo se usa el programa. Nadie me había mandado una foto torcida, así que
no la probé. Pero es exactamente lo que hace alguien que no puede exportar el
informe: sacar el móvil y fotografiar la pantalla.

Los casos de prueba heredados de los fallos reportados cubren lo que ya falló.
Los casos que salen de imaginar el uso real cubren lo que va a fallar.

**Lección:**

1. **Al hacer un banco de pruebas, no partas de los fallos conocidos: parte de
   cómo se usa la herramienta de verdad.** «¿Qué hará esta persona cuando no
   pueda hacer lo correcto?» encuentra casos que ningún informe de fallo trae.
2. **Un resultado extremo se verifica antes de creérselo.** 1 de 20 podía ser una
   prueba mal montada. Abrí la imagen y la miré: se leía sin esfuerzo. Solo
   entonces el número significaba algo. Un dato raro que confirma tu tesis es
   justo el que hay que dudar más.
3. **Contar por separado «mal leído» y «no leído» cambia las conclusiones.** El
   OCR en la foto torcida no se inventa nada: no lee. Es un fallo seguro, del que
   se ve. Un resumen con un único porcentaje habría mezclado eso con el 24.87 —
   que es un fallo invisible y peligroso— y las dos cosas no se arreglan igual.

**Contexto:** Todo banco de pruebas, y toda métrica que resuma en un solo número
cosas que no se parecen.

---

## 2026-08-11 (integración) — He cometido el fallo que yo mismo había documentado

**Error o aprendizaje:** Al integrar la rama con `master` descubrí que el
andamiaje original traía un hook, `block-subagent-external.py`, que impedía a un
subagente hacer `git push`, fusionar una PR o desplegar. Lo porté a Node, le
escribí 26 tests y los 26 pasaron.

**El hook no bloqueaba nada.** Lo comprobé lanzando el proceso a mano: código de
salida 0 donde tenía que ser 2.

La causa: la línea que decide «¿me están ejecutando o me están importando desde un
test?» comparaba `import.meta.url` con una URL montada a mano. La ruta de este
proyecto contiene un espacio —«Calculadora Vilamar»— y en `import.meta.url` un
espacio viaja como `%20`. La comparación era falsa siempre, así que el bloque que
bloquea no se ejecutaba nunca.

**Causa raíz:** Los 26 tests probaban `revisar()`, la función pura que decide.
Ninguno probaba **el hook**. Y lo único que Claude Code mira de un hook es su
código de salida.

Lo peor: el hook original en Python tenía **el mismo defecto por otro motivo**
—salía con 1, que no se trata como bloqueo—, y eso estaba escrito en el README
que yo mismo redacté. Documenté el fallo y lo repetí en la reimplementación.

**Lección:**

1. **Prueba la superficie que el sistema mira de verdad.** Si a un hook se le mira
   el código de salida, hay que lanzar el proceso y mirar el código de salida. Un
   test de la función que hay dentro es necesario y no es suficiente. Ahora hay
   cuatro pruebas que hacen `spawnSync` y comprueban 0 o 2.
2. **Una protección que no bloquea es peor que no tener protección**, porque se
   cuenta como puesta. Ya son tres veces esta sesión: el `if` alrededor de una
   aserción, el `continue` que no contaba un fallo, y esto.
3. **No montes URLs de fichero a mano.** `pathToFileURL()` existe justo para esto.
   Un espacio, un acento o una eñe en la ruta rompen la versión artesanal, y este
   proyecto vive en una carpeta con espacio.
4. Y una sobre el proceso: **haber escrito la lección no evita repetirla.** Lo que
   la evitó fue _ejecutar el hook a mano_ después de que los tests pasaran. La
   comprobación manual sigue haciendo falta cuando el test no toca la superficie
   real.

**Contexto:** Todo hook. Todo script cuyo contrato sea un código de salida. Y toda
comparación de rutas o URLs.

---

## 13/08/2026 — «N/A» no es una explicación, y una columna a medias no se ve como un fallo de diseño

**Qué pasó.** Con Kane ya funcionando, el dueño del proyecto dijo: «no rellena
todos los datos de la de kane». Su columna daba esfera y refracción prevista, y
cinco casillas con «N/A»: cilindro, eje, modelo tórico, cilindro residual y eje
residual.

Mi primera reacción fue explicar que **no era un fallo de lectura**: a Kane se le
estaba pidiendo su modo NO tórico, y en ese modo solo devuelve esas dos cosas. Eso
era cierto. Y era irrelevante.

**La causa raíz.** Se estaban comparando **tres calculadoras tóricas para una lente
tórica** y una de las tres no daba cilindro. El adaptador hacía exactamente lo que
estaba escrito que hiciera —«este producto no rellena la parte tórica de Kane»— y lo
que estaba escrito era una decisión mía de una sesión anterior, tomada cuando
descubrí que elegir una lente tórica en su lista escondía los campos. Documenté la
limitación con mucho detalle y **no volví a preguntarme si era aceptable**. Una
limitación bien comentada sigue siendo una limitación.

**Lo segundo, que era la mitad del problema.** «N/A» significaba dos cosas
distintas en la misma tabla: «no hay dato» y «la calculadora no se pronuncia». Se
leyó como «ha fallado», y con razón: nada las distinguía. Un hueco sin explicación
es una pregunta que el programa le deja al usuario.

**Lo que hago a partir de ahora.**

1. Cuando documente una limitación de un adaptador, dejar escrito **qué haría falta
   para levantarla** y qué se pierde mientras siga ahí. Si lo que se pierde es justo
   lo que el producto compara, no es una limitación: es un trabajo pendiente.
2. **Una casilla vacía tiene que decir por qué está vacía.** Si el motivo no cabe,
   cabe en la ayuda al pasar el ratón. «N/A» solo vale cuando de verdad no hay nada
   que explicar.
3. Cuando el dueño señale un síntoma y yo tenga una explicación técnica correcta,
   darla en una frase y **seguir hasta lo que él quería**. Tener razón sobre la causa
   no resuelve nada.

**Lo que NO cambió, y no va a cambiar.** Kane no destaca ninguna opción tórica: deja
la elección a quien opera. La tentación era marcar la de menor cilindro residual
para que la tabla quedara completa. Eso habría sido inventarse una recomendación
clínica, así que las tres van sin recomendada y la tabla dice «3 opciones, ninguna
destacada». Una casilla honesta vale más que una tabla bonita.

---

## 13/08/2026 — Un valor sin procedencia miente aunque el número sea correcto

**Qué pasó.** El dueño del proyecto vio la columna de Kane con «Esfera 22.50 D» y
al mismo tiempo «3 opciones, ninguna destacada», y preguntó qué opción estaba
escogiendo el programa para ese 22.50.

Pregunta perfecta. Y la respuesta tenía dos mitades, una tranquilizadora y otra no.

**La mitad tranquilizadora.** Ese 22.50 salía de Kane: su fila lleva `table-active`.
Coincide con la fila central de la escalera porque Kane centra su recomendación,
pero venía de la marca de la web, no de una regla nuestra.

**La mitad que no.** Buscándolo encontré esto, que llevaba ahí desde el principio:

    const op = r.recomendada ?? r.opciones.find((o) => o.recomendada) ?? r.opciones[0]

Ese último tramo **elegía la primera opción**. No se disparaba con los datos de hoy
porque Kane sí marca. Era una selección clínica implícita esperando a que una web
dejara de marcar, y habría pasado desapercibida: el número se habría visto igual
de creíble que uno legítimo.

**La causa raíz.** El tipo permitía representar un número sin decir de dónde salía.
Mientras `esfera` fuera `number | undefined`, cualquiera podía rellenarlo con algo
razonable y nadie notaría la diferencia en pantalla. El comentario que decía «esto
lo dice la web» no era ejecutable.

**Lo que hago a partir de ahora.**

1. **Un dato que se enseña lleva su procedencia EN EL TIPO**, no en un comentario.
   `DatoComparativo` tiene tres estados y no hay forma de escribir un número sin
   declarar si lo dijo la web, si hay varias alternativas, o si no existe.
2. **Un `?? valorPorDefecto` en la frontera de presentación es sospechoso por
   definición.** Ahí no hay valores por defecto inocentes: lo que se ponga se lee
   como si viniera de fuera.
3. **Cuando dos situaciones distintas se pintan igual, hay un fallo aunque no haya
   ningún error.** «No hay dato» y «hay varias» eran el mismo hueco, y por eso una
   columna correcta parecía rota.

**Lo que confirmó que la lección va en serio.** Se rompió la regla a propósito de
tres formas —la primera, la del medio, la de refracción más cercana a cero— y las
tres las caza un test. La guarda que nadie ha visto fallar no está demostrada.

---

## 25/08/2026 — Que el DOM ya tenga el dato no significa que la pantalla ya lo enseñe

**Qué pasó.** Al añadir la captura de pantalla del resultado de cada calculadora
(sesión del 24/08/2026), Kane era el único de los tres cuya captura salía mal: la
cabecera con los datos de entrada se veía perfecta, pero la tabla de potencias y
la tabla tórica salían con las filas vacías —bordes dibujados, sin números—. Y sin
embargo el resultado numérico que el programa leía de esas mismas tablas **siempre
fue correcto**: la extracción no fallaba, solo la foto.

**Cómo se vio.** No se supuso: se abrieron los PNG de verdad, guardados en
`%APPDATA%\calculator-vilamar\capturas`, con el visor de imágenes. Comparar una
captura de la primera ejecución (tablas vacías) con otra veinte minutos después
del mismo ojo (tablas completas, con las mismas filas que ya se estaban leyendo
bien todo el rato) fue lo que distinguió «la extracción falla a veces» —que no era
verdad— de «la foto llega demasiado pronto» —que sí lo era—.

**La causa raíz.** El código esperaba una sola señal antes de leer y fotografiar:
que el aviso «Processing…» de Kane se escondiera. Esa señal dice que Kane ha
terminado de CALCULAR, no que el navegador ya haya PINTADO la tabla en pantalla.
`pagina.evaluate()` lee el DOM, que ya tenía los números; `pagina.screenshot()`
captura el fotograma compuesto, que puede ir un paso por detrás de una mutación de
DOM muy reciente. Son dos preguntas distintas —«¿está el dato?» y «¿se ve el
dato?»— y el código solo comprobaba la primera antes de dar por buenas las dos.

**Lección:** Es la misma familia que «he pulsado el botón» ≠ «el aviso ya no está»
(11/08/2026, sobre las cookies de Barrett), en una variante nueva: aquí ni siquiera
hacía falta pulsar nada más, el fallo estaba en confundir **el dato existe** con
**el dato está pintado**. Cuando algo se va a FOTOGRAFIAR (no solo leer), la espera
tiene que apuntar a una condición visual comprobable —aquí, que la primera celda de
la tabla tenga texto de verdad—, no a la señal que basta para leer el dato por
detrás. Y la corrección para eso nunca es un `waitForTimeout` a ciegas: es esperar
la condición real con `waitForFunction`, y dejar que el camino de error de siempre
segura actuando igual si esa condición no llega nunca.

**Contexto:** Cualquier captura de pantalla o comprobación visual sobre una web
ajena. Y en general, cualquier sitio donde una señal de «ya ha terminado de
calcular» se use también como señal de «ya se puede fotografiar/leer visualmente»:
son preguntas distintas y pueden resolverse en instantes distintos.

---

## 25/08/2026 (tarde) — El primer informe real encontró un fallo que 254 tests sintéticos nunca vieron

**Qué pasó.** El dueño del proyecto pasó un informe real de IOLMaster (Zeiss) — el
primero que ve este programa desde que existe — y dijo que los datos no se leían
bien, aunque el PDF era de texto nativo y perfectamente legible. Tenía razón: el
ojo derecho perdía la longitud axial entera y los ejes de K1/K2; el izquierdo, por
pura casualidad, salía bien.

**Cómo se vio.** El informe real trae DOS secciones por ojo, no una: un resumen
arriba (con la AL, sin eje) y una «Transcripción detallada» más abajo (con el eje,
sin la AL) — el mismo dato repartido en dos sitios porque son dos vistas distintas
de lo mismo, no una repetición. Nunca hizo falta pedirle el documento a nadie para
verlo: se anonimizó a mano —nombre y fecha de nacimiento sustituidos, antes de que
tocaran ningún fichero del proyecto— y se reprodujo en un test desechable contra
`interpretarTexto`, la misma función que usa la aplicación.

**La causa raíz.** `segmentarPorSecciones` (packages/extraction/src/parsers/
segmentar.ts) ya sabía que un rótulo de ojo puede repetirse, y para ese caso se
quedaba con el trozo de texto MÁS LARGO, pensando en una mención de paso («ver
comparación OD/OS») frente a la tabla de medidas de verdad. La heurística no
contempló la tercera posibilidad: dos secciones, las dos con datos reales, cada
una con lo que la otra no trae. Quedarse con una sola pierde datos que solo
estaban en la otra — y como el ojo derecho tenía su bloque «detallado» más largo
que su resumen, y el izquierdo al revés, el fallo ni siquiera era simétrico entre
los dos ojos, lo que lo hacía más difícil de sospechar mirando un solo lado.

**Por qué no lo vio ningún test.** Los 254 tests de extracción de este proyecto
parten de textos sintéticos escritos para probar UNA cosa cada vez: nunca se
escribió uno con el mismo ojo apareciendo dos veces con campos complementarios,
porque nadie sabía que un aparato real lo hace así. Es la misma lección que ya
está en este log sobre «los casos de prueba salen de cómo se usa la herramienta
de verdad, no de lo que a uno se le ocurre» — con un matiz nuevo: aquí ni hacía
falta imaginar el uso, bastaba con mirar el primer documento real que llegó.

**La corrección.** `segmentarPorSecciones` ya no elige un trozo y descarta el
otro: los JUNTA, en el orden en que aparecen. Es seguro hacerlo porque
`aplicarReglas` (nucleo.ts) ya se queda con la PRIMERA aparición de cada campo —
así que si el resumen trae la AL, esa es la que se usa, y si la sección detallada
trae un eje que el resumen no traía, también se aprovecha, sin tener que decidir
cuál de las dos secciones es «la buena».

**Lo que hago a partir de ahora.**

1. **Un documento real vale más que cien sintéticos bien pensados** para encontrar
   la clase de fallo que nadie anticipó — no porque los sintéticos sobren, sino
   porque están escritos para confirmar lo que ya se sabe que hay que comprobar.
2. **Cuando llegue un documento con datos personales, se anonimiza ANTES de
   tocar cualquier fichero del proyecto**, nunca después. El nombre y la fecha de
   nacimiento no entraron ni en un test desechable ni en ningún commit.
3. Una heurística de «si se repite, me quedo con el mejor» necesita preguntarse
   qué pasa cuando **las dos repeticiones son buenas pero distintas**. Aquí la
   respuesta correcta no era elegir mejor, era dejar de elegir.

**Lo que sigue abierto.** Esto valida el lector contra el formato de UN informe
real de IOLMaster, de un aparato de los tres que el proyecto dice soportar
(ANTERION y Pentacam siguen sin ningún documento real). O5 en `SYSTEM_VISION.md`
sigue abierta: un documento no es una muestra, es el primero.

**Contexto:** Todo parser de informes, y en general cualquier heurística
«si algo se repite, me quedo con uno» — antes de escribirla, preguntarse si las
repeticiones pueden ser complementarias en vez de redundantes.

---

## 2026-08-26 — Una petición del dueño chocaba con un test que existía justo para evitarla

**Error o aprendizaje:** El dueño pidió una lente «recomendada» calculada con un
criterio propio, aplicada siempre, y un cuadro final con la más cercana entre
las tres calculadoras. Antes de escribir una línea de código, una relectura de
`packages/domain/src/comparacion/comparar.ts` reveló que ese fichero tiene un
test dedicado —`el producto compara, no recomienda`— y un docstring que dice,
literalmente, que ninguna regla propia («ni la primera, ni la más cercana a
cero») puede elegir una opción, porque eso convertiría el producto en quien
decide la lente. Es decir: la petición no era una función nueva más, era abrir
una puerta que el código ya había cerrado a propósito, con una lección
registrada detrás.

**Causa raíz:** Ninguna. Esto no fue un error — es la constitución del proyecto
funcionando como debía: la regla «compara, pero no recomienda» está para que
una petición razonable, y bienintencionada, no entre sin que alguien se dé
cuenta de lo que está pidiendo de verdad.

**Lección:** Cuando una petición del dueño parezca sencilla mirando solo el
código de la interfaz o el informe, conviene mirar también el módulo de dominio
que ya resolvió un problema parecido — puede llevar un docstring o un test que
explique por qué esa solución obvia ya se descartó una vez. Aquí se pudo
avisar ANTES de tocar nada, en vez de escribir la función y descubrir el
choque al ejecutar los tests.

**Cómo se resolvió:** Pushback explícito citando el fichero y el test
concretos. El dueño, informado, decidió seguir adelante — pero con una
condición explícita: que se marque siempre como opcional y no vinculante, no
como una recomendación. La estimación se implementó en un módulo NUEVO y
separado (`comparacion/recomendacion.ts`, no dentro de `comparar.ts`), con su
propio docstring explicando la diferencia, y la excepción se documentó en tres
sitios a la vez: `SYSTEM_VISION.md` (D43), `CLAUDE.md` y `.claude/CLAUDE.md`
(la única excepción, estrecha, a esa regla).

**Contexto:** Cualquier petición que toque una regla de la lista «Lo que este
proyecto no hace, nunca» (`CLAUDE.md`) o un módulo con un docstring de tipo
«esto NO hace X, y no es un olvido» — antes de implementar, leer ese docstring
entero y decidir si la petición es una función nueva o una reapertura de una
puerta cerrada. Las dos merecen tratamiento distinto.

---

## 2026-08-26 — Un algoritmo probado con datos sintéticos falló con el primer PDF real

**Error o aprendizaje:** El criterio de «lente estimada» (D43) tenía 9 tests
de dominio en verde, todos con datos escritos a mano para el test. El primer
cálculo real de punta a punta con las tres calculadoras (mandado por el dueño
en un PDF) encontró dos fallos que ningún test había visto:

1. `estimarLenteRecomendada()` cogía «la primera opción del array» dando por
   hecho que ya venía ordenada de menor a mayor potencia. **Cierto para EVO,
   falso para Kane** —Kane pinta su tabla de mayor a menor—, así que la
   estimación salía invertida solo en Kane, y ningún test lo detectó porque
   todos los fixtures de prueba se escribieron ya en orden ascendente, sin
   pensar en que una calculadora real pudiera devolverla al revés.
2. El aviso «* PK1 > PK2» que EVO enseña en su propio formulario es
   **engañoso**: lo correcto, comprobado aislando las cuatro combinaciones
   posibles, es justo lo contrario (PK1 menor que PK2). Se había dado el
   aviso de la web por bueno sin comprobarlo contra un resultado real.

**Causa raíz:** Los tests sintéticos prueban que la LÓGICA hace lo que se le
pidió con los datos que se le dan. No pueden probar una suposición sobre
CÓMO llegan esos datos de verdad (el orden de una tabla ajena, el sentido de
un aviso en una web ajena) si esa suposición nunca se escribió como
pregunta. Es la misma familia de fallo que la segmentación del IOLMaster y la
captura en blanco de Kane, antes en esta misma sesión: código que pasa todos
los tests y aun así falla con el primer caso real, porque el fallo estaba en
una suposición sobre el mundo exterior, no en la lógica interna.

**Lección:** Cuando el código depende del ORDEN o del SENTIDO de algo que
viene de fuera (una tabla ajena, un aviso de validación de una web ajena):
1. No asumir que todas las fuentes se comportan igual — comprobar cada una.
2. Un aviso visible en una web ajena («* PK1 > PK2») es un dato a verificar,
   no una instrucción a seguir a ciegas: puede estar mal, puede referirse a
   otra cosa, o puede que la propia web tenga un error de redacción.
3. Ordenar explícitamente antes de depender del orden, en vez de asumir que
   «el orden en que llega» ya es el que hace falta.

**Cómo se encontró:** Aislando la variable real con cuatro combinaciones
controladas (con lente / sin lente, PK1 mayor / menor que PK2) contra la web
real, no adivinando a partir de la primera pista visible.

**Contexto:** Cualquier función que recorra una lista buscando «la primera
que cumple X» — preguntarse explícitamente en qué orden puede llegar esa
lista según la fuente, y si ese orden está garantizado o solo es una
casualidad del primer caso que se probó.

---

## 2026-08-27 — Una petición sobre privacidad necesitó dos avisos, no uno, porque el alcance real era mayor del que parecía

**Error o aprendizaje:** El dueño pidió que el nombre real del paciente
saliera en el informe. Se hizo pushback explicando que el PDF nunca lleva
ese dato (D23) y que eso lo convierte en un documento de salud identificado
— el dueño confirmó, informado, y se aceptó. Pero al concretar el alcance
(¿dónde exactamente?) salió que la petición real era mucho más seria de lo
que la primera pregunta había cubierto: no era solo sobre las páginas locales
del PDF, sino sobre que el nombre **saliera del ordenador y viajara a tres
servidores externos** en cada cálculo. Eso es un salto de gravedad distinto
—de "un fichero en tu disco" a "un dato de salud identificado cruzando
internet tres veces por caso"— y el primer pushback no lo había distinguido
con la claridad suficiente.

**Causa raíz:** La primera pregunta de aclaración («¿local o también a las
calculadoras?») se hizo, pero se ofreció como si las dos opciones fueran
igual de graves cuando no lo son ni de lejos. Una pregunta de aclaración con
opciones de gravedad muy distinta necesita decirlo explícitamente en el
propio texto de cada opción, no dar por hecho que la persona que responde ya
ha calibrado la diferencia.

**Lección:** Cuando una petición toca una regla de privacidad y tiene más de
una interpretación posible, no basta con una ronda de pushback genérico.
Hay que:
1. Aclarar el alcance exacto ANTES de pedir la confirmación final, no
   después.
2. Si las opciones de alcance tienen gravedad muy distinta (un fichero local
   vs. tres envíos a internet), decirlo así de explícito en cada opción, no
   dejar que la persona lo infiera.
3. Aceptar que la persona puede necesitar dos rondas de aviso, no una, y que
   eso no es insistir de más — es proporcional a lo que se está a punto de
   cambiar.

**Cómo se resolvió:** Segunda pregunta específica, con la comparación
explícita («esto es mucho más serio: viajaría a tres servidores»). El dueño
confirmó las dos veces. Implementado como D44, con el rastro de las dos
confirmaciones documentado en `SYSTEM_VISION.md`, no solo la última.

**Contexto:** Cualquier petición que toque una regla de privacidad, datos de
salud o algo que "sale del ordenador" — la primera pregunta de aclaración
debe separar explícitamente "quedarse en local" de "salir a internet", nunca
presentarlas como dos matices del mismo tamaño.

---

## 2026-08-27 (tarde) — «No existe ese campo» era «no lo busqué en el momento en que aparece»

**Error o aprendizaje:** Al pedir lo mismo que D45 para Barrett (calcular con
y sin córnea posterior), revisé el adaptador y el HTML inicial de
`calc.apacrs.org` y concluí, con seguridad, que Barrett **no tiene** ningún
campo de córnea posterior — lo escribí así en `SYSTEM_VISION.md`, en el
changelog y se lo dije al dueño del proyecto. Era falso. El dueño lo
corrigió con dos capturas reales: un interruptor «Measured PCA» que abre un
panel entero con los campos exactos que hacían falta.

**Causa raíz:** El interruptor **solo existe DESPUÉS de pulsar «Calculate»
una vez** con el formulario normal — nunca en el formulario recién cargado.
Miré el HTML inicial y, al no verlo, concluí que no existía en ningún
estado, en vez de concluir que no existía **en ese estado**. Es la misma
familia que «he pulsado el botón» ≠ «el aviso ya no está» y que «el DOM ya
tiene el dato» ≠ «la pantalla ya lo pinta», ambas ya en este log: hasta
ahora todas eran sobre confundir dos ESTADOS a lo largo del tiempo. Esta es
la versión más cara — no confundí dos estados, di por inexistente algo que
solo aparece en un estado que no llegué a provocar.

Y activar el interruptor no bastaba: rellenar su panel y pulsar el
`Calculate` de siempre (`Button1`) dejaba el resultado calculado en
«Predicted PCA» de todos modos — un fallo silencioso, porque parecía haber
funcionado. El panel tiene su propio botón (`Button4`, encontrado volcando
sin filtrar TODOS los botones de la página, porque ni el nombre ni el
aspecto lo delataban), y activar «Measured PCA» de verdad exige además
volver a calcular en la pestaña «Toric IOL» — nueve pasos en total, entre
dos pestañas.

**Cómo se resolvió:** El dueño del proyecto probó la web real junto con
Claude, en tiempo real, indicando paso a paso qué pulsar y en qué orden,
mientras Claude comparaba capturas de pantalla entre cada paso para
confirmar cuál cambiaba de verdad el resultado. Sin esa colaboración en
vivo no se habría encontrado: ninguna revisión de código ni de HTML
estático lo habría revelado, porque el estado que hacía falta inspeccionar
no existe hasta la tercera acción de una secuencia de nueve.

**Lección:**
1. **«No encontré el campo» y «el campo no existe» son afirmaciones
   distintas**, y solo la primera es la que de verdad se puede sostener tras
   mirar el HTML inicial. Un formulario dinámico puede revelar campos
   nuevos después de cualquier acción — un cálculo, un checkbox, un envío
   — y "no está en el HTML de ahora" nunca prueba "no existe en ningún
   estado".
2. Antes de escribir "esta web no tiene X" en un documento que el dueño va
   a leer como un hecho verificado, la pregunta correcta es "¿probé la web
   en todos los estados razonables, o solo en el que cargó por defecto?".
3. Cuando activar una opción no cambia el resultado, **sospechar del propio
   mecanismo de activación antes que concluir que la opción no sirve** —
   aquí, el botón equivocado dejaba todo con pinta de haber funcionado.
4. Cuando el dueño del proyecto corrige una conclusión técnica con
   evidencia (capturas, no solo su palabra), el error se reconoce sin
   rodeos y se investiga desde cero — no se defiende la primera conclusión
   ni se busca cómo tenía "algo de razón".

**Contexto:** Cualquier vez que se concluya "esta web/formulario no tiene
tal campo o funcionalidad" a partir de mirar un único estado (el HTML
inicial, la primera captura) — sobre todo en `packages/integrations/src/adapters/`,
donde ya hay precedente de formularios que cambian tras un envío (Kane
esconde campos al elegir cierta lente; ahora Barrett revela un panel entero
tras el primer «Calculate»).

---

## 2026-08-27 (noche) — Un resultado «igual en silencio» era el mismo fallo de siempre, con un giro nuevo: reintentar en la misma página lo empeoró

**Error o aprendizaje:** Con la secuencia de nueve pasos de «Measured PCA»
ya implementada y verificada esa misma tarde (resultados distintos entre
«Predicted» y «Measured» con el mismo caso), el dueño probó la aplicación
de verdad con sus propios datos y las dos hojas de Barrett le dieron **el
mismo cilindro y el mismo eje**. Exactamente el síntoma que se daba por
resuelto.

Reproducido en vivo con su caso real (PK1 −6.2, PK2 −6.0): la primera vez
salió bien, con resultados distintos. Repetido varias veces seguidas, salió
mal la mayoría: el paso final —abrir «Toric IOL» por segunda vez, que es
cuando la web de verdad conmuta a «Measured PCA»— a veces se lee **antes**
de que el postback de esa web (lenta) haya terminado. Como los datos
«Predicted PCA» siguen en pantalla sin ningún aviso mientras tanto, el
programa los leía como si fueran el «Measured PCA» pedido — de ahí las dos
hojas idénticas, sin ningún error que lo delatara.

**Causa raíz:** Es la misma familia que «he pulsado el botón» ≠ «el aviso
ya no está» (11/08/2026) y «el DOM ya tiene el dato» ≠ «la pantalla ya lo
pinta» (25/08/2026), ambas ya en este log: se esperó con un
`waitForTimeout` fijo tras el último clic, en vez de comprobar la condición
real (que el texto «Measured PCA» hubiera aparecido de verdad). Van ya tres
veces con la misma forma de fallo, en tres sitios distintos.

**Lo nuevo, que no estaba en el log:** El primer arreglo que se probó fue
reintentar SIN salir de la página — recalcular y reabrir la pestaña de
resultados otra vez, con la esperanza de que la segunda vez sí le diera
tiempo. **Salió peor**: en vez de quedarse en «Predicted PCA» con pinta de
éxito, la tabla de resultados aparecía completamente vacía. Un segundo
postback disparado demasiado seguido sobre un formulario ASP.NET WebForms
(con su `__VIEWSTATE` de por medio) puede dejarlo en un estado más roto que
el que intentaba arreglar, no solo «tardar un poco más». Se abandonó el
reintento interno y se dejó que la persona pulse «Reintentar» desde fuera
— lo que reabre la página entera desde cero, la única recuperación fiable
que se comprobó que funciona en esta web.

**Lección:**
1. Verificar una vez que un cálculo da un resultado distinto **no basta**
   si la condición que hace falta esperar es intermitente por naturaleza
   (una web lenta). Hace falta repetir la comprobación varias veces
   seguidas para descubrir que a veces falla — una sola ejecución con
   éxito no demuestra que sea fiable, solo que es posible.
2. Cuando una acción depende de un postback de un formulario ajeno, la
   condición de espera tiene que ser el EFECTO observable de ese postback
   (aquí, el texto «Measured PCA» apareciendo), nunca un tiempo fijo — por
   generoso que parezca. Y si no aparece, **fallar con un aviso claro es
   mejor que devolver el dato de antes** con pinta de ser el nuevo.
3. **Reintentar dentro de la misma página no es gratis** en un formulario
   con estado en el servidor (ASP.NET WebForms, `__VIEWSTATE` y similares):
   puede dejarlo peor que antes de reintentar. La recuperación fiable de un
   postback a medias es casi siempre volver a cargar la página desde cero,
   no insistir sobre la misma sesión de formulario.
4. Antes de dar una hoja de ruta por «resuelta y verificada» en la
   documentación, distinguir explícitamente «funcionó en la comprobación
   que hice» de «es fiable» — sobre todo con webs de terceros lentas o con
   comportamiento variable. `PROJECT_STATUS.md` ahora dice explícitamente
   que esta calculadora en concreto es la menos fiable de las tres para
   esta variante, en vez de callarlo.

**Contexto:** Cualquier automatización de un formulario ajeno que dependa
de un postback — comprobar el efecto real, no un tiempo fijo, y desconfiar
de cualquier "arreglo" que reintente sin recargar la página cuando el
formulario tiene estado en el servidor.

**⚠️ Corrección, la misma noche:** El punto 2 de la lección de arriba —«la
condición de espera tiene que ser el efecto observable, el texto «Measured
PCA» apareciendo»— **no se pudo llevar a la práctica, y se abandonó.** Se
probaron CUATRO formas distintas de leer ese texto (literal, con regex
tolerante a `&nbsp;`, volviendo a buscar el marco por si había quedado
obsoleto, y comprobando el interruptor del formulario en vez del texto) y
las cuatro rechazaban cálculos que ya estaban bien — confirmado capturando
pantalla y el texto completo de la página en el momento exacto de cada
fallo: la tabla de «Measured PCA» ya tenía los números correctos, pero
ninguna de las cuatro comprobaciones lo detectaba. La explicación más
probable es que esa etiqueta se pinta con una imagen o con contenido
generado por CSS (`::before`/`::after`), invisible para `innerText`,
`textContent` y cualquier propiedad de formulario alcanzable desde la
pestaña de resultados.

Se quitó la comprobación por completo. Lo único que quedó del intento fue
subir el margen de espera fijo antes de leer la tabla (de 4 a 6 segundos
para esta variante) — es decir, exactamente el `waitForTimeout` que la
lección de arriba decía que no bastaba. Con esa única espera más larga, se
repitió la prueba en vivo dos veces seguidas y las dos dieron resultados
correctos y distintos.

**La lección que de verdad queda, corregida:** «Esperar el efecto real, no
un tiempo fijo» sigue siendo lo correcto EN GENERAL (y así se ha hecho para
D45 en EVO, donde sí funciona: `waitForFunction` sobre el DOM). Pero
**exige que la señal que se espera sea alcanzable por programa** — y aquí
no se comprobó eso antes de construir la comprobación: se dio por hecho
que un texto visible en pantalla iba a estar en `innerText`, y no lo
estaba. Antes de escribir una espera activa sobre "que aparezca X", hay
que verificar PRIMERO, con una lectura de la página en un momento en que X
ya se ve, que X es efectivamente legible por Playwright — si no lo es,
perseguirlo no es más seguro que un tiempo fijo: es peor, porque falla
también en el caso en que todo ha ido bien.

**Y una de proceso:** esto costó más de una decena de peticiones seguidas
a la web real de Barrett en menos de dos horas, entre las pruebas del
dueño y las propias, algunas con teorías que resultaron equivocadas.
Ninguna comprobación posterior mostró señales de bloqueo, pero es el tipo
de patrón (mismo perfil, mismas peticiones, en ráfaga) que puede activar
protecciones anti-bot en una web ajena — cuantas menos rondas de prueba y
error en directo hagan falta, mejor, y depurar primero con la evidencia ya
capturada (una captura de pantalla, el texto completo de la página) antes
de lanzar otra ronda contra la web real habría ahorrado varias de esas
peticiones.

## 27/08/2026 (noche, 2) — Un `pnpm test:e2e` que fallaba distinto cada vez no era el código: era mi propia terminal

**Error o aprendizaje:** Al terminar D47 (varios biómetros por ojo),
`pnpm test:e2e` fallaba en `flujo.spec.ts`, pero de forma **distinta en
cada intento**: unas veces la ventana de Electron ni llegaba a abrirse
(«Target page, context or browser has been closed»), otras se quedaba
atascada 30 segundos haciendo una captura de pantalla, otras avanzaba bien
hasta cierto punto y luego una acción (`fill`, `click`) esperaba 30
segundos y fallaba sobre una pantalla que parecía la de INICIO en vez de la
que el test esperaba. Cuatro ejecuciones seguidas, cuatro patrones de fallo
distintos con el mismo código sin tocar entre medias — la primera señal de
que el problema no estaba en la lógica de la aplicación, sino en algo
inestable alrededor.

Antes de tocar una sola línea de producción, se instrumentó el propio
`beforeAll` del test (temporalmente, revertido después) con
`ventana.on('load', …)`, `ventana.on('pageerror', …)` y
`app.process().stderr.on('data', …)`, y por separado se añadió un
`appendFileSync` temporal dentro de la red de seguridad de
`instalarRedDeSeguridad()` (`process.on('uncaughtException', …)`) para
descartar, con un fichero de verdad y no con una suposición, que hubiera
una excepción real escapándose en el proceso principal. **El fichero nunca
se creó**: no había ninguna excepción de JavaScript. Lo que sí apareció, de
forma repetible, fue un mensaje `Debugger ending on ws://127.0.0.1:PUERTO/…`
con un puerto nuevo cada vez, justo antes de cada fallo — la firma del
inspector de Node.js (`--inspect`), no de Electron ni de Chrome DevTools
Protocol.

La causa: mi propio shell (tanto la herramienta Bash como la de PowerShell
de esta sesión) tiene `ELECTRON_RUN_AS_NODE=1` puesto **globalmente**, algo
que el propio `flujo.spec.ts` ya documenta como una trampa conocida del
proyecto («si está puesta, Electron arranca como si fuera Node y no abre
ninguna ventana, sin decir nada») y que el test filtra explícitamente antes
de lanzar la app final (`if (k !== 'ELECTRON_RUN_AS_NODE') entorno[k] = v`).
Pero ese filtro solo protege el proceso de la APP; no protege a los
procesos internos que Playwright lanza por su cuenta para gestionar el
propio `_electron.launch()`, que heredan el entorno de la terminal donde se
ejecuta el comando, no el objeto `env` que se le pasa a la app. Con esa
variable puesta, esa maquinaria interna se volvía intermitentemente
inestable — de ahí que cada intento fallara distinto: no era una condición
de carrera del código, era un entorno corrupto desde antes de arrancar.

**Cómo se confirmó, no se supuso:** ejecutando la suite completa dos veces
seguidas SIN tocar código entre medias — la primera con la única aserción
realmente rota del test (una expectativa de D46 desactualizada: el SIA ya
no sale vacío, sale con 0.25 D por defecto desde el cuestionario manual), la
segunda tras corregir solo esa aserción. Con la aserción corregida, las 28
pruebas de interfaz pasaron limpias y en una cuarta parte del tiempo (24 s
en vez de casi 2 minutos) — la inestabilidad estaba correlacionada con que
UN test fallara y disparara la maquinaria de recuperación de Playwright
(trace, captura, informe de error), no con ningún estado que mi código
dejara mal puesto.

1. **Antes de sospechar del código, comprobar el entorno donde se ejecuta la
   prueba.** Un fallo que cambia de forma en cada repetición, con el mismo
   código, es la señal más fiable de que el problema está fuera del código.
2. **No aceptar una teoría de "el proceso está crasheando" sin evidencia
   directa.** La red de seguridad de excepciones ya existía
   (`instalarRedDeSeguridad`); en vez de asumir que fallaba o inventar una
   causa, se instrumentó temporalmente para producir una prueba escrita en
   disco — y esa prueba (el fichero vacío) fue lo que descartó la teoría
   más obvia.
3. **Revertir toda instrumentación de depuración antes de dar el trabajo
   por terminado.** Los `console.log` y el `appendFileSync` temporales se
   quitaron en cuanto cumplieron su propósito; lo único que quedó del
   diagnóstico fue la corrección real (la aserción de D46).
4. **Un test que falla puede arrastrar a los siguientes sin que el código
   tenga ninguna relación causal real** — aquí, más que un test rompiendo
   estado compartido, era el propio corredor de pruebas volviéndose lento e
   inestable al gestionar el fallo en un entorno ya comprometido. Antes de
   diagnosticar una "cascada" de fallos como un bug de la aplicación, vale
   la pena arreglar el fallo más simple y sospechoso primero y ver si el
   resto desaparece solo.

**Contexto:** Cualquier sesión donde `pnpm test:e2e` (o cualquier suite que
lance un proceso GUI real vía automatización) falle de forma distinta en
cada intento sin que el código haya cambiado — sospechar primero de
variables de entorno heredadas del propio shell de la sesión
(`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, banderas de depuración) antes que
de una condición de carrera en la aplicación.

## 27/08/2026 (noche, 3) — Un formulario que «no se vacía» al cambiar de aparato: la clave de React no seguía al dato

**Error o aprendizaje:** El dueño probó D47 (varios biómetros por ojo) en
la aplicación real por primera vez: rellenó los datos de un aparato,
añadió un segundo biómetro por el desplegable, y **el formulario siguió
enseñando los valores del primer aparato** en vez de vaciarse para el
nuevo. Al calcular, solo salió resultado de uno. Mandó un pantallazo.

Los 633 tests unitarios y los 28 de interfaz habían pasado en verde poco
antes de esto — ninguno ejercitaba el gesto exacto de «escribir en un
aparato, añadir otro, mirar si el formulario se vació», porque los tests
de `FormularioManual` que ya existían solo probaban un aparato por ojo.

**La causa:** `CampoManual`/`FilaCampo` guardan su valor en edición
(`borrador`) como estado LOCAL de React, y se pintaban con
`key={campo}` en su lista — la clave no incluía `ojo` ni `aparato`. React
reutiliza la misma instancia del componente mientras la clave no cambie de
posición, así que al cambiar de aparato React NO desmontaba la casilla:
seguía siendo el mismo componente, con el mismo `borrador` de antes,
enseñando el texto del aparato anterior encima de un dataset que por debajo
ya era otro (vacío). El dato de verdad SÍ estaba correctamente separado por
aparato — el fallo era solo de PANTALLA —, pero como la pantalla mentía, el
dueño no llegaba a escribir los datos del segundo aparato pensando que ya
estaban ahí, y por eso el cálculo solo tenía resultado del primero.

**La corrección:** `key={`${ojo}-${aparato}-${campo}`}` en las dos listas
(`FormularioManual.tsx` y `PanelRevision.tsx`), para que React desmonte y
vuelva a montar cada casilla —con su `borrador` a `null`— en cuanto cambia
el ojo o el aparato activo. Verificado con un script que reproduce el
gesto exacto del dueño contra la aplicación real (no solo con un test
unitario): rellenar el aparato 1, añadir el aparato 2, comprobar que el
formulario sale vacío, rellenarlo con datos distintos, volver al aparato 1
y comprobar que sus datos originales siguen ahí — y leyendo
`window.vilamar.casoActual()` para confirmar que el caso de verdad guarda
los dos datasets, cada uno con lo suyo.

1. **Una prueba automática de un flujo con varias variantes (aquí,
   «varios aparatos») tiene que ejercitar el CAMBIO entre variantes, no
   solo una variante a la vez.** Los tests existentes probaban bien UN
   aparato; ninguno probaba el gesto de añadir un segundo y comprobar que
   el primero no se colaba en la pantalla del segundo.
2. **En React, cualquier estado local (`useState`) dentro de un componente
   que se reutiliza para representar «cosas» distintas (aquí: el mismo
   campo, pero de un dataset distinto) necesita una `key` que identifique
   la COSA, no la POSICIÓN.** `key={campo}` identifica la posición en la
   lista; `key={ojo}-${aparato}-${campo}` identifica el dato real que se
   está mostrando.
3. **El pantallazo del dueño fue el diagnóstico.** No hizo falta
   reproducir a ciegas: la imagen mostraba el desplegable de «Añadir
   biómetro» ya abierto con el formulario detrás, lo que permitió ver de
   un vistazo que faltaba justo el paso de comprobar el vaciado.

**Contexto:** Cualquier componente de React en este proyecto que muestre
«el mismo campo, pero de una entidad distinta» según una pestaña o
selector activo (ojo, aparato, y cualquier futura dimensión parecida)
tiene que llevar esa dimensión en la `key` de cada casilla con estado
local propio — si no, el cambio de pestaña puede dejar estado del anterior
pegado en pantalla aunque el dato guardado ya sea correcto.

## 27/08/2026 (noche, 4) — Un informe con dos aparatos superó un límite que ningún informe anterior había rozado

**Error o aprendizaje:** Con el fallo de la casilla ya corregido, el dueño
volvió a probar D47 hasta el final: los cálculos de los dos aparatos
salieron bien, la pantalla de resultados los enseñó correctamente — y al
pulsar «Generar PDF» salió un error nuevo: `ERR_INVALID_URL (-300) loading
'data:text/html;charset=utf-8,...'`, con el mensaje cortado a media
palabra. Mandó un pantallazo con el error completo.

**La causa, no adivinada — medida.** `imprimirPdf()` (`main/index.ts`)
llevaba desde D19 metiendo el HTML entero del informe, codificado con
`encodeURIComponent`, directamente en una URL `data:` y cargándola con
`loadURL`. Funcionaba mientras el HTML era pequeño. Un informe con dos
aparatos junta el doble de tarjetas y, sobre todo, el doble de capturas de
pantalla en base64 dentro del mismo HTML — y **Chromium rechaza cualquier
URL de más de 2 097 152 caracteres** con exactamente ese error,
`net::ERR_INVALID_URL`. Antes de tocar el código, se escribió un script
que reprodujo el fallo exacto contra la aplicación real con un HTML
sintético de 3.000.000 de caracteres — mismo error, mismo código — para
confirmar la causa en vez de suponerla por la forma del mensaje.

**La corrección:** el HTML se escribe ahora a un fichero temporal junto al
PDF de destino y se carga con `loadFile()`, que no tiene ese límite —solo
la ruta viaja por la URL—, y el fichero se borra al terminar (en el
`finally`, tolerando que ya no exista). Verificado con el mismo script:
el HTML de 3.000.000 de caracteres que antes fallaba ahora produce un PDF
válido, y el `data:` viejo, probado a propósito contra el mismo HTML, sigue
fallando exactamente igual — confirma que el diagnóstico era el correcto y
no una casualidad.

1. **Un límite que nadie había rozado antes no es un límite que no exista.**
   D19 (25/08/2026, `printToPDF` con una URL `data:`) llevaba semanas en
   producción sin que ningún informe lo tocara — hasta que D47 dobló de
   golpe el tamaño típico de un informe por ojo. Un cambio que multiplica
   el contenido de algo (aquí: varios aparatos en el mismo PDF) puede sacar
   a la luz un límite técnico que llevaba ahí desde el principio, invisible
   mientras nadie lo cruzaba.
2. **Reproducir el fallo con un caso sintético ANTES de tocar el código
   de producción**, en vez de arreglar a ciegas por la forma del mensaje
   de error. Un HTML de relleno del tamaño adecuado bastó para confirmar
   la causa exacta sin necesitar datos clínicos ni volver a pedirle al
   dueño que repitiera la prueba completa de EVO/Barrett/Kane.
3. **Verificar la corrección Y volver a probar que el fallo viejo sigue
   fallando con el mismo caso.** No basta con que lo nuevo funcione: hay
   que comprobar que de verdad se está corrigiendo lo que se cree, no una
   causa distinta que coincide por casualidad.

**Contexto:** Cualquier función de este proyecto que meta contenido
generado (HTML, JSON, lo que sea) dentro de una URL en vez de un fichero
—`data:`, pero también query strings largos u otros esquemas parecidos—
tiene un límite de tamaño que Chromium/Node no avisan por adelantado.
Antes de ampliar cualquier función que genere MÁS contenido del que
generaba antes (más aparatos, más ojos, más capturas…), vale la pena
preguntarse si algo aguas abajo asumía un tamaño pequeño.

## 27/08/2026 (noche, 6) — Un `<select>` controlado por el dato guardado, no por lo que se está eligiendo

**Error o aprendizaje:** Al construir el desplegable para renombrar el
aparato principal (D49), la primera versión leía el valor mostrado
directamente del aparato YA GUARDADO: `value={yaConocido ? aparatoActivo : 'Otro'}`.
Al probarlo contra la aplicación real (antes de darlo por bueno, no
después), elegir «Otro…» en el desplegable **no hacía absolutamente
nada** — ni aparecía el campo de texto, ni el desplegable se quedaba en
«Otro…»: volvía a saltar solo a lo que ya hubiera guardado.

**La causa:** el `onChange` de «Otro…» no cambiaba ningún estado propio,
solo comprobaba `if (e.target.value === 'Otro') return` y salía sin hacer
nada. Como React vuelve a pintar el `<select>` en cada render usando
`value={...aparatoActivo...}` —que seguía siendo el aparato de antes,
porque nada lo había cambiado todavía—, el navegador «deshacía» la
selección visual de «Otro…» y volvía a enseñar el valor guardado. Confundir
«lo que el usuario está eligiendo ahora mismo» con «lo que ya está
confirmado» es el mismo problema, en miniatura, que el fallo del `key`
sin aparato de esta misma noche (noche, 3): un control de formulario que
representa un ESTADO DE PANTALLA transitorio necesita su propio estado
de React, no puede derivarse solo del dato ya guardado.

**La corrección:** un estado `modoOtro` (booleano) separado de
`aparatoActivo`. Elegir «Otro…» pone `modoOtro=true` sin tocar el dato
guardado todavía; el `<select>` pasa a mostrar `value={modoOtro ? 'Otro' : aparatoActivo}`;
el campo de texto solo se enseña con `modoOtro=true`, y solo AL ESCRIBIR
Y CONFIRMAR (blur o Enter) se llama de verdad a renombrar el aparato.
Verificado contra la aplicación real con cuatro pasos seguidos: elegir un
aparato conocido, volver a «Otro…» (el campo tiene que salir vacío, no con
el nombre anterior), escribir uno libre sin perder el dato ya tecleado, y
volver a uno conocido — los cuatro correctos.

1. **Cualquier `<select>`/campo controlado por props que representan «lo
   ya confirmado» necesita estado propio para la elección TRANSITORIA**
   —lo que el usuario está tocando ahora, antes de confirmarlo— si esa
   elección puede no coincidir con el dato guardado (aquí: «Otro…» no es
   un aparato real, es un modo de edición). Sin ese estado propio, React
   fuerza el control de vuelta al valor de las props en el siguiente
   render, y la interacción parece no hacer nada.
2. **Probar la interacción completa antes de darla por hecha**, no solo el
   camino feliz de «elegir un valor conocido». El primer intento del
   dueño con dos pasos (elegir conocido, escribir AL) habría parecido
   perfecto; hizo falta un tercer paso —volver a «Otro…»— para que el
   fallo apareciera, y ese paso lo puse yo mismo en el guion de
   verificación, no algo que hubiera que esperar a que el dueño lo
   encontrara.

**Contexto:** Cualquier `<select>` o campo de este proyecto con una opción
tipo «Otro» / «elegir después» / «sin decidir» que conviva con valores
reales ya guardados — antes de que el `value` del control lea directo de
una prop que representa el dato confirmado, comprobar si ese control
necesita su propio estado de React para la elección transitoria.

## 27/08/2026 (noche, 7) — Di por «corregido» un fallo que no había verificado, y al comprobarlo de verdad seguía roto

**Error o aprendizaje:** En la entrada (noche, 4) de este mismo log escribí
que la tabla de resultados de Kane en blanco (captura, no cálculo) «se
había corregido» esperando dos fotogramas de animación reales antes de
tomar la foto. **Esa entrada fue escrita sin poder probarla contra la web
real** —creía, equivocadamente, que este entorno no tenía acceso a
internet— y lo dije así en su momento («sin verificar, pendiente de que el
dueño lo confirme»). Más tarde esa misma noche, `pnpm reconocer:kane`
demostró que SÍ hay acceso a internet. Al verificar de verdad contra Kane
en vivo, con `guardarCaptura` conectado a un fichero para poder mirar el
PNG resultante: **la tabla seguía en blanco**, exactamente igual que antes
del «arreglo».

Antes de tocar nada más, se probó si era cuestión de esperar más: 800 ms
fijos, y luego 3000 ms fijos. **Los tres intentos —dos `requestAnimationFrame`,
800 ms, 3000 ms— dieron el PNG idéntico, byte a byte** (mismo tamaño en
bytes las tres veces). Eso es una prueba, no una sospecha: si esperar 3
segundos en vez de dos fotogramas no cambia ni un byte del resultado, el
problema no es de tiempo. Es estructural — algo en cómo Kane pinta esa
tabla concreta no depende de cuánto se espere. La causa real (¿un iframe,
un canvas, texto con el mismo color que el fondo, algo que solo se
repinta con un resize?) queda sin investigar.

1. **«Lo he razonado bien, así que debe de estar arreglado» no es lo
   mismo que «lo he comprobado».** La entrada (noche, 4) tenía el
   razonamiento correcto para el fallo de 12/08/2026 (que sí era de
   tiempo), pero aplicado sin comprobar a un fallo que, esta vez, no lo
   era. Documentar la incertidumbre («sin verificar contra la web real»)
   ayudó — permitió corregir el registro en vez de dejar una mentira
   silenciosa — pero no sustituye a la comprobación en cuanto fue posible.
2. **Cuando dos arreglos de la misma familia (esperar más) fallan igual de
   idéntico, no se prueba un tercero: se para y se busca la causa real.**
   Insistir con 5, luego 10 segundos habría sido repetir el mismo error
   con más paciencia. La prueba de que NO es de tiempo (bytes idénticos)
   es información nueva que cambia qué hay que investigar, no una excusa
   para seguir subiendo el número.
3. **En cuanto se descubre que una capacidad que se creía ausente (aquí,
   acceso a internet) sí existe, hay que volver atrás y comprobar todo lo
   que se había dejado «sin verificar» por esa razón** — no solo lo último.
   D50 (la lente) y D49 (que el PDF omite calculadoras no pedidas) SÍ se
   confirmaron correctos con esta misma vuelta de comprobaciones; solo
   D48 (la captura de Kane) seguía roto. Sin volver a comprobar los tres,
   los dos que sí funcionaban habrían quedado con la misma etiqueta de
   duda que el que no.

**Contexto:** Antes de escribir «corregido» en cualquier documento de este
proyecto (`PROJECT_STATUS.md`, `SYSTEM_VISION.md`, este log), comprobar
que de verdad se ha verificado el resultado, no solo que el razonamiento
suena correcto — y en cuanto cambie una condición del entorno (acceso a
red, una credencial, un permiso) que antes bloqueaba una verificación,
volver a intentar TODO lo que se había dejado pendiente por esa razón, no
solo lo que se esté mirando en ese momento.

---

## 28/08/2026 — Un solo síntoma («Kane falla») eran en realidad dos fallos distintos, y la foto de diagnóstico lo demostró

**Error o aprendizaje:** Retomando la lección anterior (noche, 7), la
investigación seguía tratando «Kane falla al calcular con la lente B&L
LuxSmart» como si fuera el mismo fallo que «la captura de Kane sale en
blanco» — dos síntomas distintos (uno es `ADAPTER_BROKEN` sin llegar a
hacer la foto; el otro es una foto en blanco de un resultado que sí
existe) que se habían fundido en una sola investigación porque aparecieron
la misma noche, en el mismo caso de prueba. Añadir una captura de
diagnóstico (`guardarDiagnostico`) en el punto exacto del fallo —algo que
no se había hecho antes porque se asumía que ya se sabía la causa— enseñó
en la imagen la tabla de Kane perfectamente visible, con sus tres opciones
tóricas, pero en un formato de columna distinto («B+L Cylinder Power», con
solo el número) al único que el código sabía leer («T2 (1.00)»). Era un
fallo de lectura del HTML, no de temporización ni de foto.

**Causa raíz:** Kane cambia el formato de su tabla tórica según si se ha
elegido el modelo genérico o una lente concreta del desplegable — algo que
la captura original del 13/08/2026 (que dio forma a
`leerFilaToricaDeKane`) no pudo ver porque se hizo sin ninguna lente
seleccionada. La regex de lectura exigía sí o sí una designación con
paréntesis; sin ella, cada fila se descartaba como ilegible, vaciando la
tabla entera y disparando `ADAPTER_BROKEN` — un mensaje que, sin la foto
delante, se leía como «esta lente no tiene ninguna opción tórica para este
ojo» (una explicación clínica plausible) en vez de «el código no sabe leer
esto» (la real).

**Lección:** Cuando algo fallado repite el mismo mensaje contra la misma
entrada, la foto de diagnóstico del momento exacto del fallo no es un lujo
opcional: es la diferencia entre adivinar una causa razonable (aquí,
tentador aceptar «esta lente no cubre este astigmatismo» sin comprobarlo)
y ver la causa real. Y un síntoma que aparece junto a otro fallo conocido
no tiene por qué ser el mismo fallo — merece su propia investigación desde
cero, con su propia evidencia, antes de asumir que comparten arreglo.

**Contexto:** Cualquier fallo de un adaptador (`packages/integrations/src/adapters/`)
contra una calculadora externa cuyo mensaje sea genérico (`ADAPTER_BROKEN`,
«no se ha podido leer»): pedir o mirar la captura de diagnóstico del
momento exacto antes de teorizar sobre la causa, y no asumir que comparte
causa con otro fallo solo por haber aparecido a la vez.

---

## 29/08/2026 — «Invertir un criterio» no es cambiar el signo de la comparación, es entender por qué el original funcionaba

**Error o aprendizaje:** D52 pedía invertir el criterio de esfera de la
estimación propia para la familia Lux: en vez de «la primera negativa», «la
primera positiva». Implementé eso literalmente —cambiar `< 0` por `> 0` en
el mismo `.find()` que recorre de menor a mayor potencia— y los tests que
escribí pasaron, con datos inventados donde la refracción SUBÍA con la
potencia (al revés de la realidad óptica). Con un caso real, el dueño
generó un PDF de verdad con una B&L LuxSmart: EVO estimó 18 D (refracción
0.77) en vez de 19 D (refracción 0.14, la que de verdad no cruza a miopía).

**Causa raíz:** «la primera negativa subiendo potencia» y «la más cercana a
cero del lado negativo» son la MISMA fila, porque la refracción prevista
baja de forma continua al subir la potencia — en cuanto se cruza el cero,
esa primera negativa YA es la más cercana. Pero «la primera positiva
subiendo potencia» es la fila del extremo opuesto, la MÁS ALEJADA de cero;
la más cercana a cero del lado positivo es la ÚLTIMA antes de cruzar a
negativo. Invertir el signo de la comparación sin darme cuenta de que el
criterio original dependía de esa coincidencia (que solo se da de un lado)
propagó el error. Y los tests no lo cazaron porque los escribí con datos
sintéticos que subían en vez de bajar —la forma más fácil de escribir un
caso de prueba, no la que ocurre de verdad—, así que el mismo sesgo que
metió el fallo también lo dejó pasar en la verificación.

**Lección:** Cuando se pide «invertir» un criterio de selección, no basta
con invertir el operador de comparación (`<` por `>`) si el criterio
depende de un orden de recorrido o de una asunción sobre la dirección de
los datos — hay que preguntarse qué invariante hacía funcionar el original
y comprobar si esa invariante sigue siendo cierta del otro lado. Aquí la
invariante real era «más cercana a cero», no «primera de la lista»; solo
coincidían por casualidad de la geometría de un lado. Y al escribir datos
de prueba para un criterio numérico con una relación física conocida (aquí,
refracción vs. potencia), usar la dirección REAL de esa relación, no la que
sea más cómoda de teclear — un test con datos irreales puede pasar en verde
y no proteger de nada.

**Contexto:** Cualquier criterio de selección en `packages/domain/src/comparacion/`
que dependa de un orden (`.find()`, `.sort()` seguido de tomar el primero o
el último): antes de invertirlo para un caso especial, identificar qué
propiedad hace correcto el original —aquí, «más cercana a cero», no «primera
encontrada»— y verificar que esa propiedad, no solo el signo, se traslada al
caso invertido.

---

## 01/09/2026 — Un campo que sirve de CRITERIO interno no es el mismo que el campo que se ENSEÑA, aunque los dos se llamen «eje»

**Error o aprendizaje:** `estimarLenteRecomendada()` (D43) calcula el
meridiano corneal curvo (K1 o K2, el más curvo) para decidir qué fila de
la escalera tórica de cada calculadora comparte orientación con la
córnea. Ese cálculo es correcto y sigue siéndolo. El fallo estaba en el
paso siguiente: ese mismo valor —fijo, el mismo para las cinco casillas
de un ojo— se guardaba en el campo `eje` de `LenteEstimada`, y era
`eje`, no `ejeResidual` (el eje que sí venía leído de cada web, fila a
fila, y que sí variaba), lo que el informe enseñaba en las tres
pantallas de la estimación propia. El resultado: un PDF real con «Eje 0°»
repetido cinco veces, sin ninguna información real, mientras las
capturas de pantalla de encima mostraban ejes distintos por calculadora.
El dueño del proyecto lo detectó él mismo, comparando su propio informe.

**Causa raíz:** Dos conceptos distintos compartían el mismo nombre de
campo en dos sitios distintos del código, y ninguno de los dos estaba
mal por separado — el criterio de selección (`ejeCurvo`, correcto) y el
dato que se muestra (`ejeResidual`, correcto y ya capturado) — pero al
construir el objeto de resultado, el criterio se copió al campo que
resultó ser el que se enseña, en vez de dejar que el dato ya correcto
(`ejeResidual`) hiciera ese trabajo. No hubo ningún test que lo cazara
porque los tests existentes construían sus datos de prueba con `eje` y
`ejeResidual` iguales (o solo `eje`), así que nunca importaba cuál de
los dos se leyera — el fallo solo era visible con datos reales donde los
dos números son distintos, que es precisamente el caso normal.

**Lección:** Cuando un valor sirve como CRITERIO INTERNO para elegir
entre varias opciones (aquí, «con qué eje comparar para decidir la
fila»), y ADEMÁS existe un campo que describe EL RESULTADO de esa
elección (aquí, «qué eje tendría esta opción en la práctica»), no basta
con que el criterio esté bien calculado: hay que comprobar, campo por
campo, cuál de los dos es el que de verdad llega a la pantalla. Y al
escribir datos de prueba para un campo que tiene dos «primos» con
significados distintos (`eje`/`ejeResidual`, `cilindro`/`cilindroResidual`,
etc.), ponerles valores DISTINTOS a propósito — si son iguales, un test
puede pasar en verde leyendo el campo equivocado sin que nadie se entere.

**Contexto:** `packages/domain/src/comparacion/recomendacion.ts` y
cualquier sitio de `packages/report/src/plantilla.ts` que construya un
texto o una tabla a partir de `LenteEstimada`: repasar qué campo se está
leyendo de verdad, no solo que el nombre «suene» correcto. Extensible a
cualquier tipo con un campo de criterio interno y un campo de resultado
que se parezcan.

## 02/09/2026 (2) — Una mitigación probada añade una técnica nueva, no repite la que ya falló, y no se llama «arreglado» sin verlo en vivo

**Error o aprendizaje:** El dueño compartió un PDF real (CV-2026-0091, OS)
donde la captura de Kane —página 3 del informe— sale con las dos tablas
de resultado completamente en blanco, mientras que la estimación propia
de Calculator Vilamar debajo de esa misma captura sí trae números reales
(20.13 D · Cil. 0.00 D · Eje 48°) y la tabla comparativa final también.
Esto confirma que la LECTURA de datos funcionó bien —Kane sí devolvió
las potencias, y el programa las leyó y las usó para calcular—, pero la
FOTO tomada de esa misma pantalla, para que quede como evidencia sin
interpretar, salió vacía. El propio código de `kane.ts` ya tenía, desde
el 27/08/2026, un comentario extenso documentando que esto es una
flakiness real de Chromium en captura de pantalla (no un problema del
HTML de Kane), y una mitigación ya aplicada (esperar 400 ms, desplazar la
tabla a la vista, forzar un reflow síncrono) — que reduce el problema
pero, como demuestra este PDF real, no lo elimina del todo.

**Causa raíz (probable, sin confirmar en vivo):** `page.screenshot()` de
Playwright, sobre Chromium en modo headless, a veces devuelve un
fotograma del compositor que no refleja el último cambio del DOM, aunque
ese cambio ya se pueda LEER con `evaluate()` sin problema — layout y
paint son pasos distintos, y forzar un reflow (`getBoundingClientRect()`)
solo garantiza el primero. El propio comentario del 27/08 ya deja escrito
que esperar más tiempo, con o sin `requestAnimationFrame` desde JS, no
cambiaba nada: el PNG salía idéntico byte a byte. Esta vez se ha probado
algo genuinamente distinto —un evento de ratón real, disparado por
Playwright como entrada de verdad y no desde JavaScript dentro de la
página— porque es la técnica habitual para forzar que un navegador
headless programe un fotograma nuevo del compositor, y es un mecanismo
que no aparece entre lo ya descartado en el comentario anterior.

**Lección — la más importante de esta entrada:** Esto se documenta como
una MITIGACIÓN AÑADIDA, no como un fallo «corregido». Ya hay un
precedente en este mismo log (27/08/2026, noche, 7) de decir que algo
estaba arreglado sin haberlo comprobado de verdad, y resultar que seguía
roto. Aquí no ha sido posible reproducir el cálculo contra el Kane real
dentro de esta sesión (implica pasar por su pantalla de condiciones, que
pide una acción humana — D-loa de `kane-transicion.spec.ts`), así que el
cambio se ha verificado con lint, typecheck y toda la batería de tests
existente en verde, pero **no con una repetición en vivo del caso real
que falló**. Al dueño se le tiene que decir esto exactamente así: «he
añadido una mitigación más, con una técnica que no se había probado
todavía, pero no puedo prometer que esté arreglado del todo hasta verlo
fallar o no fallar con datos reales otra vez» — nunca «ya está
arreglado» sobre un fallo de temporización de navegador que ya resistió
un intento anterior.

**Contexto:** `packages/integrations/src/adapters/kane.ts`, método
`leerResultado()`, justo antes de `capturarResultado()`. Si el dueño
reporta otra captura en blanco después de este cambio, el siguiente paso
razonable es un reintento real de la foto entera (no solo más técnicas de
espera antes de UNA foto), o investigar si `fullPage: true` interactúa
mal con el `scrollIntoViewIfNeeded()` que ya se hace justo antes.

## 02/09/2026 (3) — Un botón nuevo en un adaptador (Kane «Keratoconus», D67) se probó solo en el caso más simple, y la web tenía un aviso propio que ese caso no disparaba

**Error o aprendizaje:** Al construir D67 (córnea especial), se investigó
en vivo el interruptor «Keratoconus» de Kane antes de escribir el
adaptador —bien hecho, siguiendo la disciplina de este proyecto— pero la
investigación solo probó el caso más simple: activarlo con el ojo en modo
«Non-toric» (el que trae Kane por defecto al cargar la página). El dueño
probó D67 con un caso real de verdad, con datos completos que ponen a
Kane en modo «Toric», y ahí Kane enseña un aviso PROPIO —un modal de
Bootstrap con un botón «OK»— que el caso simple no llegó a disparar
nunca: «The Keratoconus option has been selected... Please ensure this
option is only selected if the patient has keratoconus». El adaptador no
lo esperaba, y se quedaba colgado esperando un cambio de estado que
nunca llegaba porque el modal tapaba el control.

**Causa raíz:** La reconnaissance de un botón nuevo se hizo contra el
ESTADO POR DEFECTO de la página (Non-toric, recién cargada), que es el
más fácil de alcanzar pero no necesariamente el que va a usar un caso
real — el propio adaptador, en `rellenar()`, deja el ojo en modo Toric
ANTES de tocar Keratoconus siempre que el caso tenga los datos para
tórico, que es el caso más habitual con un informe completo. Al
investigar solo el camino corto no apareció el aviso, así que el código
se escribió sin saber que existía.

**Otro hallazgo, al intentar reproducirlo para arreglarlo:** el aviso
sale de forma **inconsistente entre ejecuciones** contra la web real —ni
depende de forma fiable de activar/desactivar, ni del modo tórico por sí
solo, comprobado repitiendo la misma secuencia varias veces con
resultados distintos—. En vez de perseguir la condición exacta (que
puede no ser determinista de verdad, o depender de algo que este
programa no controla — quizá el estado guardado en el perfil del
navegador de sesiones previas), la corrección comprueba SI aparece,
sin darlo por hecho, y actúa solo entonces. Es el mismo principio que ya
regía `rechazarCookies()` en Barrett: no «se pulsa una vez y se sigue», es
«se espera a la señal real y se actúa según lo que de verdad haya».

**Lección:** Cuando se investiga un control nuevo de una web ajena antes
de automatizarlo, no basta con probarlo desde el estado por defecto de la
página — hay que probarlo en la MISMA SECUENCIA y con el MISMO ESTADO
PREVIO que el adaptador va a dejar antes de llegar a él (aquí: modo
tórico, no el modo por defecto). Un control puede comportarse distinto
según qué haya pasado antes en la misma pantalla, y solo se descubre
reproduciendo el camino real, no el más corto para llegar hasta él.

**Contexto:** `packages/integrations/src/adapters/kane.ts`,
`asegurarKeratoconus()`. Extensible a cualquier interruptor o campo nuevo
de una web que dependa de un `rellenar()` con varios pasos: probar el
campo aislado no basta si el adaptador real llega a él con la página en
otro estado.

## 03/09/2026 — Dos investigaciones seguidas «mitigaron» la foto en blanco de Kane sin comprobar el estilo real de la celda; la tercera lo miró y la causa era otra completamente distinta

**Error o aprendizaje:** Las investigaciones del 27/08 y del 02/09
(entradas de arriba) diagnosticaron la foto en blanco de Kane como
«flakiness del compositor de Chromium» — el navegador a veces no ha
pintado el último cambio del DOM cuando `screenshot()` lo pide — y
probaron mitigaciones sucesivas del mismo tipo: esperar más, forzar un
reflow, mover el ratón, hacer scroll. Todas verificadas en vivo, todas
descartadas en vivo cuando el dueño volvió a mandar un PDF con la tabla en
blanco. Ninguna funcionó porque ninguna atacaba la causa real: nunca se
inspeccionó el ESTILO COMPUTADO de la celda en el momento exacto de la
foto, solo se ensayaban técnicas para «forzar un repintado» a ciegas.

**Causa raíz (la de verdad, encontrada esta vez):** las celdas de la
tabla de resultado tienen `opacity: 0` DE VERDAD en el DOM en el momento
de la foto —confirmado con `getComputedStyle(celda).opacity === "0"`, no
supuesto—, casi seguro una animación de fade-in de Kane que no llega a
completarse cuando la conduce un script en vez de una persona. La pista
que lo destapó fue el propio dueño: probó la web de Kane a mano y le
funcionó perfecto, lo que apuntaba a una diferencia entre interacción real
y automatizada, no a timing del navegador. Ninguna de las mitigaciones
anteriores podía haber funcionado nunca: esperar, hacer reflow o mover el
ratón no cambian una opacidad que se ha quedado enganchada en 0.

**Lección:** Cuando una foto o una lectura de pantalla sale mal de forma
intermitente, antes de probar una «mitigación de timing» (esperar más,
forzar reflow, mover el ratón, hacer scroll) hay que **inspeccionar el
estado real del elemento en el momento del fallo** —`getComputedStyle()`,
tamaño, visibilidad— para saber si el problema es de verdad de timing o
si el contenido genuinamente no se ha terminado de mostrar. Una mitigación
que «a veces parece ayudar» sin una causa confirmada es indistinguible de
la flakiness que se está intentando arreglar, y dos rondas seguidas de
mitigaciones sin diagnóstico confirmado es la señal de parar y mirar el
estilo real antes de intentar una tercera. También: cuando el dueño diga
«a mí me funciona a mano», es una pista de diagnóstico, no un comentario
de pasada — señala automatización vs. interacción real como el eje del
problema.

**Contexto:** `packages/integrations/src/adapters/kane.ts`,
`leerResultado()`. Extensible a cualquier lectura de pantalla automatizada
(Playwright u otro) que falle de forma intermitente contra una web con
animaciones o transiciones CSS.

## 03/09/2026 (2) — Un botón que llamaba a la función «correcta» por el nombre («Reintentar») en realidad iba por un camino distinto y más flojo que el botón que sí funcionaba

**Error o aprendizaje:** El botón «Reintentar X» de la pantalla de
resultados (`PanelResultados.tsx`) no funcionaba para una calculadora que
nunca se había lanzado, tras reabrir un caso desde «Casos guardados» —
obligaba a volver a la pantalla de revisión, confirmar otra vez, y
lanzarla desde la pantalla de cálculo, donde SÍ funcionaba. Antes de tocar
código se sospechó de varias cosas plausibles (un guardia sobre
`caso.estado`, el caso reabierto sin hidratar bien, una condición de
carrera) — ninguna era la causa real.

**Causa raíz:** El botón llamaba a `ServicioCasos.reintentar()`, una
función CON ESE NOMBRE PARA ESO, que a falta de un aparato explícito
asumía `APARATO_PRINCIPAL` («Principal»). El botón «Calcular» de la
pantalla anterior, en cambio, llama a `ServicioCasos.calcular()`, que
resuelve el aparato real de cada ojo a través de `planificarCaso()` en vez
de asumir nada. Para un caso donde el usuario eligió un aparato con nombre
propio en el desplegable (p. ej. «ZEISS IOLMaster 700», nada raro: es
justo lo que ofrece el propio selector), `reintentar()` buscaba un
conjunto de datos con aparato «Principal» que no existe, encontraba uno
vacío, y la calculadora fallaba por «faltan todos los campos» — un fallo
real, no simulado, pero que parecía «no hace nada» porque no hay ningún
mensaje visible en pantalla que diga POR QUÉ falló una casilla que nunca
se había intentado.

**Cómo se confirmó, sin adivinar:** en vez de teorizar más, se cogió el
caso real guardado del dueño (`CV-2026-0101.json`, aparato real «ZEISS
IOLMaster 700») y se llamó `prepararEntradas()` dos veces, directamente:
con `'Principal'` (el bug) devolvía `FALTAN_DATOS` con los nueve campos
vacíos; con el aparato real, todo correcto. Cero suposiciones — el propio
dato del dueño demostró la causa antes de escribir el arreglo.

**Lección:** Cuando dos botones que deberían hacer «lo mismo» (aquí:
lanzar una casilla de cálculo) se comportan distinto, no asumir que el que
lleva el nombre más obvio («Reintentar») es el camino correcto o el más
robusto — comparar los DOS caminos de código exactamente, función a
función, hasta encontrar dónde divergen. Y cuando un valor tiene un caso
por defecto razonable (`APARATO_PRINCIPAL`) para el uso más común, revisar
si TODOS los sitios que lo asumen sin preguntarlo siguen siendo válidos
según el producto crece — aquí lo era en `casoNuevo()` y en la primera
carga de un documento, pero dejó de serlo en un tercer sitio nuevo
(`reintentar()`) escrito antes de que D47 (varios aparatos por ojo)
hiciera que el aparato real pudiera ser cualquier texto.

**Contexto:** `apps/desktop/src/renderer/App.tsx` (wiring del botón),
`apps/desktop/src/main/servicio-casos.ts` (`reintentar()` vs `calcular()`).
Arreglado haciendo que el botón use `calcular()` en vez de `reintentar()`,
en vez de enseñarle a `reintentar()` a resolver el aparato real —menos
código nuevo, y reutiliza un camino que ya estaba probado.

## 04/09/2026 — «Kane sigue fallando» no siempre es la app: la web puede estar caída, y se comprueba en 30 segundos antes de tocar código

**Error o aprendizaje:** El dueño reportó otro fallo de Kane con un PDF real
(«Kane no ha respondido como se esperaba»). Dado el historial de esta
misma sesión —dos investigaciones previas del mismo mensaje genérico que
sí eran bugs reales (repintado a medias, opacity:0)— el reflejo habría
sido asumir un tercer bug en el adaptador y ponerse a investigar el DOM
otra vez.

**Causa raíz (esta vez):** no era código. El diagnóstico que la propia app
guarda (`diagnostico/kane-*/informe.json`) decía `net::ERR_TIMED_OUT` /
`TimeoutError` al cargar `https://www.iolformula.com/` — **ni siquiera
llegaba a abrir la página**, antes de tocar ningún selector. Confirmado en
30 segundos con `curl` fuera de la app (mismo timeout; Google y EVO
respondían al instante) y, de forma definitiva, con el propio dueño
abriendo esa URL en DOS navegadores normales de su ordenador — mismo
`ERR_TIMED_OUT` en los dos. Unos minutos después, la misma URL cargaba
bien desde el móvil del dueño Y desde el mismo ordenador con el mismo
`curl` que antes fallaba: era la web de Kane caída de verdad un rato
—coincide con los tres fallos guardados en ~15 minutos—, no un bloqueo de
ninguna red concreta. Se descartó la hipótesis intermedia («la red de la
oficina la bloquea») en cuanto una nueva comprobación, en el mismo sitio
donde antes fallaba, empezó a funcionar sin que nadie cambiara nada.

**Lección:** Antes de investigar un fallo de Kane/EVO/Barrett como un bug
del adaptador, **mirar primero el `errorTecnico` guardado en
`diagnostico/<adaptador>-<fecha>/informe.json`** — si dice
`ERR_TIMED_OUT`/`TimeoutError` en el `page.goto()` inicial (antes de
`CALCULANDO` haber llegado a ningún selector), es una señal de que la web
externa podría no estar respondiendo, no de que el código esté mal. Se
comprueba en segundos con `curl <url>` o pidiéndole al dueño que abra esa
URL él mismo en su navegador normal — si tampoco carga ahí, es la web
externa (o la red), y ningún cambio de código lo arregla. Solo si la
página SÍ carga pero el adaptador falla dentro de ella, hace falta
investigar el DOM.

**Contexto:** Cualquier fallo de los tres adaptadores
(`packages/integrations/src/adapters/`) con mensaje «no ha respondido
como se esperaba». El `errorTecnico` de cada diagnóstico dice siempre en
qué fase y contra qué URL falló — es el primer sitio que hay que mirar,
antes de sospechar del código.
