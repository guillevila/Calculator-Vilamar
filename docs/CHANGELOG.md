# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [1.0.3] — 13/08/2026

«3 opciones» repetido cinco veces no decía nada. Ahora una fila las nombra.

### El problema

El paso anterior dejó de elegir una alternativa por la calculadora, que era lo
importante. Pero lo dijo mal:

    Kane
    Esfera               22.50 D
    Cilindro             3 opciones
    Eje                  —
    Modelo tórico        3 opciones
    Refracción prevista  -0.17 D
    Cilindro residual    3 opciones
    Eje residual         3 opciones

El recuento era cierto, pero no contestaba la única pregunta que deja: **tres
opciones ¿de qué?** Y puesto en la fila del cilindro se seguía leyendo como «tres
cilindros», que es justo lo que había que evitar.

### La corrección

**Una fila nombra las alternativas y las demás remiten a ella:**

    Cilindro             Ver alternativas
    Eje                  —
    Modelo tórico        3 alternativas tóricas     ← la que las nombra
    Cilindro residual    Ver alternativas
    Eje residual         Ver alternativas

La que las nombra es la primera de `CAMPOS_COMPARADOS` que tenga alternativas, y
de ahí sale también de qué clase son: si llevan designación —«T3», «T4», «T5»—,
son **tóricas**; si lo que cambia es la esfera, son **de potencia**. No se inventa
la etiqueta: se deduce de lo que la web devolvió.

**El texto viaja dentro del dato**, no lo compone cada pantalla. Así la interfaz y
el PDF no pueden decir cosas distintas de lo mismo, que es exactamente lo que pasó
la primera vez.

### Lo que NO cambia, y es deliberado

- **La esfera 22.50 D y la refracción −0.17 D se quedan.** Está demostrado que
  salen de la fila que Kane marca con `table-active`, no de una regla nuestra.
- **Las tres alternativas tóricas se quedan enteras** en el detalle, con su
  cilindro y su residual. Son datos reales de Kane.
- **Ninguna se elige.** Ni la de menor residual.
- El eje sigue siendo `—`: ese dato Kane no lo publica, y ahí no hay alternativas
  a las que remitir.

### Comprobado

Contra el caso real guardado, ojo izquierdo:

    Kane                                    EVO Toric    Barrett Toric
    Esfera                22.5              22.5         22
    Cilindro              Ver alternativas  3            2.25
    Eje                   —                 100          100
    Modelo tórico         3 alternativas    T5           T4
                          tóricas
    Refracción prevista   -0.17             -0.1         0.08

    Detalle · Kane:  T3 (cil 1.5, residual 0.67 D @ 98°)
                     T4 (cil 2.25, residual 0.18 D @ 98°)
                     T5 (cil 3, residual 0.32 D @ 8°)

14 tests de presentación nuevos, 528 en total. Hay uno que falla si el genérico
«N opciones» vuelve a aparecer en cualquier casilla, y otro que comprueba que
**solo una** la nombra.

lint, formato, tipos, build y las pruebas de interfaz en verde.

---

## [1.0.2] — 13/08/2026

Una calculadora que devuelve varias opciones ya no se representa como si hubiera
elegido una.

### La línea que elegía una lente

```ts
const op = r.recomendada ?? r.opciones.find((o) => o.recomendada) ?? r.opciones[0]
//                                                                 └──────────────┘
```

Ese último tramo **escogía la primera opción** y la pintaba en la tabla con el
mismo aspecto que una destacada por la web. Si una calculadora devolvía siete
potencias sin señalar ninguna, la comparativa enseñaba la primera —la más alta—
como si fuera su respuesta. Nadie podía distinguir lo que decía la calculadora de
lo que había decidido el programa.

Con los datos de hoy no llegaba a dispararse, porque Kane sí marca su fila con
`table-active`. Era una selección implícita esperando a que una web dejara de
marcar. Fuera.

### Y no bastaba con borrarla

Al quitarla, la celda quedaba vacía — y **vacío significaba dos cosas distintas**:

- la calculadora no publica ese dato;
- la calculadora da varias alternativas y no señala ninguna.

De ahí el cambio de raíz: `DatoComparativo`, con tres estados que no se pueden
confundir, y `SeleccionDeLaCalculadora`, que dice de dónde sale la columna.

| Estado          | Cuándo                                   | Se ve        |
| --------------- | ---------------------------------------- | ------------ |
| `VALOR`         | La web señaló una opción, o solo dio una | `22.50 D`    |
| `VARIAS`        | Varias alternativas, ninguna señalada    | `3 opciones` |
| `NO_DISPONIBLE` | Ninguna opción trae ese dato             | `—`          |

**No hay forma de escribir un número sin decir de dónde sale.** La pantalla y el
PDF leen la misma estructura, así que no pueden equivocarse por separado.

### Lo que se veía mal, y por qué

Un campo se decidía por la opción señalada; si esa no lo traía, se daba por
perdido. Ahora, si la señalada no trae el dato pero **otras opciones sí**, son
alternativas de verdad y se dicen como tales. Y si no lo trae ninguna, es `—` con
la ayuda «No disponible en el resultado de Kane».

Eso es lo que separa «3 alternativas de potencia» de «3 cilindros»: se mira si el
dato **está en las opciones**, no si falta en una.

### El detalle, en pantalla y en el PDF

Debajo de la comparación, cada calculadora con más de una opción enseña **todas**
las que devolvió, con las columnas que trajo de verdad y ninguna más. Si la web
señaló una, va marcada como «Destacada por Kane»; si no, se dice que no ha
señalado ninguna y que la elección no la hace Calculator Vilamar.

Sin alarmismo: **no es un error**. La calculadora ha calculado y ha devuelto
varias salidas porque la decisión no es suya.

### Comprobado rompiéndolo

Tres formas de reintroducir la selección implícita —la primera, la del medio, y la
de refracción más cercana a cero—, y **las tres las caza un test**.

37 tests nuevos. 514 en total; lint, tipos, build y las 12 pruebas de interfaz en
verde.

### Ficheros

- `packages/domain/src/comparacion/comparar.ts` — el modelo de presentación
- `packages/domain/src/comparacion/opciones.test.ts` — 26 tests
- `packages/report/src/plantilla.ts` + `opciones-informe.test.ts` — 11 tests
- `apps/desktop/src/renderer/componentes/PanelResultados.tsx`, `estilos.css`

---

## [1.0.1] — 13/08/2026

Kane salía N/A. Tres causas, y la primera era un aviso mío que no avisaba.

### Por qué salía N/A

El caso no tenía sexo, así que Kane devolvía `MISSING_INPUTS`. En el caso real:

    EVO OD + OS        SUCCESS
    Barrett OD + OS    SUCCESS
    Kane OD + OS       MISSING_INPUTS — «Falta el sexo del paciente»

El cálculo bilateral funcionaba. Lo que faltaba era un dato.

### 1 · El aviso previo a confirmar no miraba el sexo

`quienNoPuedeCalcular` solo contaba campos del ojo, y el sexo no es uno. Así que
el aviso decía que las tres calculadoras podían calcular, se confirmaba, se
esperaba el recorrido entero de las tres webs, y **solo entonces** salía que a
Kane le faltaba el sexo.

Es exactamente el problema de los 47 segundos que ese aviso existe para evitar,
reintroducido por otra puerta al añadir el sexo. Ahora lo cuenta, y distingue los
dos casos: «falta el sexo del paciente» si no hay ninguno, y «comprobar el sexo
del paciente» si está deducido y sin confirmar.

### 2 · El informe traía el sexo y no se leía

Es español y está **en columnas**: pone `Sexo   Femenino`, con espacios y sin dos
puntos. El patrón exigía `Sexo:`, así que no coincidía y no había nada de donde
deducir — el informe tampoco trae un nombre reconocible.

Los dos puntos pasan a ser opcionales. Aflojar el separador es seguro por una
razón concreta: **la palabra capturada tiene que ser reconocible**. Si detrás de
«Sexo» hay cualquier otra cosa, no se traduce y el campo se queda vacío.

### 3 · El fabricante trae un punto y coma

El PDF pone literalmente `Bausch&Lomb;`. Se comprobó extrayendo su texto: el punto
y coma **está en el documento**, no lo añade el parser. Sin quitarlo al comparar,
ese modelo no se emparejaba con «Bausch & Lomb» de ninguna lista. Ahora el punto y
coma cuenta como puntuación de adorno, igual que el punto o el guion.

### Y el fallo al reintentar

Si el perfil del navegador está en uso —una ventana de un cálculo anterior, o la
sonda `reconocer:kane` abierta—, Chromium no lo deja abrir y salía su error en
crudo. Ahora se dice qué pasa y qué cerrar. Es un riesgo que apareció al empezar a
compartir el perfil, que es lo que evita repetir la aceptación.

### Validación

485 tests (7 nuevos) y 27 pruebas de interfaz. lint, formato, typecheck y build en
verde.

---

## [1.0.0] — 12/08/2026

**Kane funciona.** Verificado contra su formulario real y ejecutado de punta a
punta: rellena, calcula y lee. ~9 segundos.

```
Recomendada: 21.5 D · refracción prevista −0.06     ← la que Kane marca
7 opciones leídas
[web] AL: 24.07 mm  K1: 41.22 D  K2: 42.52 D  ACD: 3.18 mm
[web] A-Constant: 119.00  Target Ref: 0.00 D  LT: 4.53 mm  CCT: 530 µm
```

Ese 21.50 D es **el mismo que dio EVO** en la verificación anterior. Dos fórmulas
independientes de acuerdo.

### Cuatro cosas que solo se supieron al mirarlo, y estaban mal supuestas

| Se suponía                                      | Es                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| El sexo es una lista que espera «Female»/«Male» | **Dos casillas**, `gender_1` (M) y `gender_2` (F), y se pulsa la etiqueta que las envuelve |
| El botón de calcular es un `submit`             | `<input type="button" value="Calculate">`                                                  |
| El nk no se envía a ninguna calculadora         | Es la lista **«Index»** de Kane, que él marca obligatoria                                  |
| Elegir el modelo de lente es inofensivo         | Una lente **tórica** cambia ese ojo al modo tórico y esconde los campos                    |

La marca `EQUIVALENCIA_KANE_VERIFICADA = false` sirvió para lo que estaba: mientras
la equivalencia era una suposición, **no se envió nada**. Si se hubiera dado por
buena, el adaptador habría escrito «Female» en un control que no existe.

### Añadido

- **`MAPA_KANE` con los identificadores reales.** No siguen ningún patrón —hay
  `al-right`, `A-Constant1` y `right-target` en el mismo formulario—, así que están
  copiados uno a uno de la captura. Las etiquetas se quedan como respaldo.
- **Lectura del resultado contra su estructura real**: espera a que su
  «Processing…» se esconda —señal, no reloj—, lee `table.res_tab3` de la sección de
  **ese ojo**, y toma la recomendada de `class="table-active"`.
- **Comprobación de lo escrito antes de calcular.** Se relee el formulario: si un
  valor no se ha quedado, se dice **qué campo y qué dice el formulario**, en vez de
  fallar cuatro pasos después como «no hay tabla de resultados».
- **Guarda contra leer el ojo equivocado**: Kane repite las entradas, y si la AL
  que enseña no es la que se le envió, el resultado se descarta.
- El **índice queratométrico** se envía, eligiendo la opción de su lista. Si el
  informe trae uno que Kane no ofrece, **no se elige ninguno**: coger el más
  parecido cambiaría lo que significan las K sin avisar.

### Corregido

- La ficha de Kane declaraba **WTW** como opcional. No existe en su formulario.
- Y los **ejes de K**, que solo aparecen en su modo tórico.

### Lo que Kane NO hace, y queda dicho

**No se rellena su modo tórico.** Elegir una lente tórica lo activa y esconde los
campos que este adaptador escribe, así que **no se le manda el modelo de lente**:
se le envía la constante A de esa lente, y el resultado lo dice con esas palabras.
Para el cálculo tórico están EVO Toric y Barrett Toric.

Y lo de siempre: **no se pulsa «I Agree» y no se toca el reCAPTCHA.**

### Validación

478 tests y **27 pruebas de interfaz** (7 nuevas sobre la lectura del resultado,
con la estructura real reproducida en una página sintética). lint, formato,
typecheck y build en verde. Y una ejecución real contra su web, con datos
sintéticos.

---

## [0.9.2] — 12/08/2026

La sonda de reconocimiento comparte el perfil del navegador con la aplicación.

### El fallo

Había **tres** perfiles de navegador en juego, no dos:

| Navegador                     | Perfil                           |
| ----------------------------- | -------------------------------- |
| El Chrome del usuario         | el suyo                          |
| La aplicación al calcular     | `sesion-navegador`, en sus datos |
| **La sonda `reconocer:kane`** | **uno nuevo y vacío cada vez**   |

Así que aceptases donde aceptases, los otros dos seguían viendo la pantalla de
condiciones. En la versión anterior se arregló la confusión entre la aplicación y
el Chrome del usuario, pero **la sonda se quedó como una tercera isla**.

### Corregido

- `reconocer:kane` abre ahora **el mismo perfil que la aplicación**, calculado
  igual que lo hace Electron. Con eso: si ya aceptaste en la aplicación, la sonda
  entra directa; y si aceptas en la sonda, la aplicación no vuelve a pedírtelo.
- Si el perfil está cogido —la aplicación abierta—, se dice **eso**, en vez de un
  error de Chromium: dos navegadores no pueden usar el mismo perfil a la vez.
- Se puede forzar la ruta con `VILAMAR_PERFIL` si algún día no coincidiera.

---

## [0.9.1] — 12/08/2026

La transición de Kane después de que tú aceptes. Dos fallos, y ninguno era el
que parecía.

### 1 · La espera se cumplía demasiado pronto

El programa esperaba a que **desapareciera** la pantalla de condiciones —la
negación— y después dormía 2,5 segundos.

Esa negación se cumple **en el instante en que la URL deja de ser
`/agreement/`**, o sea en medio de la navegación, cuando la página puede estar en
blanco. El `waitForTimeout(2500)` hacía de «ya habrá cargado». Si tardaba más,
`rellenar()` no encontraba ningún campo, devolvía 0 y el adaptador concluía
**`ADAPTER_BROKEN`: «ejecuta pnpm reconocer:kane»**.

**Aceptabas correctamente y el programa te decía que el conector estaba mal.**

Ahora se espera a **tres condiciones**, y ninguna es un reloj:

1. La dirección ya no es la del acuerdo.
2. Hay campos editables y un control de calcular.
3. **El primer campo se puede escribir de verdad** — un formulario pintado pero
   deshabilitado daría cero campos rellenados y volvería a parecer roto.

Y los dos modos de fallo se separan: si sigue en `/agreement/` es
`NEEDS_USER_ACTION` («no se ha aceptado»); si salió y no apareció la calculadora
es `ADAPTER_BROKEN` («la página ha cambiado»). Antes los dos eran lo mismo.

### 2 · La aceptación no se podía recordar nunca

Esto es aparte, y estaba oculto. El navegador se abre con **perfil persistente**
en la carpeta de datos del usuario — pero `abrirNavegador` devolvía
`contexto.browser()`, y el orquestador llamaba a `newContext()`, que crea un
contexto **nuevo y vacío que no hereda el perfil**.

Medido: una cookie puesta en el contexto persistente se ve como **1** en él y
como **0** en el nuevo. El perfil se cargaba y no se usaba jamás, así que las
cookies del cálculo morían con el contexto desechable.

Consecuencia: **Kane volvía a pedir la aceptación en cada cálculo**, hiciera el
usuario lo que hiciera. Y el comentario del código afirmaba lo contrario.

### 3 · Aceptar en otro Chrome no cuenta, y ahora se dice

Si alguien acepta en su navegador de siempre, el que abre Calculator Vilamar
sigue viendo la puerta: son dos almacenes de cookies distintos. El mensaje de
espera dice «esta ventana, no tu Chrome de siempre», y el error de tiempo agotado
lo nombra como causa probable.

### Lo que NO se ha tocado

- **No se pulsa «I Agree».** Ni ahora ni nunca: es un contrato entre el autor de
  la fórmula y quien la usa.
- **No se toca el reCAPTCHA.**
- No se abre pestaña nueva ni se recarga tras aceptar: se sigue en **la misma
  página y el mismo contexto**, porque recargar perdería lo que acabas de aceptar.

### Validación

**8 pruebas nuevas de interfaz** contra un **servidor local** que imita las tres
pantallas de Kane con cookies y redirección de verdad. No van a iolformula.com y
no aceptan nada.

**Tres mutaciones, tres caídas** — pero a la primera fueron dos de tres: la guarda
de la dirección dentro de `calculadoraDeKaneLista` **no la vigilaba nadie**,
porque la pantalla del acuerdo ya falla por no tener campos. Hizo falta añadir el
caso de una página con forma de calculadora servida en la ruta del acuerdo.

477 tests y **20 pruebas de interfaz**, todo en verde.

---

## [0.9.0] — 12/08/2026

Un solo «Calcular» procesa los dos ojos. Y el sexo del paciente, que pide Kane.

### Por qué EVO solo calculaba un ojo

**No fallaba EVO.** Su adaptador abre una página nueva por ejecución, marca el
radio del ojo que le piden y comprueba el eco que devuelve la web. Funcionaba
perfectamente para el ojo que le pedían.

El problema estaba tres capas por encima: `App.calcular()` llamaba a
`api().calcular(ojoActivo)` —el ojo de la pestaña—, el servicio lo pasaba tal
cual y el orquestador solo sabía de un ojo. **Nadie pedía el segundo.**

### Añadido

- **Dos capas donde había una.** `ejecutarUnaCalculadoraParaUnOjo` es la
  primitiva —no sabe que existe otro ojo— y `ejecutarCaso` recorre las casillas.
  Toda la decisión de «qué hay que ejecutar» vive en un solo sitio.
- **El orden es calculadora a calculadora, y dentro los dos ojos.** Con eso, las
  condiciones de Kane se aceptan UNA vez y sus dos ojos entran seguidos en la
  misma sesión del navegador.
- **«Reintentar» vuelve a significar repetir lo que falló.** `tareasPendientes`
  excluye lo que salió bien, y `MISSING_INPUTS` y `ADAPTER_BROKEN` no se
  reintentan solos: repetirlos daría exactamente el mismo fallo.
- **Guarda contra el ojo cambiado.** Si un adaptador devolviera un resultado del
  ojo que no es, se descarta como `ADAPTER_BROKEN`. Es el fallo más peligroso
  posible porque parecería perfectamente válido.
- **El sexo del paciente**, en el caso y no en el ojo: es de la persona. Del
  informe, deducido del nombre o elegido a mano. Bloquea **solo a Kane**.
- **`pnpm reconocer:kane` existe de verdad.** Se nombraba en mensajes de error y
  en tres documentos, y no estaba definido en `package.json`. Ahora abre Kane con
  ventana, pide que aceptes tú, y espera **a que aparezca el formulario** —campos
  de entrada y un botón de calcular—, no unos segundos a ver qué hay.

### Corregido

- **Kane marcaba como recomendada la fila del medio de la tabla.** Era inventarse
  una recomendación clínica a partir de una posición. Ahora no se marca ninguna
  hasta saber cómo la señala Kane, y se conservan todas las opciones.
- La puerta de las condiciones de Kane se detecta por su **dirección**
  (`/agreement/`) y no por el texto de un botón que pinta JavaScript.
- **El guardián de arquitectura no vigilaba «Kane».** Su lista tenía las otras dos
  calculadoras, así que la extracción podía nombrarlo sin que saltara nada.

### Sobre la deducción del sexo

Se implementa a petición expresa del dueño del proyecto, tomada tras exponerle
que un nombre no determina el sexo y que obliga a guardar un dato identificativo
que hasta ahora no entraba en el programa. Las salvaguardas **no se relajan**:

- El nombre **no sale del ordenador**: ni al PDF, ni a ninguna calculadora.
- Lo deducido es `DERIVADO`, así que **no se autoconfirma** y no viaja a Kane
  hasta que una persona lo mira.
- **Un nombre que no se reconoce no se adivina.** «Alex», «Cruz» o «Andrea» se
  quedan sin deducir.
- Se dice **qué regla** lo decidió, porque «estaba en la lista» pesa más que
  «acaba en -a».

### Lo que se ha comprobado abriendo las webs

- **Kane**: `iolformula.com` redirige a `/agreement/`, con **cero campos de
  formulario**. La calculadora no existe hasta que una persona acepta el acuerdo.
- **EVO**: 36 campos, **ninguno de sexo ni de edad**. Por eso el sexo no sale como
  obligatorio para él.

### Sigue pendiente de Kane

Los selectores reales, los campos obligatorios reales, la tabla de resultados
real y los valores reales del campo de sexo. Todo eso está detrás de un clic
humano en «I Agree», y este programa no lo da.

### Validación

lint, formato, typecheck y build en verde. **477 tests** (42 nuevos) y **12
pruebas de interfaz**. Tres mutaciones sobre el recorrido bilateral —volver al
comportamiento viejo, dejar de comprobar el ojo devuelto, y reintentar también lo
que salió bien—, tres caídas.

---

## [0.8.0] — 12/08/2026

Las constantes A que trae el informe, cada una pegada a su modelo de lente.

### El problema

Un ANTERION no siempre imprime «A constant: 119.1». Imprime una **tabla de
modelos**, y bajo cada uno la constante que usa una fórmula:

```
LUX SMART                     SRK/T: 118.5
ZEISS AT ELANA 841P           SRK/T: 119.6
Bausch&Lomb Akreos AO MI60    SRK/T: 119.1
Bausch&Lomb enVista MX60      SRK/T: 119.2
```

La pantalla decía **«Constante A — Pendiente de aportar»** con los cuatro números
delante.

Pero la solución fácil habría sido peor que el problema: coger 118.5 porque es la
primera. **Cuatro lentes son cuatro constantes posibles y ninguna es la del caso**
hasta que se sabe qué se va a implantar. Calcular con la constante de una lente que
no se pone da un resultado perfectamente creíble y equivocado.

### Añadido

- **`LenteDetectada`**: modelo, fabricante, constante, etiqueta de la fórmula y
  evidencia. La constante **no se puede representar sin su modelo** — no hay
  ningún sitio donde guardar una constante suelta salida de una tabla. La relación
  no se pierde porque no existe la forma de perderla.
- **`Caso.lentesDelInforme`**, fuera de los ojos: la misma lente lleva la misma
  constante se implante en el derecho o en el izquierdo.
- **`elegirLente()` en el dominio**, único sitio donde una constante de la tabla se
  convierte en la del caso. Cinco caminos y ninguno adivina: la escribe, deja el
  hueco, **quita la de la lente anterior**, pide revisión si hay ambigüedad, o
  respeta lo que ha escrito una persona.
- **`LenteElegida.constanteDeLaTabla`**, que es lo que hace posible cambiar de
  lente sin arrastrar la constante vieja: distingue «la de la lente que acabo de
  descartar» de «una constante suelta del informe o escrita a mano».
- **`perfiles.tablaDeLentes`**: qué aparatos traen tabla y en qué formato. Hoy solo
  ANTERION. En un documento cualquiera, un número junto a «SRK/T» puede ser el `a0`
  de otra fórmula o un error de lectura.
- **Auditoría de la constante frente a la web** (`auditoria-constante.ts`). Elegir
  el modelo en EVO puede cambiar SU constante; si dice haber calculado con 119.20 y
  se le envió 119.10, el informe lo dice con las dos cifras. **No se corrige.**
- La pantalla de lente enseña los modelos del informe con su constante al lado y
  **ninguno preseleccionado**: marcar el primero sería elegir por el cirujano.
- Dos informes sintéticos: ANTERION con tabla de lentes, y el mismo listado sin
  reconocer el aparato.

### Corregido

- El comentario de `SelectorLente.tsx` decía «el modelo de lente no sale del
  informe de biometría». **Era falso** para los aparatos que traen tabla.

### Sin cambiar

- **Barrett sigue igual**: la constante A le es opcional y puede calcular con el
  factor de lente. Lo que cambia es de dónde sale cuando está.
- Ningún adaptador interpreta el informe. Reciben modelo y constante ya resueltos.
- La lógica de EVO y Barrett de elegir el modelo en la web sigue intacta.

### Lo que NO hace, y está probado

- No elige una lente sola, ni la primera de la lista.
- No empareja de forma aproximada: `MX60` y `MX60T` son lentes distintas.
- No hereda la constante de otra lente, ni de otra de la misma marca.
- No interpreta «SRK/T» en un aparato desconocido.
- No guarda cuatro constantes como cuatro medidas del ojo.

### Validación

lint, formato, typecheck y build en verde. **435 tests** (59 nuevos) y **12 pruebas
de interfaz** (1 nueva, de punta a punta: PDF con las cuatro lentes → elegir →
cambiar → elegir una que no está).

**Siete mutaciones, siete tests caídos** — pero la primera vez fueron seis de
siete: la comprobación de que una constante esté dentro de 112–125 **no la vigilaba
nadie**. El test que creía cubrirla usaba «1.85», que se descarta antes por la
forma del número, así que pasaba sin que la comprobación existiera. Se rehízo con
valores que sí llegan hasta ella.

---

## [0.7.0] — 12/08/2026

La ACD, que puede llegar impresa o haber que calcularla. Y una capa nueva entre
«lo que pone el informe» y «el dato canónico».

### El problema

Las tres calculadoras exigen la ACD. Algunos informes de ANTERION **no la
imprimen**, pero traen AQD y grosor corneal — y en ese aparato el propio informe
dice desde qué superficie mide cada distancia («ACD epithelium», «AQD
endothelium»), así que entre las dos está justo el grosor de la córnea:

```
AQD 2.65 mm + CCT 530 µm (0.530 mm) = ACD 3.18 mm
```

Con esos informes, hasta ahora las tres calculadoras se quedaban fuera teniendo el
dato delante.

**Pero la cuenta no se puede aplicar a cualquier aparato.** En uno que llame «ACD»
a otra distancia da un número plausible y equivocado, y eso es lo peor que puede
producir este programa: un dato falso indistinguible de uno correcto.

### Añadido

- **`packages/domain/src/normalizacion/`**, una capa nueva. El recorrido queda así:

  ```
  documento → extracción literal → normalización del aparato → modelo canónico
            → revisión humana → calculadoras
  ```

  El parser sigue diciendo qué pone el informe; esta capa decide si un dato
  canónico se puede obtener de otros del mismo informe. Vive en el dominio porque
  es conocimiento clínico, no conocimiento de cómo está maquetado un PDF.

- **`perfiles.ts`: una tabla por aparato, restrictiva por defecto.** Hoy solo
  ANTERION deriva; IOLMaster, Pentacam y DESCONOCIDO no. Un test comprueba que la
  lista sea exactamente `['ANTERION']`, para que ampliarla sea una decisión y no
  un descuido.
- **`DERIVADO_DEL_INFORME`, quinto estado de origen.** No es «del informe» —el
  papel no lo dice— ni «aportado» —no lo ha escrito nadie—. La pantalla y el PDF
  enseñan **la cuenta**, no la palabra: «AQD 2.65 mm + CCT 530 µm (0.530 mm)» se
  contrasta con el informe en dos segundos; «derivado» no se comprueba.
- **`ACD_NO_CUADRA_CON_AQD_MAS_CCT`**, en la validación. Salta cuando están las
  tres medidas y no cuadran por más de **0.05 mm**. Avisa y **no elige**: los tres
  números pueden ser normales por separado y uno estar mal. Corre también sobre
  una ACD derivada, para cazar el caso silencioso — corregir la AQD después de
  haber derivado deja una ACD que ya no cuadra.
- **`necesitaComprobacionHumana()`**. Lo leído por una máquina y lo calculado por
  el programa exigen los dos que una persona mire, **por motivos distintos**: lo
  primero puede estar mal; lo segundo está bien pero nadie lo ha visto. Se separa
  de `esLecturaAutomatica()` porque una cuenta no es una lectura, y confundirlas
  haría que la pantalla dijera «leído de la imagen» de algo que no se ha leído de
  ninguna parte.
- Cuatro informes sintéticos nuevos: ANTERION sin ACD, ANTERION sin CCT, ANTERION
  con las tres medidas incoherentes, y aparato desconocido con AQD y CCT.

### Corregido

- El aviso de cabecera decía «datos leídos de la imagen» de todo lo pendiente.
  Con una ACD calculada eso era falso: no se ha leído de ninguna parte. Ahora cada
  motivo se dice solo cuando toca.

### Sin cambiar

- **AQD y ACD siguen siendo campos distintos.** Derivar no consume ni convierte
  nada: las tres medidas quedan guardadas, cada una con su procedencia y su
  evidencia. Los tests del dominio y de la extracción lo comprueban.
- Ninguna otra semántica clínica.

### Detalles que se decidieron a propósito

- **El CCT se sigue guardando en µm**, como lo imprime el informe. La conversión a
  mm ocurre dentro de la cuenta y se escribe en la explicación, porque el error de
  mil es justo el que da un resultado creíble.
- **La ACD derivada se redondea a dos decimales**, los del campo. Una derivada y
  una leída tienen que tener la misma forma; distinguirlas por el número de cifras
  en vez de por su etiqueta sería un accidente esperando. Lo que se descarta es
  como mucho media milésima de milímetro, y los sumandos exactos quedan aparte.
- **La capa se llama desde los dos caminos de lectura**, el local y el del modelo
  de visión, porque el segundo no pasa por el primero. Dejarlo en uno haría que la
  ACD se derivara o no según con qué lector se leyó el informe.

### Validación

lint, formato, typecheck y build en verde. **376 tests** (37 nuevos) y **11
pruebas de interfaz** (1 nueva, de punta a punta: PDF de verdad → proceso
principal → pantalla).

Y la comprobación que de verdad importa: **seis mutaciones, seis tests caídos.**
Se rompió a propósito la conversión de unidad, la tabla de perfiles, el estado de
origen, la tolerancia, la regla de no pisar la ACD leída y la exigencia de
comprobación humana. Ninguna pasó desapercibida.

---

## [0.6.0] — 11/08/2026

Cada campo dice cuánta falta hace, y la pantalla avisa antes de calcular de qué
se va a quedar sin resultado.

### La pregunta

«¿Son todos los datos obligatorios?» No. Y **«obligatorio» no es una propiedad
del campo**: depende de qué calculadora quieras. Sin SIA, Barrett no calcula y
EVO sí. De los 24 campos:

| Cuántos | Nivel                      | Cuáles                                                                                   |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| 5       | Obligatorios en las tres   | AL, K1, K2, ACD, refracción objetivo                                                     |
| 5       | Obligatorios en alguna     | Ejes de K1/K2 (EVO y Barrett), SIA y eje de incisión (Barrett), constante A (EVO y Kane) |
| 8       | Opcionales                 | LT, CCT, WTW, córnea posterior, factor de lente                                          |
| 6       | **No se envían a ninguna** | AQD, TK1/TK2 y sus ejes, nk                                                              |

Esos seis últimos merecen decirse en voz alta: se leen del informe y quedan en el
PDF por trazabilidad, pero **no alimentan ningún cálculo**. Callarlo hacía pensar
que hacían falta. Incluye el `nk` que se añadió en la versión anterior.

### Añadido

- `exigenciaDe(campo)` y `textoDeExigencia()`. Salen de `FICHAS`, comprobada
  contra los formularios reales: no hay una segunda lista que mantener, y hay un
  test que lo vigila.
- Cada campo enseña su nivel debajo del nombre. En el caso intermedio **se
  nombran las calculadoras** — «Obligatorio para Barrett Toric» dice qué pierdes;
  «puede ser obligatorio» no dice nada.
- `quienNoPuedeCalcular()` y el aviso **antes** de confirmar, con qué calculadora
  se queda fuera y qué le falta. Hasta ahora eso solo se sabía después de que el
  navegador recorriera las tres webs: 47 segundos para enterarse de un dato que
  se podía haber escrito antes.
- 11 tests nuevos y una prueba de interfaz más.

### Lo que NO hace

**No bloquea.** Calcular con dos de tres es un resultado legítimo, y puede que el
dato que falta sencillamente no se tenga. Se avisa y se sigue.

334 tests y 10 pruebas de interfaz.

---

## [0.5.0] — 11/08/2026

La pantalla de revisión deja de mezclar «el informe no lo trae» con «esto lo
pones tú». Eran dos cosas muy distintas y las dos decían «NO ENCONTRADO», así
que un hueco perfectamente normal parecía un fallo del extractor.

### La regla

**El origen pertenece al valor concreto, no al tipo de campo.** El mismo campo
puede venir del informe en un caso y escribirse a mano en otro.

| Origen        | Cuándo                            | En pantalla                                        |
| ------------- | --------------------------------- | -------------------------------------------------- |
| `DEL_INFORME` | Texto del PDF, OCR o visión       | «Del informe»                                      |
| `APORTADO`    | A mano, y no había nada antes     | «Aportado»                                         |
| `CORREGIDO`   | A mano, y **pisó un valor leído** | «Corregido» + «Leído originalmente: …»             |
| `NO_CONSTA`   | No está                           | «No consta en el informe» o «Pendiente de aportar» |

Los dos textos del hueco los decide quién se espera que aporte el campo: lo que
mide el aparato «no consta en el informe»; lo que decide el cirujano está
«pendiente de aportar».

Y **origen no es validación**: de dónde salió un número y si alguien lo ha
revisado van en columnas distintas.

### Añadido

- `Medida.original` conserva el valor anterior **y su evidencia** al corregir. Es
  la única ampliación de modelo que hacía falta; todo lo demás ya estaba y solo
  faltaba exponerlo bien.
- `corregirMedida()`, la única forma correcta de escribir a mano. Al corregir dos
  veces conserva **lo que decía el papel**, no el paso intermedio.
- `origenDe()`, `textoDeOrigen()` y `loAportaElCirujano()`.
- **Dos datos del ANTERION que se estaban tirando**: `Target refraction`
  —incluido el 0.00, que es emetropía y no un hueco, y los valores negativos con
  su signo— y `nk` (1.3375). Los dos campos ya existían en el dominio: faltaban
  las reglas del parser. Sin inventar ninguna equivalencia clínica.
- 39 tests nuevos y una prueba de interfaz más.

### Corregido

- **Una edición manual destruía la evidencia.** El servicio construía una
  `Medida` nueva de cero, así que el valor leído del informe desaparecía y el PDF
  decía «escrito a mano» sin poder explicar frente a qué. Verificado por mutación.
- El informe PDF usa el mismo vocabulario que la pantalla, y en un dato corregido
  enseña las dos cosas: el valor usado y el que ponía el informe.

### Lo que NO cambia

`AQD` y `ACD` siguen siendo campos distintos y **nada los convierte**. Hay tests
que lo comprueban en el dominio y en la extracción.

323 tests y 9 pruebas de interfaz.

---

## [0.4.0] — 11/08/2026

Un comparador que responde con números a «¿qué lector uso y cuánto cuesta?».

### Añadido

- **`pnpm comparar:lectores`**. Genera 6 documentos sintéticos que cubren los
  casos que fallan de verdad —no solo el fácil— y pasa cada uno por todos los
  lectores: el OCR local y los modelos de visión a distintos precios. Imprime
  aciertos, errores, datos que faltan, **coste real por informe** y un veredicto.
- El lector de visión admite elegir modelo y esfuerzo, y devuelve su consumo en
  tokens para poder calcular el coste de verdad en vez de estimarlo.
- **Caché del prompt.** Las instrucciones son idénticas en cada lectura; a partir
  de la segunda cuestan la décima parte.
- `precios.ts` con las tarifas anotadas y su fecha, porque un coste sin fecha
  envejece en silencio.

### Medido

El lector local, sobre 120 comparaciones: **91 bien, 1 mal, 28 sin leer**.

| Documento                         | bien     | MAL   | falta  |
| --------------------------------- | -------- | ----- | ------ |
| PDF con texto dentro              | 20/20    | —     | —      |
| Captura de pantalla nítida        | 20/20    | —     | —      |
| PDF que por dentro es una imagen  | 19/20    | —     | 1      |
| JPEG pequeño y muy comprimido     | 18/20    | —     | 2      |
| Esa imagen convertida a PDF       | 13/20    | **1** | 6      |
| **Foto de una pantalla, torcida** | **1/20** | —     | **19** |

Lo que enseña la tabla: **un PDF con texto sale perfecto**, y **una foto de la
pantalla del aparato hunde el OCR a 1 de 20** aunque la imagen se lea sin
esfuerzo a simple vista. Ese es el caso real cuando no se puede exportar.

### Cómo elige el comparador

_El lector más barato que no cometa ni un error._ Un dato ausente se ve y lo
escribes tú; un dato equivocado que parece razonable no se ve y cambia la lente.
Por eso un solo error descalifica antes de mirar el precio.

### Pendiente

**Cuánto mejoran los modelos, no se sabe.** El comparador los mide, pero hace
falta una clave para ejecutarlo. El modelo por defecto (`claude-sonnet-5`,
esfuerzo `medium`) está elegido por criterio y marcado como provisional en el
código, no por medición.

254 tests y 8 pruebas de interfaz.

---

## [0.3.0] — 11/08/2026

Un lector de informes que **entiende** el documento, en lugar de reconocer letras.
Construido, probado y **apagado**.

### Añadido

- **Lector de visión** (Claude, `claude-opus-5`). Lee el informe como lo lee una
  persona: ve la maqueta, sabe que AL es una longitud axial en milímetros y
  devuelve los datos estructurados, cada uno con la línea literal del informe de
  donde sale. Es la comprobación semántica que el reconocimiento de texto no
  puede hacer, y que en la versión 0.2.0 se midió que falta.
- **Lectura del fichero `.env`**. No existía: poner una variable en un `.env` no
  hacía absolutamente nada. Era el peor tipo de fallo — configuras la clave,
  arrancas, y el programa sigue igual sin decir nada.
- 22 pruebas nuevas. Ninguna sale a internet.

### Decidido

- **D17 — el lector de visión viene apagado.** Manda el informe fuera del
  ordenador; son datos de salud. Sin `ANTHROPIC_API_KEY`, la aplicación lee en
  local exactamente como antes y no manda nada a ningún sitio. Encenderlo es
  una decisión de quien lo usa (decisión abierta **O5**).
- **D18 — el modelo está fijo en el código**, no en una variable de entorno. En
  una herramienta clínica hay que poder decir con qué se leyó cada informe.

### Lo que NO cambia

Un dato leído por el modelo **sigue** saliendo en ámbar y hay que comprobarlo uno
a uno: entra con procedencia `VISION`, que el dominio trata igual que `OCR`. La
invariante 11 lo alcanza. Un modelo que se equivoca menos sigue siendo un modelo
que se equivoca, y aquí un número mal leído cambia la lente.

### Detalles que importan

- Si la API falla, **no se pierde el documento**: se lee en local y se dice qué
  ha pasado. Quedarse sin poder leer un informe porque una API está caída sería
  un mal cambio.
- Un ojo que aparece dos veces se **descarta entero**, con aviso. Quedarse con
  uno sería elegir al azar entre dos ojos.
- El catálogo de campos que se le pide al modelo se genera desde el dominio, no
  de una lista paralela que se desincronizaría.
- Las tres guardas anteriores se verificaron **rompiéndolas a propósito** y
  comprobando que los tests fallan.

**Sin validar contra informes reales.** No se ha podido medir cuánto mejora;
hacen falta informes anonimizados de verdad.

254 tests y 8 pruebas de interfaz.

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
