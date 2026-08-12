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

| Nivel               | Qué significa                         | Ejemplos                                                                                  |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `OBLIGATORIO`       | Sin él no calcula ninguna de las tres | AL, K1, K2, ACD, refracción objetivo                                                      |
| `SEGUN_CALCULADORA` | Unas calculan y otras no              | SIA y eje de incisión (solo Barrett); ejes de K (EVO y Barrett); constante A (EVO y Kane) |
| `OPCIONAL`          | Todas calculan; mejora el resultado   | LT, CCT, WTW, córnea posterior                                                            |
| `INFORMATIVO`       | **No se envía a ninguna calculadora** | AQD, TK1/TK2 y sus ejes, nk                                                               |

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

#### Origen y validación son ejes distintos

De dónde salió un número y si alguien lo ha revisado son dos preguntas, y van en
columnas distintas de la pantalla:

- **Origen** → de la procedencia del valor.
- **Estado** → de `confirmadoPorUsuario` y de los avisos de validación.

Mezclarlos era el problema de fondo: el nivel de validación `MISSING` se pintaba
con el mismo texto que la ausencia, así que un hueco normal parecía un error.

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

---

## 6. La aplicación

### Proceso principal

- `almacen.ts` — ficheros JSON en `%APPDATA%\calculator-vilamar`. Sin base de
  datos, y es una decisión: un caso es un objeto pequeño, no hay consultas, y
  SQLite traería un módulo nativo que hay que compilar.
- `diagnostico.ts` — el cuaderno de bitácora de los adaptadores.
- `servicio-casos.ts` — coordina; no decide. Todo lo que decide «qué se puede
  hacer» está en el dominio.
- `extraccion/` — las implementaciones concretas de lectura.

### Interfaz

React con `contextIsolation` puesto y sin Node: solo puede llamar a lo que
expone el preload. Una política de seguridad estricta impide cargar nada de
internet.

El flujo es uno solo, en cuatro pasos. No hay menús.

### El PDF

HTML → `printToPDF` de Electron. Cero dependencias, nada que compilar, y se
maqueta con CSS. Se guarda también el HTML: si el PDF fallara, el informe no se
pierde.

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
