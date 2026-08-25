# PROJECT_STATUS.md — Estado real de Calculator Vilamar

> 🟢 **Este es el archivo más honesto del proyecto.**
> Dice qué funciona DE VERDAD hoy y qué no. Si algo no está aquí marcado como
> «funciona», asume que NO funciona.
>
> Regla que gobierna este documento: **construido ≠ probado ≠ validado.**
> Que exista un adaptador no significa que se haya probado contra su web. Que se
> haya probado contra su web no significa que se haya validado con informes
> reales.

**Última actualización:** 25/08/2026 · refracción objetivo por defecto (D44).
⚠️ El resto de este documento (secciones 1–5 y 7) no se ha revisado desde
12/08/2026 y no refleja el trabajo hecho después —catálogo de lentes,
selección de modelo en Kane/EVO, PDF por calculadora, carpeta de informes
configurable, correcciones de Kane (D38–D43)—. Hace falta una pasada completa
para que vuelva a ser fuente de verdad; mientras tanto, `docs/CHANGELOG.md` y
las decisiones D37–D44 de `SYSTEM_VISION.md` son lo más al día que hay.

---

## 1. Estado actual

- [ ] 💡 **Idea**
- [ ] 📄 **Documentación**
- [ ] 🎬 **Demo**
- [x] 🛠️ **Prototipo funcional**
- [ ] 🚀 **MVP**
- [ ] 🏭 **Producción**

**Por qué prototipo funcional y no MVP.**

Lo construido funciona de verdad y está comprobado: la aplicación arranca, se
rellenan los datos, se confirman, **habla con EVO y con Barrett de verdad**, trae
sus resultados y saca un PDF. Eso no es una demo: son dos webs reales
respondiendo, y está medido (47 segundos de punta a punta).

Pero **falta lo que lo convertiría en MVP**, y es justo la puerta de entrada:

1. **La lectura de informes no se ha probado nunca con un informe real.**
   Funciona sobre textos sintéticos escritos por mí imitando la forma de esos
   aparatos. Un informe de verdad puede tener otra maquetación, otras
   abreviaturas y otro orden. **Hasta que no se pruebe con informes reales, el
   dato de entrada del producto no está validado.** Es la limitación más
   importante de esta lista.
2. **No hay instalador `.exe`.** Se arranca con doble clic en
   `Calculator Vilamar.cmd`, que sí funciona, pero no es un programa instalado.

Mientras el paso 1 siga abierto, esto no se puede usar cómodamente cada día, que
es lo que separa un prototipo de un MVP.

---

## 2. ✅ Qué funciona HOY

> Solo lo que he ejecutado y comprobado, no lo que he escrito.

### Comprobado contra las webs reales

- **EVO Toric: funciona de punta a punta.** Se rellena su formulario, se pulsa
  calcular y se leen los resultados. Medido: **~4–7 segundos**. Devuelve esfera,
  cilindro, eje, designación tórica, refracción prevista, cilindro y eje
  residuales y el equivalente de desenfoque.
- **Barrett Toric: funciona de punta a punta.** Incluye entrar por la página de
  la ASCRS, quitar su aviso de cookies, esperar al iframe, rellenar, calcular y
  abrir su pestaña de resultados. Medido: **~21–35 segundos**.
- **Las dos coinciden** sobre el fixture sintético: 21.50 D de esfera, cilindro
  1.00 y eje 81°. Que dos implementaciones independientes den lo mismo es la
  mejor señal de que los datos se están enviando bien.
- **EVO devuelve lo que dice haber recibido** y se guarda. Eso es lo que hace el
  informe auditable: no se apunta lo que creemos haber mandado, sino lo que la
  web enseña en su pantalla.
- **Kane: funciona de punta a punta.** Ejecutado contra su web el 12/08/2026 con
  datos sintéticos: rellena, calcula y lee. Medido: **~9 segundos**. Devolvió siete
  potencias y **la recomendada que Kane marca**, 21.50 D con refracción prevista
  −0.06 — el mismo 21.50 que dio EVO. Dos fórmulas independientes de acuerdo.
- **Kane pide su acuerdo de licencia una vez, y solo una.** El programa lo
  reconoce, avisa y espera; **no lo acepta por su cuenta**. La aceptación queda en
  el perfil del navegador, así que los cálculos siguientes entran directos.
- **Kane devuelve lo que dice haber recibido**, y se guarda: «AL: 24.07 mm K1:
  41.22 D K2: 42.52 D ACD: 3.18 mm» / «A-Constant: 119.00 Target Ref: 0.00 D».
  Sirve de auditoría y de guarda contra leer el ojo equivocado.
- **Kane calcula también en su MODO TÓRICO.** Ejecutado contra su web el 13/08/2026
  con datos sintéticos: `SUCCESS` en **12,7 s**, 8 opciones —5 potencias esféricas y
  3 tóricas con su cilindro residual—, y el eco confirmando que los ejes llegaron:
  «K1: 41.22 D @ 175° K2: 42.52 D @ 85°». El modo se elige por los datos: con eje de
  las dos K, SIA y eje de la incisión se pide el tórico; si falta alguno, el no
  tórico. Antes de esto su columna salía sin cilindro y parecía un fallo de lectura.
- **Kane no elige la potencia tórica, y el programa tampoco elige por él.** Su tabla
  tórica no destaca ninguna fila: enseña cuánto astigmatismo quedaría con cada
  opción y deja la decisión a quien opera. Comprobado en la ejecución real: **0
  tóricas marcadas como recomendadas**. La regla está probada rompiéndola.
- **En la tabla comparativa, «no hay dato» y «no elige» ya no se ven igual.** Donde
  Kane no se pronuncia, la casilla dice «3 opciones, ninguna destacada» en vez de
  «N/A». La fila «Eje» sigue como N/A a propósito: ese dato no lo da.

### Comprobado arrancando la aplicación de verdad

Veinte pruebas de interfaz —doce abren Electron y pulsan con el ratón, ocho
comprueban la transición de Kane contra un servidor local—, más una verificación
vertical completa:

- **La ventana abre** y enseña la pantalla de inicio.
- **Se pueden escribir los datos a mano**, y se validan según se escriben.
- **Un dato imposible bloquea.** `AL = 240.7` sale en rojo, dice «parece un punto
  decimal mal leído: podría ser 24.07», **no lo cambia** y no deja confirmar.
- **Un campo vacío dice quién lo tiene que aportar**, nunca 0.
- **Borrar un dato** lo deja ausente, no a cero.
- **El flujo completo**: datos → confirmar → EVO y Barrett reales → tabla
  comparativa → **PDF escrito en disco**. Comprobado en 47 segundos.
- **Una calculadora que espera no bloquea a las demás:** con Kane esperando a que
  se acepten sus condiciones, se pueden ver los resultados de EVO y Barrett.

### Comprobado con tests automáticos (485, todos en verde)

- **Las diez invariantes clínicas.** Las dos barreras de confirmación se han
  comprobado **rompiéndolas a propósito** y viendo caer el test que las cubre.
- **Aislamiento de fallos**: con un adaptador que revienta —no uno que falla
  bien—, los otros dos conservan su resultado.
- **Que falte un dato bloquea solo a quien lo necesita**: sin SIA, Barrett no
  calcula y EVO sí.
- **Ningún selector HTML sale de `adapters/`.** Comprobado plantando una
  infracción y viendo saltar el guardián.
- **La comparativa describe y no aconseja**: hay un test que busca «debes»,
  «recomendamos», «implanta»… y falla si aparecen.
- **Lectura de informes sobre textos sintéticos**: ANTERION, IOLMaster 700 y
  Pentacam; formato por secciones y a dos columnas; ACD y AQD como campos
  distintos; K y TK por separado; y un informe sin marca de ojo que **no se
  atribuye a ninguno**.
- **El informe PDF** no lleva datos identificativos en su cuerpo y escapa el HTML
  que venga de fuera.

### Lectura de documentos — comprobada con documentos generados

Con `pnpm probar:lectura`, que genera tres documentos y los pasa por el mismo
proveedor que usa la aplicación:

| Documento                         | Resultado                                      |
| --------------------------------- | ---------------------------------------------- |
| **PDF con capa de texto**         | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |
| **Imagen PNG o JPEG (OCR)**       | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |
| **PDF escaneado (imagen dentro)** | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |

Y con imágenes de distintos tamaños y formatos, comprobado por separado:

| Entrada                              | Fiabilidad del OCR | Números                                      |
| ------------------------------------ | ------------------ | -------------------------------------------- |
| PNG 900×600                          | 89 %               | correctos                                    |
| JPEG 1920×1080 (captura de pantalla) | 90 %               | correctos                                    |
| JPEG 4032×3024 (foto de móvil)       | 91 %               | correctos                                    |
| Fichero corrupto                     | —                  | mensaje claro, y la aplicación sigue abierta |

#### Un solo «Calcular» procesa los dos ojos

Comprobado con 14 pruebas automáticas. Antes había que cambiar de pestaña y
volver a lanzar el flujo para el segundo ojo.

**Y la causa no era la que parecía.** No fallaba EVO: su adaptador abre una
página nueva por ejecución, marca el ojo que le piden y comprueba el eco de la
web. Es que **nadie le pedía el segundo** — la pantalla mandaba el ojo de la
pestaña activa y el orquestador solo sabía de uno.

El recorrido ahora es calculadora a calculadora y, dentro de cada una, los dos
ojos:

    EVO OD → EVO OS → Barrett OD → Barrett OS → Kane OD → Kane OS

Ese orden no es casual: **Kane pide aceptar sus condiciones**, y así se aceptan
una vez y sus dos ojos entran seguidos en la misma sesión del navegador.

Lo comprobado:

- Un caso de un solo ojo calcula solo ese, sin inventar el otro.
- **A cada ojo le llegan sus valores.** Los casos de prueba tienen números
  distintos en cada uno a propósito: es la única forma de verlo.
- Si un adaptador devolviera el ojo cambiado, **el resultado se descarta**. Es el
  fallo más peligroso posible porque parecería válido.
- Si falla un ojo, el otro se conserva. Si a Barrett le falta el SIA, ni EVO ni
  Kane ni el otro ojo se bloquean.
- **«Reintentar» vuelve a significar lo que dice**: repetir lo que falló. Ya no
  hace falta para conseguir el segundo ojo, y lo que salió bien no se repite.

#### El sexo del paciente

Kane lo pide en su formulario. **EVO no** —comprobado el 12/08/2026 abriendo su
formulario: 36 campos, ninguno de sexo ni de edad— y Barrett tampoco.

Se guarda en el caso, no en el ojo: es de la persona y es el mismo para los dos.
Sale de tres sitios, por este orden:

1. **Del informe**, si lo imprime («Sex: Female»), con su evidencia.
2. **Deducido del nombre del paciente**, si el informe no lo dice.
3. **Elegido por ti**, si no hay ninguna de las dos.

⚠️ **Sobre la deducción, que la pediste tú y conviene tener claro qué implica.**
Un nombre no determina el sexo: hay nombres unisex, extranjeros, iniciales, y un
OCR que lee «Andrea» donde ponía «Andrés». Por eso:

- **Un sexo deducido NO se autoconfirma.** Sale «⚠ compruébalo» y no viaja a Kane
  hasta que pulsas «Está bien». Es la D32 aplicándose, no una excepción.
- **Un nombre que no se reconoce no se adivina.** «Alex», «Cruz», «Andrea» y
  compañía se quedan sin deducir y los eliges tú.
- **Se dice qué regla lo decidió**: «Deducido del nombre «maría»» pesa más que
  «Deducido de la terminación del nombre «zoraida» — compruébalo».

Y una consecuencia que hay que decir en voz alta: **el nombre del paciente pasa a
guardarse**, que hasta ahora no ocurría. Vive solo en el fichero del caso, en tu
ordenador. **No sale al PDF, no sale a ninguna calculadora** —a las webs se les
sigue mandando `CV-2026-0042`— y no entra en el repositorio.

#### Cada campo dice cuánta falta hace

No todos los datos son obligatorios, y **«obligatorio» depende de qué calculadora
quieras**. De los 24 campos:

| Cuántos | Qué son                                | Cuáles                                                                                        |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| 5       | **Obligatorios** en las tres           | AL, K1, K2, ACD, refracción objetivo                                                          |
| 5       | **Obligatorios en alguna**             | Ejes de K1/K2 (EVO y Barrett), SIA y eje de incisión (solo Barrett), constante A (EVO y Kane) |
| 8       | **Opcionales** — mejoran el resultado  | LT, CCT, WTW, córnea posterior, factor de lente                                               |
| 6       | **No se envían a ninguna calculadora** | AQD, TK1/TK2 y sus ejes, nk                                                                   |

Cada campo lo dice debajo de su nombre. Y antes de confirmar, la pantalla avisa
de **qué calculadoras no van a poder calcular** con lo que hay y qué les falta —
hasta ahora eso solo se sabía después de esperar los 47 segundos del recorrido.

No bloquea: calcular con dos de tres es un resultado legítimo, y quizá el dato que
falta sencillamente no lo tienes.

#### La pantalla de revisión dice de dónde sale cada dato

Antes, un campo que el informe no traía y un campo que tiene que poner el cirujano
decían lo mismo: «NO ENCONTRADO». Eso hacía parecer que la lectura había fallado.
Ahora se distinguen cinco orígenes, y el origen sale del **valor concreto**, no
del tipo de campo:

| Lo que ves                  | Qué significa                                      |
| --------------------------- | -------------------------------------------------- |
| **Del informe**             | Lo traía el documento                              |
| **Derivado del informe**    | El programa lo ha calculado con otros datos suyos  |
| **Aportado**                | No venía y lo has escrito tú                       |
| **Corregido**               | El informe traía otro valor. Se enseña cuál        |
| **No consta en el informe** | Ese informe no publica ese dato                    |
| **Pendiente de aportar**    | Lo decides tú (SIA, eje de incisión, constante A…) |

Tres cosas que se pueden comprobar:

- **Cualquier dato que no venga en el informe se puede escribir a mano**, y queda
  marcado como aportado.
- **Corregir no borra lo que ponía.** Si el informe decía 24.07 y escribes 24.08,
  la pantalla y el PDF enseñan «Leído originalmente: 24.07 mm», con la línea
  literal del documento.
- **Origen y estado van en columnas separadas.** De dónde salió un número y si
  está revisado son dos preguntas.

También se leen ya dos datos del ANTERION que antes se tiraban: **refracción
objetivo** (incluido el 0.00, que es emetropía y no un hueco) y **nk = 1.3375**.

#### Un ANTERION que no imprime la ACD ya no deja las tres calculadoras fuera

Comprobado de punta a punta, con un PDF de verdad: si el informe trae AQD y grosor
corneal pero no ACD, el programa la calcula —`2.65 mm + 530 µm = 3.18 mm`— y la
enseña como **«Derivado del informe»**, con la cuenta debajo para poder
contrastarla. Las tres calculadoras exigen la ACD, así que antes esos informes se
quedaban fuera teniendo el dato delante.

Lo que **no** hace, y también está comprobado:

- **No pisa una ACD impresa.** Si el informe la trae, se usa esa.
- **No aplica la cuenta a cualquier aparato.** Solo a ANTERION, porque su informe
  dice desde qué superficie mide cada distancia. Con un aparato desconocido no
  calcula nada y explica por qué: la suma daría un número creíble que podría estar
  medio milímetro desviado, y las dos cosas se parecen.
- **No inventa si falta un ingrediente.** AQD sin CCT no da ACD.
- **No elige cuando hay dos versiones que no cuadran.** Avisa, deja los tres datos
  como estaban y corriges tú.
- **No se da por buena sola.** Aunque la cuenta sea exacta, nadie ha visto el
  resultado: hay que pulsar «Está bien», como con lo leído por OCR.

⚠️ Sigue siendo lectura sobre documentos **sintéticos**. Que la regla funcione no
dice que se reconozca la maqueta de un ANTERION real — eso sigue en el punto 1.

#### Las constantes A de las lentes que propone el informe

Comprobado de punta a punta con un PDF de verdad. Un ANTERION que lista modelos con
su constante ya no deja la constante A en «Pendiente de aportar»:

```
Modelos encontrados en el informe:
  LUX SMART                     A 118.5
  ZEISS AT ELANA 841P           A 119.6
  Bausch&Lomb Akreos AO MI60    A 119.1
  Bausch&Lomb enVista MX60      A 119.2
```

**Ninguna viene marcada, y esa es la parte importante.** Cuatro lentes son cuatro
constantes posibles y ninguna es la del caso hasta que eliges qué implantas.
Elegir Akreos pone 119.1 como «Del informe»; cambiar a enVista la cambia a 119.2.

Lo que **no** hace, todo comprobado:

- **No elige sola**, ni siquiera la primera de la lista.
- **No hereda.** Una lente que no está en el informe se queda sin constante: no se
  coge la más parecida, ni otra de la misma marca, ni un promedio.
- **No arrastra.** Al cambiar de lente, la constante de la anterior se quita.
- **No empareja de forma aproximada.** `MX60` y `MX60T` son lentes distintas.
- **No interpreta «SRK/T» en un aparato desconocido.** Ahí ese número puede ser
  cualquier cosa.
- **No pisa lo que has escrito tú.** Avisa de que quizá ya no corresponde.

Y si una calculadora externa **usa otra constante** —elegir el modelo en su web
puede cambiarla—, el informe lo dice con las dos cifras. No se corrige: el
resultado es el de la constante que usó la web, y taparlo sería mentir por omisión.

⚠️ **El lector de visión todavía no lee esta tabla.** Va vacía y lo avisa; no se
inventa. Ampliarlo es tarea aparte y no se puede medir sin clave (O8).

#### Cuánto acierta el lector local, medido

`pnpm comparar:lectores` pasa 6 documentos por el lector y cuenta. 20 datos por
documento, 120 comparaciones. Ejecutado el 11/08/2026:

| Documento                              | bien     | MAL   | falta  |
| -------------------------------------- | -------- | ----- | ------ |
| PDF con texto dentro                   | 20/20    | —     | —      |
| Captura de pantalla nítida             | 20/20    | —     | —      |
| PDF que por dentro es una imagen       | 19/20    | —     | 1      |
| JPEG pequeño y muy comprimido          | 18/20    | —     | 2      |
| Esa imagen convertida a PDF            | 13/20    | **1** | 6      |
| **Foto de una pantalla, algo torcida** | **1/20** | —     | **19** |
| **Total**                              | **91**   | **1** | **28** |

**Lo que hay que saber de esta tabla:**

- **Un PDF con texto dentro sale perfecto.** Si el aparato exporta así, no hace
  falta nada más: es exacto, instantáneo y gratis.
- **Una foto de la pantalla lo hunde: 1 de 20.** La imagen se lee sin esfuerzo a
  simple vista; basta un giro de 2,4° y algo de desenfoque. Es el caso más
  probable en el uso real cuando no se puede exportar.
- **El único dato equivocado** es el conocido: 24.87 donde ponía 24.07. Los
  demás fallos son del tipo seguro (no lee) y salen como NO ENCONTRADO.

El comparador mide también los modelos de visión, con su coste real por informe.
**Falta ejecutarlo con una clave** — sin eso, no se sabe cuánto mejoran.

#### Hay un segundo lector, mejor, y viene apagado

Existe un **lector de visión** (Claude, `claude-opus-5`) que lee el informe
entendiéndolo en vez de reconociendo letras: ve la maqueta, sabe que AL es una
longitud axial en milímetros y devuelve los datos ya estructurados, cada uno con
la línea literal del informe de donde sale.

**Está construido, con pruebas, y APAGADO.** Sin `ANTHROPIC_API_KEY` configurada
se declara no disponible y la aplicación lee en local exactamente como antes.

Por qué apagado: **manda el informe fuera del ordenador.** Son datos de salud
(RGPD art. 9). Encenderlo es una decisión de quien lo usa, no del programa —
decisión abierta O5 en SYSTEM_VISION.

Qué NO cambia si se enciende: un dato leído por el modelo sigue saliendo en
ámbar y hay que comprobarlo uno a uno. Acierta mucho más, pero no es exacto.

**Sin validar contra informes reales.** No he podido medir cuánto mejora, porque
para eso hacen falta informes de verdad anonimizados. Lo que está probado son
las 13 pruebas de que su respuesta se trata con la desconfianza que le toca
(entra como `VISION`, un ojo dudoso se descarta entero, nada se pierde en
silencio), verificadas rompiendo cada guarda a propósito.

Si la API falla —sin internet, clave caducada, cuenta sin saldo— **no se pierde
el documento**: se lee en local y se dice qué ha pasado.

#### ⚠️ Lo más importante que se ha aprendido: el OCR no es de fiar para números

Sobre un informe convertido a PDF desde una imagen comprimida, el reconocimiento
leyó esto:

| Pone en el informe | Leyó      | Fiabilidad que declaró |
| ------------------ | --------- | ---------------------- |
| AL 24.01           | **24.81** | **93 %**               |
| AL 24.07           | **24.87** | 80 %                   |
| K1 40.27           | **48.27** | 68 %                   |
| CCT 530            | **538**   | —                      |

Y en el mismo documento, un **24.07 leído CORRECTAMENTE** declaraba un 79 %.

O sea: **la fiabilidad que da el OCR no distingue lo correcto de lo incorrecto.**
El programa NO PUEDE saber si un número reconocido es bueno. Y un 24.81 en lugar
de 24.01 está dentro de rango, así que ninguna validación lo detecta.

**Qué se ha hecho con eso**, porque es una decisión de producto y no un ajuste:

- Un dato leído por OCR **nunca se enseña como «✓ correcto»**. Sale en ámbar,
  como «⚠ compruébalo», aunque el valor sea perfectamente normal.
- **«Confirmar datos» no los acepta en bloque.** Hay que comprobar cada uno
  contra el informe y pulsar «Está bien». Lo escrito a mano y lo que viene del
  texto de un PDF no lo necesitan: son exactos.
- La pantalla enseña el texto que se leyó, para poder compararlo de un vistazo.

**Consecuencia práctica:** con un informe en PDF **con texto dentro**, la lectura
es exacta y el programa ahorra todo el trabajo. Con una imagen o un escaneo,
ahorra teclear pero **hay que comprobar cada número**. Convertir una imagen a PDF
no ayuda: sigue siendo reconocimiento sobre imagen.

**Toda imagen pasa por el navegador y sale como PNG limpio** del tamaño que
mejor lee el OCR (unos 2200 px de ancho). El navegador decodifica muchos más
formatos y variantes que tesseract, y eso es lo que convirtió un «Error
attempting to read image» en un informe leído.

Medido: llevar la imagen a ese ancho sube la fiabilidad del 80 % al 90 %.
Ampliar ×3 **empeora** —apareció un 24.97 donde ponía 24.07—, así que hay tope.

### Comprobado a mano

- **`pnpm install` no compila nada** y termina en segundos.
- **Lint, comprobación de tipos y build en verde.**
- **El PDF se ve bien.** Generado, abierto y mirado, no solo compilado.

---

## 3. ⚠️ Qué NO funciona todavía

- **Catálogo de lentes propio: construido y probado con datos sintéticos, sin
  usar todavía con un inventario real.** Ajustes → «Tu catálogo de lentes»
  guarda modelo, constante A y rango de esfera/cilindro; los resultados
  cruzan la potencia calculada contra ese catálogo y dicen qué lentes lo
  cubren — nunca cuál implantar (concreta D14, ver SYSTEM_VISION.md D37). Los
  13 tests de dominio y los 4 de interfaz (añadir, editar, borrar, tórica sin
  rango de cilindro) pasan, y se ha visto la pantalla funcionando de verdad.
  Lo que falta: que el dueño del proyecto meta su inventario real y compruebe
  que el cruce con los resultados de Kane/EVO/Barrett dice lo que espera.
- **Selección de modelo en Kane: construida, sin ejecutar todavía contra la
  web real.** Kane ahora también elige el modelo en su desplegable «IOL Type»
  —igual que EVO y Barrett— y usa la constante que rellena solo si lo
  encuentra. Antes de este cambio Kane nunca elegía modelo a propósito, por un
  problema medido: una lente tórica le cambia el modo del formulario y podía
  borrar lo ya escrito. La solución (elegir el modelo LO PRIMERO de todo, y
  leer el modo que resulte con `modoActivo` en vez de suponerlo) tipa bien,
  pasa lint y no rompe ningún test existente — pero, como con las tres
  calculadoras, **no hay tests automáticos contra la web real** (D25): hace
  falta ejecutar un cálculo de verdad, con el acuerdo de Kane ya aceptado en
  el navegador de la aplicación, para confirmar que el modo se lee bien y que
  no se pierde ningún dato al cambiar de modelo a mitad de formulario.
  **Ya se encontró y se arregló un fallo real probando esto a mano**: la
  pantalla de revisión seguía pidiendo escribir la constante A aunque la
  lente elegida ya la diera (D40) — señal de que probar a mano, aunque sea
  parcial, encuentra cosas que lint y los tests no ven.
- **PDF por calculadora: construido, sin ejecutar todavía contra las webs
  reales.** «Generar PDF» crea ahora una carpeta con el informe comparativo
  de siempre y, junto a él, un PDF de una hoja por cada calculadora con la
  captura de su propia pantalla de resultados (ver SYSTEM_VISION.md D39).
  tipa bien y no rompe ningún test, pero la captura solo se puede probar
  calculando de verdad contra EVO, Barrett y Kane —no hay forma de
  simularla— y generando el PDF después. Falta comprobar a mano que las tres
  capturas salen legibles y que la carpeta se abre bien desde «Abrir la
  carpeta».
- **DOCUMENT EXTRACTION NOT YET VALIDATED ON REAL REPORTS.** Lo repito en inglés
  porque es la frase que pidió el pliego y porque es la limitación que más
  importa. Los parsers funcionan sobre textos sintéticos. Con un informe real
  pueden fallar, y el modo de fallo más probable no es un error: es leer un
  número donde no toca.
- **Kane funciona, con una limitación declarada.** Ya no está «sin verificar»: se
  capturó su formulario real y se ejecutó de punta a punta contra su web. Lo que
  NO hace es rellenar su **modo tórico** — medido: elegir una lente tórica en su
  lista cambia el formulario y esconde los campos que se rellenan. Se le envía la
  constante A de esa lente, y el resultado lo dice. Para el cálculo tórico están
  EVO Toric y Barrett Toric.
- **No hay instalador `.exe`.** Hay un lanzador de doble clic
  (`Calculator Vilamar.cmd`) **comprobado: abre la ventana**. El instalador de
  verdad falla en este equipo porque `electron-builder` necesita permiso para
  crear enlaces simbólicos; se arregla activando el Modo de desarrollador de
  Windows, pero no lo he podido probar sin ese permiso.
- **Sin historial de casos en la interfaz.** Los casos se guardan en disco, pero
  no hay pantalla para volver a uno anterior.
- **El OCR necesita internet UNA vez** para bajar 5 MB de datos de idioma;
  después funciona sin conexión. Se puede hacer por adelantado con
  `pnpm ocr:preparar`. Si faltan y no hay conexión, se dice con claridad y se
  puede seguir a mano — **antes esto cerraba la aplicación**.
- **Un PDF escaneado se lee, pero solo las 5 primeras páginas**, y lo dice.
- **Sin soporte de córnea post-cirugía refractiva** más allá de guardar los
  campos: no se rellenan las secciones específicas de EVO para post-LASIK.
- **El lector de visión no lee la tabla de lentes.** Devuelve la lista vacía y lo
  avisa cuando el aparato es de los que la traen, en vez de inventarla. Con el
  lector de visión encendido hay que escribir la constante A a mano.
- **Solo ANTERION trae tabla de lentes reconocida.** Igual que con la ACD: es una
  decisión (D33), no un descuido. Añadir otro aparato exige comprobar antes cómo
  presenta sus constantes.
- **Solo ANTERION puede derivar la ACD.** Es una decisión, no una carencia (D31),
  pero conviene tenerlo escrito: si un IOLMaster o un Pentacam trae AQD y grosor
  corneal sin ACD, el programa **no la calcula** — no está documentado desde qué
  superficie mide su ACD, y suponerlo daría un número creíble medio milímetro
  desviado. Para añadir un aparato hace falta poder señalar dónde lo dice su
  informe. Si no se puede señalar, la respuesta sigue siendo no.

---

## 4. 🔒 Bloqueos externos

| Qué                                | Por qué está bloqueado                                                                                                                                                                       | Qué hace falta                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verificar Kane**                 | Su calculadora está detrás de un acuerdo de licencia que hay que aceptar, y la web declara reCAPTCHA. Aceptar un contrato legal en nombre del usuario no es algo que deba hacer el programa. | Que el dueño del proyecto ejecute `pnpm reconocer:kane`, acepte las condiciones con su propio clic, y con lo que salga se cierre el adaptador. **Además: decisión sobre O1** (ver SYSTEM_VISION § 7) y, dado el impacto, revisión jurídica. |
| **Validar la lectura de informes** | No hay ningún informe real en el proyecto, y no debe haberlo sin anonimizar.                                                                                                                 | Informes reales **anonimizados** de ANTERION, IOLMaster 700 y Pentacam. Con 2–3 de cada uno se puede ajustar y medir de verdad.                                                                                                             |
| **Catálogo de lentes**             | No sé qué lentes usa la consulta.                                                                                                                                                            | La lista de modelos y constantes habituales.                                                                                                                                                                                                |

Ninguno de los tres impide usar lo demás.

---

## 5. 🚨 Riesgos

| Riesgo                                              | Gravedad | Qué hay hecho                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El OCR lee mal un número y nadie lo nota**        | **Alta** | Validación por rangos que marca lo imposible y bloquea; detección de punto decimal mal leído; evidencia visible de qué se leyó; revisión humana obligatoria. Aun así, un error dentro de rango **puede colarse**: por eso la pantalla enseña el texto original de cada dato. |
| **Los datos acaban en el ojo equivocado**           | **Alta** | Si no se puede determinar el ojo, no se asigna ninguno. La lateralidad viaja dentro de cada medida y guardarla en el ojo que no es lanza un error. EVO confirma el ojo en su respuesta y se comprueba.                                                                       |
| **Una web cambia y el adaptador deja de funcionar** | Media    | Cada fallo guarda un expediente con fase, dirección, selector esperado y captura. `pnpm live` prueba los adaptadores contra las webs en un minuto.                                                                                                                           |
| **Sesiones y cookies**                              | Media    | Perfil de navegador local en `%APPDATA%`, fuera del repositorio y en `.gitignore`.                                                                                                                                                                                           |
| **Privacidad**                                      | **Alta** | Nada identificativo entra en el repositorio ni en el PDF. Las capturas de diagnóstico **sí pueden contener biometría** y por eso viven solo en local, con un aviso escrito en su carpeta.                                                                                    |
| **Dependencia de terceros**                         | Media    | Las tres webs son ajenas y pueden cambiar o caerse. Por eso los tests contra ellas están fuera del CI y el producto entrega resultados parciales.                                                                                                                            |

---

## 6. Qué se ha decidido esta sesión

- Todo el apartado de decisiones cerradas de [SYSTEM_VISION.md](SYSTEM_VISION.md)
  (D1–D32).
- **La carpeta del repositorio estaba vacía.** La plantilla habitual no llegó a
  copiarse, así que se ha instalado desde el proyecto hermano y adaptado.
- **D31: un dato canónico puede derivarse, pero solo si el perfil del aparato lo
  permite explícitamente.** La tabla de perfiles es restrictiva por defecto — hoy
  solo ANTERION — porque en otro aparato la misma cuenta daría un número plausible
  y equivocado, que es lo peor que puede producir este programa.
- **D32: lo derivado tiene estado de origen propio y no se autoconfirma.** Las dos
  alternativas eran mentira («del informe» de algo que el papel no dice, o
  «aportado» de algo que no ha escrito nadie), y aunque la cuenta sea exacta nadie
  ha visto el resultado.
- **D33: la constante A pertenece al modelo de lente, no al informe.** Se guarda la
  relación modelo→constante, nunca una constante suelta, y una lente que no está en
  el informe no hereda la de otra.
- **D34: si una web externa dice haber usado otra constante, se registra y se
  enseña; no se corrige.** El resultado es el de la constante que usó la web.
- **D44 (25/08/2026): Refracción objetivo se propone en 0, marcada como valor
  por defecto (no como dato del informe ni escrito a mano), editable como
  cualquier otro dato.** Construido y comprobado con tests unitarios (7 nuevos)
  y con la suite e2e completa (31, en verde); **no** se ha comprobado todavía
  abriendo la aplicación real y mirando la pantalla de revisión con un caso
  nuevo — pendiente de que el dueño del proyecto lo pruebe.
- **D45 (25/08/2026): en la pantalla de cálculo se puede elegir con qué
  calculadoras trabajar, con una casilla por calculadora, antes de pulsar
  «Calcular».** Empieza con las tres marcadas. Construido y comprobado con
  lint, typecheck, tests unitarios y la suite e2e (32, con 1 test nuevo para
  esto); **no** se ha comprobado todavía abriendo la aplicación real —
  pendiente de que el dueño del proyecto lo pruebe.
- **D46 (25/08/2026): la carpeta de informes lleva el nombre del paciente,
  cuando el informe lo trae — excepción explícita y documentada a que ese
  dato no sale del ordenador ni entra en ningún PDF.** Se hizo pushback antes
  de tocar nada; el dueño del proyecto lo confirmó igualmente. También se
  amplió el reconocimiento del nombre para la etiqueta «Paciente:» a secas.
  Construido y comprobado con lint, typecheck, tests unitarios (1 nuevo) y
  la suite e2e; **la construcción del nombre de carpeta en sí no tiene test
  automático** —habla con el sistema de archivos, como el resto de
  `generarPdf`— así que sigue pendiente de que el dueño del proyecto genere
  un informe real y compruebe el nombre de la carpeta.
- **D47 (25/08/2026): tres huecos de lectura reales, encontrados con la
  primera biometría de IOLMaster que subió el dueño del proyecto.** Un ojo
  repetido se quedaba con el trozo más largo (perdía la AL); el IOLMaster no
  leía su tabla de lentes; la refracción objetivo exigía decimales. Los tres
  arreglados y comprobados con 4 tests nuevos (fixtures sintéticas, sin
  ningún dato del informe real), lint, typecheck y la suite e2e completa.
  **No** se ha vuelto a probar contra el informe real que trajo el problema
  —no se guarda en ningún sitio persistente— así que sigue pendiente de que
  el dueño del proyecto vuelva a subir esa biometría y confirme que ahora sí
  se lee entera.
- **D48 (25/08/2026): un tercer biómetro habitual (ANTERION, pantalla de
  cálculo de LIO) usa una tabla a tres columnas con la etiqueta puesta una
  sola vez; `segmentarPorPosicion` ya sabe leerla, ignorando la columna de
  diferencia.** Construido y comprobado con 1 test nuevo (posiciones
  sintéticas, ningún dato real), lint, typecheck y la suite e2e completa —el
  primer intento rompió un test e2e existente y se corrigió antes de seguir.
  **No probado con una foto real**: eso pasa por OCR, que no se ha ejecutado
  contra una imagen de verdad de este formato, así que sigue pendiente de
  que el dueño del proyecto lo confirme subiendo esa biometría.

---

## 7. Lo siguiente, por orden de importancia

1. **Probar la lectura con informes reales anonimizados.** Todo lo demás está por
   detrás de esto.
2. **Cerrar Kane**: aceptar sus condiciones una vez, capturar su formulario y
   ajustar el adaptador. Antes, decidir O1.
3. **Instalador de Windows.** La configuración está puesta; falta ejecutarlo
   con el Modo de desarrollador activado y comprobar el `.exe` resultante.
4. Calcular los dos ojos de una vez.
5. Historial de casos.
