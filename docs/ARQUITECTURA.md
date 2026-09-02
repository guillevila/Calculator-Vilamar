# Arquitectura de Calculator Vilamar

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude

> Cómo está construido y, sobre todo, **por qué está construido así**. Lo que
> aquí se explica es lo que permite mantenerlo dentro de seis meses.

---

## 1. El mapa en treinta segundos

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/desktop                                                        │
│                                                                      │
│   renderer (React)  ──IPC──▶  main (Node)                            │
│   la pantalla                 ficheros, navegador, PDF               │
└───────────────┬──────────────────────────┬───────────────────────────┘
                │                          │
    ┌───────────▼──────────┐   ┌───────────▼───────────┐
    │  @vilamar/extraction │   │ @vilamar/integrations │
    │  documento → datos   │   │  Playwright, HTML     │
    └───────────┬──────────┘   └───────────┬───────────┘
                │                          │
                └────────────┬─────────────┘
                             ▼
                  ┌─────────────────────┐      ┌──────────────────┐
                  │   @vilamar/domain   │◀─────│ @vilamar/report  │
                  │  el modelo y sus    │      │  HTML del PDF    │
                  │  invariantes        │      └──────────────────┘
                  └─────────────────────┘
```

Las flechas apuntan **hacia dentro**. El dominio no conoce a nadie; todos lo
conocen a él.

---

## 2. Los cinco paquetes

| Paquete                 | Qué hace                                                              | Qué NO puede importar                                     |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `@vilamar/domain`       | El modelo biométrico, sus invariantes, la validación y la comparación | Playwright, Electron, React, `node:fs`. Lo impide ESLint. |
| `@vilamar/extraction`   | Documento → datos, con evidencia                                      | Nada de calculadoras. Ni siquiera sabe que existen.       |
| `@vilamar/integrations` | Los tres adaptadores de Playwright                                    | Es la **única** capa con HTML ajeno                       |
| `@vilamar/report`       | El HTML del informe                                                   | Nada del sistema; son funciones puras                     |
| `@vilamar/desktop`      | Electron, la interfaz y las implementaciones concretas                | —                                                         |

### Las tres reglas estructurales

1. **`packages/domain` es puro.** Se prueba sin navegador, sin disco y sin
   Electron. Si un cambio obliga a importar algo de esos, el cambio está mal
   planteado.
2. **Ningún selector HTML sale de `packages/integrations/src/adapters/`.** Hay un
   test que lo vigila y que se ha comprobado plantando una infracción.
3. **Nada llega a una calculadora sin pasar por `prepararEntradas`.** Es el único
   camino, y hace dos comprobaciones que no se pueden saltar.

---

## 3. El modelo: por qué un dato ausente no es un cero

Es la decisión de diseño más importante y conviene entenderla antes de tocar
nada.

```ts
interface Medida {
  readonly valor: number // ← siempre un número real
  // …
}

type MapaMedidas = Partial<Record<CampoBiometrico, Medida>>
```

`valor` es un `number` a secas: **no admite `null`, ni `0` como comodín, ni
`-1`, ni `NaN`.** Un dato que no se conoce no se representa con un número: la
medida **no se crea** y la clave no está en el mapa.

Eso convierte «lo que falta no es cero» en algo que no depende de que nadie se
acuerde de comprobarlo: **es imposible escribir el caso contrario.** Y
`crearMedida` lanza un error si le pasan algo que no es un número finito.

La otra cara: los datos que faltan no se pueden distinguir de los que no se
buscaron. Es un precio asumido — la pantalla enseña todos los campos esperados,
así que un hueco se ve.

### Procedencia

Un número nunca viaja solo. Lleva de dónde vino (`TEXTO_PDF`, `OCR`, `VISION`,
`MANUAL`, `DERIVADO`), de qué documento, con qué fiabilidad, **qué texto exacto
se leyó** y si una persona lo ha confirmado. Sin eso el informe no se podría
auditar y la pantalla de revisión no podría distinguir lo que leyó el ordenador
de lo que escribió el cirujano.

Un dato derivado obliga a declarar de qué se derivó y con qué criterio, para que
nunca se confunda con una medida.

#### El origen pertenece al VALOR, no al tipo de campo

`MetodoExtraccion` es el detalle técnico —cómo llegó el número al programa—. Lo
que se le enseña a una persona es el **origen**, que se deduce del dato y no se
guarda aparte (un origen guardado por su cuenta acabaría desincronizado del dato
que describe):

| Origen                 | Cuándo                                | En pantalla                                            |
| ---------------------- | ------------------------------------- | ------------------------------------------------------ |
| `DEL_INFORME`          | `TEXTO_PDF`, `OCR` o `VISION`         | «Del informe»                                          |
| `DERIVADO_DEL_INFORME` | `DERIVADO`: calculado con otros suyos | «Derivado del informe», con la cuenta debajo           |
| `APORTADO`             | Manual, y no había nada antes         | «Aportado»                                             |
| `CORREGIDO`            | Manual, y **pisó un valor leído**     | «Corregido», con «Leído originalmente: …»              |
| `NO_CONSTA`            | El dato no está                       | «No consta en el informe» **o** «Pendiente de aportar» |

Cuatro consecuencias que importan:

- **El mismo campo puede tener orígenes distintos** en dos casos. Una refracción
  objetivo impresa en el informe es `DEL_INFORME` aunque el campo esté catalogado
  como decisión del cirujano.
- **`NO_CONSTA` tiene dos textos**, y cuál toca lo decide `loAportaElCirujano()`
  a partir de la categoría: lo que mide el aparato «no consta en el informe»; lo
  que decide el cirujano está «pendiente de aportar». Antes los dos decían «NO
  ENCONTRADO», y eso hacía parecer un fallo del extractor un campo que el
  documento sencillamente no trae.
- **Corregir no borra.** `Medida.original` conserva el valor anterior y su
  evidencia. `corregirMedida()` es la única forma correcta de escribir a mano, y
  al corregir dos veces conserva **lo que decía el papel**, no el paso intermedio.
- **Un dato calculado no es ni leído ni aportado.** `DERIVADO_DEL_INFORME` existe
  porque las dos alternativas eran mentira: decir «del informe» de algo que el
  papel no dice, o «aportado» de algo que no ha escrito nadie. Siempre lleva
  escrita la cuenta —«AQD 2.65 mm + CCT 530 µm (0.530 mm)»— para poder
  contrastarla con el documento. Ver el apartado 4.1.

Y una regla que se cruza con la validación pero no es lo mismo:
`necesitaComprobacionHumana()` es verdadera tanto para lo leído por una máquina
como para lo calculado, **por motivos distintos**: lo primero puede estar mal;
lo segundo está bien pero nadie lo ha visto. Ninguna de las dos cosas se
autoconfirma al pulsar «Confirmar».

`TEXTO_AUSENTE` («NO ENCONTRADO») sigue existiendo, pero solo como marca interna
para registros. Hay un test que impide que vuelva a la interfaz.

#### Cuánta falta hace cada campo

`exigenciaDe(campo)` mira las tres fichas y clasifica en cuatro niveles. No hay
una segunda lista que mantener: sale de `FICHAS`, que está comprobada contra los
formularios reales, así que si Barrett deja de pedir el SIA se cambia su ficha y
esto cambia solo. Hay un test que lo vigila.

| Nivel               | Qué significa                         | Ejemplos                                                                                                                        |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `OBLIGATORIO`       | Sin él no calcula ninguna de las tres | AL, K1, K2, ACD, refracción objetivo                                                                                            |
| `SEGUN_CALCULADORA` | Unas calculan y otras no              | SIA y eje de incisión (Barrett, y Kane en su modo tórico); ejes de K (EVO, Barrett, y Kane en tórico); constante A (EVO y Kane) |
| `OPCIONAL`          | Todas calculan; mejora el resultado   | LT, CCT, WTW, córnea posterior                                                                                                  |
| `INFORMATIVO`       | **No se envía a ninguna calculadora** | AQD, TK1/TK2 y sus ejes, nk                                                                                                     |

Dos cosas que no son obvias:

- **«Obligatorio» a secas sería mentira.** No es una propiedad del campo: depende
  de qué calculadora quieras. Por eso el texto del nivel intermedio **nombra las
  calculadoras** — «Obligatorio para Barrett Toric» dice qué pierdes si lo dejas
  vacío; «puede ser obligatorio» no dice nada.
- **Seis campos no alimentan ningún cálculo.** Se leen y quedan en el informe por
  trazabilidad. Callarlo haría pensar que hacen falta.

`quienNoPuedeCalcular(medidas)` responde lo mismo desde el otro lado: qué
calculadoras se van a quedar sin resultado con lo que hay escrito. La pantalla lo
enseña **antes** de confirmar; hasta ahora eso solo se sabía después de que el
navegador recorriera las tres webs — cuarenta y siete segundos para enterarse de
que faltaba un dato que se podía haber escrito antes.

No bloquea la confirmación a propósito: calcular con dos de tres es un resultado
legítimo, y puede que el dato que falta sencillamente no se tenga.

### 3.1. La lente y su constante

`packages/domain/src/modelo/lente.ts` · `seleccion-lente.ts`

**La constante A pertenece al MODELO DE LENTE, no al informe** (D33). Algunos
informes traen una tabla de modelos y, bajo cada uno, la constante que usa una
fórmula. Cuatro lentes son **cuatro constantes posibles y ninguna es la del caso**
hasta que alguien elige qué se va a implantar.

```ts
interface LenteDetectada {
  modelo: string // el único obligatorio: identifica la lente
  fabricante?: string
  constanteA?: number
  etiquetaConstante?: string // «SRK/T»: una constante A lo es PARA una fórmula
  procedencia: Procedencia // con evidencia literal y página
}
```

Van en `Caso.lentesDelInforme`, **no dentro de un ojo**: la misma lente lleva la
misma constante se implante en el derecho o en el izquierdo.

**La relación no se puede perder, porque no existe la forma de representarla
suelta.** No hay ningún sitio donde guardar una constante salida de una tabla sin
su modelo. No es una regla que alguien tenga que recordar: es la forma del tipo.

`elegirLente()` es el **único** sitio donde una constante de la tabla se convierte
en la `CONSTANTE_A` del caso, y garantiza cuatro cosas de una vez:

| Situación                      | Qué hace con la constante                      |
| ------------------------------ | ---------------------------------------------- |
| La lente está y trae constante | La escribe en los ojos del caso, `DEL_INFORME` |
| La lente está, sin constante   | Deja el hueco y lo explica                     |
| La lente NO está en el informe | **Quita** la de la lente anterior              |
| Varias lentes encajan          | No elige ninguna. Pide revisión                |
| Lo escribió una persona        | **No lo toca.** Avisa de que quizá ya no vale  |

`LenteElegida.constanteDeLaTabla` guarda de qué modelo salió la constante actual.
Es lo que permite distinguir «la constante de la lente que acabo de descartar»
—que sobra— de «una constante suelta del informe o escrita a mano» —que se
respeta—. Sin ese dato habría que deducirlo mirando la evidencia, que es
exactamente la clase de deducción frágil que este modelo evita.

**`Caso.lenteSecundaria`** (D55, 01/09/2026) es una segunda lente candidata,
para comparar con la misma biometría sin volver a escribir ningún dato —
pero **nunca hay dos lentes activas a la vez**. `lente` sigue siendo la
única que de verdad viaja a las tres calculadoras; `lenteSecundaria` es
solo una elección aparcada, y no toca `CONSTANTE_A` ni ningún otro campo
mientras está ahí (`elegirLenteSecundaria()`, deliberadamente más simple
que `elegirLente()` — no busca la lente en el informe ni resuelve
constante, porque una lente aparcada no calcula nada todavía).

`intercambiarLentes()` es lo único que la activa: reutiliza `elegirLente()`
entero para la que pasa a ser `lente` —con sus propias cuatro reglas de
constante, cero código nuevo que pueda emparejarla mal—, mueve la que era
`lente` a `lenteSecundaria`, y **borra `Caso.resultados`**. Es deliberado y
no un efecto secundario descuidado: los resultados que había eran de la
lente anterior —y, con Barrett, que no elige su propio modelo como sí
hacen EVO y Kane, con SU constante A—; conservarlos enseñaría un informe
que dice hablar de una lente pero calculó con otra. Es la razón de fondo
de que esta función exista en vez de, por ejemplo, dar a `CONSTANTE_A` una
dimensión por lente (como si fuera un aparato más, D47): ese campo es del
OJO, no de la lente, así que tener las dos lentes «activas» a la vez para
calcular las dos en paralelo habría abierto la puerta a mandarle a Barrett
la constante equivocada sin que nada lo avisara.

**Los nombres se comparan de forma exacta tras normalizar**, nunca aproximada. Se
ignoran mayúsculas, espacios, puntuación de adorno y el nexo del fabricante
(«Bausch & Lomb» = «Bausch and Lomb» = «Bausch-Lomb»). Lo que NO se hace es
distancia de edición ni prefijos: `MX60` y `MX60T` son lentes distintas con
constantes distintas, y confundirlas produciría un cálculo creíble y equivocado.

#### La constante que dice la web frente a la que se envió

`comparacion/auditoria-constante.ts`. Elegir el modelo en EVO o en Barrett puede
cambiar la constante que esa web usa. Si dice haber calculado con 119.20 y se le
envió 119.10, **el resultado es el de 119.20** y el informe lo dice, con las dos
cifras. No se corrige, no se reintenta y no se decide quién tiene razón (D34).

Que la web **no publique** su constante —Barrett no lo hace— es distinto de que no
cuadre, y se distinguen: sin eco no hay aviso.

#### Origen y validación son ejes distintos

De dónde salió un número y si alguien lo ha revisado son dos preguntas, y van en
columnas distintas de la pantalla:

- **Origen** → de la procedencia del valor.
- **Estado** → de `confirmadoPorUsuario` y de los avisos de validación.

Mezclarlos era el problema de fondo: el nivel de validación `MISSING` se pintaba
con el mismo texto que la ausencia, así que un hueco normal parecía un error.

### 3.2. Varios biómetros por el mismo ojo (D47, 27/08/2026)

`packages/domain/src/modelo/caso.ts` · `medida.ts` · `comparacion/discrepanciaAparatos.ts`

Hasta D47, `Caso.ojos` admitía **un único** `OjoBiometrico` por lado:

```ts
// Antes
ojos: Partial<Record<Lateralidad, OjoBiometrico>>

// Desde D47
ojos: Readonly<Partial<Record<Lateralidad, readonly OjoBiometrico[]>>>
```

Cada elemento de la lista es un conjunto de medidas de un aparato distinto —
`OjoBiometrico` ganó `readonly aparato: string`, texto libre (el desplegable
de la interfaz ofrece los aparatos conocidos más «Otro», pero el dominio no
necesita una lista cerrada). El aparato implícito de un caso con un solo
biómetro es `APARATO_PRINCIPAL`, y es el valor por defecto de **todas** las
funciones que antes solo conocían `(caso, lado)`: `ojoDe`, `conResultado`,
`resultadoDe`, `prepararEntradas`, `claveResultado`… Es la razón por la que
este cambio, siendo estructural, no tocó ningún llamador existente: cada uno
sigue compilando y comportándose igual sin pasar el nuevo parámetro. (La
propia `columnasComparativa(caso, lado, aparato)` de entonces pasó a ser
`COLUMNAS_COMPARATIVA`, una lista constante, en D51 — ver 5.0.1.)

**Deliberadamente NO tocado**: `ResultadoCalculadora` y `EntradasCalculadora`
no llevan `aparato`. La dimensión del aparato se pasa como parámetro
explícito por la cadena de orquestación (`TareaCalculo.aparato`,
`OpcionesCaso.alTerminarUna(resultado, tarea)`), no se guarda dentro del
resultado — así ningún adaptador (`evo.ts`, `barrett.ts`, `kane.ts`) ni su
suite de tests necesitó cambiar una sola línea: siguen sin saber que existen
varios aparatos.

**Confirmación y cálculo son por dataset, no por caso** (decisión 1 del
dueño): `sePuedeConfirmarDataset(caso, lado, aparato)` sustituye a
`sePuedeConfirmar` como puerta real antes de calcular; un aparato puede
calcular mientras otro, del mismo ojo, sigue sin confirmar.

**`detectarDiscrepancias`** (decisión 2) compara, campo a campo, cada par de
datasets **confirmados** del mismo ojo contra una tabla de umbrales (AL
0.3 mm, K1/K2 0.5 D, ACD/LT 0.3 mm, CCT 20 µm, WTW 0.5 mm — valores de
partida, no una cifra clínica validada). `Caso.discrepanciasReconocidas`
guarda que el cirujano ya lo comprobó para un ojo, y se **borra
automáticamente** en cuanto `editarMedida` vuelve a tocar ese ojo — un
reconocimiento viejo nunca puede tapar una discrepancia nueva.

**La pantalla de revisión comprueba las discrepancias de TODOS los ojos
del caso, no solo del que se está viendo** (D62, 02/09/2026, corrige un
fallo real): antes, `PanelRevision.tsx` solo pedía
`discrepanciasDe(ojoActivo)`, así que confirmar mirando OD (sin problemas)
dejaba pasar una discrepancia sin reconocer en OS — `calcular()` la
descartaba en silencio (D51 la deja pasar el resto del caso a propósito),
sin que nadie hubiera visto la alarma. Ahora se piden las de cada ojo por
separado y «Confirmar» se bloquea si cualquiera tiene una pendiente, con
el aviso señalando cuál.

**El informe** (decisión 3): `hojaResumenFinal` sigue mostrando un único
cuadro por ojo, con una tarjeta por resultado; el nombre de la tarjeta
incluye el aparato («EVO Toric — IOLMaster 700») solo cuando ese ojo tiene
más de uno. `generarPdf()` ya no genera un PDF por caso, sino uno por cada
ojo de `ojosDelCaso(caso)`, cada uno con `recopilarInforme(..., soloOjo)`.

---

## 4. Extracción: capas, no una masa de expresiones regulares

```
documento
   ↓  ProveedorExtraccion  (se inyecta: PDF nativo, OCR, o lo que venga)
texto + posiciones
   ↓  detectarDispositivo   (indicios con peso; DESCONOCIDO es una respuesta válida)
qué aparato es
   ↓  segmentarPorOjo       (por posición si hay coordenadas; si no, por texto)
un trozo por ojo
   ↓  aplicarReglas         (tabla de reglas por aparato)
medidas con evidencia  ← LO QUE PONE EL INFORME, y nada más
   ↓  normalizarOjo        (dominio: qué se puede deducir en ESE aparato)
modelo canónico
```

**`ProveedorExtraccion` es la abstracción que permite cambiar de tecnología.**
Hoy hay tres implementaciones en la aplicación: texto nativo de PDF con pdfjs,
OCR con tesseract.js, y PDF escaneado → imagen → OCR. Cambiarlas no toca los
parsers.

**El OCR no corrige el giro de la imagen por su cuenta** (D59, 02/09/2026):
una foto de móvil torcida sale con el texto ilegible. `ProveedorDocumentos`
(`apps/desktop/src/main/extraccion/proveedor.ts`) no adivina el ángulo con
heurísticas — lee la imagen tal cual y, **solo si esa primera lectura ya
sale por debajo del umbral de poca fiabilidad** (`UMBRAL_FIABILIDAD_BAJA`,
el mismo que ya avisaba al usuario), prueba las otras tres orientaciones
(`Rasterizador.rotar()`, en `rasterizador.ts`) y se queda con la de más
fiabilidad. Una foto bien orientada —el caso normal— no paga ningún coste
de más.

Añadir un aparato es **añadir una tabla de reglas**, no reescribir la lógica.
Ver [MANTENIMIENTO.md](MANTENIMIENTO.md).

### Dos detalles que costaron sangre

- **pdfjs no devuelve líneas, devuelve trozos.** «AL» y «24.07 mm» son elementos
  distintos que solo comparten la altura. Si se juntara el texto en el orden en
  que viene, las reglas no encontrarían nada. Por eso `lector-pdf.ts`
  reconstruye las líneas agrupando por altura y ordenando por horizontal, **y
  conserva además los trozos con su posición** para poder separar columnas.
- **Rasterizar un PDF sin módulos nativos.** Convertir una página en imagen suele
  exigir un lienzo nativo que compila C++. Aquí se usa el Chromium que ya trae
  Playwright: se carga pdf.js desde `node_modules` en una página local, se dibuja
  en un lienzo de verdad y se captura. Ninguna dependencia nueva.

---

## 4.1. Normalización por aparato: la capa que deduce

`packages/domain/src/normalizacion/`

La frontera importante es la línea marcada arriba: **hasta ahí, lo que hay es
exactamente lo que pone el informe.** Esta capa es lo primero que puede añadir un
dato que el documento no traía, y por eso todo lo que produce va marcado.

Vive en el **dominio** y no en un parser a propósito. Decidir que en un ANTERION
la ACD es la AQD más el grosor corneal es conocimiento clínico, no conocimiento de
cómo está maquetado un PDF. El parser sigue diciendo qué pone; esta capa decide
si un dato canónico se puede obtener de otros del mismo informe.

### La regla que existe hoy: la ACD

Las tres calculadoras exigen la ACD. Algunos informes de ANTERION no la imprimen,
pero sí traen AQD y CCT, y en ese aparato el propio informe dice desde dónde mide
cada distancia —«ACD (epithelium)», «AQD (endothelium)»—, así que entre las dos
está justo el grosor de la córnea:

```
ACD = AQD + CCT/1000      (el CCT viene en µm y se guarda en µm)
```

Los cinco casos:

| Qué trae el informe            | Qué hace                                      |
| ------------------------------ | --------------------------------------------- |
| ACD                            | Usa esa. **Nunca la pisa**                    |
| AQD + CCT, sin ACD, y ANTERION | La calcula, marcada `DERIVADO`, con la cuenta |
| ACD **y** AQD + CCT            | Conserva las tres y comprueba que cuadren     |
| AQD sin CCT                    | No calcula nada. Dice qué falta               |
| Aparato que no lo permite      | No calcula nada. Dice **por qué**             |

### La otra regla del perfil: la tabla de lentes

`PerfilDispositivo.tablaDeLentes` dice si ese aparato imprime una lista de modelos
de LIO con su constante y en qué formato. Hoy solo ANTERION
(`CONSTANTES_POR_FORMULA`); los demás, `NINGUNA`.

El motivo es el mismo que el de la ACD y merece decirse igual de claro: **un
número junto a «SRK/T» solo significa «la constante A de la lente de arriba» si
sabemos que el informe está montado así.** En un documento cualquiera puede ser el
`a0` de otra fórmula, un porcentaje o un error de lectura, y emparejarlo con el
texto de encima inventaría una relación que quizá no existe.

La lista se lee del **documento completo**, no de los trozos por ojo. La tabla de
modelos no habla de ojos: en un informe a dos columnas caería en la columna de uno
por pura maqueta, y en uno por secciones saldría repetida bajo cada ojo. Leyendo
todo el documento y quitando las repeticiones exactas, los dos formatos dan lo
mismo. Ver también el apartado 3.1.

### Por qué hay una tabla de perfiles y no una regla general

`perfiles.ts` es explícito y **restrictivo por defecto**: hoy solo ANTERION
deriva. En un aparato que llame «ACD» a otra distancia, esa misma suma da un
número plausible y equivocado — y un número plausible y equivocado es justo lo
que este programa no puede producir. `DESCONOCIDO` está en la tabla con todo a
`false`, para que nadie lo trate como un caso «por definir».

Añadir un aparato exige **poder señalar dónde dice el informe desde qué
superficie mide**. Si no se puede señalar, la respuesta es `false`. Hay un test
que comprueba que la lista de los que derivan sea exactamente `['ANTERION']`, para
que ampliarla sea una decisión y no un descuido.

### Dos cosas que la capa NO hace

- **No convierte AQD en ACD.** Son campos distintos y los dos siguen guardados,
  cada uno con su procedencia y su evidencia. Derivar no consume nada.
- **No elige cuando hay dos versiones.** De comprobar si cuadran se encarga la
  validación, no esta capa.

### La coherencia la comprueba la validación, no la normalización

Están separadas porque son preguntas distintas: derivar es «¿puedo obtener este
dato?»; la coherencia es «¿me creo estos datos?». Y viven donde les toca —
`validar.ts` tiene ya las otras comprobaciones de conjunto (K1 ≤ K2, ejes
perpendiculares, AQD < ACD).

`ACD_NO_CUADRA_CON_AQD_MAS_CCT` salta cuando las tres medidas están y la ACD no
cuadra con la suma por más de **0.05 mm**. La tolerancia no es a ojo: el redondeo
de las tres medidas explica algo más de una centésima, y confundir ACD con AQD
desplaza el valor **medio milímetro** —el grosor entero de una córnea, diez veces
la tolerancia—. Hay un test que fija las dos cotas para que nadie la ensanche
hasta volverla inútil.

Es un **aviso, no un bloqueo**, y no elige: los tres números pueden ser normales
por separado y uno estar mal, y el programa no puede saber cuál. Corrige la
persona.

Corre también sobre una ACD derivada. Recién derivada la diferencia es cero y no
dice nada; el caso que importa es el de después —si alguien corrige la AQD, la ACD
calculada con la anterior deja de cuadrar, y eso hay que verlo antes de que viaje
a tres calculadoras.

Se llama desde **los dos** caminos de lectura —`interpretarTexto` para el lector
local y `aResultado` para el modelo de visión—, porque el segundo no pasa por el
primero. Dejarlo en uno haría que la ACD se derivara o no según con qué lector se
hubiese leído el informe. Es idempotente, así que aplicarla dos veces por error
no duplica nada.

---

## 5. Integraciones: un adaptador por web

```ts
interface AdaptadorCalculadora {
  readonly calculadora: Calculadora
  readonly requiereNavegadorVisible: boolean
  validarEntradas(entradas): readonly string[]
  ejecutar(contexto): Promise<ResultadoCalculadora>
}
```

`ejecutar` **no lanza excepciones hacia fuera**: cualquier fallo se convierte en
un `ResultadoCalculadora` con estado. Es lo que permite que una calculadora se
rompa sin llevarse a las otras dos. El orquestador tiene además una red por si
algo se escapa.

Estados posibles: `SUCCESS`, `PARTIAL`, `NEEDS_USER_ACTION`, `MISSING_INPUTS`,
`EXTERNAL_ERROR`, `ADAPTER_BROKEN`.

**El orden de ejecución no es casual:** EVO (no pide nada) → Barrett (puede pedir
una comprobación) → Kane (pide aceptar sus condiciones). Así el usuario ya tiene
resultados en pantalla cuando le toca hacer algo, y si decide no hacerlo no se
queda sin nada.

Lo específico de cada web está en [INTEGRACIONES.md](INTEGRACIONES.md).

### 5.0.1. Calculadoras con variantes — córnea posterior en EVO y Barrett (D45, D51)

`Calculadora` tiene dos miembros más, `EVO_TORIC_SIN_CARA_POSTERIOR` y
`BARRETT_TORIC_CON_CARA_POSTERIOR`, que **no** están en `CALCULADORAS` (la
lista histórica de tres). Existen para poder comparar el efecto de la
córnea posterior — pero en sentidos opuestos: EVO usa la córnea posterior
**por defecto**, así que su variante se la QUITA; Barrett usa un modelo
teórico («Predicted PCA») por defecto, así que su variante se la AÑADE
(«Measured PCA»). Por eso el tipo no es un simple mapa a otra calculadora,
sino:

```ts
export interface VariantePosterior {
  readonly calculadora: Calculadora
  readonly sentido: 'CON' | 'SIN'
}
export const VARIANTE_CARA_POSTERIOR: Partial<Record<Calculadora, VariantePosterior>> = {
  EVO_TORIC: { calculadora: 'EVO_TORIC_SIN_CARA_POSTERIOR', sentido: 'SIN' },
  BARRETT_TORIC: { calculadora: 'BARRETT_TORIC_CON_CARA_POSTERIOR', sentido: 'CON' },
}
```

`sentido` es lo que le dice a `COLUMNAS_COMPARATIVA` (`packages/domain/src/modelo/caso.ts`)
en qué orden mostrar cada pareja: Predicted siempre antes que Measured PCA,
sea cuál sea la base y cuál la variante — así una tabla nunca depende de
recordar qué calculadora hace qué. `recopilarResultadosParaInforme()`
(proceso principal) y `PanelResultados.tsx` usan esa misma lista, para que
la comparativa en pantalla y el informe muestren siempre las mismas cinco
columnas.

Cómo encaja cada una sin tocar el adaptador real ni duplicar selectores:

- **EVO** (composición, sin tocar `AdaptadorEvoToric`):
  `FICHAS.EVO_TORIC_SIN_CARA_POSTERIOR` es igual que la de EVO, salvo que
  sus `opcionales` no incluyen PK1/PK1_EJE/PK2/PK2_EJE. Como
  `prepararEntradas()` ya construye las entradas campo a campo según la
  ficha, esto basta: la variante nunca recibe esos campos.
  `AdaptadorSinCaraPosterior` (`packages/integrations/src/variante-sin-cara-posterior.ts`,
  fuera de `adapters/` porque no conoce ningún HTML propio) envuelve el
  adaptador real de EVO y solo reetiqueta el `ResultadoCalculadora.calculadora`
  con la clave de la variante — sin eso, el resultado «sin córnea posterior»
  pisaría al de «con» al guardarse, porque los resultados se guardan por
  calculadora.
- **Barrett** (un único adaptador con dos configuraciones): `AdaptadorBarrettToric`
  recibe un `conCaraPosterior: boolean` en el constructor, y `calculadora`/
  `nombre` son getters que devuelven una clave u otra según ese flag — no
  una subclase, porque TypeScript no deja que una subclase estreche el tipo
  literal de un campo `as const` de la clase base. Cuando `conCaraPosterior`
  es `true`, después del primer «Calculate» del formulario normal,
  `rellenarCaraPosterior()` marca «Measured PCA» y ejecuta la secuencia real
  de nueve pasos entre dos pestañas que se explica en el docstring de
  `barrett.ts` — descubierta en vivo, no deducible del HTML inicial, porque
  el interruptor «Measured PCA» solo existe después de calcular una vez.
  Tiene su propio «Calculate» (`Button4`, distinto del `Button1` del
  formulario principal); equivocarse de botón deja el panel relleno pero el
  cálculo sigue en «Predicted PCA» — un fallo silencioso que ya ocurrió una
  vez aquí, por eso ahora lanza `ADAPTER_BROKEN` si la secuencia no se
  completa entera.
- **Desde D51 (28/08/2026), ninguna de las dos se añade sola.** Hasta
  entonces, `ServicioCasos.calcular()` añadía la tarea de la variante junto
  a la de su base en cuanto el ojo tenía PK1 o PK2 —
  `conVariantesDeCaraPosterior()`, ya eliminado—. Ahora las cinco
  calculadoras de `COLUMNAS_COMPARATIVA` son botones independientes en
  `PanelCalculo.tsx`: cada una se pide (o no) por su cuenta, sin magia
  detrás. La razón del cambio: con D47 (varios aparatos) la pantalla ya
  tenía botones explícitos por calculadora, y que dos de las cinco casillas
  aparecieran o no «solas» según los datos rompía la previsibilidad de
  «pulso este botón, se calcula esta casilla» — además de duplicar tráfico
  a EVO/Barrett en cuanto un ojo tenía córnea posterior, sin que la persona
  lo hubiera pedido.
- `recopilarResultadosParaInforme()` ya no necesita mirar `sentido` ni
  PK1/PK2 en absoluto: recorre `COLUMNAS_COMPARATIVA` sin condiciones, y es
  `anadirCasilla()` —no este bucle— quien decide si esa casilla sale en el
  PDF, mirando si de verdad hay un `ResultadoCalculadora` guardado (D49). El
  cuadro final orientativo (D43) sigue excluyendo las cinco de su
  comparación textual, sin cambios.

### 5.0. El modelo de lente en el desplegable propio de cada web (26/08/2026)

Si el caso trae un modelo de lente y la web lo tiene en su propia lista,
EVO y Kane lo eligen antes de escribir ningún número — igual que ya hacían
con el modelo, ahora también se dejan de sobrescribir con la constante A
escrita a mano: si el modelo se encontró, esa constante es la que la propia
web rellena sola. Barrett no tiene estas lentes en su lista y sigue
recibiendo la constante A del caso, sin cambios.

En Kane esto tiene una vuelta: elegir una lente TÓRICA de su lista cambia el
modo del formulario (`Toric`/`Non-toric`) por su cuenta, y ese modo lo
decide `modoParaKane()` a partir de los datos del caso — no la lista de
lentes. Por eso el modelo se elige DESPUÉS de fijar el modo por primera vez,
y el modo se **reafirma** justo después de elegir el modelo, antes de
escribir ningún número: no se pierde nada porque nada se ha escrito todavía.

**El mismo modelo físico puede llamarse distinto en cada desplegable**
(petición expresa del dueño, 27/08/2026): «B&L LuxSmart» en EVO es «B+L
LuxSmart Toric» en Kane, y `elegirModelo()` en los dos adaptadores busca
una coincidencia EXACTA de texto contra su propia lista — sin ese matiz,
el nombre que le sirve a uno no encuentra nada en el otro, y esa
calculadora calcula con la constante A escrita a mano en vez de con la
suya propia, sin avisar de que se ha equivocado de lente. `LenteElegida`
(`caso.ts`) lleva ahora `nombreEnEvo`/`nombreEnKane` opcionales, y
`prepararEntradas()` (`preparar-entradas.ts`) elige cuál mandar según la
`calculadora` que está preparando —`nombreDeLentePara()`—, cayendo en el
nombre general (`modelo`) si esa calculadora no tiene uno propio. El
catálogo de `SelectorLente.tsx` lleva los pares ya rellenos para las
lentes Bausch & Lomb que los necesitan (Aspire, Envy, LuxGood, LuxSmart,
LuxLife); los modelos que ya se llaman igual en las dos webs (Alcon,
Tecnis, Rayner, ZEISS…) no llevan nombre propio y siguen exactamente
igual que antes. Barrett no tiene desplegable de lentes (D33): no le
afecta nada de esto.

**El mismo patrón, para el aparato que midió la córnea posterior** (D58,
01/09/2026): EVO y Barrett enseñan, cada una junto a su panel de córnea
posterior medida, un desplegable «Biometer»/«Device» que cambia la
corrección que aplican según el instrumento. `EntradasCalculadora` gana
`dispositivoCaraPosterior?: string`, resuelto por
`dispositivoCaraPosteriorPara(calculadora, aparato)` en
`preparar-entradas.ts` contra dos tablas de mapeo, una por web
(`DISPOSITIVO_EN_EVO`/`DISPOSITIVO_EN_BARRETT`) — un aparato que esa web
no reconoce no manda nada, y el desplegable se queda en su propio valor
por defecto («IOLMaster 700»/«IOLMaster 700 TK»). `evo.ts` lo selecciona
con `selectOption('#DropDownListPK', { label })`, siempre visible;
`barrett.ts` con `selectOption('#MainContent_Device', { label })`, dentro
del mismo panel que `rellenarCaraPosterior()` ya revela al marcar
«Measured PCA». Kane no tiene córnea posterior (D51): este dato nunca
llega a su adaptador.

**El aparato de córnea posterior no es siempre el mismo que el general**
(D60, 02/09/2026, corrige D58 el mismo día): la primera versión reutilizaba
directamente el `aparato` de D47 —que es el biómetro de TODO el dataset—,
y el dueño avisó de que a veces la córnea posterior se mide con otro
instrumento aparte. `OjoBiometrico` gana `aparatoCaraPosterior?: string`,
un campo independiente; `dispositivoCaraPosteriorPara()` recibe
`aparatoCaraPosterior ?? aparato`, así que sin elegir uno propio el
comportamiento es el de D58, sin cambios. En el formulario manual esto son
DOS selectores distintos: el de D47 (arriba del todo, para todo el
dataset) y uno nuevo dentro de «Córnea posterior» (`SelectorAparatoCaraPosterior`,
por defecto «Igual que arriba»).

### 5.1. La captura del resultado

Cada adaptador, justo después de comprobar que el resultado es del ojo
correcto, toma un `page.screenshot({ fullPage: true })` de la pantalla de
resultado y lo guarda con `ctx.guardarCaptura(...)` — el mismo patrón
inyectado que ya usaba `guardarDiagnostico` para el camino de fallo, pero en
el de éxito. La lógica compartida vive en `packages/integrations/src/captura.ts`
y no sabe HTML de ninguna web; si fotografiar o guardar falla, no lanza:
un resultado ya leído no se puede perder por no haberle podido hacer una foto.

`ResultadoCalculadora.capturaId` guarda solo la referencia (un string), nunca
los bytes — el dominio sigue sin `node:fs`. Los PNG viven en
`apps/desktop/src/main/capturas.ts`, en `%APPDATA%\calculator-vilamar\capturas`,
con el mismo aviso de privacidad que `diagnostico.ts`: pueden llevar
biometría, nunca un dato identificativo, y no salen del ordenador. Solo
`servicio-casos.ts` los lee de disco, al generar el PDF, y se los pasa a
`@vilamar/report` ya en `data:` URI — `recopilarInforme` y
`generarHtmlInforme` siguen siendo funciones puras.

---

## 6. La aplicación

### Proceso principal

- `almacen.ts` — ficheros JSON en `%APPDATA%\calculator-vilamar`. Sin base de
  datos, y es una decisión: un caso es un objeto pequeño, no hay consultas, y
  SQLite traería un módulo nativo que hay que compilar. **Excepción:**
  `informes` vive en `Escritorio\Calculadora Vilamar\` (D57, 01/09/2026,
  petición expresa del dueño) — `prepararCarpetas(rutaDatos, rutaInformes?)`
  acepta una ruta aparte solo para esa carpeta; el resto sigue en
  `rutaDatos`. `apps/desktop/src/main/index.ts` la fija a
  `app.getPath('desktop')`, salvo que `VILAMAR_CARPETA_INFORMES` (variable
  de entorno) la sobreescriba — lo que usan las pruebas de interfaz para no
  escribir PDF de prueba en el Escritorio real de quien las ejecute, ya que
  `app.getPath('desktop')`, a diferencia de `userData`, no depende de
  `--user-data-dir`. Aviso hecho al dueño antes de construir, y aceptado
  informado: si el Escritorio de quien instala la app está sincronizado con
  algún servicio en la nube (como pasa en el ordenador de desarrollo, con
  OneDrive corporativo), los informes —que llevan el nombre real del
  paciente, D44— se suben ahí automáticamente.
- **Un caso solo vive en memoria** (`ServicioCasos.caso`) mientras la
  aplicación está abierta — nunca se recarga solo de `guardarCaso()` al
  arrancar. «Casos guardados» (D63, 02/09/2026) es la vía para volver a él
  a propósito: `listarCasosGuardados()`/`abrirCaso(codigo)` usan
  `leerCaso`/`listarCasos` de `almacen.ts` —ya existían, sin usar por
  nadie— para leer un caso guardado y ponerlo como el actual, igual que
  hace `nuevo()`.
- `diagnostico.ts` — el cuaderno de bitácora de los adaptadores.
- `capturas.ts` — la captura de cada resultado de éxito, tal cual. A
  diferencia de `diagnostico.ts`, no se poda: es parte permanente del caso,
  no un cuaderno de depuración rotatorio.
- `servicio-casos.ts` — coordina; no decide. Todo lo que decide «qué se puede
  hacer» está en el dominio.
- `extraccion/` — las implementaciones concretas de lectura.

### Interfaz

React con `contextIsolation` puesto y sin Node: solo puede llamar a lo que
expone el preload. Una política de seguridad estricta impide cargar nada de
internet.

El flujo es uno solo, en cuatro pasos. No hay menús.

**La barra de esos cuatro pasos, arriba, es navegable** (D64, 02/09/2026):
un paso se puede volver a pulsar si el CASO ya lo ha alcanzado de verdad
—se mira `caso.estado` (`CONFIRMADO`/`CALCULANDO`/`COMPLETADO` habilitan
«Calcular»/«Resultados»; «Revisar datos» siempre, si hay caso)—, nunca la
pantalla en la que se esté en ese momento: mirar la pantalla actual
«olvidaba» que ya se había llegado más lejos en cuanto se volvía atrás.

Antes de calcular, `PanelCalculo.tsx` deja marcar/desmarcar con qué
calculadoras lanzar el cálculo (D40) — el backend ya soportaba un subconjunto
de `Calculadora[]` (`ServicioCasos.calcular`/`planificarCaso`), solo hacía
falta la interfaz. El botón «Reintentar» de cada calculadora sigue siendo un
mecanismo aparte, no afectado por la selección.

El objetivo de refracción (`REFRACCION_OBJETIVO`) arranca en 0 (D38):
`servicio-casos.ts` lo rellena como medida `MANUAL` —confirmada por
definición, como cualquier dato escrito a mano— si el documento no trae ya
un valor propio. No hace falta ningún mecanismo nuevo de confirmación: es
la misma regla que ya rige cualquier dato manual.

### El cuestionario de entrada 100% manual (D42)

Antes de calcular hay dos vías igual de visibles en el paso `INICIO`:
cargar un archivo (`ZonaSoltar.tsx`) o escribir los datos a mano
(`FormularioManual.tsx`, paso nuevo `MANUAL` en `App.tsx`). El cuestionario
es deliberadamente más simple que la pantalla de revisión: sin columnas de
Origen/Estado/Evidencia, porque todo lo que se escribe ahí ya es `MANUAL` y
un dato manual sale confirmado por definición — no hay nada que revisar de
ese tipo. Reutiliza `SelectorLente.tsx` tal cual (ya funciona sin ningún
documento) y el mismo `editarMedida` que usa `PanelRevision.tsx`. Al pulsar
«Continuar» aterriza en la **misma** `PanelRevision` de siempre — el sexo
que pide Kane y el resto de la confirmación no se han duplicado.

El nombre del doctor y el del paciente no son `CampoBiometrico` (son del
caso, no de un ojo), así que se guardan con un método nuevo,
`establecerIdentificacion`, en vez de `editarMedida`.

**El nombre del cirujano viaja a las tres calculadoras (D41), y el del
paciente también (D44)** — los dos, a diferencia de lo que decía antes
esta misma sección, hasta que se corrigió el mismo día que D61: D23 (código
local, nunca un nombre) quedó SUPERADA para el nombre del paciente por
D44, no «sin tocar». `Caso.nombreCirujano`/`Caso.nombrePaciente` →
`EntradasCalculadora` (hilado en `prepararEntradas()`) → cada adaptador
los rellena si los tiene, con `.catch()` para que un selector que no
aparezca no tire el cálculo. Los selectores están comprobados con `pnpm
reconocer`, no supuestos: `#TextBoxSurgeon`/`#TextBoxName` en EVO,
`#MainContent_DoctorName`/`#MainContent_PatientName` en Barrett (dentro
del `Frame` `calc`), y `#Surgeon` en Kane —este último ya estaba en el
código, solo que no se usaba—.

**Los dos son obligatorios para confirmar** (D61, 02/09/2026):
`IdentificacionCaso`/`faltaIdentificacion()`
(`apps/desktop/src/renderer/componentes/Identificacion.tsx`) es un
componente COMPARTIDO entre `FormularioManual.tsx` y `PanelRevision.tsx`
—no duplicado—, porque quien carga un documento no tenía, antes de D61,
ningún sitio de la interfaz donde escribir estos dos nombres. El botón
«Confirmar datos» de `PanelRevision.tsx` se deshabilita si falta
cualquiera de los dos, con el mismo patrón que ya usa para un dato
imposible o una discrepancia sin reconocer.

### El PDF

HTML → `printToPDF` de Electron. Cero dependencias, nada que compilar, y se
maqueta con CSS. Se guarda también el HTML: si el PDF fallara, el informe no se
pierde.

**El informe que genera la aplicación por defecto es el simplificado**
(D39, ampliado por D48): una hoja de biometría de entrada por cada
aparato, luego una hoja por calculadora y ojo intentado —agrupadas por
aparato, no por calculadora—, con su captura y una línea con la lente
recomendada, y cierra con un cuadro de tarjetas (D43) y una tabla
comparativa detallada. Si una casilla no tuvo resultado utilizable, lleva
un aviso explicando por qué en vez de una hoja omitida en silencio. Sigue
sin tener alternativas, diagramas del ojo ni trazabilidad — eso sigue solo
en el informe detallado, sin usarse.

**El título de cada hoja de cálculo, y si dice «con córnea posterior
medida», no es fijo por calculadora** (D48, 27/08/2026): `EVO_TORIC` y
`BARRETT_TORIC` (las calculadoras BASE, distintas de sus variantes de
D45) solo llevan el sufijo cuando el dataset de ESE aparato tiene de
verdad `PK1` o `PK2` —`hayCaraPosteriorEn(caso, ojo, aparato)`, en
`plantilla.ts`—, porque la base manda la córnea posterior si el ojo la
tiene y decirlo siempre habría mentido en el caso normal sin ella. Las
variantes de D45 (`EVO_TORIC_SIN_CARA_POSTERIOR`,
`BARRETT_TORIC_CON_CARA_POSTERIOR`) sí llevan un título fijo: por
construcción solo aparecen en el informe cuando la comparación tiene
sentido.

**Con un solo aparato por ojo, la banda grande del aparato no se pinta en
ninguna hoja** — mismo principio que el resto de D47: cero cambios
visibles para quien no usa varios biómetros.

Ese contenido más elaborado (portada, comparación, alternativas, biometría,
diagramas, trazabilidad) sigue existiendo en el código —
`generarHtmlInformeDetallado`, en `packages/report/src/plantilla.ts`— porque
viene de una feature ya fusionada a `master` en una sesión anterior, pero
**no se usa por defecto**: `servicio-casos.ts` llama a `generarHtmlInforme`,
que es la versión simplificada. Las dos comparten la misma infraestructura de
numeración y serialización de hojas (`documentoDeHojas`) y la misma hoja de
estilos — solo cambia qué hojas se construyen.

`ResultadoInforme` (antes `CapturaInforme`) es el tipo que describe una
casilla en el informe: la captura, una estimación y, si no hubo resultado,
por qué. `servicio-casos.ts` construye una entrada por CADA casilla
intentada (`CALCULADORAS × ojosDelCaso(caso)`), tenga o no éxito — antes esto
se saltaba en silencio las que fallaban.

### 6.1. La estimación propia — excepción a «compara, pero no recomienda» (D43)

`ResultadoInforme.recomendada` **ya no es** lo que la calculadora destacó
(`resultado.recomendada`, lo que pone el adaptador al ver la marca de la
propia web): `servicio-casos.ts` llama siempre a
`estimarLenteRecomendada(r.opciones, ejeCurvoDe(ojo), criterioEsferaPara(caso.lente?.modelo))`,
de `packages/domain/src/comparacion/recomendacion.ts` — un módulo NUEVO y
deliberadamente separado de `comparar.ts`.

Por qué separado: `comparar.ts` existe justo para que este producto no elija
nunca una opción por su cuenta (tiene un test dedicado que lo vigila, «el
producto compara, no recomienda»). `recomendacion.ts` hace exactamente eso —
con un criterio clínico fijo, pedido de forma expresa por el dueño del
proyecto tras el aviso de que es lo contrario a esa regla— y su propio
docstring lo dice así, para que nadie confunda los dos ficheros ni intente
fusionarlos.

El criterio, sin caso especial por calculadora:

- **Esfera**: entre las opciones con refracción prevista negativa, la más
  cercana a cero — **salvo la familia Lux de Bausch & Lomb** (LuxSmart,
  LuxLife, LuxGood), donde es la de refracción prevista POSITIVA más cercana
  a cero (D52, 29/08/2026). `criterioEsferaPara(modeloLente)` decide cuál
  aplica, comparando por `LenteElegida.modelo` — el nombre canónico del
  catálogo, no `nombreEnEvo`/`nombreEnKane` (D50). **No es «la primera de la
  lista subiendo potencia»**: del lado positivo esas dos nociones no
  coinciden (la refracción baja de forma continua al subir la potencia, así
  que la primera positiva subiendo es la MÁS ALEJADA de cero) — fallo real
  encontrado el mismo día con un PDF de EVO, corregido tomando
  `Math.min(Math.abs(refraccionPrevista))` del lado que toca en vez de la
  primera que cumple el signo.
- **Cilindro**: entre las opciones tóricas cuyo eje residual coincide con el
  eje curvo (`ejeCurvoDe`, el meridiano más curvo de K1/K2), la ÚLTIMA antes
  de que ese eje cambie de orientación. No depende de la lente.

Ninguna de las dos partes se inventa si el criterio no señala nada: sin una
opción con refracción negativa no hay esfera; sin eje curvo, o sin ninguna
opción tórica que lo comparta, no hay cilindro.

**Se enseña siempre como lo que es.** La línea bajo cada captura dice
«Estimación de Calculator Vilamar (no vinculante)», nunca «lente
recomendada» a secas. El cuadro final (`hojaResumenFinal`, una hoja por ojo
con más de una estimación) lleva un aviso imposible de no ver y marca la que
se aleja menos de las otras dos por su esfera como «Más cercana entre las
tres» — nunca «la elegida». Ninguna de las dos sustituye a la captura de
pantalla de encima, que sigue siendo, sin interpretar, lo que la calculadora
respondió de verdad.

---

## 7. Qué se prueba y dónde

| Dónde                            | Qué                                                                         | Depende de   |
| -------------------------------- | --------------------------------------------------------------------------- | ------------ |
| `pnpm test` (205)                | Dominio, invariantes, parsers, aislamiento de fallos, arquitectura, informe | Nada externo |
| `pnpm test:e2e` (5)              | La aplicación real, pulsando con el ratón                                   | Electron     |
| `pnpm verificar:vertical`        | El producto entero contra EVO y Barrett reales                              | Las webs     |
| `pnpm live [evo\|barrett\|kane]` | Los adaptadores contra las webs                                             | Las webs     |

**Los dos últimos NO están en el CI, a propósito.** Una web ajena con un mal día
pondría el control en rojo por algo que no es nuestro, y un control que falla
por motivos ajenos deja de mirarse.

---

## 8. Decisiones que parecen raras y no lo son

- **`ELECTRON_RUN_AS_NODE` se quita al lanzar.** Si esa variable está en el
  entorno —lo está dentro de algunos editores— Electron arranca como Node y **no
  abre ventana, sin decir nada**. Es un fallo mudo que ya costó un rato.
- **`externalizeDepsPlugin` excluye los paquetes `@vilamar/*`.** Son TypeScript
  sin compilar: si se dejan fuera del paquete, Electron intenta importar un `.ts`
  en ejecución y la aplicación no arranca. El síntoma es el peor posible: la
  ventana no aparece y no se ve ningún error salvo en la salida de error.
- **Barrett exige navegador con ventana.** No es estética: su dominio responde
  403 al navegador sin ventana.
- **A las webs se les manda el código local del caso** como «Patient Name».
  EVO y Barrett lo exigen; darles `CV-2026-0042` cumple sin enviar un dato de
  paciente.
- **Los datos del idioma del OCR van a `%APPDATA%`.** Por defecto tesseract.js
  los deja donde se ejecute el programa; la primera prueba dejó 5 MB en la raíz
  del repositorio.
