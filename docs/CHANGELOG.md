# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [1.10.0] — 27/08/2026 (noche)

feat: estética del cuestionario manual — apartados con azules distintos,
SIA + eje de incisión a 0.25 D @ 135° por defecto (D46), cabecera más clara.

### Qué se pidió

Tres mejoras al cuestionario de entrada 100% manual: (1) un color de fondo
azul distinto por apartado, para distinguirlos de un vistazo — hoy solo un
`<h3>` los separaba y los tres se veían idénticos; (2) que el SIA salga ya
con 0.25 D @ 135° por defecto, editable, igual que el objetivo de
refracción ya sale en 0 (D38); (3) que el nombre del paciente y qué ojo se
está editando se vean muy claros al principio.

### Cómo se hizo

- **Colores**: tres variables CSS nuevas (`--grupo-biometria`,
  `--grupo-lente`, `--grupo-cornea`, en `estilos.css`) y una clase
  `.grupo-manual` con un modificador por apartado. `FormularioManual.tsx`
  gana un campo `clase` en cada entrada de `GRUPOS` para elegir el suyo.
- **SIA por defecto (D46)**: mismo mecanismo que D38 — un valor mostrado
  antes de escribir nada (`VALOR_POR_DEFECTO`, en `CampoManual`) y una red
  de seguridad al pulsar «Continuar» que lo guarda de verdad si el ojo
  tiene algún dato y el campo sigue sin tocar. `EJE_INCISION` (el eje que
  acompaña al SIA — no hay un `SIA_EJE` separado) recibe el mismo trato,
  con 135°. Ampliado también al camino de documentos: `conTargetPorDefecto`
  en `servicio-casos.ts` se convierte en `conValoresPorDefecto`, cubriendo
  los tres campos (target, SIA, eje) en vez de solo el target — el SIA
  nunca lo mide un biómetro, así que nunca hay nada real que este cambio
  pueda pisar.
- **Cabecera más clara**: la tarjeta «Quién es» gana un acento (borde
  izquierdo en azul, clase `.tarjeta-destacada`) que la marca como lo
  primero a rellenar; el selector OD/OS se agranda (`.selector-ojo.grande`)
  y lleva delante la etiqueta «Editando:».

Lint, typecheck y build en verde. Documentado como D46 en
`SYSTEM_VISION.md`, ampliando D38.

---

## [1.9.2] — 27/08/2026 (noche)

fix: Barrett con córnea posterior — margen de espera más largo antes de leer
el resultado, y el cilindro de cada opción se lee por su propia designación,
no solo por la que Barrett destaca.

### El fallo de la comprobación de «Measured PCA»

La 1.9.0 añadió una comprobación que esperaba a ver el texto «Measured PCA»
antes de aceptar el resultado, para detectar un postback lento que dejara el
cálculo en «Predicted PCA» sin avisar. Probada contra la web real repetidas
veces, **rechazaba cálculos que ya estaban bien**: esa etiqueta se ve en
pantalla pero no está en el texto real de la página (`innerText`) —
probablemente una imagen o contenido generado por CSS—, así que ninguna de
las cuatro formas que se probaron de leerla (texto literal, con `\s*` para
espacios no estándar, volviendo a buscar la pestaña, mirando el interruptor
del formulario) la encontraba nunca, aunque las capturas de pantalla del
momento exacto del fallo mostraran el resultado correcto.

Se quitó la comprobación entera. Lo único que quedó fue alargar el margen de
espera fijo antes de leer la tabla (de 4 a 6 segundos para esta variante) —
verificado dos veces seguidas con éxito contra la web real. Detalle completo
en el log de lecciones, 2026-08-27 (noche).

### El cilindro que faltaba en la estimación propia

Con ese fallo ya resuelto, el dueño encontró uno nuevo probando la
aplicación: en Barrett con córnea posterior, la estimación propia de
Calculator Vilamar (D43) a veces salía con esfera pero **sin cilindro ni
eje**, aunque Barrett sí los diera. Causa: `leerResultado()` solo copiaba el
cilindro de la tabla tórica a la fila que Barrett destaca (la del medio); las
otras dos filas de potencia se quedaban sin cilindro aunque compartieran la
misma designación (T3, T4…) que la destacada — y el criterio propio de D43
puede elegir una esfera distinta a la que Barrett señala, así que esa esfera
se enseñaba coja. Corregido para que cada fila reciba el cilindro que le
corresponde por su PROPIA designación, no solo la destacada. Verificado
contra la web real: las tres filas de dos cálculos distintos, las seis con
su cilindro y eje ya presentes.

Con estos dos arreglos, 617 tests, typecheck, lint y build en verde, y D45
probado de punta a punta en la aplicación real por el dueño del proyecto,
con las cinco casillas, ambos cálculos de Barrett y su cuadro comparativo
final saliendo correctos.

---

## [1.9.1] — 27/08/2026

fix: la tabla comparativa, el cuadro final del PDF y «Reintentar» ya
enseñan las cinco casillas cuando el ojo tiene córnea posterior — y se
quita la insignia «Más cercana entre las tres» del cuadro final (D43).

### Lo que estaba mal

Tres sitios distintos —`PanelResultados.tsx` (tabla en pantalla),
`recopilar.ts` (cuadro comparativo del PDF) y los botones de «Reintentar
una sola»— tenían la lista de calculadoras «de las tres»
(`EVO_TORIC`/`BARRETT_TORIC`/`KANE`) escrita a fuego. Con las variantes de
córnea posterior de D45 ya calculándose, sus resultados existían pero no
aparecían en ninguna pantalla —ni siquiera como fallo si algo salía mal—:
no había ningún sitio donde verlos, cosa que llevó a diagnosticar el fallo
real de Barrett con más vueltas de las necesarias.

### Cómo se hizo

- **Nueva función de dominio** `columnasComparativa(caso, ojo)`
  (`packages/domain/src/modelo/caso.ts`): decide, por ojo, si hay que
  añadir la variante de EVO o de Barrett — mirando si ese ojo tiene de
  verdad PK1 o PK2, la misma condición que ya usaba el motor de cálculo.
  Los tres sitios de arriba la usan ahora, así que no pueden decidir cosas
  distintas entre sí.
- Además, a petición expresa del dueño del proyecto: se quitó
  `masCercanaEntreLasTres()` y la insignia que marcaba una tarjeta del
  cuadro final (D43) como la más cercana a las demás. Cada tarjeta sigue
  enseñando su propia estimación; ninguna se señala ya como preferente.
- 340 tests (report + domain), typecheck y lint en verde.

---

## [1.9.0] — 27/08/2026

feat: Barrett Toric también se calcula dos veces cuando el ojo tiene córnea
posterior (D45) — corrige el aviso de la versión anterior, que daba el campo
por inexistente.

### La corrección

La 1.8.0 (más abajo) dejó a Barrett fuera de D45 por un motivo concreto:
revisando el adaptador y el HTML inicial de `calc.apacrs.org` no aparecía
ningún campo de córnea posterior. Esa conclusión era **equivocada**, y el
dueño del proyecto la corrigió con capturas reales: Barrett sí tiene un
interruptor «Measured PCA» — pero solo aparece DESPUÉS del primer
«Calculate» de un cálculo normal, nunca en el formulario recién cargado.
Ninguna revisión que solo mire el HTML inicial iba a encontrarlo.

Activarlo de verdad —no solo marcarlo, que dejaba el cálculo calculando en
silencio con «Predicted PCA» de todos modos— exige una secuencia de nueve
pasos que cruza dos pestañas, con dos botones «Calculate» distintos:

1. Rellenar el formulario normal y pulsar «Calculate» (`Button1`) — solo
   entonces aparece el interruptor.
2. Marcar «Measured PCA», lo que revela el panel «Measured Posterior
   Cornea».
3. Rellenar sus 4 campos (Flat K / eje, Steep K / eje) — ordenados por
   módulo, igual que ya hacía EVO: el dominio no garantiza que PK1 sea
   siempre el meridiano más plano.
4. Pulsar el «Calculate» DE ESE PANEL, que es un botón distinto (`Button4`,
   no `Button1`) — descubierto volcando sin filtrar todos los botones de la
   página, porque ni la vista ni el nombre lo delataban.
5. Abrir la pestaña «Toric IOL».
6. Pulsar «Calculate» otra vez — ahí sí es `Button1`, que existe de nuevo
   en esa pestaña.
7. Abrir «Toric IOL» una segunda vez — solo entonces el resultado refleja
   «Measured PCA» de verdad.

Descubierta en vivo, con el dueño del proyecto probando la web real a la
vez que Claude, comparando capturas de pantalla en cada paso.

### Cómo se hizo

- **`AdaptadorBarrettToric`** ya tenía el mecanismo de D45 preparado
  (constructor con `conCaraPosterior`, getters para `calculadora`/`nombre`,
  la nueva calculadora `BARRETT_TORIC_CON_CARA_POSTERIOR` en el dominio) —
  lo que faltaba era que `rellenarCaraPosterior()` completara la secuencia
  real en vez de pulsar el botón equivocado (`Button1`) y parar ahí.
- Nuevo selector `SEL.calcularCaraPosterior` (`#MainContent_Button4`),
  distinto de `SEL.calcular` (`#MainContent_Button1`).
- El último paso —abrir «Toric IOL» por segunda vez— no se repite dentro de
  `rellenarCaraPosterior()`: lo hace `abrirPestanaResultados()`, que ya
  existía para cualquier cálculo de Barrett. Un solo sitio hace ese clic.
- Verificado contra la web real: mismo caso, «Predicted PCA» dio cilindro
  1.5 D @ 84°, «Measured PCA» (mismo PK1/PK2) dio cilindro 2.25 D @ 177° —
  resultados distintos, confirmando que el paso de más cambia de verdad el
  cálculo. 617 tests, typecheck, lint y build en verde.

---

## [1.8.0] — 27/08/2026

feat: EVO Toric se calcula dos veces cuando el ojo tiene córnea posterior —
con y sin ella (D45), para poder ver el efecto real de ese dato.

### Qué se pidió

El dueño del proyecto pidió que, para EVO y Barrett, cuando el caso tenga
datos de córnea posterior se calcule dos veces: una con esos datos y otra
sin ellos, mostrando las dos hojas seguidas en el informe. Automático, sin
casilla nueva que marcar.

### Un aviso antes de tocar Barrett — ⚠️ corregido en la 1.9.0

> Esta sección se conserva tal como se escribió, porque la conclusión era
> equivocada y el error interesa tanto como el acierto. Ver **1.9.0**, más
> arriba, para lo que de verdad pasaba.

Revisando el adaptador de Barrett y todas las capturas reales de esta sesión
para localizar su campo de córnea posterior, **no existe tal campo** en
`calc.apacrs.org` (la calculadora que usa este programa) — ni en el
formulario, ni en el HTML, ni en ninguna captura. Existe una calculadora
distinta de la ASCRS, «Barrett True K Toric», pensada para córneas
irregulares, pero es otra web y otro adaptador. Se ha implementado solo la
parte de EVO, y se ha dejado escrito en `SYSTEM_VISION.md` (D45) que Barrett
queda pendiente de confirmar con el dueño antes de inventar un campo que tal
vez no es el que él tiene en mente.

### Cómo se hizo

- **Nueva calculadora en el dominio**: `EVO_TORIC_SIN_CARA_POSTERIOR`. No es
  una cuarta calculadora que se elija a mano —no está en `CALCULADORAS`, la
  lista que gobierna las casillas—, es una variante que se calcula sola.
- Su ficha (`FICHAS.EVO_TORIC_SIN_CARA_POSTERIOR`) es idéntica a la de EVO
  salvo que sus campos opcionales no incluyen PK1/PK1_EJE/PK2/PK2_EJE. Como
  `prepararEntradas()` ya construye las entradas campo a campo según la
  ficha, esto basta para que esta variante nunca reciba la córnea posterior
  — no hizo falta tocar ningún adaptador ni duplicar ningún selector.
- **`packages/integrations/src/variante-sin-cara-posterior.ts`** (nuevo):
  `AdaptadorSinCaraPosterior` envuelve el adaptador real de EVO y solo
  reetiqueta el resultado con la calculadora de la variante — si no, el
  resultado saldría marcado como `EVO_TORIC` y pisaría al de la ejecución
  CON córnea posterior, porque los resultados se guardan por calculadora.
- **`servicio-casos.ts`**: `calcular()` añade la tarea de la variante justo
  después de la de EVO, por cada ojo que de verdad tenga PK1 o PK2 —nunca
  en un ojo sin ese dato, porque sería calcular lo mismo dos veces—.
  `recopilarResultadosParaInforme()` la intercala en el sitio justo para que
  las dos hojas salgan seguidas, y el cuadro final orientativo (D43) sigue
  comparando solo EVO, Barrett y Kane: la variante nunca entra ahí, porque
  su propio texto («entre las tres») dejaría de ser exacto.
- Verificado contra la web real: mismo caso, con córnea posterior 22.5 D /
  cilindro 3, sin ella 22.0 D / cilindro 2.25 — resultados distintos, cada
  uno guardado y mostrado bajo su propia clave. 612 tests, typecheck, lint,
  build y los 28 tests de interfaz, todos en verde.

---

## [1.7.0] — 27/08/2026

feat: el nombre real del paciente viaja a EVO, Barrett y Kane (D44) —
reversión expresa de una regla de privacidad, confirmada dos veces.

### Qué se pidió, y por qué se hizo pushback dos veces

El dueño del proyecto pidió que el informe muestre el nombre real del
paciente en vez del código local. Se le explicó que el informe **nunca**
lleva el nombre del paciente, a propósito, desde el principio del proyecto
(D23), y que eso convierte cualquier PDF compartido en un documento de salud
identificado. El dueño mantuvo la petición.

Al concretar el alcance salió que la petición era más amplia de lo que
parecía: no era solo sobre las páginas que genera el propio programa, sino
sobre lo que ya se ve en las capturas de EVO/Barrett/Kane — que el nombre
real **llegue a esas tres webs**, no solo que se muestre en un PDF local. Se
hizo un segundo aviso, más serio, dejando claro que eso manda un dato
identificativo de salud a tres servidores externos por internet en cada
cálculo, algo que ninguna decisión anterior había hecho (ni D41, que abrió
esa puerta solo para el nombre del cirujano). El dueño confirmó las dos
veces, informado.

### Cómo se hizo

- `Caso.nombrePaciente` ya existía (12/08/2026, para deducir el sexo) — ahora
  también fluye hasta `EntradasCalculadora.nombrePaciente` en
  `prepararEntradas()`, igual que `nombreCirujano` desde D41.
- Los tres adaptadores mandan `entradas.nombrePaciente ?? entradas.codigoCaso`
  al campo de nombre de cada web —así que un caso sin nombre de paciente
  sigue funcionando exactamente como antes—, y el código local del caso pasa
  al campo de identificador de cada una (`Patient Identifier` en EVO, `ID` en
  Kane; en Barrett no se ha localizado su selector real, sigue vacío).
- D23 queda marcada como superada para este dato concreto — el resto de sus
  protecciones (nunca en el repositorio, nunca en un fixture) no se tocan.
- Verificado contra la web real de EVO: el campo «Patient Name» acepta y
  conserva el nombre, «Patient Identifier» el código, «Surgeon» el nombre del
  cirujano — los tres a la vez, sin conflicto.

---

## [1.6.2] — 26/08/2026

fix(evo): la escalera tórica completa, y el cilindro residual en la misma
notación que Kane y Barrett.

### Qué pasaba

Con un segundo PDF real, el dueño detectó que el cilindro estimado de EVO
(3.00 D) no seguía el criterio pedido: según la tabla, el 2.25 D tenía el eje
«raro» (176°) y el 3.00/3.75 D coincidían con la córnea (86°) — así que
2.25 debería quedar descartado, no elegido. Dos causas, una detrás de otra:

1. **El adaptador solo leía UNA fila tórica** (la que EVO destaca), nunca la
   escalera completa — así que el criterio propio no tenía de verdad tres
   opciones entre las que elegir, solo repetía lo que EVO ya había marcado.
2. **EVO enseña el astigmatismo residual en cilindro NEGATIVO por defecto**
   (tiene un interruptor «−ve cyl / +ve cyl» en su propia página), mientras
   que Kane y Barrett lo dan en positivo. Con notación negativa, el eje sale
   desplazado 90° respecto a la notación positiva — es una transposición
   óptica estándar, no un dato distinto — así que comparar ese eje contra el
   eje curvo (que no tiene noción de signo de cilindro) daba una lectura al
   revés: lo que en negativo parecía «coincide» en positivo es lo que
   diverge, y viceversa.

### Cómo se arregló

- `evo.ts` ahora lee las tres filas de la escalera tórica (`LblToric{i}`,
  `LblToricAxis{i}`, `LblResiCyl{i}`, IDs comprobados contra la web real), no
  solo la destacada.
- Antes de leer cualquier cilindro o eje, se pulsa el interruptor «+ve cyl»
  de EVO (`#RadioBtnCyl_1`) — es un cambio de notación en el propio cliente,
  no un recálculo, y se espera a que el valor cambie de verdad en el DOM
  antes de seguir leyendo.
- Verificado contra la web real con los números exactos del segundo PDF: la
  estimación pasó de 3.00 D a **2.25 D**, coincidiendo con el criterio.

---

## [1.6.1] — 26/08/2026

fix: dos fallos reales, encontrados con un PDF de un cálculo hecho a mano.

El dueño del proyecto probó las tres calculadoras con datos manuales y mandó
el PDF resultante. Dos cosas no cuadraban:

### 1. La estimación de Kane salía mal con su propia tabla

Kane pinta su escalera de potencias de MAYOR a menor (24.0 D primero, 22.0 D
al final) — EVO la pinta al revés. `estimarLenteRecomendada()` cogía «la
primera del array» confiando en que ya viniera ordenada de menor a mayor
potencia, así que en Kane cogía 24.00 D (la primera del array, que ya era
negativa) en vez de 22.50 D (la primera negativa subiendo de verdad desde la
más baja). **`packages/domain/src/comparacion/recomendacion.ts`**: ahora se
ordena explícitamente por esfera (y por cilindro, en la parte del eje) antes
de recorrer las opciones, sin fiarse nunca del orden en que llega cada
calculadora. Nuevo test de regresión con la tabla real de Kane.

### 2. EVO seguía sin calcular con la córnea posterior, en un caso distinto al de ayer

Con PK1 = 6.00 y PK2 = 5.90 (el módulo ya corregido ayer), EVO seguía sin
devolver nada. Aislado probando las cuatro combinaciones posibles (con lente
elegida / sin elegir, y con PK1 mayor o menor que PK2): la lente no influye
nada, y **EVO exige que PK1 sea MENOR que PK2 en módulo** para calcular —
justo lo contrario de lo que dice su propio aviso en pantalla, «* PK1 > PK2»,
que resultó ser engañoso. El dominio no garantiza que PK1 sea siempre el
meridiano más plano (eso depende de qué escriba la persona, o de cómo lo
llame el aparato). **`evo.ts`**: si `|PK1| > |PK2|`, se intercambian valor y
eje SOLO al mandárselos a EVO — el caso guarda sus PK1/PK2 tal cual los
tenía, en ningún otro sitio del programa se tocan.

Verificado contra la web real con las cuatro combinaciones por separado, y
con los números exactos del PDF que mandó el dueño.

---

## [1.6.0] — 26/08/2026

feat: estimación propia de la lente (D43), no vinculante, bajo cada captura
y en un cuadro final.

### Qué pide esto, y por qué es delicado

El dueño del proyecto pidió que, bajo cada pantallazo, se enseñe una lente
«recomendada» calculada con su propio criterio —«coger la esfera primera
negativa y el primer cilindro con el mismo eje que el eje curvo»— y que se
aplique siempre, esté o no de acuerdo con lo que la calculadora haya
destacado. También pidió un cuadro final con las tres estimaciones lado a
lado y cuál se aproxima más entre las tres.

Esto choca de frente con una regla de la constitución del proyecto:
**«compara, pero no recomienda»**. `packages/domain/src/comparacion/comparar.ts`
tiene un test (`el producto compara, no recomienda`) que existe justo para
evitar esto — su propio docstring dice «ni la primera, ni la más cercana a
cero» sería una regla nuestra. Se le explicó al dueño antes de tocar nada, y
decidió seguir adelante, aceptando que el cuadro final —y, por coherencia,
también la línea de cada captura— se marquen siempre como **opcionales y no
vinculantes**. Documentado como **D43** en `SYSTEM_VISION.md`, con enmienda
explícita de `CLAUDE.md` y `.claude/CLAUDE.md` (la única excepción, estrecha,
a esa regla).

### Cómo se hizo

- **`packages/domain/src/comparacion/recomendacion.ts`** (nuevo, deliberadamente
  separado de `comparar.ts`, con su propio docstring explicando la diferencia):
  `ejeCurvoDe(ojo)` calcula el meridiano más curvo de la córnea a partir de
  K1/K2 y sus ejes; `estimarLenteRecomendada(opciones, ejeCurvo)` aplica el
  criterio — sin inventar una esfera si ninguna opción tiene refracción
  prevista negativa, y sin inventar un cilindro si no hay eje curvo o
  ninguna opción tórica comparte su orientación. El mismo criterio sirve
  para las tres calculadoras sin caso especial: con una sola fila tórica
  (EVO, Barrett) esa fila hace de «última que coincide»; con una escalera
  (Kane) se recorre entera.
- **`servicio-casos.ts`**: `recopilarResultadosParaInforme()` ya no usa
  `resultado.recomendada` (lo que la web destacó) para la línea del informe:
  siempre llama a `estimarLenteRecomendada`, de acuerdo o no con la web.
- **`packages/report/src/plantilla.ts`**: la línea bajo cada captura dice
  ahora «Estimación de Calculator Vilamar (no vinculante)», nunca «lente
  recomendada» a secas, para no confundirla con lo que la calculadora
  destacó. Nuevo cuadro final (`hojaResumenFinal`), una hoja por ojo con más
  de una estimación disponible: tres tarjetas de color, un aviso «opcional y
  no vinculante» imposible de no ver, y la que se aleja menos de las otras
  dos por su esfera marcada como «Más cercana entre las tres» — nunca «la
  elegida» ni «la recomendada».
- Verificado con 9 tests nuevos de dominio, 5 de informe (incluido uno que
  comprueba que el cuadro nunca dice «recomendamos», «debes» ni «implanta»),
  y visualmente generando un PDF sintético con las tres calculadoras.

---

## [1.5.0] — 26/08/2026

feat: EVO y Kane eligen el modelo de lente en su propio desplegable, y usan
la constante A que aparece sola al elegirlo.

### Qué pide esto

El dueño del proyecto pidió que, al elegir un tipo de lente en el caso, se
busque ese mismo modelo en la lista de EVO y de Kane —cada una tiene la
suya— y se elija. Si aparece, esa web rellena su propia constante A al
elegirlo, y esa es la que se deja: ya no se pisa con la escrita a mano.
Barrett no tiene estas lentes en su lista, así que sigue con la constante
que se escribe en el caso, sin cambios.

### Cómo se hizo

- **`evo.ts`**: ya elegía el modelo antes de escribir los números (para no
  perder la constante recién puesta). Lo que faltaba era dejar de
  sobrescribirla: ahora, si el modelo se encuentra en la lista de EVO, el
  bucle que rellena los campos se salta la constante A.
- **`kane.ts`**: no elegía ningún modelo — decisión deliberada, porque elegir
  una lente TÓRICA de su lista cambia el modo del formulario (`Toric`/
  `Non-toric`) por su cuenta, y ese modo lo decide `modoParaKane()` a partir
  de los datos del caso, no la lista de lentes. La solución: elegir el
  modelo DESPUÉS de fijar el modo por primera vez, y **reafirmar el modo
  justo después** de elegirlo, antes de escribir ningún número — no se
  pierde nada porque nada se ha escrito todavía. El desplegable de Kane
  (`#type1`/`#type2`, uno por ojo) se localizó con una sonda de solo lectura
  que reutiliza el perfil de navegador ya autorizado por el dueño del
  proyecto (sin volver a aceptar ninguna condición): 30 modelos, comprobado
  que «Alcon SN6ATx» —el mismo del fixture sintético— está en la lista.
- Verificado contra las dos webs reales con `pnpm live`: EVO pasó de
  «A Constant: 119.0» (el escrito a mano) a «A Constant: 119.2» (el propio
  de EVO para esa lente); Kane, de 119.00 a «A-Constant: 119.28», con el modo
  «Tórico» conservado tras elegir el modelo.

---

## [1.4.1] — 26/08/2026

fix(evo): el cálculo fallaba siempre que la córnea posterior tenía dato.

### Qué pasaba

El dueño del proyecto reportó que Barrett y Kane funcionaban bien pero EVO
"no hace el cálculo o falla la web". Un registro de diagnóstico real (guardado
automáticamente por el propio programa al fallar) mostró la causa exacta en
una captura de pantalla: el campo PK1 de EVO enseñaba `-6.00` en rojo con el
aviso `Range 3 to 9 D`, y el formulario se quedaba bloqueado sin devolver
ningún resultado.

El dominio guarda la córnea posterior con su signo clínico natural (negativo,
como la imprime el propio aparato). El formulario de EVO, sin embargo, exige
el **módulo** en ese campo concreto — algo que no se podía saber sin verlo
fallar con datos reales, porque ningún fixture sintético de los 254 tests
existentes tenía ese campo relleno.

### Cómo se arregló

- `packages/integrations/src/adapters/evo.ts`: al rellenar PK1 y PK2 (y solo
  esos dos campos), se manda `Math.abs(valor)` en vez del valor tal cual. El
  signo no se pierde en ningún otro sitio del programa — ni en el dominio, ni
  en el informe, ni en los otros dos adaptadores —, solo se le da la vuelta
  al mandárselo a EVO, porque es lo único que ella admite.
- `scripts/sondas/live.ts`: el fixture sintético de la sonda en vivo
  (`pnpm live evo`) no ejercitaba nunca la córnea posterior. Se le añadieron
  PK1/PK2 con signo negativo a propósito, para que un futuro cambio de EVO en
  ese campo concreto se detecte antes de que lo vea un caso real. Verificado
  contra la web real: `EVO Toric: SUCCESS`.

### Por qué importa

El primer informe con córnea posterior real encontró un fallo que ningún
test sintético había visto — el mismo patrón que la corrección de
segmentación del IOLMaster real esta misma semana. Ver
`.claude/skills/lessons-learned/log.md`.

---

## [1.4.0] — 25/08/2026

feat: cuestionario simplificado de entrada 100% manual, y el nombre del
cirujano viaja a las tres calculadoras.

### Qué pide esto

El dueño del proyecto pidió simplificar aún más la vía sin documento:

1. Dos opciones igual de visibles desde el principio — cargar un archivo o
   escribir los datos a mano —, no un botón secundario pequeño.
2. Un cuestionario con solo los campos que usan las tres calculadoras:
   nombre del doctor, nombre del paciente, tipo de lente, constante A, SIA
   y su eje, longitud axial, K1/K2 con sus ejes, ACD, LT, CCT, WTW, el
   objetivo de refracción (ya en 0, D38), y córnea posterior.
3. Que el nombre del doctor se mande también a EVO, Barrett y Kane.

Sobre el punto 3 se hizo pushback antes de implementarlo: el código dejaba
ese campo vacío a propósito en las tres webs, agrupado bajo la misma regla
que protege el nombre del paciente. El dueño, informado de que esto la
reabre solo para el cirujano —el paciente sigue sin mandarse nunca—,
decidió seguir adelante. Documentado como D41; el cuestionario en sí, D42.

### Cómo se hizo

- **`Caso.nombreCirujano`** (nuevo, junto a `nombrePaciente`) →
  **`EntradasCalculadora.nombreCirujano`** (hilado en `prepararEntradas()`)
  → cada adaptador lo rellena si lo tiene. Los tres selectores del campo
  «Doctor»/«Surgeon» se comprobaron con `pnpm reconocer` contra las webs
  reales, no se supusieron: `#TextBoxSurgeon` en EVO, `#MainContent_DoctorName`
  en Barrett, y `#Surgeon` en Kane —este último ya estaba en el código, solo
  que se dejaba vacío a propósito—.
- Nuevo método `ServicioCasos.establecerIdentificacion()` + su IPC de punta
  a punta, porque el nombre del doctor y el del paciente no son
  `CampoBiometrico`: son del caso, no de un ojo, y no había manera de
  escribirlos a mano hasta ahora (el del paciente solo se rellenaba solo,
  al leer un documento).
- **`FormularioManual.tsx`** (nuevo): el cuestionario en sí. Reutiliza
  `SelectorLente.tsx` tal cual —ya funcionaba sin ningún documento— y el
  mismo `editarMedida` que usa la pantalla de revisión, pero sin las
  columnas de Origen/Estado/Evidencia: todo lo que se escribe ahí ya es un
  dato manual, que sale confirmado por definición. Al terminar, aterriza en
  la misma pantalla de revisión de siempre.
- `ZonaSoltar.tsx`: las dos vías pasan a ser dos tarjetas del mismo tamaño,
  no un botón principal y uno secundario.
- `App.tsx`: paso nuevo `MANUAL`, entre `INICIO` y `REVISION`.

### Validación

46 tests de dominio (2 nuevos), `typecheck`, `lint`, `build` y los 28 tests
de interfaz completos, tres de ellos reescritos porque la vía manual ya no
aterriza directo en la pantalla de revisión.

**Sin probar contra las tres webs reales**: el cuestionario y el nombre del
cirujano están probados con tests y con selectores comprobados en las webs
reales, pero no con un cálculo real de punta a punta.

---

## [1.3.2] — 25/08/2026

fix(extraction): el primer informe real (IOLMaster) perdía datos cuando el
mismo ojo aparecía en dos secciones.

### El problema

El dueño del proyecto pasó un informe real de IOLMaster (Zeiss) — el primer
informe real que ve este lector — y dijo que los datos no se leían bien,
aunque el PDF era de texto nativo y perfectamente legible. Tenía razón: el
ojo derecho perdía la longitud axial (AL) entera y los ejes de K1/K2; el
izquierdo, por pura casualidad de cómo caía el texto, salía bien.

**Anonimizado antes de tocar cualquier fichero del proyecto**: nombre y
fecha de nacimiento sustituidos por marcadores sintéticos, nunca llegaron a
un test ni a un commit.

### La causa

El informe real trae DOS secciones por ojo: un resumen (con la AL, sin eje)
y una «Transcripción detallada» (con el eje, sin la AL) — el mismo ojo, dos
vistas complementarias, no una repetición. `segmentarPorSecciones`
(`packages/extraction/src/parsers/segmentar.ts`) ya sabía que un rótulo de
ojo puede repetirse, pero para ese caso se quedaba con el trozo de texto MÁS
LARGO —pensada para descartar una mención de paso («ver comparación
OD/OS»)— y esa heurística no contemplaba dos secciones reales con datos
complementarios: quedarse con una perdía lo que solo estaba en la otra.

### La corrección

`segmentarPorSecciones` ya no elige un trozo y descarta el otro: los junta,
en el orden en que aparecen. Es seguro porque `aplicarReglas` (nucleo.ts) ya
se queda con la PRIMERA aparición de cada campo — así que el resumen aporta
la AL y la sección detallada aporta el eje, sin tener que decidir cuál de
las dos es «la buena».

### Validación

Reproducido con un test desechable (borrado tras confirmar) contra
`interpretarTexto`, la misma función que usa la aplicación, con el texto
real anonimizado. `typecheck`, `lint` y los 589 tests de la suite en verde,
sin ninguna regresión en los fixtures sintéticos existentes.

**Sigue abierto:** es un informe de un aparato de los tres (ANTERION y
Pentacam siguen sin ningún documento real), y ha llegado como texto pegado
en la conversación, no subido y procesado de punta a punta por la
aplicación. Ver O5 en `SYSTEM_VISION.md`.

Lección registrada en `.claude/skills/lessons-learned/log.md` (25/08/2026,
tarde): una heurística de «si se repite, me quedo con el mejor» necesita
preguntarse qué pasa cuando las dos repeticiones son buenas pero distintas.

---

## [1.3.1] — 25/08/2026

fix(kane): la captura de resultado salía con la tabla en blanco.

### El problema

Probando el cambio anterior (1.3.0) contra las tres webs reales: la captura
de EVO y la de Barrett salían bien; la de Kane salía con la cabecera de
entradas rellena pero las tablas de potencias y de opciones tóricas con las
filas vacías. El resultado numérico que el programa leía de esas mismas
tablas siempre fue correcto — la extracción no fallaba, solo la foto.

Diagnosticado abriendo los PNG reales guardados en
`%APPDATA%\calculator-vilamar\capturas`, no por suposición.

### La causa

El código esperaba una sola señal antes de leer y fotografiar: que el aviso
«Processing…» de Kane se escondiera. Esa señal dice que Kane ha terminado de
calcular, no que el navegador ya haya pintado la tabla en pantalla — el dato
ya estaba en el DOM (por eso la lectura funcionaba) antes de que el pintado
visual de esa tabla hubiera terminado.

### La corrección

`packages/integrations/src/adapters/kane.ts`: entre esperar a «Processing…»
y leer/fotografiar, se añade una espera a una condición real —que la
primera celda de la tabla de resultados de ESE ojo tenga texto— con
`page.waitForFunction`, no un `waitForTimeout` a ciegas. Si esa condición no
llega nunca, el camino de error que ya existía sigue actuando exactamente
igual que antes de este cambio.

### Validación

`typecheck` y `lint` en verde. 70 tests de `packages/integrations` y los 15
tests de interfaz de Kane (`kane-resultado.spec.ts`, `kane-transicion.spec.ts`)
en verde, sin más lentitud apreciable. **Sin volver a probar todavía contra
la web real de Kane** — hace falta un cálculo real más para confirmarlo del
todo.

Lección registrada en `.claude/skills/lessons-learned/log.md`
(25/08/2026): que un dato ya esté en el DOM no significa que la pantalla ya
lo enseñe pintado.

---

## [1.3.0] — 25/08/2026

Simplificación radical del informe: solo capturas, lente recomendada y
aviso de fallo. Elegir calculadoras antes de calcular. El target arranca en 0.

### Qué pide esto

Tras ver la aplicación funcionando de verdad contra las tres webs, el dueño
del proyecto pidió ir mucho más lejos que el cambio del día anterior (1.2.0):

1. **El PDF final lleva SOLO capturas + lente recomendada + aviso de fallo**
   — nada de tabla comparativa, alternativas, biometría, diagramas del ojo
   ni trazabilidad.
2. **Casillas para elegir con qué calculadoras calcular** antes de pulsar
   «Calcular» — una, dos o las tres.
3. **El objetivo de refracción (target) arranca siempre en 0**, editable.

Sobre el punto 3 se hizo pushback explícito antes de implementarlo: es la
primera vez que el programa rellena un dato ausente, y eso es justo lo que
las reglas fundacionales del proyecto (D3, D20, el principio rector) dicen
que no se hace, ni con cero. El dueño, informado del riesgo, decidió seguir
adelante — documentado como D38 en `SYSTEM_VISION.md`, con la misma
honestidad que D36 en su momento.

### Cómo se hizo

- **El target en 0** reutiliza el mecanismo que el dominio ya tenía:
  `corregirMedida` escribe un valor `MANUAL`, y un valor manual ya sale
  confirmado sin más — no hizo falta ningún mecanismo nuevo. Se aplica en
  `servicio-casos.ts` (`cargarDocumentos()`, solo si el documento no trae ya
  la refracción objetivo) y en `App.tsx` (`empezarAMano()`, el flujo 100%
  manual).
- **Las casillas de calculadoras** son solo interfaz: el backend
  (`ServicioCasos.calcular(calculadoras?)`, `planificarCaso`) ya aceptaba un
  subconjunto. `PanelCalculo.tsx` añade el estado local y los tres
  interruptores.
- **El informe simplificado** es una función nueva y pequeña en
  `packages/report/src/plantilla.ts`. La función `generarHtmlInforme`
  anterior —con portada, tabla comparativa, alternativas, biometría,
  diagramas del ojo y trazabilidad, de una feature ya fusionada a `master`—
  se renombra a `generarHtmlInformeDetallado` y se conserva intacta, sin
  usarse por defecto. Las dos comparten la infraestructura de numeración y
  serialización de hojas, extraída a `documentoDeHojas`.
- `CapturaInforme` se convierte en `ResultadoInforme`, con `recomendada?` y
  `fallo?` añadidos. `servicio-casos.ts` ya no salta en silencio las
  casillas sin resultado utilizable: genera una entrada igual, con el aviso
  de por qué.

### Validación

589 tests en verde, `lint`, `typecheck`, `build` y `test:e2e` (26 de 27 — el
que falla, «un ANTERION sin ACD la calcula», es un fallo preexistente en
`master`, confirmado reproduciéndolo también sobre `master` limpio antes de
descartarlo como ajeno a este cambio).

**Probado también contra las tres webs reales**, con un resultado mixto: EVO
y Barrett generaron su captura correctamente; **la de Kane salió en
blanco**, sin diagnosticar todavía — queda como el bloqueo más concreto
antes de cerrar esta funcionalidad del todo (ver `PROJECT_STATUS.md`).

---

## [1.2.0] — 24/08/2026

El informe lleva primero la captura de pantalla de cada resultado, tal cual
la mostró la web. El resumen comparativo se queda, pero pasa a ir después.

### Qué pide esto

El dueño del proyecto quiso simplificar lo que se entrega al final del
flujo: antes de cualquier comparación o análisis, quien lea el informe tiene
que poder ver la pantalla real que devolvió cada calculadora, sin recortar
ni interpretar. El informe comparativo (portada, tabla, alternativas,
biometría, trazabilidad) no desaparece — se queda exactamente igual, solo se
mueve para ir después de las capturas.

### Cómo se hizo

- Cada adaptador (`evo.ts`, `barrett.ts`, `kane.ts`) toma un
  `page.screenshot({ fullPage: true })` de la pantalla de resultado **justo
  después** de comprobar que es del ojo correcto — la guarda contra el ojo
  equivocado no se toca, sigue descartando el resultado antes de que exista
  ninguna captura que guardar. Se guarda con `ctx.guardarCaptura(...)`, el
  mismo patrón que ya usaba `guardarDiagnostico` para el camino de fallo.
- La lógica compartida vive en `packages/integrations/src/captura.ts`: no
  sabe HTML de ninguna web, y si fotografiar o guardar falla, no lanza — un
  resultado ya leído no se puede perder por no haberle podido hacer una foto.
- `ResultadoCalculadora.capturaId` (dominio) guarda solo la referencia, nunca
  los bytes: el dominio sigue sin `node:fs`.
- `apps/desktop/src/main/capturas.ts` guarda los PNG en
  `%APPDATA%\calculator-vilamar\capturas`, con el mismo aviso de privacidad
  que `diagnostico.ts` — la imagen puede llevar biometría, nunca un dato
  identificativo, y no sale nunca del ordenador.
- `servicio-casos.ts` (el único sitio con acceso a disco en esta cadena) lee
  los PNG y los pasa a `@vilamar/report` ya en `data:` URI; `recopilarInforme`
  y `generarHtmlInforme` siguen siendo funciones puras.
- Un resultado de éxito sin captura legible no se omite en silencio: el
  informe explica que no se pudo guardar, en vez de dejar un hueco sin decir
  por qué.

### Un test que había que arreglar de paso

El test de privacidad del informe busca subcadenas como «dni» o «nhc» en
todo el cuerpo del PDF. El base64 de una captura real puede tener cientos de
miles de caracteres, y la probabilidad de que contenga por azar una de esas
subcadenas es alta — un falso positivo esperando a pasar. `cuerpoSinPie()`
en `plantilla.test.ts` ahora descarta el contenido de los `data:` URI antes
de buscar.

### Validación

585 tests en verde (270 nuevos y modificados en este cambio), `lint`,
`typecheck` y `build` en verde. Comprobado además con un script desechable
que genera un PDF real con una captura del tamaño de viewport que usa
`orquestador.ts` (1500×1050): la imagen queda acotada dentro de la hoja A4
sin desbordar.

**Sin comprobar todavía contra las tres webs reales** (`pnpm live`): esta
sesión no ha ejecutado ningún cálculo real contra EVO, Barrett ni Kane, así
que la captura no se ha visto todavía tal y como sale de verdad de cada una.

---

## [1.1.2] — 13/08/2026

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

## [1.1.1] — 13/08/2026

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

---

## [1.1.0] — 13/08/2026

Kane ya calcula en **modo tórico**, que es lo que se estaba comparando.

### El problema real

Con Kane arreglado y devolviendo `SUCCESS`, su columna seguía a medias:

    Ojo izquierdo        Kane        EVO Toric    Barrett Toric
    Esfera               22.50 D     22.50 D      22.50 D
    Cilindro             N/A         3.00 D       3.75 D
    Eje                  N/A         84°          84°
    Modelo tórico        N/A         T5           T4
    Cilindro residual    N/A         0.31 D       0.09 D
    Eje residual         N/A         174°         6°

No era un fallo de lectura: **a Kane se le estaba pidiendo el cálculo NO tórico**,
y en ese modo solo devuelve potencia y refracción prevista. Se comparaban tres
calculadoras tóricas para una lente tórica y una de las tres no daba cilindro.

### 1 · Su modo tórico, capturado y usado

Kane tiene dos modos por ojo. Capturado el 13/08/2026 pulsando su interruptor
«Toric»: los campos son los mismos con sufijo `-t`, y aparecen tres que en no
tórico no existen —eje de K1, SIA y eje de la incisión—. Los del ojo izquierdo se
verificaron uno a uno contra la web, sin dar la simetría por supuesta.

⚠️ **El eje de K2 existe pero no admite escritura**: Kane lo deriva perpendicular
al de K1, que es lo correcto. No se le manda.

El modo lo decide `modoParaKane` **por los datos**, no por una preferencia: con el
eje de las dos K, el SIA y el eje de la incisión se pide el tórico; si falta
cualquiera de los cuatro, el no tórico, que sigue funcionando igual. Esos cuatro
campos entran en la ficha como **opcionales**, no requeridos: ponerlos requeridos
dejaría a Kane sin poder calcular en casos en los que sí puede.

### 2 · Kane no elige la tórica, y eso no se tapa

Su resultado tórico son **dos tablas**: las potencias esféricas, con una destacada
por `table-active`, y las opciones tóricas con su cilindro residual —**sin destacar
ninguna**—. Kane enseña cuánto astigmatismo quedaría con cada una y deja la
elección a quien opera.

Así que **ninguna opción tórica sale como recomendada**. Ni la de menor residual,
que era la tentación: eso sería inventarse una recomendación clínica que Kane se
guarda a propósito. La regla vive en `construirOpcionesDeKane`, aparte del
adaptador para poder probarla sin navegador, y está comprobada rompiéndola: al
cambiar `recomendada: false` por `recomendada: fila.destacada`, un test falla.

### 3 · «N/A» y «no elige» ya no se parecen

Las casillas vacías de la tabla se leían como «ha fallado». Ahora la comparativa
distingue las dos cosas con `toricasSinElegir`, y la casilla dice «3 opciones,
ninguna destacada» con la explicación al pasar el ratón. La fila «Eje» sigue como
N/A a propósito: ese dato Kane no lo da en la tabla que se lee.

### 4 · Una guarda más contra leer el ojo equivocado

El bloque de resultados se elige por posición, y el eco de la web es lo que
confirma que es el ojo correcto. Si el eco no se puede leer **y** hay resultados de
los dos ojos en pantalla, ahora se para en vez de arriesgarse.

### Comprobado de verdad

Contra la web real de Kane, ojo derecho, datos sintéticos: `SUCCESS` en 12,7 s, 8
opciones —5 esféricas y 3 tóricas—, eco `K1: 41.22 D @ 175° K2: 42.52 D @ 85°`,
modo «Tórico», y **0 tóricas marcadas como recomendadas**.

    ★ esfera 21.5 · refr -0.06
      esfera 21.5 · «Non-toric» · cil 0    · residual 0.71 D @ 84°
      esfera 21.5 · «T2»        · cil 1    · residual 0.05 D @ 84°
      esfera 21.5 · «T3»        · cil 1.5  · residual 0.28 D @ 174°

515 tests unitarios y 27 e2e en verde; lint, tipos y build también.

### Ficheros

- `packages/integrations/src/adapters/kane.ts` — `CAMPOS_TORICOS`, `modoParaKane`,
  `asegurarModo`, `leerFilaToricaDeKane`, `construirOpcionesDeKane`
- `packages/integrations/src/adapters/kane-torico.test.ts` — 30 tests nuevos
- `packages/domain/src/modelo/calculadoras.ts` — los cuatro campos, opcionales
- `packages/domain/src/comparacion/comparar.ts` — `toricasSinElegir`
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
