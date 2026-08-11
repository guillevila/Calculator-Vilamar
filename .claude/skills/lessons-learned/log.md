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
