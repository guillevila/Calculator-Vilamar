# PROJECT_STATUS.md — Estado real de Calculator Vilamar

> 🟢 **Este es el archivo más honesto del proyecto.**
> Dice qué funciona DE VERDAD hoy y qué no. Si algo no está aquí marcado como
> «funciona», asume que NO funciona.
>
> Regla que gobierna este documento: **construido ≠ probado ≠ validado.**
> Que exista un adaptador no significa que se haya probado contra su web. Que se
> haya probado contra su web no significa que se haya validado con informes
> reales.

**Última actualización:** 27/08/2026 (noche) · estética del cuestionario
manual: los tres apartados (Biometría / Lente e incisión / Córnea
posterior) ahora se ven con fondos azules distintos, la tarjeta «Quién es»
y el selector OD/OS se distinguen como lo primero a rellenar, y el SIA +
su eje de incisión arrancan en 0.25 D @ 135° editable (D46, misma excepción
que D38 ampliada) — en los dos caminos de entrada, manual y documento
leído. Sin probar todavía en la aplicación real por el dueño (solo
`pnpm lint && pnpm typecheck`, pendiente `pnpm test` completo y
`pnpm dev` a mano). Queda pendiente, sin empezar y sin decisión aún: varios biómetros por el
mismo ojo con sus propios cálculos, y el informe partido en un PDF por
ojo — investigado a fondo (toca el tipo central `Caso.ojos`, hoy un único
conjunto de medidas por lado, y de ahí se propaga a ~15-20 ficheros: ver
la sección 7, «Lo siguiente», más abajo, para el resumen del diseño y las
preguntas abiertas antes de empezar); y, antes de eso, el dueño probó D45
completo
en la aplicación de verdad —EVO y Barrett, con y sin córnea posterior, las
cinco tarjetas del cuadro final— y encontró un último fallo concreto: en
Barrett con córnea posterior, la estimación propia de Calculator Vilamar
(D43) a veces elegía una esfera que Barrett no había destacado —correcto,
es su propio criterio, no tiene por qué coincidir— y esa esfera salía SIN
cilindro ni eje, aunque Barrett sí los daba. Causa: `barrett.ts` solo le
pegaba el cilindro de su tabla tórica a la fila que Barrett destaca, nunca a
las otras dos. Corregido para que cada fila reciba el cilindro de SU PROPIA
designación (T3, T4…), sea o no la que Barrett señala — verificado contra la
web real con las tres filas de dos cálculos distintos, las seis con su
cilindro y eje ya presentes. Y, antes de eso, una tarde entera puliendo D45
para Barrett contra la web real: la secuencia de nueve pasos ya estaba,
pero salía «Predicted PCA» disfrazado de «Measured PCA» de forma
intermitente, y se acabó descartando la comprobación que se intentó para
detectarlo —ver el detalle en «Lo siguiente» y en el log de lecciones,
2026-08-27 (noche)—, quedándose solo con un margen de espera más largo
antes de leer el resultado, verificado dos veces seguidas con éxito y
resultados distintos; y, el mismo día, dos correcciones más encontradas
usando la aplicación de verdad: la tabla comparativa en pantalla, el cuadro
final del PDF y los botones de «Reintentar» solo enseñaban las tres
calculadoras base aunque el ojo tuviera las dos variantes de córnea
posterior calculadas — ahora las cinco casillas se enseñan siempre que
existan (nueva función de dominio `columnasComparativa`); y se quitó la
insignia «Más cercana entre las tres» del cuadro final (D43), petición
expresa del dueño: cada tarjeta enseña su propio valor, sin señalar ninguna
como la más adecuada; sumado a lo mismo de hoy: añadir que EVO y Barrett se
calculan dos veces cuando el ojo tiene córnea posterior —con y sin ella—
(D45); que el nombre real del paciente viaja a EVO, Barrett y Kane (D44, decisión de
privacidad revertida dos veces con aviso expreso); y corregir el cilindro de
EVO, que no tenía en cuenta que esa web enseña el astigmatismo residual en
notación negativa — sumado a lo de ayer: corregir dos fallos reales
encontrados con el primer cálculo manual completo de las tres calculadoras
(el orden de la tabla de Kane invertía la estimación; EVO exige PK1 < PK2 en
módulo, al revés que su propio aviso en pantalla); añadir una estimación PROPIA de
lente, no vinculante, bajo cada captura y en un cuadro final (D43 — excepción
estrecha a «compara, pero no recomienda», ver más abajo); EVO y Kane eligiendo
ya el modelo de lente en su propio desplegable; diagnosticar y corregir con
datos reales un fallo de EVO con la córnea posterior; sumado a lo de ayer: el
cuestionario simplificado de entrada 100% manual con el nombre del cirujano
viajando a las tres calculadoras (D41, D42), simplificar el informe a solo
capturas + lente recomendada + aviso de fallo (D39), añadir la selección de
calculadoras antes de calcular (D40), el objetivo de refracción en 0 (D38),
diagnosticar y corregir la captura en blanco de Kane, y corregir un fallo real
de lectura encontrado con el primer informe real (IOLMaster)

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

1. **La lectura de informes se ha probado con UN informe real, y encontró un
   fallo de verdad** (25/08/2026, IOLMaster de Zeiss — ver apartado 2 y 3).
   Ya corregido. Pero sigue siendo la limitación más importante: un solo
   documento de un solo aparato no es una validación, y ANTERION y Pentacam
   siguen sin ningún informe real. Un informe de verdad puede tener otra
   maquetación, otras abreviaturas y otro orden que este todavía no ha visto.
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

### La captura de pantalla de cada resultado (24–25/08/2026)

Cada calculadora deja, para cada ojo con resultado, una captura de pantalla
tal cual de su pantalla de resultado — sin recortar, sin interpretar.

**Probado contra las webs reales (25/08/2026):** EVO y Barrett generaron su
captura correctamente. La de Kane salió con la tabla de resultados en
blanco — **diagnosticado y corregido (25/08/2026)**.

**Lo que se vio, mirando directamente los PNG guardados en
`%APPDATA%\calculator-vilamar\capturas`** (no una suposición: se abrieron
los ficheros de verdad): la cabecera con los datos de entrada (AL, K1, K2,
A-Constant…) y el diagrama del eje SÍ salían pintados en la captura. **Las
tablas de potencias y de opciones tóricas salían con las filas vacías** —
bordes dibujados, sin números dentro. Y sin embargo el resultado numérico
que el programa leía de esas mismas tablas siempre fue correcto: la
extracción no fallaba, solo la foto.

**La causa:** el código esperaba solo a que el aviso «Processing…» se
escondiera y hacía la captura inmediatamente después. Esa señal dice que
Kane ha terminado de CALCULAR, no que la tabla ya esté PINTADA en pantalla —
el dato ya estaba en el DOM (por eso la lectura funcionaba) antes de que el
navegador hubiera completado el pintado visual de esa tabla. Es la misma
familia de fallo que ya hay en el log de lecciones con Barrett y su aviso de
cookies: confundir el instante en que algo es cierto en los datos con el
instante en que se ve así en pantalla.

**La corrección:** entre esperar a «Processing…» y hacer la captura, ahora
se espera además a una condición real y verificable — que la primera celda
de la tabla de resultados de ESE ojo tenga texto de verdad, no solo que el
marcador de espera haya desaparecido. Sin reloj a ciegas: si esa condición
nunca llega, el paso siguiente (la lectura de la tabla) sigue exactamente
igual que antes y produce el mismo error explicado que ya producía.

Comprobado: typecheck, lint, los tests de `integrations` (70) y los 15 tests
de interfaz de Kane, todos en verde tras el cambio. **No se ha vuelto a
probar contra la web real de Kane** — hace falta un cálculo real más para
confirmar que la captura sale ya completa.

La comprobación de seguridad del ojo equivocado **no se ha relajado**: si un
adaptador descarta un resultado por venir del ojo que no es, nunca llega a
existir ninguna captura de ese resultado.

### EVO fallaba con la córnea posterior rellena — diagnosticado y corregido (26/08/2026)

El dueño reportó que Barrett y Kane funcionaban perfectamente pero EVO "no
hace el cálculo o falla la web". El propio expediente de diagnóstico que la
aplicación guarda al fallar (`%APPDATA%\calculator-vilamar\diagnostico`) traía
la captura de pantalla exacta del momento del fallo: el campo PK1 mostraba
`-6.00` con el aviso rojo `Range 3 to 9 D` de la propia web, y el formulario
se quedaba bloqueado.

La causa: el dominio guarda la córnea posterior con su signo clínico natural
(negativo), y el formulario de EVO exige el módulo en ese campo — algo que
ningún test sintético había ejercitado nunca, porque ninguno de los 591 tests
rellenaba la córnea posterior. Corregido en `evo.ts`: solo al mandarle el
valor a PK1/PK2 se manda `Math.abs(...)`; el signo no se toca en ningún otro
sitio del programa. **Verificado contra la web real** con `pnpm live evo`
(antes: fallo idéntico al del expediente; después: `SUCCESS`). Se ha ampliado
también el fixture de `pnpm live` con córnea posterior negativa, para que un
cambio futuro en ese campo se detecte solo, sin esperar a un caso real.

### EVO y Barrett se calculan dos veces cuando el ojo tiene córnea posterior (D45, 27/08/2026)

Petición expresa del dueño: comparar el efecto de la córnea posterior en el
resultado. Cuando un ojo tiene PK1 o PK2, EVO y Barrett se calculan
automáticamente dos veces cada uno —una con esos datos, otra sin ellos— y el
informe enseña las dos hojas seguidas, cada una con su propia estimación. No
hay casilla nueva: es automático, según los datos del ojo.

**Verificado contra la web real, EVO**: mismo caso, con córnea posterior
22.5 D / cilindro 3, sin ella 22.0 D / cilindro 2.25 — resultados distintos,
cada uno guardado bajo su propia clave.

**Barrett costó más, y quedó resuelto.** La primera revisión de esta sesión,
mirando solo el adaptador y el HTML inicial de `calc.apacrs.org`, concluyó
que Barrett no tenía ningún campo de córnea posterior — conclusión
**equivocada**: el dueño aportó capturas reales mostrando un interruptor
«Measured PCA» que solo aparece DESPUÉS del primer «Calculate», nunca en el
formulario recién cargado, así que ninguna revisión estática del HTML podía
encontrarlo. Activarlo de verdad —no solo marcarlo, que dejaba el cálculo
en «Predicted PCA» sin avisar— exige una secuencia de nueve pasos entre dos
pestañas, con dos botones «Calculate» distintos (`Button1` y `Button4`),
descubierta en vivo con ayuda directa del dueño del proyecto probando la web
a la vez que Claude. **Verificado contra la web real**: mismo caso, con
«Predicted PCA» dio cilindro 1.5 D @ 84°, y con «Measured PCA» (mismo
PK1/PK2) dio cilindro 2.25 D @ 177° — resultados distintos, confirmando que
el paso de más produce un cálculo genuinamente distinto y no un
«Predicted PCA» disfrazado.

**⚠️ Y todavía costó una tarde entera más.** El dueño probó la aplicación de
verdad y las dos hojas de Barrett le salieron **con el mismo cilindro y el
mismo eje** — el fallo que la verificación de arriba ya daba por resuelto.
Causa real: la web de Barrett es lenta, y el último paso de la secuencia (el
que de verdad activa «Measured PCA») a veces no había terminado su postback
cuando el programa ya intentaba leer el resultado.

Se intentó arreglar de dos formas que **no funcionaron** y se descartaron:
(1) reintentar sin salir de la página —recalcular y reabrir la pestaña otra
vez— dejó la tabla de resultados completamente vacía, peor que antes; (2)
comprobar que el texto «Measured PCA» hubiera aparecido de verdad antes de
aceptar el resultado, probado de cuatro formas distintas (texto literal,
expresión tolerante a espacios raros, volviendo a buscar la pestaña,
comprobando el interruptor del formulario) — **las cuatro rechazaban
cálculos que ya estaban bien**: capturas de pantalla tomadas en el momento
exacto del fallo mostraban la tabla correcta, con los números de «Measured
PCA», mientras el programa decía no haberlo confirmado. Esa etiqueta se ve
a simple vista pero no está en el texto real de la página —todo apunta a
una imagen o a contenido generado por CSS—, así que perseguirla por
programa nunca podía funcionar.

Se quitó esa comprobación por completo. Lo único que quedó, tras descartar
lo demás, fue alargar el margen de espera fijo antes de leer la tabla (de 4
a 6 segundos para esta variante) — verificado dos veces seguidas contra la
web real, ambas con éxito y resultados correctos y distintos. Sigue siendo
la calculadora menos fiable de las tres para esta variante concreta —una
web lenta con un margen de espera más largo sigue siendo, en el fondo, un
margen de espera— y conviene saberlo antes de fiarse a la primera; si algún
día vuelve a fallar, el mensaje de «Barrett no ha devuelto resultados» de
siempre (no uno nuevo) es la señal, y «Reintentar» la solución.

### ⚠️ El nombre real del paciente ya viaja a EVO, Barrett y Kane (D44, 27/08/2026)

Petición expresa del dueño, confirmada dos veces tras dos avisos: el primero
sobre que el informe nunca había llevado el nombre del paciente (D23); el
segundo, más serio, sobre que esto manda un dato de salud identificado a
tres servidores externos por internet en cada cálculo — algo que ninguna
decisión anterior había hecho. El dueño confirmó las dos veces, informado.
El código local del caso pasa al campo de identificador de cada web (antes
vacío). Verificado contra EVO real: los tres campos (nombre, identificador,
cirujano) se rellenan y se conservan correctamente a la vez.

**Lo que NO ha cambiado**: el nombre del paciente sigue sin entrar nunca en
el repositorio, ni en un fixture, ni en el texto propio que genera el PDF
(portada, resumen) — solo en lo que reciben las tres webs y, por tanto, en
sus capturas de pantalla.

### El cilindro de EVO, corregido con un segundo PDF real (26/08/2026)

El dueño mandó un segundo cálculo real donde el cilindro estimado de EVO no
seguía el criterio (cogía 3.00 D cuando, según la tabla, 2.25 D era el que de
verdad coincidía con la córnea antes de invertirse). Dos causas: el
adaptador solo leía la fila que EVO destaca, nunca la escalera tórica
completa, y EVO enseña el astigmatismo residual en cilindro **negativo** por
defecto (tiene su propio interruptor «−ve cyl / +ve cyl»), lo que desplaza el
eje 90° respecto a la notación positiva que usan Kane y Barrett — una
transposición óptica estándar, no un error de lectura, pero que hacía que la
comparación contra el eje curvo saliera invertida. Corregido leyendo la
escalera completa y pulsando el interruptor «+ve cyl» antes de leer ningún
eje. Verificado contra la web real con los números exactos del PDF: la
estimación pasó de 3.00 D a 2.25 D.

### Dos fallos reales encontrados con el primer cálculo manual completo (26/08/2026)

El dueño probó las tres calculadoras a mano y mandó el PDF resultante — el
primer cálculo real de punta a punta con las tres. Encontró dos fallos que
ningún test había visto:

1. **La estimación de Kane salía mal** (24.00 D en vez de 22.50 D): Kane pinta
   su tabla de mayor a menor potencia, al revés que EVO, y el código confiaba
   en que ya viniera ordenada. Corregido ordenando explícitamente antes de
   recorrer las opciones, en vez de fiarse del orden de cada calculadora.
2. **EVO seguía sin calcular con la córnea posterior**, en un caso distinto al
   de ayer: exige que PK1 sea MENOR que PK2 en módulo, justo lo contrario de
   lo que dice su propio aviso en pantalla («* PK1 > PK2», engañoso). Aislado
   probando las cuatro combinaciones (con/sin lente, PK1 mayor/menor que PK2):
   la lente no influye nada. Corregido intercambiando PK1/PK2 solo al
   mandárselos a EVO, sin tocar el dato guardado en el caso.

Comprobado contra la web real con las cuatro combinaciones por separado y con
los números exactos del PDF. El dueño confirmó, tras verlo, que **Barrett
(23.00 D) ya estaba bien** — no hacía falta ningún cambio ahí.

### ⚠️ Estimación propia de lente, no vinculante — excepción a una regla constitucional (D43, 26/08/2026)

Bajo cada captura de pantalla, y en un cuadro final cuando un ojo tiene más
de una estimación, el informe enseña ahora una lente calculada con un
criterio PROPIO —la primera esfera con refracción prevista negativa; el
cilindro tórico más alto que sigue compartiendo el eje curvo de la córnea—,
siempre, de acuerdo o no con lo que la calculadora haya destacado.

**Esto es una excepción, y se trató como tal.** El proyecto tiene una regla
de fondo, «compara, pero no recomienda», con un test dedicado
(`el producto compara, no recomienda` en `comparar.test.ts`) que existe
justo para que este programa nunca elija una opción por su cuenta. Antes de
tocar nada se le explicó esto al dueño del proyecto, que decidió seguir
adelante informado, aceptando que tanto la línea de cada captura como el
cuadro final se marquen siempre, sin excepción, como **«no vinculante»** —
nunca como una recomendación clínica. La estimación vive en un módulo nuevo
y deliberadamente separado del que compara de verdad
(`packages/domain/src/comparacion/recomendacion.ts`), y `CLAUDE.md` /
`.claude/CLAUDE.md` llevan la enmienda explícita de esta única excepción.

Comprobado: 9 tests nuevos del criterio (esfera, cilindro, sin eje curvo, sin
ninguna opción negativa…), 5 del cuadro final (incluido uno que comprueba
que nunca dice «recomendamos», «debes» ni «implanta»), y una comprobación
visual generando el HTML con las tres calculadoras y mirando la imagen
resultante. `typecheck`, `lint` (salvo el aviso preexistente y ajeno de
siempre), 605 tests, `build` y los 28 tests de interfaz, todos en verde.

### EVO y Kane ya eligen el modelo de lente en su propio desplegable (26/08/2026)

Petición expresa del dueño: que el modelo de lente del caso se busque en la
lista de EVO y de Kane, y que si aparece, se use la constante A que esa web
rellena sola —no la escrita a mano—. Barrett no tiene estas lentes en su
lista, así que sigue con la constante del caso, sin cambios.

Para Kane esto no era trivial: elegir una lente tórica de su lista cambia el
modo del formulario por su cuenta, y ese modo lo decide el programa a partir
de los datos, no la lista de lentes — es la misma cosa que el propio código
llevaba documentada desde el 13/08/2026 como motivo para NO elegir el
modelo. Se resolvió reafirmando el modo correcto justo después de elegir el
modelo, antes de escribir ningún número.

**Verificado contra las dos webs reales**, no solo con tests: con el mismo
caso sintético (lente Alcon SN6ATx), EVO pasó de usar la constante escrita a
mano (119.0) a la propia de EVO para esa lente (119.2); Kane, a la suya
(119.28), conservando el modo Tórico que le correspondía por los datos.

### El informe simplificado: solo capturas, lente recomendada y aviso de fallo (D39, 25/08/2026)

El PDF que genera la aplicación por defecto se ha reducido a lo mínimo,
petición expresa del dueño del proyecto: una hoja por calculadora y ojo, con
la captura (o el aviso si no se pudo guardar), y una línea con la lente
recomendada. Si una calculadora no tuvo resultado utilizable, su hoja lleva
el aviso de por qué en vez de quedar omitida en silencio. Nada de tabla
comparativa, diagramas del ojo, biometría ni trazabilidad — ese informe
sigue existiendo en el código (`generarHtmlInformeDetallado`), pero ya no se
usa por defecto.

También, esta misma sesión: **antes de pulsar «Calcular» se puede elegir con
qué calculadoras** —una, dos o las tres, con casillas EVO/Barrett/Kane— (D40),
y **el objetivo de refracción arranca siempre en 0**, editable (D38 — ver el
apartado de decisiones, incluye el pushback que se le hizo al dueño antes de
implementarlo).

Comprobado: 589 tests en verde, `lint`, `typecheck`, `build` y `test:e2e`
(26 de 27; el que falla es un fallo preexistente en `master`, ajeno a este
cambio — «un ANTERION sin ACD la calcula», confirmado reproduciéndolo también
sobre `master` limpio).

⚠️ **El informe simplificado en sí (con las tres calculadoras reales,
incluida la captura en blanco de Kane) no se ha vuelto a generar y mirar
después de este cambio.** Falta hacerlo antes de darlo por cerrado del todo.

### El cuestionario simplificado de entrada 100% manual (D41, D42, 25/08/2026)

La pantalla de inicio enseña ahora dos opciones igual de visibles: cargar un
archivo (como siempre) o escribir los datos a mano. La vía manual ya no
aterriza directo en la pantalla de revisión completa (pensada para revisar
un documento leído, con columnas de Origen/Estado/Evidencia que no pintan
nada aquí): pasa primero por un cuestionario nuevo y pequeño
(`FormularioManual.tsx`) con solo los campos que usan las tres calculadoras
— nombre del doctor, nombre del paciente, tipo de lente, constante A, SIA y
su eje, longitud axial, K1/K2 con sus ejes, ACD, LT, CCT, WTW, el objetivo
de refracción (ya en 0, D38), y córnea posterior. Al terminar, se aterriza
en la misma pantalla de revisión de siempre — el sexo que pide Kane, la
lente y la confirmación no se han duplicado.

**El nombre del cirujano ahora viaja a las tres calculadoras** (D41): antes
el código lo dejaba vacío a propósito, agrupado bajo la misma regla que
protege al paciente. Es una decisión distinta y expresa del dueño, con el
aviso hecho antes de aceptarla — **el nombre del paciente sigue sin viajar
nunca**, esa regla no se ha tocado. Los tres selectores del campo
«Doctor»/«Surgeon» están comprobados de verdad con `pnpm reconocer` (EVO:
`#TextBoxSurgeon`; Barrett: `#MainContent_DoctorName`; Kane: `#Surgeon`, que
ya estaba en el código sin usarse) — no supuestos.

Comprobado: 46 tests de dominio (2 nuevos, sobre que el cirujano viaja y el
paciente no), `typecheck`, `lint` (salvo un aviso preexistente y ajeno en
`scripts/generar-informe-paciente.ts`, sin tocar), `build`, y los 28 tests
de interfaz completos, incluidos tres reescritos porque ya no aterrizaban
directo en la revisión.

⚠️ **Sin probar contra las tres webs reales.** El cuestionario y el hilo de
`nombreCirujano` hasta cada adaptador están probados con tests, no con un
cálculo real — falta confirmar que el nombre llega de verdad al campo
«Doctor»/«Surgeon» de EVO, Barrett y Kane.

---

## 3. ⚠️ Qué NO funciona todavía

- **El nombre del cirujano no se ha visto llegar de verdad a EVO, Barrett ni
  Kane.** El cuestionario simplificado y el hilo hasta cada adaptador están
  probados con tests (los tres selectores están comprobados con
  `pnpm reconocer`, no supuestos), pero falta un cálculo real para confirmar
  que el campo se rellena tal cual en las tres webs.
- **La corrección de la captura en blanco de Kane no se ha vuelto a probar
  contra la web real.** Diagnosticado (la tabla se pintaba después de que el
  aviso «Processing…» ya se hubiera escondido) y corregido con una espera a
  una condición real — ver el apartado 2. Comprobado con los tests, no con
  un cálculo real de Kane todavía.
- **El informe simplificado no se ha vuelto a generar tras el cambio de hoy**
  que lo redujo a capturas + lente recomendada + aviso de fallo (D39). Está
  probado con tests, no con un PDF real de un caso con las tres calculadoras.
- **DOCUMENT EXTRACTION: VALIDADO CON UN INFORME REAL, NO CON LA MUESTRA
  COMPLETA.** El 25/08/2026 se probó por primera vez contra el formato de un
  informe real de IOLMaster (Zeiss) — anonimizado antes de tocar cualquier
  fichero del proyecto: nombre y fecha de nacimiento sustituidos, nunca
  llegaron a un test ni a un commit. **Encontró un fallo de verdad**: el ojo
  derecho perdía la longitud axial entera y los ejes de K1/K2, porque el
  informe trae dos secciones por ojo —un resumen y una «Transcripción
  detallada»— y el segmentador se quedaba solo con una de las dos,
  descartando datos que solo estaban en la otra. Corregido: ahora las junta
  en vez de elegir. Sigue abierto: **es un informe de un aparato de los
  tres** (ANTERION y Pentacam siguen sin ningún documento real), y ha
  llegado como texto pegado en la conversación, no subido y procesado de
  punta a punta por la aplicación de verdad.
- **Esta limitación quedó superada el 26/08/2026 y se deja tachada para no
  perder el rastro:** ~~Kane funciona, pero no rellena su modo tórico, y
  elegir una lente tórica en su lista cambia el formulario~~ — desde el
  13/08/2026 el modo tórico sí se rellena (ver apartado 2), y desde el
  26/08/2026 el modelo de lente también se elige en su desplegable,
  reafirmando el modo correcto justo después para que no se descuadre.
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

- **D45: EVO y Barrett se calculan dos veces si el ojo tiene córnea
  posterior — con y sin ella, automático.** Petición expresa del dueño
  (27/08/2026). Barrett sí tiene el campo («Measured PCA»): la primera
  revisión de esta sesión lo dio por inexistente mirando solo el HTML
  inicial, y el dueño corrigió el error con capturas reales — el
  interruptor solo aparece tras el primer «Calculate». Activarlo de verdad
  exige nueve pasos entre dos pestañas, descubiertos en vivo junto al dueño
  y ya implementados y verificados contra la web real.
- **D44: el nombre real del paciente viaja a EVO, Barrett y Kane.** Petición
  expresa del dueño (27/08/2026), confirmada DOS VECES tras dos avisos: el
  primero sobre que el informe nunca había llevado ese dato (D23); el
  segundo, más serio, sobre que esto manda un dato de salud identificado a
  tres servidores externos por internet en cada cálculo. El dueño confirmó
  las dos veces, informado.
- **D43: excepción estrecha a «compara, pero no recomienda».** Bajo cada
  captura y en un cuadro final se enseña una estimación PROPIA de lente, con
  un criterio clínico fijo, siempre marcada como no vinculante. Petición
  expresa del dueño (26/08/2026), con el pushback más serio de la sesión:
  existe un test dedicado (`comparar.test.ts`) que vigila justo que esto no
  pase. El dueño, informado, decidió seguir adelante aceptando la condición
  de que sea opcional y no vinculante. `CLAUDE.md` y `.claude/CLAUDE.md`
  llevan la enmienda explícita de esta única excepción.
- **D41: el nombre del cirujano viaja a las tres calculadoras; el del
  paciente sigue sin viajar nunca.** Petición expresa del dueño (25/08/2026),
  con pushback explícito: el código dejaba ese campo vacío a propósito,
  agrupado bajo la misma regla que protege al paciente. Informado de que
  esto la reabre solo para el cirujano, decidió seguir adelante.
- **D42: cuestionario simplificado como alternativa a cargar un documento**,
  con solo los campos que usan las tres calculadoras. Las dos vías —cargar
  archivo o escribir a mano— igual de visibles desde el principio.
- **D38: el objetivo de refracción (target) arranca siempre en 0, editable,
  sin pedir confirmación si se deja así.** Petición expresa del dueño
  (25/08/2026), con pushback explícito de por medio: es la primera vez que
  el programa rellena un dato ausente, y se le explicó por qué eso es
  justo lo que el proyecto evita. Decidió seguir adelante informado del
  riesgo — la mayoría de sus casos van a emetropía.
- **D39: el PDF final se reduce a capturas + lente recomendada + aviso de
  fallo. Sustituye a D37 al día siguiente.** El informe detallado (portada,
  tabla, alternativas, biometría, diagramas, trazabilidad) no se borra —se
  queda en el código como `generarHtmlInformeDetallado`, sin usarse.
- **D40: casillas para elegir con qué calculadoras calcular, antes de
  pulsar «Calcular».** El backend ya lo permitía; solo hacía falta la
  interfaz.
- **D37 (24/08/2026): el informe lleva primero una captura de pantalla tal
  cual del resultado de cada calculadora.** Superada por D39 al día
  siguiente, pero la decisión de origen sigue registrada.
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

---

## 7. Lo siguiente, por orden de importancia

1. **Varios biómetros por el mismo ojo, con sus propios cálculos, y el
   informe partido en un PDF por ojo.** Pedido el 27/08/2026, investigado
   a fondo esa misma tarde pero sin empezar a construir — es un cambio de
   modelo de datos, no una ampliación: hoy `Caso.ojos`
   (`packages/domain/src/modelo/caso.ts`) admite **un único** conjunto de
   medidas por ojo, y de ahí se propaga a cómo se calcula
   (`servicio-casos.ts`), cómo se revisa (`PanelRevision.tsx`) y cómo se
   genera el informe (`packages/report`) — unos 15-20 ficheros tocados.
   Diseño recomendado: `OjoBiometrico` gana un campo `aparato: string`
   (texto libre; el desplegable ofrece los aparatos conocidos —ANTERION,
   IOLMaster 700, Pentacam— más «Otro»), `Caso.ojos` pasa a
   `Partial<Record<Lateralidad, readonly OjoBiometrico[]>>`, y
   `generarPdf()` llama a `documentoDeHojas` una vez por ojo en vez de una
   vez por caso. **Antes de empezar, decidir con el dueño**: ¿confirmar
   exige que TODOS los aparatos de TODOS los ojos estén revisados, o se
   puede calcular uno mientras otro sigue a medias?; ¿avisa el programa si
   dos aparatos dan datos muy distintos para el mismo ojo?; ¿el cuadro
   comparativo final (D43) compara solo dentro de cada aparato, o también
   entre aparatos (riesgo de rozar otra vez «no recomienda»)?
2. **Seguir probando la lectura con informes reales anonimizados** —
   ANTERION y Pentacam en particular, que siguen sin ningún documento real.
   El de IOLMaster (25/08/2026) encontró y corrigió un fallo de verdad; con
   uno solo no basta para darlo por validado.
3. **Añadir la opción de córnea post-cirugía refractiva (LASIK/PRK/RK) o
   queratocono**, con selección automática en los desplegables propios de
   EVO y Kane — pedido el 26/08/2026 junto con la selección de modelo, pero
   aplazado: hace falta diseñar el campo en el dominio y localizar los
   selectores reales de Kane (los de EVO ya están vistos: «Post LASIK/PRK/RK»
   y una pestaña separada de queratocono).
4. **Cerrar Kane**: aceptar sus condiciones una vez, capturar su formulario y
   ajustar el adaptador. Antes, decidir O1.
5. **Instalador de Windows.** La configuración está puesta; falta ejecutarlo
   con el Modo de desarrollador activado y comprobar el `.exe` resultante.
6. Historial de casos.
