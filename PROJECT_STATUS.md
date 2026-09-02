# PROJECT_STATUS.md — Estado real de Calculator Vilamar

> 🟢 **Este es el archivo más honesto del proyecto.**
> Dice qué funciona DE VERDAD hoy y qué no. Si algo no está aquí marcado como
> «funciona», asume que NO funciona.
>
> Regla que gobierna este documento: **construido ≠ probado ≠ validado.**
> Que exista un adaptador no significa que se haya probado contra su web. Que se
> haya probado contra su web no significa que se haya validado con informes
> reales.

**Última actualización:** 02/09/2026 · **Kane se quedaba bloqueado al
activar Keratoconus con datos reales (fallo de D67).** El dueño probó
D67 con un caso real: EVO y Barrett True K Toric fueron bien, Kane no.
Con su pantallazo se encontró la causa exacta: Kane enseña su PROPIO
aviso («asegúrate de que el paciente tiene queratocono de verdad»), con
un botón «OK», al activar esa casilla en modo tórico — el adaptador no lo
sabía y se quedaba esperando un cambio que no llegaba porque el aviso
tapaba el control. Corregido en `asegurarKeratoconus()`: comprueba si
aparece el aviso —sale de forma inconsistente entre ejecuciones,
comprobado repitiendo la secuencia varias veces contra la web real— y lo
acepta si sale; no es una condición legal ni antirrobot, es un
recordatorio sobre un dato que el cirujano ya confirmó en la propia
pantalla de Calculator Vilamar. **No se ha vuelto a probar el caso
completo del dueño dentro de la aplicación** — haría falta repetir el
mismo cálculo real para confirmarlo del todo. Lección registrada en
`.claude/skills/lessons-learned/log.md` (02/09/2026, 3): investigar un
control nuevo solo desde el estado por defecto de la página no basta,
hay que probarlo en la misma secuencia que va a usar el adaptador de
verdad.

Antes de esto — **D67: córnea especial — Barrett
True K Toric en vez de Barrett Toric.** Un ojo con LASIK/PRK/queratotomía
radial previos, o con queratocono, se marca con un selector nuevo, por
ojo/aparato («Lente e incisión»). EVO y Kane lo usan como un campo más en
su mismo formulario (comprobado en vivo con `pnpm reconocer evo` y la
sonda de Kane: `#DropDownLASIK` en EVO, el interruptor independiente
`keratoconus_1`/`keratoconus_2` en Kane). Barrett es distinto: pasa a
calcularse con `BARRETT_TRUE_K_TORIC`, un adaptador nuevo
(`barrett-true-k.ts`) con su propia página — nunca junto a Barrett Toric
para el mismo ojo, `prepararEntradas()` las excluye mutuamente con un
aviso explícito de cuál usar. Investigado con datos sintéticos antes de
escribir el adaptador, incluido un cálculo de prueba real de punta a
punta contra la web —nunca con un paciente real—; el dueño corrigió el
rumbo inicial hacia mitad de la investigación: la página «Barrett True
K» sin cilindro que se había mirado primero NO es la que hace falta,
sino «Barrett True K Toric». **No probado todavía dentro de la
aplicación completa, con un caso real.** `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build && pnpm test:e2e` en verde (691 tests unitarios,
37 de interfaz; el único fallo unitario es el previo y sin relación en
`block-subagent-external.test.mjs`). Decisión D67 en `SYSTEM_VISION.md`.

Antes de esto — **Tercer intento de mitigar la
captura de Kane en blanco — sin verificar en vivo todavía.** El dueño
compartió un PDF real (CV-2026-0091) donde la tabla de resultado de Kane
sale vacía en la captura aunque el cálculo se leyó y se usó bien (la
estimación propia y la tabla comparativa, debajo de esa misma captura,
traen números reales). Es la MISMA flakiness de Chromium ya documentada
el 12/08 y el 27/08 —el compositor a veces no ha pintado el último cambio
del DOM cuando se pide la foto—, con dos mitigaciones previas que no
bastaron. Se ha añadido una técnica distinta —un evento de ratón real
justo antes de la foto, no ya solo esperar más tiempo o forzar un
reflow—, verificada con lint, typecheck y tests en verde, **pero NO con
un cálculo real de Kane**: su pantalla de condiciones pide una acción
humana que esta sesión no puede completar sola. Detalle completo en el
apartado 3, y en `.claude/skills/lessons-learned/log.md` (02/09/2026, 2)
— con el aviso explícito de no llamarlo «arreglado» hasta verlo en vivo.

Justo antes de esto — **D66: elegir «Ojos a calcular»,
y la constante A se copia sola al otro ojo.** Dos peticiones juntas: un
selector junto a «Calcular» para elegir los dos ojos o solo uno (visible
solo si el caso tiene datos de los dos; «Los dos ojos» activo de partida,
igual que siempre), usando el filtro por ojo que `ServicioCasos.calcular()`
ya tenía desde D47 pero que ninguna pantalla usaba; y que la constante A
escrita a mano en un ojo aparezca sola en el otro cuando comparten
aparato —en cualquiera de los dos sentidos, según cuál se toque primero—
sin pisar nunca una que ya hubiera. Investigado primero si hacía falta
tocar el selector de lente del catálogo: no, ya se aplica a los dos ojos
en el mismo movimiento desde D33; el hueco real era solo la constante
manual, y un único punto de cambio (`ServicioCasos.editarMedida()`) cubre
las dos vías de entrada porque las dos llaman al mismo método. `pnpm lint
&& pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` en verde
(685 tests unitarios, 36 de interfaz; el único fallo unitario es el
previo y sin relación en `block-subagent-external.test.mjs`). Decisión
D66 en `SYSTEM_VISION.md`.

Antes de esto — **D65: la pantalla de revisión
(documentos cargados) queda igual que el cuestionario manual.** El dueño,
probando a cargar datos ya extraídos de fotos de biometría, pidió que la
revisión dejara añadir un segundo aparato —solo lo tenía el cuestionario
manual— y que el orden de los campos coincidiera entre las dos pantallas.
`SelectorAparato.tsx` es ahora un componente compartido (antes vivía
duplicado en el manual); los tres grupos de la revisión —Biometría,
Lente e incisión, Córnea posterior— quedan en el mismo orden, con los
campos informativos de más (AQD, TK1/TK2…) que un documento sí puede
traer. **Fallo real encontrado y corregido antes de enseñarlo**:
`aparatoActivo` es un estado global compartido con cálculo y resultados,
con una corrección automática que deshacía «Añadir otro biómetro» en el
mismo instante de elegirlo — arreglado con una excepción para el paso de
revisión. Decisión D65 en `SYSTEM_VISION.md`.

Antes de esto — **D64: la barra de pasos de arriba
se puede pulsar.** Al abrir un caso terminado desde «Casos guardados»
(D63), el dueño aterrizaba en «4. Resultados» sin encontrar cómo volver a
los datos — la barra de arriba era solo un indicador, y la única vía era
un botón escondido dentro de «Reintentar una sola», en mitad de la
pantalla de resultados: «entonces, ¿de qué me sirve?». Corregido: un paso
ya alcanzado por el CASO se puede volver a pulsar; uno que no, se queda
bloqueado. **Segundo fallo encontrado y corregido antes de enseñarlo**:
la primera versión miraba la pantalla actual, no el estado real del
caso, así que volver atrás y avanzar de nuevo dejaba el botón de avance
bloqueado por error. Corregido mirando `caso.estado` directamente. `pnpm
lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` en
verde (685 tests unitarios, 33 de interfaz; el único fallo unitario es el
previo y sin relación en `block-subagent-external.test.mjs`; una
ejecución concurrente con los tests unitarios dio tres timeouts por
saturar la máquina, repetida sola en 20 s sin ningún fallo). Decisión D64
en `SYSTEM_VISION.md`.

Antes de esto — **D63: «Casos guardados» —
volver a abrir un caso ya guardado, desde la pantalla de inicio.** Tras
arreglar D62, el dueño preguntó dónde encontrar un caso para reabrirlo:
la aplicación solo conocía «el que está abierto ahora mismo» —en memoria,
se perdía al cerrar la aplicación o al reiniciarla—, aunque el fichero de
cada caso se guardaba en disco desde siempre. `leerCaso`/`listarCasos` ya
existían en `almacen.ts` sin usarse por nadie —sin tests, sin IPC, sin
botón—. Nuevo: `ServicioCasos.listarCasosGuardados()`/`abrirCaso(codigo)`,
componente `CasosGuardados.tsx` con su tabla (código, paciente, estado,
última vez tocado), y un tercer botón en el inicio junto a «Elegir
archivo» y «Escribir a mano». Al abrir, aterriza en revisión o en
resultados según cómo se dejó. De paso se corrigió, en `ZonaSoltar.tsx`,
el mismo aviso desactualizado ya corregido antes en dos sitios: seguía
diciendo que ningún nombre viaja a las calculadoras, cuando D41/D44 lo
cambiaron hace días. `pnpm lint && pnpm typecheck && pnpm test && pnpm
build && pnpm test:e2e` en verde (685 tests unitarios, 32 de interfaz;
el único fallo unitario es el previo y sin relación en
`block-subagent-external.test.mjs`). Decisión D63 en `SYSTEM_VISION.md`.

Antes de esto — **D62: fallo real corregido — una
discrepancia sin reconocer en un ojo lo dejaba sin calcular EN SILENCIO
si se confirmaba mirando el otro ojo.** El dueño reportó, con el PDF real
de un caso de dos ojos, que OS salía «sin resultados» sin explicación.
Investigado mirando el propio fichero del caso: OS tenía dos aparatos
(ZEISS IOLMaster 700 y OCULUS Pentacam) con un K2 que discrepaba 0.54 D
—por encima del umbral de 0.5 D, D47— y nunca se había reconocido. La
pantalla de revisión solo comprobaba la discrepancia del ojo que se
estuviera viendo; al confirmar mirando OD (sin problemas), el botón
estaba habilitado, y `calcular()` (D51) descartó en silencio las
casillas de OS sin bloquear el resto del caso — el diseño de D51 hizo
justo lo que se construyó, pero nadie llegó a ver la alarma antes de que
se descartara. Corregido: la pantalla de revisión ahora comprueba las
discrepancias de TODOS los ojos, no solo del activo, y bloquea
«Confirmar» sea cual sea el que se esté mirando, señalando cuál hay que
revisar. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm
test:e2e` en verde (681 tests unitarios, 31 de interfaz — nuevo test que
reproduce el caso real exacto; el único fallo unitario es el previo y
sin relación en `block-subagent-external.test.mjs`). Decisión D62 en
`SYSTEM_VISION.md`.

Antes de esto — **D61: el nombre del cirujano y el
del paciente pasan a ser obligatorios para confirmar.** El dueño pidió que
faltar cualquiera de los dos bloqueara «Confirmar datos», igual que ya
bloquea un dato imposible o una discrepancia sin reconocer — «los
calculadores lo piden siempre». Al investigar el hueco real: el bloque
«Quién es» solo vivía en el cuestionario manual, así que quien carga un
documento (la vía más habitual) no tenía ningún sitio en la interfaz para
escribir estos dos nombres — las tres calculadoras llevaban recibiendo el
código local del caso como sustituto silencioso (D44) sin que nadie lo
supiera. Nuevo componente compartido `Identificacion.tsx`, usado tanto en
el cuestionario manual como en la revisión final; de paso se corrigió un
aviso en pantalla que decía que el nombre del paciente «no se manda nunca
a ningún sitio» — dejó de ser cierto con D44 y nadie había actualizado el
texto. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm
test:e2e` en verde (681 tests unitarios, 30 de interfaz; el único fallo
unitario es el previo y sin relación en
`block-subagent-external.test.mjs`). Decisión D61 en `SYSTEM_VISION.md`.

Antes de esto — **D60: la córnea posterior puede
venir de un aparato distinto del resto de la biometría — corrige D58 el
mismo día.** Tras probar D58, el dueño avisó de un efecto no querido: al
mover el selector de aparato general dentro del recuadro «Córnea
posterior», se perdió la forma de elegir el aparato para el resto de los
datos (AL, K1/K2, ACD…). Explicó el motivo real, con las capturas de
EVO/Barrett a la vista: ese desplegable es un campo aparte de verdad, no
un espejo del general — a veces se meten los datos generales de un
aparato y la córnea posterior se ha medido con otro. Solución: dos campos
independientes. `OjoBiometrico` gana `aparatoCaraPosterior?: string`; sin
elegirlo, `dispositivoCaraPosteriorPara()` (D58) sigue usando el aparato
general, sin cambios. En el formulario manual el selector de D47 vuelve
arriba del todo, y dentro de «Córnea posterior» hay un segundo
desplegable propio, con «Igual que arriba» por defecto. `pnpm lint &&
pnpm typecheck && pnpm test` en verde (681 tests; el único fallo es el
previo y sin relación en `block-subagent-external.test.mjs`). Decisión
D60 en `SYSTEM_VISION.md`.

Antes de esto — **D59: el lector local de imágenes
corrige el giro de la foto cuando hace falta.** El dueño pasó dos fotos
reales que el lector no conseguía leer: una foto de la pantalla de un
Pentacam (ya medido como el peor caso posible del lector, 1 acierto de
20 — sin arreglo de código razonable) y un papel impreso fotografiado
girado 90° (este sí arreglable: el lector nunca corregía el giro, y
tesseract intenta leer el texto tal cual venga). Se pidió además mejorar
la lectura «hasta el 100% fiable», si hacía falta con una IA que
transformara la foto en datos — **aviso hecho antes de tocar nada**:
ninguna lectura automática, ni local ni con IA, llega al 100% sobre una
foto de móvil, y por eso ningún dato leído se confirma solo; esa
protección no se toca. Se propuso también pasar la foto por «otra IA»
externa antes de dársela al programa — rechazado con pushback: mismo
problema de privacidad que encender el lector de visión ya construido
(D26/D27), sin ningún control sobre esa otra IA y saltándose la pantalla
de revisión. Lo construido: `ProveedorDocumentos` prueba a girar la
imagen 90°/180°/270° **solo si la primera lectura ya sale poco fiable**
(el mismo umbral que ya avisaba al usuario, 60%) y se queda con la
orientación de más fiabilidad; una foto bien orientada no paga ningún
coste de más. **Verificado en vivo** contra el pipeline real: un informe
sintético girado 90° lee exactamente los mismos valores que sin girar.
`pnpm lint && pnpm typecheck && pnpm test` en verde (679 tests; el único
fallo es el previo y sin relación en
`block-subagent-external.test.mjs`). Decisión D59 en `SYSTEM_VISION.md`.

Antes de esto — **D58: EVO y Barrett
reciben también qué aparato midió la córnea posterior.** Con capturas de
pantalla de los dos formularios, el dueño pidió añadir al desplegable
«Biometer»/«Device» de Barrett qué instrumento hizo la medida —al
principio dijo que en EVO no hacía falta, corregido en el mismo turno con
una segunda captura: EVO tiene el mismo desplegable y necesita el mismo
tratamiento—. Se reutiliza el `aparato` que ya tiene cada dataset (D47),
sin campo nuevo en el formulario: `dispositivoCaraPosteriorPara()`
traduce ese aparato al texto exacto de cada web, mismo patrón que D50
para los nombres de lente. Un aparato que la web no reconoce —incluido
«Otro», texto libre— no manda nada, y el desplegable se queda en su
propio valor por defecto, igual que hasta ahora. Kane no tiene córnea
posterior (D51): no le llega este dato. Selectores comprobados en vivo,
no de memoria (`#DropDownListPK` en EVO, `#MainContent_Device` en
Barrett), y la selección **verificada en vivo** contra las dos webs
reales tras construirlo. Seis tests nuevos en
`preparar-entradas.test.ts`. `pnpm lint && pnpm typecheck && pnpm test`
en verde (mismo fallo previo y sin relación en
`block-subagent-external.test.mjs`). Decisión D58 en `SYSTEM_VISION.md`.

Antes de esto — **D57: los informes se
guardan en el Escritorio, en «Calculadora Vilamar».** El dueño preguntó
por qué la ruta de los informes era tan rara (`%APPDATA%\...`) y pidió
moverlos a una carpeta del Escritorio. **Aviso hecho antes de tocar
nada**: en este ordenador el Escritorio está sincronizado con el OneDrive
de la empresa, así que los PDF —que llevan el nombre real del paciente,
D44— empezarían a subirse solos a esa nube corporativa, algo que en
`AppData` no pasaba. El dueño, informado, decidió seguir adelante de
todas formas. El resto de datos internos del programa no se ha tocado —
solo se mueve `informes`, con su misma estructura por ojo (D53) dentro.
Se añadió una variable de entorno (`VILAMAR_CARPETA_INFORMES`) para que
las pruebas automáticas de interfaz sigan usando una carpeta desechable
en vez de escribir PDF de prueba en el Escritorio real de quien las
ejecute — **comprobado en vivo**: tras el cambio, `pnpm test:e2e` no deja
ningún rastro en el Escritorio de verdad. `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build && pnpm test:e2e` en verde (mismo fallo previo y
sin relación en `block-subagent-external.test.mjs`). Decisión D57 en
`SYSTEM_VISION.md`.

Antes de esto — **D56, un fallo real
encontrado por el dueño con un PDF de verdad, y corregido.** El «Eje» de
la estimación propia (D43) —bajo cada captura, en el cuadro «Comparación
orientativa» y en la «Tabla comparativa detallada»— salía SIEMPRE como el
meridiano corneal fijo (el mismo número para las cinco casillas de un
ojo, «Eje 0°» repetido), en vez del eje que de verdad devuelve cada
calculadora (`ejeResidual`), que sí varía por calculadora y por si hay
córnea posterior medida. El dueño lo detectó comparando su propio PDF
real —cinco «Eje 0°» idénticos— con las capturas de pantalla de encima,
que mostraban ejes distintos (4°, 3°, 4°, 2°, 5°) en el recuadro de
recomendación de cada web. Corregido: las tres pantallas ahora muestran
`ejeResidual`; el meridiano corneal fijo (`eje`) se queda como lo que
siempre fue por dentro —el criterio para ELEGIR qué fila de la escalera
tórica comparte orientación con la córnea— pero deja de enseñarse como si
fuera el resultado. Dos tests nuevos reproducen el caso real exacto.
`pnpm lint && pnpm typecheck && pnpm test` en verde (mismo fallo previo y
sin relación en `block-subagent-external.test.mjs`). Decisión D56 en
`SYSTEM_VISION.md`.

Antes de esto — **D54 y D55, las dos
peticiones que quedaban del mismo aviso, construidas y probadas.** (D54)
Botón «Volver a los datos» en la pantalla de cálculo — antes solo existía
tras ver los resultados; ahora también se puede corregir un dato justo
antes de la primera vez que se calcula, o cambiar uno o dos campos después
de ya haber calculado, sin reescribir el formulario entero. (D55) Una
segunda lente «aparcada» (`Caso.lenteSecundaria`) para comparar con la
misma biometría sin volver a escribir ningún dato — un botón «Calcular con
esta lente» la activa (con su propia constante A, resuelta con las mismas
cuatro reglas de siempre) y aparca la que estaba activa en su lugar; el
PDF ya generado de la primera lente no se pierde, solo hace falta
recalcular para sacar el de la segunda. **Verificado de punta a punta**:
30 pruebas de interfaz contra la aplicación real en verde (dos nuevas),
más 7 tests de dominio que comprueban que cada lente se queda con SU
constante sin arrastrar la de la otra. `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build` en verde (mismo fallo previo y sin relación en
`block-subagent-external.test.mjs`). Decisiones D54 y D55 en
`SYSTEM_VISION.md`.

Antes de esto — **un aviso de fallo («solo sale el
informe del segundo ojo/aparato»), investigado a fondo y resuelto — no
era una pérdida de datos.** Comprobado en tres niveles (backend directo,
la app real con los mismos clics que describió el dueño, y un cálculo
real contra EVO con tres casillas) sin encontrar ningún fallo: los dos
ojos y los dos aparatos siempre se guardaban, calculaban y generaban su
PDF correctamente. La causa real, encontrada mirando los casos guardados
de verdad del dueño: con muchos informes de muchos casos mezclados en la
misma carpeta, el segundo PDF estaba siempre ahí pero se perdía de vista
entre los demás archivos — confirmado por el propio dueño («en la
carpeta solo me aparecía uno, o eso creía yo»). **Arreglado con la mejora
que él mismo propuso**: cada informe se guarda ahora en su propia
subcarpeta según el ojo («Ojo derecho (OD)» / «Ojo izquierdo (OS)»).
Decisión D53 en `SYSTEM_VISION.md`. `pnpm lint && pnpm typecheck && pnpm
test` en verde (mismo fallo previo y sin relación en
`block-subagent-external.test.mjs`; de paso, excluida del lint la
carpeta del Chromium empaquetado, que ESLint había empezado a analizar
como código propio). **Pendientes, del mismo aviso del dueño**: (2)
poder calcular una segunda lente con los mismos datos de biometría sin
tener que volver a escribirlos; (3) poder volver al formulario a
corregir un dato antes de calcular, sin tener que recalcular desde cero.

Antes de esto — **Empaquetar la aplicación
para repartirla a otros ordenadores — a medias, bloqueado por un permiso de
Windows sin relación con el código.** El dueño quiere instalar la
aplicación en los ordenadores de sus compañeros optometristas. Primer
hueco identificado y resuelto en código: el paquete no llevaba el
navegador que usan las tres calculadoras (Playwright busca, por defecto,
una caché que solo existe en el ordenador de quien programa) — nuevo
script `scripts/preparar-navegador-empaquetado.mjs` lo descarga dentro del
proyecto (`apps/desktop/resources/playwright-browsers`, fuera del
repositorio), `electron-builder` lo incluye (`build.extraResources`) y
`apps/desktop/src/main/index.ts` le dice a Playwright que lo use ahí solo
cuando la aplicación está empaquetada (`app.isPackaged`). **Confirmado**:
la descarga funciona y deja un Chromium completo (703 MB) en su sitio.
**No confirmado todavía**: que el paquete final funcione de verdad,
porque `electron-builder` no ha llegado a generarlo — falla en este
ordenador por un permiso de Windows (crear enlaces simbólicos) necesario
para una herramienta suya (`winCodeSign`) que no tiene nada que ver con
Playwright ni con este cambio. Pendiente de que el dueño active el «Modo
de desarrollador» de Windows (Ajustes → Privacidad y seguridad → Para
desarrolladores) para poder terminar de comprobarlo. `pnpm lint && pnpm
typecheck && pnpm test` en verde mientras tanto (mismo fallo previo y sin
relación en `block-subagent-external.test.mjs`).

Antes de esto — **D52, fallo real encontrado por el
dueño con un PDF de verdad, y corregido.** El dueño probó D52 (criterio de
esfera según familia de lente) generando un informe real de EVO con una
B&L LuxSmart y mandó el pantallazo: EVO había estimado 18 D (refracción
prevista 0.77) cuando lo correcto era 19 D (refracción 0.14) — la que de
verdad no llega a cruzar a miopía. Causa: la primera implementación de
«primera positiva» tomaba literalmente el primer elemento positivo subiendo
potencia, pero del lado positivo eso es el MÁS ALEJADO de cero (al subir
potencia la refracción prevista baja de forma continua) — la mezcla exacta
de «primera» y «más cercana a cero» que sí coinciden del lado negativo
(por eso Barrett y Kane, con datos donde no se notaba, habían salido bien).
Corregido: el criterio ahora busca, del lado que toca, la refracción más
cercana a cero — no la primera de la lista — válido para los dos signos sin
caso especial. Test nuevo que reproduce exactamente la tabla del pantallazo
real. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde
(mismo fallo previo y sin relación en `block-subagent-external.test.mjs`).
**Pendiente de que el dueño confirme con un nuevo PDF que ahora da 19 D.**
Decisión D52 en `SYSTEM_VISION.md`, actualizada con este hallazgo.

Antes de esto — **D51 construido y probado**
—`pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
en verde, el único fallo de la suite (`.claude/hooks/block-subagent-external.test.mjs`)
es previo a esta sesión y no tiene relación—, **sin verificar todavía a mano
en la aplicación real** (`pnpm dev` se dejó abierto pero no se ha recorrido
la pantalla nueva con el dueño): (1) la pantalla de cálculo pasa de tres
casillas a **cinco**, cada una con su propio botón — EVO y Barrett, con
«Predicted PCA» y «Measured PCA» por separado, más Kane con uno solo,
porque su web **no tiene ningún campo de córnea posterior**, comprobado en
vivo con `pnpm reconocer:kane` antes de construir nada; (2) una **tabla de
solo lectura con los parámetros ya metidos** (AL, K1, K2, ejes, ACD, LT,
CCT, WTW, córnea posterior), un aparato por columna, encima de las
casillas, para comprobar de un vistazo antes de calcular; (3) **una
discrepancia sin reconocer en un ojo ya no bloquea calcular el resto del
caso** — antes, `calcular()` no calculaba nada si CUALQUIER ojo tenía una
alarma pendiente, aunque el otro estuviera listo; ahora se descarta solo
la casilla bloqueada. Decisión D51 en `SYSTEM_VISION.md` (D45 queda
superada por esta). Antes de construir, pushback explícito sobre un umbral
de discrepancia al 20%: se comprobó con un ejemplo real (AL 23.5 vs 24.2 mm,
2.9% de diferencia) que un 20% igual para todos los campos habría apagado
la alarma justo donde más importa — el dueño lo descartó y pidió mantener
los umbrales de hoy, con el arreglo del bloqueo de arriba en su lugar.

Antes de esto — **D48 (Kane), la causa real encontrada y corregida**: no
era la captura en blanco, era otro fallo distinto: al elegir un modelo
(p. ej. «B+L LuxSmart Toric»), Kane deja de escribir sus filas tóricas
como «T2 (1.00)»
y pasa a escribir solo el número bajo una columna con el nombre de la
lente; el lector no sabía reconocer ese formato y descartaba las tres
opciones, dando `ADAPTER_BROKEN` aunque Kane sí había calculado bien.
Corregido en `leerFilaToricaDeKane`, con dos tests nuevos que codifican el
formato real, y **confirmado en vivo** repitiendo el caso exacto que
fallaba: Kane ahora da sus 3 opciones tóricas y la captura sale correcta.
**D48 (la captura de Kane a veces en blanco), mitigado, con cautela**: la
misma sesión de investigación probó desplazar la tabla a la vista y forzar
un reflow del navegador justo antes de la foto — 4 de 4 capturas
correctas en las pruebas en vivo de esta sesión (frente a 0 de varias con
los intentos anteriores basados solo en esperar más tiempo). Es una mejora
real, pero por ser un fallo de temporización del navegador —ya demostrado
difícil de fijar con pocas pruebas, ver el log de lecciones (noche, 7)— no
se da por «resuelto al 100%» sin más uso real acumulado. `pnpm lint &&
pnpm typecheck && pnpm test` en verde (el único fallo de la suite,
`.claude/hooks/block-subagent-external.test.mjs`, es previo a esta sesión
y no tiene relación con este cambio). **D50 CONFIRMADO funcionando**:
elegir «B&L LuxSmart» en el formulario hizo que EVO usara de verdad «B&L
LuxSmart» (A-Constant 118.45, la suya, no la escrita a mano) y que Kane
usara de verdad «B+L LuxSmart Toric» con la misma constante — comprobado
leyendo el eco de cada web, tres veces. **D49 CONFIRMADO funcionando**:
calculando solo con EVO y Kane, el informe generado no menciona Barrett en
ningún sitio salvo el aviso legal fijo del pie (que siempre nombra a las
tres calculadoras como fuente, independientemente de cuáles se usaran).

Antes de esto — **D50: elegir la lente
correcta en EVO y en Kane aunque cada web la llame distinto** — EVO y Kane
ya elegían solos el modelo de lente en su propio desplegable (D26), pero
solo si las dos webs usaban el mismo texto exacto. Para varias Bausch &
Lomb no es el caso —EVO dice «B&L Aspire», Kane «B+L enVista Aspire
Toric»— así que sin darse cuenta cada calculadora podía acabar calculando
con la constante A escrita a mano en vez de con la propia de esa lente,
sin ningún aviso de que se había equivocado. Añadido `nombreEnKane` al
tipo de lente (`nombreEnEvo` ya existía, sin usarse en ningún sitio) y
una función que elige qué nombre mandarle a cada calculadora
(`nombreDeLentePara`); cinco lentes nuevas en el catálogo del selector
—Aspire, Envy, LuxGood, LuxSmart, LuxLife—, cada una con el nombre exacto
de los dos desplegables. **Verificado de punta a punta contra la
aplicación real** que elegir cada lente nueva guarda el par de nombres
correcto; **sin verificar contra las webs reales de EVO y Kane** —sin
acceso a internet desde aquí—, aunque la parte que de verdad busca en el
desplegable de cada web no ha cambiado. Dos entradas ya existentes («B&L
MX60T», «B&L MX60ET/PT») se han dejado sin tocar por no tener confirmado
su nombre en Kane — adivinarlo podría haber seleccionado otra lente en
silencio. `pnpm lint && pnpm typecheck && pnpm test` (643/643 relevantes)
y `pnpm build`, en verde.

Antes de esto — **D49: dos ajustes más sobre D47/D48** — «funciona
perfectamente» dijo el dueño del PDF rediseñado, y pidió dos cosas más:
(1) poder elegir o escribir de qué biómetro es el
PRIMER aparato de un ojo, con el mismo desplegable que ya existía para
añadir un segundo (`conAparatoRenombrado`, nuevo en el dominio); (2) que el
PDF no saque hojas ni tarjetas de una calculadora que nunca se pidió
calcular (antes, usar solo una o dos de las tres, D40, llenaba igual el
informe de «no se ha calculado» por cada una que se dejó fuera a
propósito). **Verificado el desplegable de punta a punta contra la
aplicación real** —incluido un fallo real que se encontró y corrigió en
la propia verificación: elegir «Otro…» no hacía nada, porque el
desplegable leía directamente del aparato ya guardado en vez de llevar su
propio estado de «estoy escribiendo un nombre nuevo»—. **La omisión de
calculadoras no pedidas en el PDF está verificada leyendo el código, no
con un cálculo real** —necesitaría EVO/Barrett/Kane de verdad, sin acceso
a internet desde aquí—; pendiente que el dueño la confirme calculando con
una o dos calculadoras nada más. `pnpm lint && pnpm typecheck && pnpm test`
(639/639 relevantes) y `pnpm test:e2e` (28/28), en verde.

Antes de esto — **D48: el PDF, rediseñado tras la primera prueba real de
D47** — el dueño generó su primer informe con dos aparatos, lo abrió de
verdad y pidió cinco cambios, todos hechos:
(1) título claro en cada hoja («EVO Toric — estimado» / «— con córnea
posterior medida», igual para Barrett, «Kane» sin más); (2) las hojas se
agrupan por aparato primero, no por calculadora; (3) una banda grande con
el nombre del aparato en cada hoja, cuando el ojo tiene más de uno; (4) una
hoja de biometría de entrada al principio, por cada aparato —reintroduce
parcialmente lo que D39 había quitado, documentado en SYSTEM_VISION.md
(D39 superada parcialmente por D48)—; (5) una tabla comparativa detallada
al final —aparato, calculadora, lente resultante, residuales de esfera y
cilindro, eje—, con un tono de color por aparato. **Verificado no solo con
tests: generado un informe sintético con dos aparatos y mirado hoja a
hoja, con capturas de pantalla, antes de darlo por hecho** — sin datos de
ningún paciente real. Con un solo aparato, nada de esto se nota.

**De paso, un fallo real distinto, encontrado al mirar el mismo PDF, y
⚠️ TODAVÍA SIN RESOLVER** (corregido el «un momento, siguen así» de la
entrada anterior): la tabla de resultados de Kane sale en blanco en la
captura, con el dato ya correctamente leído por debajo. El primer intento
—esperar dos fotogramas de animación reales antes de la captura— se dio
por bueno sin comprobarlo contra la web real; **al comprobarlo sí de
verdad (27/08/2026, más tarde esa misma noche, con acceso a internet
confirmado), la tabla seguía en blanco**, y se probaron además 800 ms y
3000 ms de espera fija: los tres intentos dieron el PNG idéntico, byte a
byte. Esto descarta que sea un problema de tiempo — no es que haga falta
esperar más, es que esa tabla concreta no se pinta con solo esperar. La
causa real no se ha investigado todavía (¿iframe, canvas, un color igual
al fondo, algo que solo se repinta con un resize?). Se ha dejado un margen
corto en el código (no arregla nada, pero tampoco alarga los cálculos sin
motivo) y una nota explícita en `kane.ts` para que no se confunda con
«arreglado». Detalle completo en el log de lecciones, 27/08/2026 (noche, 4
y 7) — la entrada 4 quedó incompleta y la 7 la corrige.

Antes, la misma noche — **D47: varios biómetros por el mismo ojo**: el
dueño encontró dos fallos reales probándolo por primera vez (el formulario
no se vaciaba al añadir un segundo aparato — un problema de React,
`key={campo}` sin el ojo ni el aparato, corregido en `FormularioManual.tsx`
y `PanelRevision.tsx`; y generar el PDF fallaba con `ERR_INVALID_URL` por
el tamaño del informe con dos aparatos, corregido cargando el HTML desde
un fichero en vez de una URL `data:`), los dos ya corregidos y verificados
con scripts contra la aplicación real antes de este rediseño del PDF.
Detalle en el log de lecciones, 27/08/2026 (noche, 3 y 4).

Resumen de lo construido en D47: `Caso.ojos[lado]` pasa de un único
`OjoBiometrico` a una lista, una entrada por aparato; cada aparato se
confirma y calcula de forma independiente; una alarma bloquea el cálculo de
un ojo si dos de sus aparatos, ya confirmados, dan datos que se apartan de
un umbral por campo, hasta que el cirujano la reconoce explícitamente; el
informe final junta, en un cuadro por ojo, una tarjeta por cada combinación
aparato × calculadora sin destacar ninguna; y el PDF pasa de uno por caso a
uno por ojo. Con un solo aparato (el uso de siempre) no cambia nada en
pantalla. **Cubierto por `pnpm lint && pnpm typecheck && pnpm test`
(636/636 tests relevantes) y `pnpm test:e2e` (28/28), y por `pnpm build`,
tras todas las correcciones de esta noche.** ⚠️ **Sigue pendiente que el
dueño repita la prueba completa una vez más** con el PDF ya rediseñado y
confirme que Kane sale bien en la captura; ver el apartado 3. Decisiones
D47 y D48 en SYSTEM_VISION.md. Antes de esto: estética del cuestionario
manual: los tres apartados (Biometría / Lente e incisión / Córnea
posterior) ahora se ven con fondos azules distintos, la tarjeta «Quién es»
y el selector OD/OS se distinguen como lo primero a rellenar, y el SIA +
su eje de incisión arrancan en 0.25 D @ 135° editable (D46, misma excepción
que D38 ampliada) — en los dos caminos de entrada, manual y documento
leído. Y, antes de eso, el dueño probó D45
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

### Varios biómetros por el mismo ojo (D47, 27/08/2026) — construido; un fallo real encontrado y corregido, pendiente de reprobar

Petición expresa del dueño: para el mismo paciente y el mismo ojo, meter
datos de más de un biómetro/aparato en paralelo, cada uno con su propio
cálculo, y verlos juntos en el informe final. Es un cambio de modelo de
datos (`Caso.ojos[lado]` pasa de un `OjoBiometrico` a una lista), y se ha
construido siguiendo las tres respuestas que dio el dueño antes de empezar:

1. **Cada aparato se confirma y calcula por su cuenta.** No es todo-o-nada
   por caso: un aparato puede estar a medias de revisar mientras otro, del
   mismo ojo, ya tiene resultado.
2. **Alarma de discrepancia.** Si dos aparatos del mismo ojo, ya
   confirmados, dan datos que se apartan más de un umbral por campo (AL
   0.3 mm, K1/K2 0.5 D, ACD/LT 0.3 mm, CCT 20 µm, WTW 0.5 mm —
   `packages/domain/src/comparacion/discrepanciaAparatos.ts`, valores de
   partida sin validar clínicamente todavía), el cálculo de ese ojo se
   bloquea hasta que el cirujano pulsa «Ya lo he comprobado, continuar».
3. **Un único cuadro comparativo final por ojo**, con una tarjeta por cada
   combinación aparato × calculadora, sin destacar ninguna.

El PDF pasa de uno por caso a **uno por ojo** (`generarPdf()` devuelve una
lista de rutas, no una sola).

**Con un solo aparato —el uso de todos los casos hasta ahora— no cambia
nada en pantalla**: ni selector nuevo, ni paso de más, ni un solo campo que
se comporte distinto. Es la comprobación más importante de este cambio, y
está cubierta por tests (invariante 12) precisamente porque un descuido
aquí rompería el uso normal de todo el mundo.

Cubierto por 636 tests unitarios (relevantes; hay un fallo preexistente y
ajeno en `.claude/hooks/block-subagent-external.test.mjs`, un problema de
codificación de caracteres sin relación con este cambio), `typecheck`,
`lint`, `build` y los 28 tests de interfaz (`pnpm test:e2e`), todos en
verde.

**El dueño lo probó en la aplicación real y encontró DOS fallos, los dos
corregidos la misma noche** (ver cabecera del documento y el log de
lecciones, 27/08/2026 noche 3 y 4):

1. **El formulario no se vaciaba al añadir un segundo aparato.** No era un
   problema del dato guardado —los dos aparatos SÍ quedaban separados por
   debajo—, sino de que la pantalla no se refrescaba al cambiar de aparato
   (una `key` de React sin el aparato). Corregido y verificado con un
   script contra la aplicación real que repite el gesto exacto del primer
   pantallazo.
2. **Generar el PDF fallaba con `ERR_INVALID_URL`** en cuanto el informe
   de un ojo con dos aparatos cruzaba el límite de tamaño de una URL
   `data:` de Chromium (2 097 152 caracteres) — un límite que ningún
   informe de un solo aparato había rozado nunca. Corregido cargando el
   HTML desde un fichero temporal en vez de desde una URL, y verificado
   reproduciendo el error exacto con un HTML sintético del mismo tamaño.

Con esos dos corregidos, el dueño abrió el PDF de verdad y encontró un
tercer fallo (la tabla de Kane en blanco) y pidió el rediseño del PDF que
se describe en la siguiente sección (D48).

### El PDF, rediseñado tras la primera prueba real de D47 (D48, 27/08/2026)

El dueño abrió el primer PDF de verdad con dos aparatos y pidió cinco
cambios, los cinco hechos:

1. **Título claro en cada hoja**: «EVO Toric — estimado» / «— con córnea
   posterior medida», lo mismo para Barrett, «Kane» sin más. Para las
   calculadoras BASE (`EVO_TORIC`, `BARRETT_TORIC`) el sufijo solo aparece
   si ESE dataset de verdad tiene `PK1` o `PK2` — decirlo siempre habría
   mentido en el caso normal sin córnea posterior medida.
2. **Las hojas se agrupan por aparato primero**, no por calculadora: todos
   los cálculos de un biómetro seguidos, luego los del siguiente.
3. **Una banda grande con el nombre del aparato** en cada hoja, solo
   cuando el ojo tiene más de uno.
4. **Una hoja de biometría de entrada al principio del informe, por cada
   aparato** — reintroduce parcialmente lo que D39 había quitado
   (`SYSTEM_VISION.md`: D39 superada parcialmente por D48).
5. **Una tabla comparativa detallada al final**: aparato, calculadora,
   ojo, lente resultante, residual de esfera, residual de cilindro y eje,
   con un tono de color distinto por aparato.

**Verificado no solo con 84 tests del paquete de informe (todos en
verde), sino generando un informe sintético de verdad** —dos aparatos,
cinco calculadoras cada uno, sin datos de ningún paciente real— **y
mirándolo hoja a hoja, con capturas de pantalla**, antes de darlo por
hecho. Con un solo aparato, nada de esto cambia lo que ya se veía.

De paso, al mirar ese mismo informe se encontró y corrigió el fallo real
de Kane — ver el apartado siguiente.

### La tabla de Kane, en blanco otra vez (27/08/2026, noche)

Con los dos fallos anteriores corregidos, el dueño llegó hasta generar el
PDF de verdad y la tabla de resultados de Kane volvió a salir en blanco en
la captura — el número que el programa lee y estima por debajo era
correcto, así que no era un fallo de cálculo, era de FOTO. Mismo síntoma
que el ya diagnosticado el 12/08/2026 (el DOM tiene el dato antes de que
Chromium lo pinte); con D47 hay más páginas de Playwright trabajando a la
vez en el mismo caso, y ese margen volvió a quedarse corto. Corregido en
`kane.ts`: tras comprobar que la celda tiene texto, se espera además a dos
fotogramas de animación reales (`requestAnimationFrame` anidado dos veces)
antes de la captura. **Sin verificar contra la web real de Kane** — no hay
acceso a internet desde este entorno de desarrollo.

**Lo que falta, y es lo único que falta**: que el dueño repita la prueba
completa una vez más — los dos aparatos, calcular, provocar a propósito
una discrepancia y ver la alarma, generar el informe ya rediseñado y
comprobar que Kane sale bien en su captura. Ver el apartado 3.

### La corrección de arriba no era la buena, y detrás había dos fallos distintos (27–28/08/2026, noche)

Verificado de verdad en cuanto se confirmó que este entorno sí tiene
acceso a internet: la corrección de «dos fotogramas de animación» de más
arriba **no arregló nada** — la tabla de Kane seguía saliendo en blanco,
con captura idéntica byte a byte tanto esperando 800 ms como 3000 ms fijos
(descartando que fuera «simplemente hace falta más tiempo»). Se registró
la lección de no dar nada por corregido sin comprobarlo contra la web real
(log de lecciones, noche, 7) y se retomó la investigación al día
siguiente:

1. **El síntoma de la captura en blanco SÍ es real**, y es del propio
   `screenshot()` de Chromium (el «back-buffer» a veces no refleja el
   último cambio pintado), no de la tabla en sí — inspeccionado el CSS
   calculado de la celda en una captura correcta y no hay nada oculto,
   de tamaño cero, ni un `iframe` de por medio. Mitigado desplazando la
   tabla a la vista y forzando un reflow síncrono del navegador justo
   antes de la foto — 4 de 4 capturas correctas en las pruebas en vivo de
   esta sesión, frente a 0 de varias con las esperas fijas. Mejora real,
   pero se mantiene la cautela: un fallo de temporización del navegador no
   se declara «resuelto al 100%» con solo unas pocas pruebas.
2. **Pero el caso que hizo saltar el aviso por primera vez —EVO y Kane
   calculando con la lente «B&L LuxSmart» / «B+L LuxSmart Toric», D50— no
   era este fallo.** Era uno **distinto y ya identificado con su causa
   exacta**: al elegir un modelo de lente concreto, Kane deja de escribir
   sus filas tóricas como «T2 (1.00)» y pasa a escribir solo el número,
   bajo una columna que ya no se llama «Toric (Cylinder Power)» sino con
   el nombre de la propia lente («B+L Cylinder Power»). El lector de la
   tabla (`leerFilaToricaDeKane`) no sabía reconocer ese segundo formato y
   descartaba las tres filas, dando `ADAPTER_BROKEN` aunque Kane sí había
   calculado bien y sí mostraba sus opciones. **Corregido**, con dos tests
   nuevos que codifican el formato real observado, y confirmado en vivo
   repitiendo el caso exacto que fallaba: Kane ya da sus 3 opciones
   tóricas y la captura sale correcta.

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

- **D67 (córnea especial, Barrett True K Toric) no se ha probado dentro de
  la aplicación completa, con un caso real, DESDE la corrección del aviso
  de Kane.** El dueño probó D67 una vez con un caso real: EVO y Barrett
  True K Toric fueron bien, Kane se quedó bloqueado por un aviso propio de
  su web (ver «Última actualización», arriba) — corregido, pero sin
  volver a probar el caso completo. El adaptador de Barrett True K Toric
  se investigó y se probó con un cálculo SINTÉTICO real de punta a punta
  contra la web —formulario, envío y lectura del resultado—, pero nunca
  se ha lanzado desde `pnpm dev` con un caso guardado hasta el PDF final.
  Falta: repetir el mismo caso con córnea especial, calcular con las tres
  calculadoras (más Barrett True K Toric) y comprobar que el PDF sale
  bien con las tarjetas correctas.
- **D50 (elegir la lente correcta en EVO y Kane con nombres distintos) no
  se ha probado contra las webs reales.** Verificado que la interfaz
  guarda el par de nombres correcto para cada una de las cinco lentes
  nuevas (Aspire, Envy, LuxGood, LuxSmart, LuxLife), pero falta un cálculo
  real con alguna de ellas para confirmar que EVO y Kane la encuentran de
  verdad en su desplegable y usan su propia constante. Las entradas ya
  existentes «B&L MX60T»/«B&L MX60ET/PT» siguen sin nombre propio de Kane
  confirmado — si el dueño las usa, puede que sigan sin encontrarse ahí.
- **D47/D48/D49 (varios biómetros por ojo, y el PDF rediseñado) no se han
  probado COMPLETOS en la aplicación real.** El dueño encontró varios
  fallos reales probándolo —el formulario no se vaciaba al añadir un
  segundo aparato; generar el PDF fallaba con `ERR_INVALID_URL` por el
  tamaño del informe; la tabla de Kane volvía a salir en blanco en la
  captura; el desplegable «Otro…» del aparato principal no hacía nada—,
  todos ya corregidos (ver apartado 2), pero **dos sin verificar contra
  condiciones reales** —no hay acceso a internet desde este entorno—: que
  Kane sale bien en su captura, y que el PDF de verdad omite las
  calculadoras que no se pidieron calcular (verificado leyendo el código,
  no con un cálculo real). Falta repetir la prueba entera: los dos
  aparatos con datos de verdad, calcular con menos de las tres
  calculadoras y comprobar que el PDF no saca hojas de las que se dejaron
  fuera, ver saltar la alarma de discrepancia con datos que de verdad se
  contradicen, abrir el PDF ya rediseñado y comprobar que Kane sale bien en
  su captura. Los umbrales de discrepancia son un punto de partida
  razonable, no una cifra clínica validada — puede que el dueño quiera
  ajustarlos tras probarlo.
- **El nombre del cirujano no se ha visto llegar de verdad a EVO, Barrett ni
  Kane.** El cuestionario simplificado y el hilo hasta cada adaptador están
  probados con tests (los tres selectores están comprobados con
  `pnpm reconocer`, no supuestos), pero falta un cálculo real para confirmar
  que el campo se rellena tal cual en las tres webs.
- **La corrección de la captura en blanco de Kane (12/08/2026) no bastó, ni
  la segunda (27/08/2026, noche), ni la tercera (02/09/2026) se han
  verificado contra la web real todavía.** Diagnosticado tres veces: la
  primera, que la tabla se pintaba después de que el aviso «Processing…»
  ya se hubiera escondido (corregido con una espera a que la celda tuviera
  texto); la segunda, que con D47 corriendo más páginas de Playwright a la
  vez ese margen volvió a quedarse corto (mitigado con una espera de
  400 ms, desplazar la tabla a la vista y forzar un reflow síncrono); la
  tercera —el dueño compartió un PDF real, CV-2026-0091, con la tabla de
  Kane en blanco pese a la mitigación anterior, mientras la estimación
  propia debajo SÍ traía números reales (la lectura de datos funcionó, la
  foto no)— se ha probado una técnica nueva y distinta de las dos
  anteriores: un evento de ratón real (no disparado desde JavaScript) justo
  antes de la foto, porque el propio código ya documentaba, desde el
  27/08, que esperar más tiempo con o sin `requestAnimationFrame` no
  cambiaba nada. **Dicho tal cual al dueño**: es una mitigación más, no un
  «ya está arreglado» — verificado con lint, typecheck y toda la batería
  de tests en verde, pero no con un cálculo real de Kane, porque su
  pantalla de condiciones pide una acción humana que no se puede completar
  sola dentro de esta sesión. Si vuelve a salir en blanco, avisar con
  el PDF real como se hizo esta vez: es lo que ha permitido diagnosticarlo
  cada vez.
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

- **D47: varios biómetros por el mismo ojo, confirmación independiente,
  alarma de discrepancia y un PDF por ojo.** Petición expresa del dueño
  (27/08/2026), con tres respuestas suyas antes de empezar a construir:
  confirmación y cálculo independientes por aparato; alarma con
  reconocimiento explícito si dos aparatos del mismo ojo se contradicen; y
  un cuadro comparativo final neutral, sin destacar ningún aparato.
- **D46: el SIA y su eje de incisión arrancan en 0.25 D @ 135°, editables.**
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

1. **Probar D47 (varios biómetros por ojo) en la aplicación real.** Está
   construido y en verde en todos los controles automáticos (ver apartado
   2) — lo único que falta es que el dueño lo use de verdad: dos aparatos
   en un mismo ojo, confirmarlos por separado, provocar a propósito una
   discrepancia y ver la alarma, generar el informe y comprobar los dos PDF.
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
