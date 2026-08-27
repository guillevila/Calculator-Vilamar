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
