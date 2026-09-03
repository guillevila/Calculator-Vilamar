# SYSTEM_VISION.md — Calculator Vilamar

> Documento de visión del producto.
> Define QUÉ queremos construir, PARA QUIÉN y qué decisiones de producto
> están cerradas. La implementación técnica concreta la decide Claude cuando
> no esté expresamente fijada aquí.
>
> Claude lo lee al empezar cada sesión. Las decisiones cerradas no se reabren sin
> información nueva explícita.

**Versión:** 2.0 · **Fecha:** 11/08/2026 · **Autor:** dueño del proyecto, con la
parte técnica y las mediciones añadidas por Claude

> **Nota sobre esta versión.** La 1.x la escribió el dueño del proyecto el
> 10/08/2026. La primera sesión de construcción ocurrió con la carpeta local
> vacía, sin acceso a este documento, así que Claude escribió en paralelo su
> propia versión. Esta 2.0 es la fusión de las dos: se conserva íntegra la
> estructura y el criterio de producto del original, y se incorporan las
> decisiones técnicas que se tomaron y lo que se ha medido. **Ninguna decisión del
> original se ha eliminado ni renumerado.**

---

## 1. ¿Qué es este proyecto?

Calculator Vilamar es una herramienta local para automatizar el flujo de cálculo
de lentes intraoculares (LIO) que actualmente se realiza manualmente.

El usuario carga una fotografía, captura o PDF procedente de un biómetro o equipo
oftalmológico. El sistema identifica el informe, extrae automáticamente las
medidas relevantes de cada ojo, las presenta para revisión humana y, una vez
confirmadas, prepara y/o introduce esos mismos datos en tres calculadoras web
externas:

1. Kane — https://www.iolformula.com
2. EVO Toric — https://www.evoiolcalculator.com/toric.aspx
3. Barrett Toric — https://www.ascrs.org/en/tools/barrett-toric-calculator

Después recopila los resultados de las tres calculadoras y genera una vista
comparativa y un informe PDF claro.

La herramienta NO desarrolla una nueva fórmula de cálculo de LIO. Automatiza un
trabajo que hoy se realiza manualmente.

---

## 2. ¿Para quién es?

### Usuario principal

- Profesional de óptica/oftalmología que actualmente recibe informes biométricos
  y rellena manualmente varias calculadoras online.

### Usuario inicial real

- Un único usuario de confianza.
- Uso local en ordenador.
- No es inicialmente un SaaS ni una plataforma multiusuario.

### Administrador/desarrollador

- El dueño del proyecto puede configurar dispositivos soportados, revisar
  integraciones y añadir nuevas calculadoras o formatos en el futuro.

---

## 3. Objetivo central

Convertir este flujo:

    leer informe
    → buscar AL
    → buscar K1
    → copiar eje
    → buscar K2
    → copiar eje
    → copiar ACD
    → copiar LT
    → copiar CCT
    → abrir calculadora 1
    → rellenar
    → abrir calculadora 2
    → volver a rellenar
    → abrir calculadora 3
    → volver a rellenar
    → comparar resultados manualmente

en:

    subir imagen/PDF
    → comprobar datos extraídos
    → confirmar
    → ejecutar/preparar las tres calculadoras
    → recibir comparación
    → generar PDF

El valor principal es AHORRAR TIEMPO y REDUCIR ERRORES DE TRANSCRIPCIÓN.

**Medido:** el recorrido completo —datos confirmados → EVO y Barrett reales →
tabla comparativa → PDF en disco— tarda **47 segundos**.

---

## 4. Flujo ideal del producto

```
  NUEVO CÁLCULO
       ↓
  subir foto / captura / PDF de la biometría
       ↓
  detectar el aparato y el tipo de informe
       ↓
  extraer los datos de OD y/o OS
       ↓
  normalizarlos al modelo único
       ↓
  ENSEÑARLOS TODOS AL USUARIO
       ↓
  revisión y corrección humana OBLIGATORIA
       ↓
  CONFIRMAR
       ↓
  Playwright rellena las calculadoras externas
       ↓
  EVO Toric  ·  Barrett Toric  ·  Kane
       ↓
  resultados normalizados y puestos juntos
       ↓
  análisis descriptivo de concordancias y discrepancias
       ↓
  PDF trazable
```

El detalle paso a paso de la versión 1.x sigue vigente. Su estado real hoy:

| Paso                            | Qué ocurre                                                                            | Estado                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1 · Nuevo caso                  | Se crea un caso con su código local. Varias imágenes NO se dan por del mismo paciente | ✅ hecho                                 |
| 2 · Detección                   | Se reconoce el aparato por la maqueta del informe                                     | ✅ hecho                                 |
| 3 · Extracción                  | Se leen los campos al modelo único, cada uno con su procedencia                       | ✅ hecho                                 |
| 4 · Revisión humana OBLIGATORIA | Nada avanza sin confirmación explícita; campo a campo si el dato viene de una máquina | ✅ hecho                                 |
| 5 · Validación                  | Rango, coherencia, ACD≠AQD, ejes, avisos en lenguaje normal                           | ✅ hecho                                 |
| 6 · Adaptadores                 | Uno por calculadora, reparables por separado                                          | ✅ EVO y Barrett · ⚠️ Kane sin verificar |
| 7 · Automatización web          | Playwright rellena y lee resultados                                                   | ✅ EVO y Barrett                         |
| 8 · Comparación                 | Descriptiva, sin recomendar lente                                                     | ✅ hecho                                 |
| 9 · Informe PDF                 | Trazable, con entradas y salidas, sin datos identificativos                           | ✅ hecho                                 |

---

## 5. Stack técnico

La arquitectura debe ser LOCAL-FIRST.

El objetivo inicial NO es desplegar un SaaS.

Preferencias:

- aplicación sencilla de instalar en Windows;
- interfaz moderna;
- automatización del navegador;
- procesamiento de imágenes/PDF;
- generación de PDF;
- tests automáticos.

**Elegido** — era el candidato preferido del documento original y no apareció
ninguna razón para desviarse:

- TypeScript en modo estricto
- React
- Electron
- Playwright para automatización de navegador
- Vitest para tests unitarios; Playwright para los de interfaz
- almacenamiento local en ficheros JSON

### Extracción de documentos

El documento original no fijaba la tecnología y exigía una interfaz desacoplada
—`DocumentExtractor`— para poder comparar OCR local, modelo de visión, OCR más
reglas y extractores por dispositivo. Textualmente: **«La elección debe hacerse
por PRECISIÓN sobre informes reales, no por moda.»**

Eso se ha respetado. Hay dos lectores detrás de la misma interfaz:

- **OCR local** (tesseract.js sobre WebAssembly), el que se usa por defecto. No
  manda nada a internet.
- **Lector de visión** (Claude), construido y **apagado** mientras no haya clave.

Y existe la herramienta para decidir con datos: `pnpm comparar:lectores` pasa los
mismos documentos por todos los lectores y cuenta aciertos, errores y coste real
por informe. **La mitad local ya está medida** (apartado 14); la de los modelos
necesita una clave para ejecutarse.

---

## 6. Decisiones cerradas ✅

> No se reabren sin información nueva explícita.
>
> **D1–D15** son del documento original (10/08/2026) y no se han modificado.
> **D16–D36** son las decisiones técnicas tomadas al construir. Cuando una de
> ellas concreta a una anterior, se dice cuál.

| ID  | Decisión                                                                                                                      | Razón                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | El producto inicial es de uso local y para un único usuario                                                                   | No necesitamos SaaS ni infraestructura compleja                                                                                                                                                                                                                                                                                                                                                                                      |
| D2  | Los datos extraídos siempre requieren confirmación humana antes de enviarse                                                   | Un error OCR en biometría puede ser clínicamente relevante                                                                                                                                                                                                                                                                                                                                                                           |
| D3  | Ningún campo clínico faltante se inventa ni se completa silenciosamente                                                       | Trazabilidad y seguridad                                                                                                                                                                                                                                                                                                                                                                                                             |
| D4  | Kane, EVO Toric y Barrett Toric son las tres integraciones iniciales                                                          | Son las tres calculadoras que el usuario quiere consultar                                                                                                                                                                                                                                                                                                                                                                            |
| D5  | Cada calculadora tendrá un adapter independiente                                                                              | Las webs cambiarán y deben poder repararse por separado                                                                                                                                                                                                                                                                                                                                                                              |
| D6  | Existirá un único modelo normalizado de biometría                                                                             | Evita introducir tres veces información ligeramente diferente                                                                                                                                                                                                                                                                                                                                                                        |
| D7  | El sistema conservará procedencia y estado de confirmación de cada dato                                                       | Debe poder auditarse qué se leyó y qué se corrigió                                                                                                                                                                                                                                                                                                                                                                                   |
| D8  | La herramienta no implementa ni replica las fórmulas de Kane, EVO o Barrett                                                   | Su función es automatizar el flujo de usuario                                                                                                                                                                                                                                                                                                                                                                                        |
| D9  | CAPTCHA, login y protecciones externas no se evaden                                                                           | Si requieren intervención humana, se solicita                                                                                                                                                                                                                                                                                                                                                                                        |
| D10 | No se mezclan automáticamente informes de pacientes/casos diferentes                                                          | Mezclar ojos o pacientes sería un fallo crítico                                                                                                                                                                                                                                                                                                                                                                                      |
| D11 | Ninguna imagen clínica real se almacena en Git ni se incluye en el repositorio                                                | Privacidad                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D12 | No habrá base de datos clínica en la primera versión                                                                          | No es necesaria para el caso de uso inicial                                                                                                                                                                                                                                                                                                                                                                                          |
| D13 | Los resultados deben poder exportarse a PDF                                                                                   | Es parte del flujo final del usuario                                                                                                                                                                                                                                                                                                                                                                                                 |
| D14 | La primera versión no da una recomendación clínica propia                                                                     | Compara las salidas de las calculadoras externas                                                                                                                                                                                                                                                                                                                                                                                     |
| D15 | El producto debe seguir funcionando aunque una de las tres calculadoras falle                                                 | Un adapter roto no debe bloquear necesariamente los demás                                                                                                                                                                                                                                                                                                                                                                            |
| D16 | **Playwright** para toda automatización de las webs externas                                                                  | Decisión del dueño del proyecto. No se usa Selenium, Puppeteer, WebDriver ni clics por coordenadas                                                                                                                                                                                                                                                                                                                                   |
| D17 | **Electron + React + TypeScript estricto**                                                                                    | Concreta D1 y el apartado 5: navegador controlado, sesiones persistentes, imágenes y PDF, instalación sencilla en Windows                                                                                                                                                                                                                                                                                                            |
| D18 | **Almacenamiento en ficheros JSON**, no SQLite                                                                                | Concreta D12. Un módulo nativo convierte «instalar» en una tarde de configuración. Hay una lección registrada sobre esto                                                                                                                                                                                                                                                                                                             |
| D19 | **El PDF se genera con `printToPDF` de Electron** desde HTML                                                                  | Concreta D13. Cero dependencias nuevas, nada que compilar, y se maqueta con CSS                                                                                                                                                                                                                                                                                                                                                      |
| D20 | **Un dato ausente se representa por su AUSENCIA**, nunca con un número                                                        | Concreta D3 en el tipo: `Medida.valor` es un `number` a secas, así que no existe ningún valor que signifique «no lo sé» y no se puede confundir con un cero                                                                                                                                                                                                                                                                          |
| D21 | **El programa no corrige datos.** Avisa y bloquea; corrige la persona                                                         | Concreta D3. Un OCR arreglado en silencio esconde el fallo y la próxima vez nadie se entera                                                                                                                                                                                                                                                                                                                                          |
| D22 | **Ningún selector HTML sale de `packages/integrations/src/adapters/`**                                                        | Concreta D5, y hay un test que lo vigila. Para que reparar EVO sea tocar un solo fichero                                                                                                                                                                                                                                                                                                                                             |
| D23 | ~~A las webs se les manda el CÓDIGO LOCAL del caso, nunca un nombre~~ **Superada por D44 (27/08/2026) para el nombre del paciente** | Concreta D11. EVO, Barrett y Kane exigían «Patient Name»: se les daba `CV-2026-0042`. El código local se sigue mandando siempre —ahora en el campo «Patient Identifier»/«ID»—, pero ya no es lo único que llega al campo del nombre |
| D24 | **En la web de la ASCRS se RECHAZAN las cookies opcionales**                                                                  | Declinar no es consentir en nombre de nadie, y es lo que menos datos comparte                                                                                                                                                                                                                                                                                                                                                        |
| D25 | **Los tests contra las webs reales NO están en el CI**                                                                        | Una web ajena con un mal día no puede poner el control en rojo. Se lanzan a mano con `pnpm live`                                                                                                                                                                                                                                                                                                                                     |
| D26 | **El lector de visión existe, y viene APAGADO**                                                                               | El OCR local no basta (apartado 14) y un modelo de visión sí. Pero manda el informe fuera del ordenador, y eso lo decide una persona. Sin clave, nada sale a internet                                                                                                                                                                                                                                                                |
| D27 | **El modelo de visión está fijo en el código**, no en una variable de entorno                                                 | En una herramienta clínica hay que poder decir con qué se leyó cada informe. Una variable suelta haría que dos lecturas del mismo documento pudieran no ser comparables sin que nadie supiera por qué                                                                                                                                                                                                                                |
| D28 | **Un dato leído por una máquina no se da por bueno solo**, por mucha confianza que declare                                    | Es el **principio rector** (apartado 13) aplicado al dato concreto, y está medido en el apartado 14. Sale en ámbar y se comprueba uno a uno                                                                                                                                                                                                                                                                                          |
| D29 | **El origen de un dato pertenece al VALOR, no al tipo de campo**, y se enseña separado de la validación                       | El mismo campo puede venir del informe en un caso y escribirse a mano en otro. Mientras «no consta en el informe» y «lo tienes que aportar tú» decían lo mismo, un hueco normal parecía un fallo del extractor. Concreta D7                                                                                                                                                                                                          |
| D30 | **Corregir un dato NO borra lo que decía el informe**                                                                         | `Medida.original` conserva el valor anterior y su evidencia. Sin eso, el informe final decía «escrito a mano» sin poder explicar frente a qué, y una corrección no se podía auditar. Concreta D7                                                                                                                                                                                                                                     |
| D31 | **Un dato canónico puede derivarse de otros del mismo informe, pero SOLO si el perfil del aparato lo permite explícitamente** | Las tres calculadoras exigen la ACD y algunos ANTERION no la imprimen, pero sí traen AQD y CCT, y en ese aparato la suma es exacta porque el informe dice desde qué superficie mide cada una. En otro aparato la misma cuenta daría un número **plausible y equivocado**, que es lo peor que puede producir este programa. La tabla de perfiles es restrictiva por defecto: hoy solo ANTERION. Concreta D3 y D6                      |
| D32 | **Lo derivado tiene estado de origen propio, y no se da por bueno solo**                                                      | `DERIVADO_DEL_INFORME` existe porque las dos alternativas eran mentira: «del informe» de algo que el papel no dice, o «aportado» de algo que no ha escrito nadie. Y aunque la cuenta sea exacta, **nadie ha visto el resultado**, así que se comprueba como lo leído por una máquina. Concreta D2, D7 y D28                                                                                                                          |
| D33 | **La constante A pertenece al MODELO DE LENTE, no al informe**                                                                | Algunos informes traen una tabla de modelos, cada uno con su constante. Cuatro lentes son cuatro constantes posibles y **ninguna es la del caso** hasta que se elige el modelo. Se guarda la relación modelo→constante, nunca una constante suelta, y una lente que no está en el informe **no hereda la de otra**: calcular con la constante de una lente que no se implanta da un resultado creíble y equivocado. Concreta D3 y D6 |
| D35 | **Un «Calcular» procesa TODOS los ojos del caso; la primitiva sigue siendo una calculadora para un ojo**                      | Antes la pantalla mandaba el ojo de la pestaña activa y el segundo se quedaba sin calcular. No era un fallo de ninguna web: nadie lo pedía. El orquestador de caso recorre calculadora a calculadora y, dentro, los dos ojos — así las condiciones de Kane se aceptan UNA vez. «Reintentar» vuelve a significar repetir lo que falló. Concreta D15                                                                                   |
| D36 | **El sexo se deduce del nombre del paciente, y por eso el nombre entra en el programa**                                       | Petición expresa del dueño del proyecto (12/08/2026), tomada tras exponerle que un nombre no determina el sexo y que obliga a guardar un dato identificativo que hasta ahora no entraba. Las salvaguardas NO se relajan: el nombre no sale del ordenador ni al PDF ni a ninguna web (D23 sigue), lo deducido es `DERIVADO` y no se autoconfirma (D32), y **un nombre que no se reconoce no se adivina**. Concreta D3 y D7            |
| D34 | **Si una web externa dice haber usado otra constante, se registra y se enseña; NO se corrige**                                | Elegir el modelo de lente en EVO o Barrett puede cambiar la constante que esa web usa. Si calculó con 119.20 y se le envió 119.10, el resultado es el de la web. Callarlo convertiría el informe en un adorno; corregirlo en silencio sería peor. Concreta D7 y D15                                                                                                                                                                  |
| D37 | ~~El informe lleva primero una captura de pantalla tal cual del resultado de cada calculadora; el resumen comparativo se queda, pero va después~~ **Superada por D39 al día siguiente** | Petición expresa del dueño del proyecto (24/08/2026): antes de cualquier comparación o análisis, quien lea el informe tiene que poder ver la pantalla real que devolvió cada web, sin recortar ni interpretar. No se toca ninguna comprobación de seguridad interna —el ojo equivocado se sigue descartando antes de que exista captura que guardar (D15)— ni se borra el informe comparativo existente: solo se reordena. Concreta D2 y D13 |
| D38 | **El objetivo de refracción (target) arranca siempre en 0, editable, y no pide confirmación si se deja así** | Petición expresa del dueño del proyecto (25/08/2026), con pushback explícito antes de aceptarla: es la primera vez que este programa rellena un dato ausente en vez de dejarlo vacío, y eso es justo lo que D3/D20/el principio rector dicen que no se hace, ni con cero — porque un valor por defecto silencioso esconde el caso en que el cirujano quería otra cosa y no llegó a decidirlo. El dueño, informado del riesgo, decidió seguir adelante: la mayoría de sus casos van a emetropía. Es un valor `MANUAL` normal —`corregirMedida` ya lo deja confirmado sin más, igual que cualquier dato escrito a mano—, y **no pisa** un valor que el informe ya trajera. Análoga a D36 en su momento: una decisión del dueño, informada, documentada con la misma honestidad |
| D39 | ~~El PDF final se reduce a: la captura de cada calculadora, una línea con la lente recomendada, y un aviso si alguna no pudo calcular. Nada de tabla comparativa, diagramas, biometría ni trazabilidad~~ **Superada PARCIALMENTE por D48 (27/08/2026): la biometría de entrada y una tabla comparativa detallada vuelven al informe, a petición expresa del dueño** | Petición expresa del dueño del proyecto (25/08/2026), elegida entre tres opciones. Sustituye a D37 al día siguiente: ya no basta con poner las capturas primero, el informe entero se reduce a eso. El informe detallado (portada, comparación, alternativas, biometría, diagramas del ojo, trazabilidad) **no se borra** —viene de una feature ya fusionada a `master`— pero se desconecta del flujo por defecto y queda como código disponible sin usarse (`generarHtmlInformeDetallado`, en `packages/report/src/plantilla.ts`). Ninguna casilla se omite en silencio: una que no tuvo resultado utilizable enseña su propio aviso explicando por qué. Concreta D2 y D13. **Lo que sigue vigente de esta decisión** tras D48: la captura de cada calculadora sigue siendo la fuente sin interpretar, y el informe detallado completo sigue sin ser el que se genera por defecto — solo se ha reintroducido la biometría de entrada y un resumen tabular, no las alternativas ni los diagramas del ojo |
| D40 | **Antes de pulsar «Calcular», se puede elegir con qué calculadoras —una, dos o las tres— mediante casillas EVO/Barrett/Kane y un único botón** | Petición expresa del dueño del proyecto (25/08/2026), para poder lanzar un cálculo rápido con una sola calculadora cuando hay prisa, sin esperar a las otras dos. El backend ya lo permitía de punta a punta (`ServicioCasos.calcular(calculadoras?)`); solo hacía falta la interfaz. Elegida frente a la alternativa de tres botones «Calcular con X» independientes |
| D41 | **El nombre del cirujano viaja a las tres calculadoras (campo «Doctor»/«Surgeon»); el del paciente sigue sin viajar nunca** | Petición expresa del dueño del proyecto (25/08/2026). Pushback hecho antes de aceptarla: el código dejaba ese campo vacío a propósito en las tres webs, agrupado bajo la misma regla que protege al paciente — se le advirtió de que esto la reabre para el cirujano. El dueño, informado, decidió seguir adelante. **Sigue sin mandarse el nombre del paciente**: esa regla (D23) no se toca, y `EntradasCalculadora` no tiene ningún campo capaz de llevarlo. Los tres selectores (`#TextBoxSurgeon` en EVO, `#MainContent_DoctorName` en Barrett, `#Surgeon` en Kane, este último ya existente en el código sin usarse) están comprobados con `pnpm reconocer`, no supuestos |
| D42 | **Cuestionario simplificado como alternativa a cargar un documento**, con solo los campos que usan las tres calculadoras (nombre doctor, nombre paciente, lente, constante A, SIA y su eje, AL, K1/K2 con sus ejes, ACD, LT, CCT, WTW, target en 0, córnea posterior) | Petición expresa del dueño del proyecto (25/08/2026): las dos vías —cargar archivo o escribir a mano— igual de visibles desde el principio, y la manual reducida a lo que hace falta para calcular, sin las columnas de Origen/Estado/Evidencia que solo tienen sentido revisando un documento. Después del cuestionario se aterriza en la misma pantalla de revisión de siempre: no se duplica el sexo del paciente, la lente ni la confirmación |
| D45 | ~~EVO Toric y Barrett Toric se calculan DOS veces cuando el ojo tiene córnea posterior (PK1/PK2): una con ese dato y otra sin él, automático, sin casilla que marcar~~ **Superada por D51 (28/08/2026): cada variante pasa a tener su propio botón explícito, ya no se añade sola** — el informe enseña las dos hojas seguidas, cada una con su propia estimación | Petición expresa del dueño del proyecto (27/08/2026), para poder ver el efecto real de la córnea posterior en el resultado. EVO: calculadora nueva `EVO_TORIC_SIN_CARA_POSTERIOR` — el mismo adaptador, envuelto, cuya ficha simplemente no incluye PK1/PK2 entre sus campos opcionales, así que `prepararEntradas()` nunca se los manda. Barrett: al revés — por defecto usa «Predicted PCA» (un modelo teórico) y la calculadora nueva es `BARRETT_TORIC_CON_CARA_POSTERIOR`, que marca «Measured PCA» y rellena su panel con PK1/PK2. **Ninguna de las dos variantes está en `CALCULADORAS`** (la lista de las tres que se eligen a mano): se calculan solas, además de la base, solo en los ojos que de verdad tienen el dato. **Verificado contra las webs reales**: EVO, mismo caso, con córnea posterior 22.5 D/cilindro 3, sin ella 22.0 D/cilindro 2.25 — resultados distintos. Barrett tardó más en confirmarse: el campo de córnea posterior medida («Measured PCA») **sí existe** en `calc.apacrs.org` —la primera revisión de esta sesión, solo con el HTML inicial, no lo encontró porque el interruptor solo aparece DESPUÉS del primer «Calculate»— y activarlo de verdad exige una secuencia de nueve pasos entre dos pestañas (ver el docstring de `barrett.ts`), descubierta en vivo con ayuda directa del dueño del proyecto. Verificado: mismo caso con «Predicted PCA» dio cilindro 1.5 D @ 84°, y con «Measured PCA» (mismo PK1/PK2) dio cilindro 2.25 D @ 177° — resultados distintos, confirmando que el paso de más no es un placebo |
| D44 | **El nombre real del paciente viaja a EVO, Barrett y Kane**, en el campo «Patient Name»/«Nombre del paciente» — el código local del caso pasa al campo «Patient Identifier»/«ID» (antes vacío) | Petición expresa del dueño del proyecto (27/08/2026), confirmada **dos veces** tras dos avisos explícitos: el primero sobre convertir el informe local en un documento de salud identificado; el segundo, más serio, sobre que el nombre real saldría del ordenador y viajaría a tres servidores externos por internet en cada cálculo — algo que ninguna decisión anterior había hecho, ni siquiera D41 (que abrió esa puerta solo para el cirujano). El dueño confirmó las dos veces, informado. Supera D23 para este dato concreto; D11 (ninguna imagen clínica real en el repositorio) y el resto de protecciones de privacidad —fixtures sintéticos, nada en diagnósticos, nada en el repositorio— no se tocan |
| D43 | **Excepción estrecha a «compara, pero no recomienda»**: bajo cada captura, y en un cuadro final opcional, se enseña una estimación PROPIA con un criterio clínico fijo —la primera esfera con refracción prevista negativa; el cilindro tórico más alto que sigue compartiendo el eje curvo de la córnea— calculada siempre, de acuerdo o no con lo que la calculadora haya destacado, y marcada siempre como «no vinculante» | Petición expresa del dueño del proyecto (26/08/2026), con pushback explícito antes de aceptarla: `packages/domain/src/comparacion/comparar.ts` existe precisamente para que este producto no elija nunca una opción por su cuenta —ni la primera, ni la más cercana a cero—, y esto es justo lo contrario. Se le explicó que un test existente (`comparar.test.ts`, «el producto compara, no recomienda») es el guardián de ese límite, y que esta pieza lo abre para un caso concreto. El dueño, informado, decidió seguir adelante, y aceptó explícitamente que el cuadro final se marque como opcional y no vinculante — no como una recomendación. La estimación vive en un módulo NUEVO y separado (`comparacion/recomendacion.ts`), con su propio docstring explicando por qué es distinto de `comparar.ts` y no lo sustituye; la captura de pantalla de cada calculadora sigue siendo, sin interpretar, la fuente de lo que esa web respondió de verdad |
| D46 | **El SIA y su eje de incisión arrancan en 0.25 D @ 135°, editables** —igual que D38 ya hace con el objetivo de refracción, ampliado a estos dos campos | Petición expresa del dueño del proyecto (27/08/2026): «la mayoría de sus casos usan un SIA y un eje parecidos», mismo argumento y mismo riesgo que D38 aceptó una vez —es un valor ausente que el programa rellena, algo que D3/D20/el principio rector dicen que no se hace—. No hace falta un aviso nuevo porque es la misma excepción ya conocida y ya aceptada, no una nueva. Se aplica en los dos caminos de entrada (formulario manual y documento leído), igual que D38: nunca pisa un SIA que un informe trajera —cosa que en la práctica no puede pasar, porque ningún biómetro mide el SIA (`origen.test.ts`, «El SIA no viene en ninguna biometría»)— |
| D47 | **Un mismo ojo del mismo paciente admite VARIOS conjuntos de medidas en paralelo, uno por biómetro/aparato** (`Caso.ojos[lado]` pasa de un `OjoBiometrico` a una lista), con tres reglas: (1) cada aparato se confirma y calcula de forma independiente —uno puede estar a medias mientras otro ya calculó—; (2) si dos aparatos del mismo ojo, ya confirmados, dan datos que se apartan de un umbral por campo, se bloquea el cálculo de ese ojo con una alarma hasta que el cirujano la reconoce explícitamente; (3) el informe final junta, en un único cuadro por ojo, una tarjeta por cada combinación aparato × calculadora, sin destacar ninguna. El PDF pasa de uno por caso a **uno por ojo** | Petición expresa del dueño del proyecto (27/08/2026), para poder comparar lo que da un biómetro frente a otro con el mismo paciente y el mismo ojo. Las tres reglas del bloque son respuesta directa a tres preguntas que se le hicieron antes de construir: confirmación independiente (no todo-o-nada por caso), alarma de discrepancia en vez de calcular en silencio con datos que se contradicen, y un cuadro comparativo neutral en vez de uno por aparato. Los umbrales de discrepancia (`packages/domain/src/comparacion/discrepanciaAparatos.ts`: AL 0.3 mm, K1/K2 0.5 D, ACD/LT 0.3 mm, CCT 20 µm, WTW 0.5 mm) son un punto de partida razonable, no una cifra clínica validada — pendiente de que el dueño los ajuste con casos reales. Con un solo aparato (`APARATO_PRINCIPAL`, el uso de siempre) no cambia nada en pantalla: cero selectores nuevos, cero pasos de más. No se relaja ninguna invariante existente: los dos ojos se siguen sin mezclar (D-invariante 4), y ahora tampoco se mezclan los aparatos de un mismo ojo (invariante 12 nueva) |
| D48 | **El PDF, rediseñado tras la primera prueba real de D47 con dos aparatos**: (1) cada hoja dice en su título claro qué cálculo es —«EVO Toric — estimado» / «— con córnea posterior medida», «Barrett Toric — estimado» / «— con córnea posterior medida», «Kane»—, y una banda grande con el nombre del aparato, visible solo si el ojo tiene más de uno; (2) las hojas se ordenan aparato primero —todos los cálculos de un biómetro seguidos, luego los del siguiente—, no calculadora primero; (3) el informe abre con una hoja de biometría de entrada por cada aparato —**reintroduce parcialmente lo que D39 había quitado**—; (4) cierra con una tabla comparativa detallada —aparato, calculadora, ojo, lente resultante, refracción y astigmatismo residuales previstos, eje—, con un tono de color distinto por aparato, además del cuadro de tarjetas que ya había (D43) | Petición expresa del dueño del proyecto (27/08/2026), tras generar su primer informe real con dos aparatos y verlo: los cinco cambios pedidos de una vez, con un ejemplo concreto de cómo quería ver el título de cada hoja. La etiqueta «con córnea posterior medida» en `EVO_TORIC`/`BARRETT_TORIC` (las calculadoras BASE, no las variantes de D45) depende de si ESE dataset concreto tiene de verdad PK1 o PK2 — nunca se pone a ciegas, porque la base manda la córnea posterior solo si el ojo la tiene, y decirlo siempre habría mentido en el caso normal sin ella. Los residuales de la tabla (`refraccionPrevista`, `cilindroResidual`, `ejeResidual`) son los mismos datos de la fila que ya eligió el criterio de D43, no un cálculo nuevo — ver `LenteEstimada` en `packages/domain/src/comparacion/recomendacion.ts`. Con un solo aparato, la banda del aparato no se pinta y las hojas de biometría se ven igual que antes de D47: sigue sin haber nada nuevo en pantalla para el uso de siempre |
| D49 | Dos ajustes más sobre D47/D48, tras seguir probando: (1) **el primer aparato de un ojo («Principal») se puede elegir o escribir desde el mismo desplegable que el segundo**, sin esperar a añadir uno de verdad — `conAparatoRenombrado`, nuevo en el dominio, cambia el nombre de un aparato ya existente conservando sus medidas; (2) **el PDF ya no saca hojas, tarjetas ni filas de una calculadora que nunca se pidió calcular** — antes, calcular con una o dos de las tres (D40) sacaba igual una hoja de «no se ha calculado» por cada una que se dejó fuera, llenando el informe de páginas sobre calculadoras que nadie quería usar. Una calculadora que SÍ se pidió y falló sigue enseñando su aviso, sin cambios — D39 sigue en pie para eso | Petición expresa del dueño del proyecto (27/08/2026), tras seguir usando la aplicación real. Para (2), la señal que distingue «nunca se pidió» de «se pidió y no salió» es si existe un `ResultadoCalculadora` guardado para esa casilla: solo se guarda uno cuando la calculadora llegó a formar parte del plan de cálculo (D40); una que se dejó desmarcada nunca lo tiene. `recopilarResultadosParaInforme` (`servicio-casos.ts`) ahora omite la casilla entera cuando no hay nada guardado, en vez de rellenarla con un aviso genérico |
| D50 | **Un mismo modelo de lente puede elegirse automáticamente en el desplegable de EVO y en el de Kane aunque cada web lo llame distinto** — «B&L LuxSmart» en EVO es «B+L LuxSmart Toric» en Kane. `LenteElegida` lleva `nombreEnEvo`/`nombreEnKane` opcionales; sin ellos, cada calculadora sigue buscando el nombre general, exactamente como antes. Añadidas al catálogo del selector de lente las cinco Bausch & Lomb que lo necesitaban: Aspire, Envy, LuxGood, LuxSmart, LuxLife. Barrett no tiene desplegable de lentes (D33) y no cambia: su constante A se sigue escribiendo a mano | Petición expresa del dueño del proyecto (27/08/2026), con capturas de pantalla de los dos desplegables para fijar el nombre exacto de cada lado. El problema real que resolvía: `elegirModelo()` en `evo.ts` y `kane.ts` (D26, 26/08/2026) busca una coincidencia EXACTA de texto contra la lista de esa web, y usaba un único nombre para las dos — si una web llama a la lente de otra forma, esa calculadora nunca la encontraba y calculaba con la constante A escrita a mano en vez de con la suya propia, **sin decir que se había equivocado de lente**. El campo `nombreEnEvo` ya existía en el tipo desde antes, sin usarse en ningún sitio; `nombreEnKane` es nuevo. Los pares EVO↔Kane de Aspire/Envy/LuxGood/LuxSmart/LuxLife son claros (mismo sufijo, Kane añade «enVista»/«Toric»); los ya existentes «B&L MX60T»/«B&L MX60ET/PT» no se han tocado por no tener un nombre de Kane confirmado — puede que sigan sin encontrarse en esa web, y hace falta que el dueño confirme cuál les corresponde si quiere que también se automaticen |
| D51 | Tres cambios en la pantalla de cálculo, pedidos juntos: (1) **las cinco casillas —EVO y Barrett, cada una con su botón «Predicted PCA» y su botón «Measured PCA» por separado, más Kane con uno solo— se eligen a mano**, ya no se añade sola la variante de córnea posterior detrás de su base (superaba a D45); Kane se queda con un único botón porque su web **no tiene ningún campo de córnea posterior** — comprobado en vivo el 28/08/2026 con `pnpm reconocer:kane`, tanto en modo normal como en modo tórico, y descartado explícitamente antes de construir nada para no inventarle a Kane una capacidad que no tiene; (2) **una tabla de solo lectura, encima de las casillas, con los parámetros ya metidos** —AL, K1, K2, sus ejes, ACD, LT, CCT, WTW, córnea posterior si la hay—, un aparato por columna, para poder comprobarlos de un vistazo antes de calcular; (3) **una discrepancia sin reconocer en un ojo ya no bloquea calcular el resto del caso** — antes, `calcular()` lanzaba un error y no calculaba NADA si algún ojo tenía una discrepancia pendiente, aunque el otro ojo estuviera perfectamente listo; ahora se descarta solo la casilla del ojo bloqueado y se sigue con las demás, y solo se avisa con un error si de verdad no queda nada que calcular. La alarma en sí —avisar, y poder corregir el dato o reconocerla explícitamente para seguir— no cambia (D47, decisión 2) | Petición expresa del dueño del proyecto (28/08/2026). Para (1): la primera propuesta incluía también «Kane Measured PCA», rechazada tras comprobar en vivo que iolformula.com no lo ofrece — construirlo habría sido fingir una capacidad que la web no tiene, contra la regla de no inventar datos ni comportamientos de terceros. `COLUMNAS_COMPARATIVA` (antes `columnasComparativa(caso, ojo, aparato)`, una función) pasa a ser una lista constante en `packages/domain/src/modelo/caso.ts`: las cinco casillas ya no dependen de si un dataset concreto tiene PK1/PK2, porque ahora se piden todas por su cuenta — la que no se pidió sale como «no calculada» en su columna, no desaparece de la tabla ni del informe (sigue aplicando D49: una casilla nunca calculada no saca hoja en el PDF). Para (3): al probarlo con dos ojos, una discrepancia pendiente en OD impedía calcular OS aunque no tuvieran nada que ver — el dueño pidió explícitamente que «se pueda corregir o continuar sin que se bloquee la pantalla»; `ServicioCasos.calcular()` ahora filtra las casillas del ojo bloqueado en vez de lanzar para todo el lote |
| D52 | **El criterio de esfera de la estimación propia (D43) depende de la familia de lente**: para la familia enVista de Bausch & Lomb (enVista normal/MX60T, MX60ET/PT, Aspire, Envy) y cualquier otra lente —incluida ninguna elegida— se mantiene el criterio de siempre, la opción con refracción prevista NEGATIVA más cercana a cero; para la familia Lux (LuxSmart, LuxLife, LuxGood) se invierte: la de refracción prevista POSITIVA más cercana a cero. El criterio del cilindro (última opción tórica que comparte el eje curvo) no cambia con la lente | Petición expresa del dueño del proyecto (29/08/2026). La familia se decide por el nombre CANÓNICO del catálogo (`LenteElegida.modelo`), nunca por `nombreEnEvo`/`nombreEnKane` (D50): el mismo modelo físico se llama distinto en cada web, y el criterio es del modelo, no del texto que se le manda a una calculadora en concreto. LuxGood no se mencionó en la petición original junto a LuxSmart/LuxLife — se preguntó explícitamente antes de tocar código, y el dueño confirmó que también usa el criterio positivo. Nueva función `criterioEsferaPara(modeloLente)` en `packages/domain/src/comparacion/recomendacion.ts`; `estimarLenteRecomendada()` gana un tercer parámetro opcional (`criterioEsfera`, por defecto `PRIMERA_NEGATIVA`, así que cualquier llamada antigua sigue igual). **Fallo real encontrado y corregido el mismo día, con un PDF real de EVO**: la primera implementación tomaba «la primera opción positiva subiendo potencia», que del lado positivo es la MÁS ALEJADA de cero (al subir potencia la refracción baja de forma continua) — EVO daba 18 D (refracción 0.77) en vez de 19 D (refracción 0.14). Corregido a «la más cercana a cero del lado que toca», válido para los dos signos sin caso especial |
| D57 | **Los informes se guardan en el Escritorio, dentro de «Calculadora Vilamar»**, en vez de en `%APPDATA%\calculator-vilamar\informes` — el resto de datos internos del programa (casos, documentos, diagnóstico, sesión del navegador) se queda donde estaba, sin cambios. Dentro, sigue habiendo una subcarpeta por ojo (D53) | Petición expresa del dueño del proyecto (01/09/2026), tras preguntar por qué la ruta de los informes «era tan rara». **Aviso hecho antes de construir, y aceptado informado**: en este ordenador el Escritorio está sincronizado con el OneDrive de la empresa —se ve en el árbol de carpetas de Windows—, así que guardar ahí los PDF —que llevan el nombre real del paciente, D44— los sube automáticamente a esa nube corporativa, cosa que no pasaba en `AppData`. Se ofrecieron tres opciones (acceso directo sin mover nada, mover de verdad, o una carpeta fuera de OneDrive); el dueño, informado, eligió mover los PDF de verdad. `prepararCarpetas()` gana un segundo parámetro opcional para la ruta de informes, así que el cambio no toca ninguna otra carpeta. Para que las pruebas de interfaz no escriban PDF de prueba en el Escritorio real de quien las ejecute, se añadió `VILAMAR_CARPETA_INFORMES` (variable de entorno que manda sobre el Escritorio real cuando está puesta) — comprobado en vivo que, tras el cambio, `pnpm test:e2e` no deja ningún rastro en el Escritorio de verdad |
| D56 | **El «Eje» de la estimación propia (D43) era siempre el meridiano corneal fijo, no el eje que de verdad devuelve cada calculadora.** Corregido: las tres pantallas donde se enseña (bajo cada captura, el cuadro «Comparación orientativa» y la «Tabla comparativa detallada») ahora muestran `ejeResidual` —el eje que la propia calculadora dice que quedaría con esa opción, que sí varía por calculadora y por si hay córnea posterior medida— en vez de `eje` —el meridiano corneal (K1 o K2, el más curvo), que es el mismo para las cinco casillas de un ojo y solo sirve como CRITERIO para elegir la fila, nunca como dato que enseñar. `eje` se queda en el tipo, documentado como interno | Fallo real, encontrado por el dueño del proyecto con un PDF real (01/09/2026): las cinco casillas de un ojo enseñaban «Eje 0°», idéntico en todas, mientras que las capturas de pantalla de encima —EVO, Barrett, Kane, cada una con y sin córnea posterior— mostraban ejes distintos (4°, 3°, 4°, 2°, 5° en su propio recuadro de recomendación). Investigado hasta la causa exacta: `estimarLenteRecomendada()` usa el meridiano corneal (`ejeCurvo`) como CRITERIO para decidir qué fila de la escalera tórica compartía orientación con la córnea —y eso es correcto, no cambia—, pero al construir el resultado ponía ese mismo valor fijo en el campo `eje`, que es justo el que el informe enseñaba, en vez de `ejeResidual` —el que sí venía correctamente leído de cada web, fila a fila, y que ya estaba disponible sin necesitar ningún cambio en los adaptadores. Dos tests nuevos en `plantilla.test.ts` reproducen el caso real exacto (eje corneal fijo en 0°, `ejeResidual` variando 94°/4°/5°) para que no se pueda repetir el fallo sin que un test avise |
| D55 | **Comparar dos lentes con la misma biometría, sin volver a escribir ningún dato.** `Caso` gana `lenteSecundaria?: LenteElegida` — una segunda lente APARCADA, que no participa en ningún cálculo mientras está ahí. Un botón «Calcular con esta lente» la ACTIVA: pasa a ser `lente` (con su propia constante A, resuelta con las mismas cuatro reglas de `elegirLente` — ninguna hereda la de la otra), la que era `lente` pasa a `lenteSecundaria`, y se borran los resultados ya calculados —eran de la lente anterior, y con Barrett, con SU constante—, así que hace falta un cálculo nuevo antes de generar otro PDF. El PDF de la primera lente ya generado no se pierde: sigue en el disco, sin tocar | Petición expresa del dueño del proyecto (01/09/2026): «meto todos los datos para calcular una lente, quiero poder calcular otra sin tener que meterlos de nuevo». Aclarado en dos preguntas antes de construir: (1) la comparación se aplica a TODOS los ojos y aparatos del caso, igual que el resto del programa, no solo al que se esté mirando; (2) el resultado se ve como «la opción de generar OTRO PDF con la otra lente», no mezclado en el mismo informe ni solo en pantalla — de ahí que la solución sea «intercambiar y recalcular», no una segunda dimensión de resultados en paralelo (que hubiera sido tan grande como D47, y con un riesgo real: `CONSTANTE_A` es un campo por ojo, no por lente, así que tener las dos lentes activas a la vez habría podido mandarle a Barrett la constante equivocada sin que nadie lo notara). `intercambiarLentes()`, en `packages/domain/src/modelo/seleccion-lente.ts`, reutiliza `elegirLente()` entero para la lente que se activa — cero lógica nueva de constantes, cero riesgo de un camino alternativo que las empareje mal |
| D54 | **Botón «Volver a los datos» en la pantalla de cálculo** (D08 lo tenía tras los resultados, pero no antes de calcular): lleva de vuelta a la revisión con el caso tal cual está, sin borrar ni recalcular nada, para corregir un dato antes de la primera vez que se calcula o cambiar uno o dos campos después de ya haber calculado, sin volver a escribir todo el formulario | Petición expresa del dueño del proyecto (01/09/2026): «antes de dar a calcular... poder volver al formulario a cambiar cualquier dato por si ha habido algún error», ampliada después a que funcione también tras haber calculado, para variar un parámetro y recalcular sin repetir todo. `PanelResultados.tsx` ya tenía «Volver a los datos» desde D47; el hueco real estaba en `PanelCalculo.tsx`, que no tenía forma de volver atrás. `confirmar()` en el dominio es idempotente (`{ ...caso, estado: 'CONFIRMADO' }`), así que confirmar de nuevo tras editar no tiene ningún caso especial |
| D53 | **Cada informe se guarda en una subcarpeta según el ojo** —«Ojo derecho (OD)» / «Ojo izquierdo (OS)», dentro de la carpeta de informes de siempre— en vez de todos los PDF sueltos en una única carpeta | Petición expresa del dueño del proyecto (01/09/2026), tras un aviso de fallo que se investigó a fondo y resultó no serlo: reportó que, al meter datos de OD y luego de OS (o de un aparato y luego de otro), «solo sale el informe del segundo». Comprobado exhaustivamente —directo contra `ServicioCasos`, con la app real haciendo clic exactamente como él, y con un cálculo real contra EVO para tres casillas a la vez— los dos PDF se generaban siempre bien, los dos con sus datos correctos. La causa real se encontró mirando sus propios casos guardados: el único caso de ese día con datos de los dos ojos (`CV-2026-0051`) SÍ tenía los dos PDF, generados tres veces sin fallar ninguna; el resto de casos del día solo tenían un ojo cada uno, sin ningún fallo detrás. Con muchos informes de muchos casos mezclados en la misma carpeta, el segundo PDF estaba siempre ahí, pero se perdía de vista entre los demás archivos — el dueño lo confirmó («en la carpeta solo me aparecía uno, o eso creía yo») y propuso él mismo la solución: separar por carpetas. Lección para el log: investigar a fondo antes de «corregir» algo que puede no estar roto — aquí sí hacía falta, y el resultado fue una mejora de verdad (separar por ojo), no un parche sobre un fallo inventado |
| D64 | **La barra de pasos de arriba se puede pulsar** — antes era solo un indicador. Un paso que el CASO ya ha alcanzado de verdad (no solo la pantalla en la que se esté mirando) se puede volver a pulsar para corregir algo; uno que todavía no se ha alcanzado se queda bloqueado, para no saltar por delante de lo que falta | El dueño abrió un caso terminado desde «Casos guardados» (D63) y no encontraba cómo volver a los datos para corregirlos — la única vía era un botón escondido dentro de la tarjeta «Reintentar una sola», en mitad de la pantalla de resultados. «Entonces, ¿de qué me sirve?», tal cual. Al construirlo se encontró y corrigió un segundo fallo real, antes de enseñárselo: si «alcanzable» se calculaba comparando con la PANTALLA actual (en vez de con el estado real del caso), volver atrás y pulsar hacia delante otra vez dejaba el paso de avance bloqueado por error — el caso «olvidaba» que ya había llegado a Calcular. Corregido mirando `caso.estado` directamente, no la posición en la barra. Nuevo test de interfaz que reproduce el ciclo completo: avanzar, volver atrás, avanzar de nuevo, comprobando que nunca se puede saltar a un paso todavía no alcanzado |
| D65 | **La pantalla de revisión (documentos cargados) queda igual que el cuestionario manual**: mismo orden de campos —Biometría, Lente e incisión, Córnea posterior— y el mismo selector de aparato, con su botón «Añadir otro biómetro» y el selector aparte para el aparato de córnea posterior (D58/D60), cosas que antes solo tenía el cuestionario manual. `SelectorAparato.tsx` es ahora un componente COMPARTIDO entre las dos pantallas, no duplicado. La única diferencia real que queda: la revisión sigue enseñando los campos informativos que ningún cálculo usa (AQD, TK1/TK2, índice queratométrico, factor de lente) porque un documento sí puede traerlos y esta pantalla tiene que enseñar TODO lo leído; el cuestionario manual no los pide porque nadie los escribe a mano sin que sirvan para nada | Petición expresa del dueño del proyecto (02/09/2026), probando a cargar datos ya extraídos de fotos de biometría: la pantalla de revisión no dejaba añadir un segundo aparato, y el orden de los campos no coincidía con el del formulario manual — pidió que fueran «exactamente iguales». Al construirlo se encontró y corrigió un fallo real antes de enseñarlo: `aparatoActivo` es un estado GLOBAL en `App.tsx`, compartido con las pantallas de cálculo y resultados, con una corrección automática que lo devuelve al aparato real del caso en cuanto el elegido no existe todavía — necesaria en esas otras pantallas (no tiene sentido ver resultados de un aparato fantasma), pero deshacía justo la elección de «Añadir otro biómetro» en revisión, en el mismo instante de elegirlo, antes de que dé tiempo a escribir ningún dato. Corregido con una excepción: esa corrección automática no actúa mientras se está en el paso de revisión, donde elegir un aparato que todavía no existe es exactamente lo que se quiere permitir |
| D68 | **El sexo del paciente arranca en «Hombre» por defecto**, en vez de vacío, en todo caso nuevo (documento o manual). Es una excepción explícita y estrecha a D3 («ningún campo clínico faltante se inventa»), igual que D43 lo es para «compara, pero no recomienda»: se distingue con una procedencia propia, `DEFECTO` —nunca `MANUAL`—, así que la pantalla y el informe dicen siempre «Valor por defecto», nunca lo confunden con un dato que alguien haya escrito o confirmado de verdad. Si el informe trae el sexo, o se puede deducir del nombre (D14/D32), esa fuente se usa en su lugar, con la misma jerarquía de siempre; el valor por defecto solo se queda cuando ninguna de las dos funciona. Cambia poco el resultado de Kane (la única de las tres que lo pide), así que no exige el clic extra de «compruébalo» que sí exige una deducción — se puede calcular sin tocarlo, pero se puede cambiar en cualquier momento igual que cualquier otro dato | Petición expresa del dueño del proyecto (03/09/2026): «que se me olvida marcarlo, y el cálculo es casi igual, así no hay que repetirlo». Claude hizo pushback explícito antes de construirlo —explicando que romper D3 podía dejar un informe con un dato equivocado sin que nadie lo hubiera escrito— y ofreció una alternativa más conservadora (recordar el último sexo usado, sin autoconfirmar); el dueño, ya informado del riesgo, mantuvo la petición original. Se implementó tal cual se pidió, pero con la procedencia `DEFECTO` como salvaguarda: el valor nunca se ve, se guarda ni se imprime como si lo hubiera confirmado una persona |
| D67 | **Córnea especial**: un ojo con córnea alterada por LASIK/PRK/queratotomía radial previos, o con queratocono, se marca por ojo/aparato con un selector nuevo («Córnea especial», en «Lente e incisión») — Ninguna (de partida) / LASIK miópico / LASIK hipermetrópico / Queratotomía radial / Queratocono. EVO y Kane lo usan como un campo más en su MISMO formulario (el desplegable «Post LASIK/PRK/RK» de EVO; el interruptor «Keratoconus» de Kane, independiente de Non-toric/Toric). **Barrett es distinto**: pasa a calcularse con `BARRETT_TRUE_K_TORIC` —una calculadora aparte, con su propia página (`barrett-true-k.ts`), no una casilla más a elegir— en vez de Barrett Toric, que daría un resultado erróneo en estos ojos; las dos se EXCLUYEN MUTUAMENTE por ojo (`prepararEntradas()` bloquea la que no toca, con un aviso explícito). Dos campos nuevos, opcionales a propósito, `REFRACCION_PRE_LASIK`/`REFRACCION_POST_LASIK` (historial del paciente, no lo mide ningún biómetro): aparecen solo cuando el ojo tiene una córnea especial marcada | Petición expresa del dueño del proyecto (02/09/2026), con dos pantallazos reales de EVO y Kane mostrando sus campos respectivos. Investigado en vivo antes de escribir el adaptador —con datos sintéticos, nunca un paciente real—: `pnpm reconocer evo`/`reconocer-kane.mjs` dieron los selectores exactos (`#DropDownLASIK` en EVO; `keratoconus_1`/`keratoconus_2`, checkboxes independientes de Non-toric/Toric, en Kane); para Barrett, el dueño corrigió el rumbo inicial —la página «Barrett True K» esférica que se había investigado primero NO es la que hay que usar, sino «Barrett True K Toric» (con cilindro y eje), que resultó tener prácticamente los mismos `id` de campo que Barrett Toric —mismo dominio `calc.apacrs.org`, mismas tablas de resultado `GridView1`/`GridView2`— así que el adaptador nuevo reutiliza casi entero el diseño del existente. Un cálculo sintético real confirmó el formulario, el envío y la lectura del resultado de punta a punta. La refracción pre/post-LASIK se dejó opcional tras preguntar directamente si el dueño la tiene siempre a mano: «a veces, que sea opcional» |
| D66 | Dos cambios en la pantalla de cálculo y en cómo se escribe la constante A, pedidos juntos: (1) **selector «Ojos a calcular»** en la pantalla de cálculo (solo visible si el caso tiene datos de los dos ojos): «Los dos ojos» (de partida, el comportamiento de siempre), «Solo OD» o «Solo OS» — usa el filtro por ojo que `ServicioCasos.calcular()` ya tenía desde D47, nunca usado hasta ahora desde la interfaz; (2) **la constante A escrita en un ojo se copia sola al otro** cuando ambos tienen el mismo aparato, en cualquiera de los dos sentidos según cuál se toque primero (se escribe en uno que ya existía en los dos, o se crea el segundo dataset cuando el primero ya tenía su constante) — nunca pisa una que YA hubiera, así que borrarla en un ojo no la hace reaparecer sola, y escribir una distinta a propósito se respeta igual que cualquier dato manual | Petición expresa del dueño del proyecto (02/09/2026): «al lado del botón de calcular, poder elegir si quiero calcular los dos ojos o solo uno», y «que la lente y la constante del primer ojo aparezcan por defecto en el segundo, para no repetirlas». Para (2): investigado primero si hacía falta tocar el selector de lente (`SelectorLente.tsx`) — no, es una única pantalla compartida por los dos ojos desde siempre, así que una lente elegida del catálogo ya se aplica a los dos ojos con datos en el mismo movimiento (`elegirLente()`, D33); el hueco real estaba solo en la constante A escrita a MANO, sin lente de catálogo detrás, que hasta ahora vivía exclusivamente en el dataset donde se escribía. Un solo punto de cambio, `ServicioCasos.editarMedida()`, cubre las dos formas de llegar a los datos (cuestionario manual y revisión de documento/foto, D65), porque las dos pasan por el mismo canal |
| D63 | **«Casos guardados»**: una pantalla nueva, desde el inicio, para volver a abrir un caso ya guardado — hasta ahora solo existía «el que está abierto ahora mismo» (en memoria; se perdía al cerrar la aplicación), sin ninguna forma de recuperar uno anterior. Lista los casos por código, paciente, estado y última vez tocado, más recientes primero, y al abrir uno aterriza donde se dejó (revisión, si no está terminado; resultados, si sí) | Petición expresa del dueño del proyecto (02/09/2026), preguntando dónde encontrar un caso para reabrirlo, tras arreglar D62 en el suyo. `leerCaso`/`listarCasos` ya existían en `almacen.ts` desde antes —guardando cada caso en disco desde el principio— pero no los usaba nadie: sin tests, sin IPC, sin pantalla. Nuevos métodos `ServicioCasos.listarCasosGuardados()`/`abrirCaso(codigo)`, nuevo componente `CasosGuardados.tsx`, y un tercer botón en la pantalla de inicio junto a «Elegir archivo» y «Escribir a mano». De paso se corrigió, en `ZonaSoltar.tsx`, el mismo aviso desactualizado que ya se había corregido en `Identificacion.tsx` y `ARQUITECTURA.md`: seguía diciendo que ningún nombre viaja a las calculadoras, cuando D41/D44 lo cambiaron hace días |
| D62 | **Fallo real corregido: una discrepancia sin reconocer en un ojo dejaba de calcularse EN SILENCIO si se confirmaba mirando el otro ojo.** «Confirmar datos» solo miraba la discrepancia del ojo activo en pantalla (D47); ahora mira las de TODOS los ojos del caso, y el aviso dice explícitamente cuál hay que revisar si no es el que se está mirando | El dueño reportó (02/09/2026, con el PDF real de un caso de dos ojos) que el ojo izquierdo salía «sin resultados» sin explicación. Investigado hasta la causa exacta mirando el propio fichero del caso: OD tenía sus ocho resultados; OS, ninguno; `discrepanciasReconocidas` solo tenía `OD: true`. OS tenía dos aparatos (ZEISS IOLMaster 700 y OCULUS Pentacam) con un K2 que discrepaba 0.54 D —por encima del umbral de 0.5 D (D47)—, nunca reconocida. La secuencia real: el dueño confirmó mirando OD (sin discrepancia visible ahí), «Confirmar» estaba habilitado porque solo comprobaba el ojo activo, y `calcular()` descartó en silencio las casillas de OS (D51: una discrepancia sin reconocer no bloquea el resto del caso) — el diseño de D51 funcionó exactamente como se construyó, pero nadie llegó a VER la alarma de OS antes de que se descartara. Corregido en `PanelRevision.tsx`: las discrepancias se piden de todos los ojos del caso, no solo del activo, y bloquean «Confirmar» igual sea cual sea el ojo que se esté mirando. Nuevo test de interfaz que reproduce el caso real exacto (dos aparatos en OS con un K2 que discrepa, confirmar mirando OD) y comprueba que el botón se queda bloqueado hasta reconocer la discrepancia en OS |
| D61 | **El nombre del cirujano y el del paciente pasan a ser obligatorios para confirmar** — igual que un dato biométrico imposible, un dato sin comprobar o una discrepancia sin reconocer, faltar cualquiera de los dos bloquea el botón «Confirmar datos». Además, el bloque «Quién es» (antes solo en el cuestionario manual) pasa también a la pantalla de revisión, para que quien llega de un documento cargado —el camino más habitual— pueda escribirlos, cosa que antes no podía hacer en ningún sitio | Petición expresa del dueño del proyecto (02/09/2026): «igual que no te deja continuar si no metes los datos mínimos que necesitan los calculadores, también tienes que exigir el nombre del paciente y el cirujano, porque los calculadores lo piden siempre». Investigando para aplicarlo se encontró un hueco real: el bloque «Quién es» solo existía en `FormularioManual.tsx` — quien carga un documento (la vía más usada) nunca ha tenido dónde escribir estos dos nombres desde la interfaz, y las tres calculadoras llevaban recibiendo el código local del caso como sustituto silencioso (D44) sin que nadie lo supiera. Nuevo componente compartido `Identificacion.tsx` (`IdentificacionCaso`, `faltaIdentificacion`), usado en las dos pantallas — no se duplica la lógica, y el aviso de que el nombre del paciente SÍ viaja ahora a las tres calculadoras (D44) se corrige en el mismo sitio, donde antes decía lo contrario por error |
| D60 | **La córnea posterior puede venir de un aparato DISTINTO del resto de la biometría.** `OjoBiometrico` gana `aparatoCaraPosterior?: string`, independiente del `aparato` general (D47): sin él, `dispositivoCaraPosteriorPara()` (D58) sigue usando el aparato general, como hasta ahora; con él, manda ESE a EVO/Barrett en vez del general. En el formulario manual, el selector de aparato general (D47) vuelve arriba del todo, donde estuvo siempre; dentro del recuadro «Córnea posterior» hay un segundo desplegable, propio, que por defecto dice «Igual que arriba» | Corrige D58 el mismo día: el dueño probó el cambio y avisó de que, al mover el selector de aparato general dentro del recuadro de córnea posterior (para que se viera junto al desplegable de EVO/Barrett), **se perdió la forma de elegir el aparato para el resto de los datos** —AL, K1/K2, ACD…—. Explicó el motivo real, con las capturas de EVO/Barrett a la vista: esos dos desplegables son un campo aparte de verdad, no un espejo del aparato general, porque a veces se meten los datos generales de un aparato y la córnea posterior se ha medido con otro, aparte. La solución no era «dónde poner un único selector», sino que hacían falta DOS campos independientes — uno de dataset (D47, ya existía) y uno nuevo, solo para córnea posterior, que por defecto seguiría al general sin que nadie tuviera que tocar nada |
| D59 | **El lector local de imágenes prueba a girar la foto si la primera lectura sale poco fiable.** Se lee tal cual; si esa lectura ya está por debajo del umbral de «poca fiabilidad» que ya existía (60%), se prueba a girar 90°, 180° y 270° y se elige la de más fiabilidad de las cuatro. Con una foto bien orientada —el caso normal— no se prueba ningún giro: cero coste de más | Petición expresa del dueño del proyecto (02/09/2026), con dos fotos reales que el lector no conseguía leer: una era una foto de una PANTALLA (caso ya conocido y medido como el peor posible, 1 acierto de 20 — sin arreglo de código razonable, hace falta exportar o imprimir en vez de fotografiar el monitor); la otra era un papel impreso fotografiado girado 90°. Revisando el código se confirmó que el lector **nunca corregía el giro**: tesseract intenta leer el texto tal cual venga, de lado si hace falta. Se propuso también mandar la foto a otra IA externa para que la «formatee» antes de dárnosla — rechazado con pushback explícito: es el mismo problema de privacidad que encender el lector de visión (D26/D27), sin el control de saber qué hace esa IA con el dato, y sin pasar por la pantalla de revisión que guarda de dónde sale cada número. Verificado en vivo con un informe sintético girado 90°: lee exactamente los mismos valores que sin girar, con un aviso explicando que se corrigió el giro |
| D58 | **EVO y Barrett reciben también qué aparato midió la córnea posterior**, en el desplegable «Biometer»/«Device» que cada una enseña junto a su panel de córnea posterior medida — se traduce el `aparato` que ya tiene el dataset (D47) al texto exacto de CADA web (`dispositivoCaraPosteriorPara()` en `preparar-entradas.ts`, mismo patrón que D50 para las lentes); un aparato que esa web no reconoce —incluido «Otro», texto libre— no manda nada, y la web se queda en su propio valor por defecto, igual que hasta ahora. Kane no tiene córnea posterior (D51): este dato nunca le llega | Petición expresa del dueño del proyecto (01/09/2026), con capturas de pantalla de los dos desplegables — la primera solo mencionaba Barrett («en EVO no es necesario»), corregida en el mismo turno con una segunda captura: EVO tiene el mismo desplegable (`#DropDownListPK`, siempre visible) y necesitaba el mismo tratamiento que el de Barrett (`#MainContent_Device`, que solo aparece tras marcar «Measured PCA»). Los dos selectores y sus listas de opciones exactas se comprobaron en vivo el 01/09/2026, no de memoria; sin este dato las dos webs se quedaban en su propio aparato por defecto («IOLMaster 700»/«IOLMaster 700 TK») aunque el real fuera otro, aplicando una corrección de córnea posterior pensada para un aparato distinto del que de verdad la midió. Barrett no tiene «Anterion» en su lista (comprobado en vivo): un caso con ese aparato no le manda nada, tal y como manda la regla de «no adivinar». Verificado en vivo, tras construir, que `selectOption(selector, { label })` selecciona de verdad la opción correcta en las dos webs reales |

---

## 7. Decisiones abiertas ❓

| ID  | Pregunta                                                                                                              | Estado                                                                                                                            | Quién decide                  |
| --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| O1  | ¿Electron es la mejor opción o conviene aplicación web local + extensión de navegador?                                | **Cerrada** → D17. Electron, por el navegador controlado y las sesiones persistentes                                              | Claude propuso; falta validar |
| O2  | ¿OCR local, modelo de visión o sistema híbrido ofrece mayor precisión?                                                | **En curso, con herramienta**: `pnpm comparar:lectores`. La mitad local ya medida (apartado 14); la de los modelos necesita clave | Se decide mediante benchmark  |
| O3  | ¿Cómo gestionar de forma más robusta las sesiones/cookies de las tres webs?                                           | **Cerrada**: perfil de navegador persistente en la carpeta de datos del usuario, que nunca sale del ordenador                     | Claude                        |
| O4  | ¿Qué campos exactos devuelve cada web y cuáles merece la pena incluir en el informe?                                  | **Cerrada para EVO y Barrett** (ver `docs/INTEGRACIONES.md`). Abierta para Kane                                                   | Se determina al implementar   |
| O5  | ¿Qué formatos exactos de ANTERION, IOLMaster y Pentacam soportará V1?                                                 | **Abierta, en curso.** El 25/08/2026 se probó por primera vez contra un informe real (IOLMaster, Zeiss) y encontró un fallo de verdad —ya corregido: el segmentador perdía datos cuando el mismo ojo aparecía en dos secciones con campos complementarios—. Sigue siendo el bloqueo más importante: un informe de un aparato no es una validación; ANTERION y Pentacam siguen sin ninguno real           | Dueño + pruebas reales        |
| O6  | ¿Conviene guardar historial local de casos o trabajar sin persistencia?                                               | Abierta                                                                                                                           | Dueño, después del MVP        |
| O7  | ¿Se automatiza Kane, sabiendo que sus condiciones prohíben «operar un service bureau» y que la web declara reCAPTCHA? | Abierta. Bloquea cerrar el adaptador de Kane. Ver apartado 15                                                                     | Dueño, con criterio jurídico  |
| O8  | ¿Se enciende el lector de visión, sabiendo que el informe sale del ordenador?                                         | Abierta. Ver apartados 11 y 14                                                                                                    | Dueño, con criterio jurídico  |

---

## 8. Lo que NO es este proyecto

- No es una nueva fórmula de cálculo de LIO.
- No pretende reproducir internamente Kane, EVO o Barrett.
- No es el proyecto de ray tracing independiente.
- No es inicialmente un SaaS.
- No es inicialmente multiusuario.
- No es una historia clínica.
- No debe guardar información identificativa del paciente sin necesidad.
- No realiza cálculos inventando campos ausentes.
- No debe saltarse CAPTCHA ni mecanismos de seguridad.
- No debe decidir automáticamente qué lente implantar.
- No sustituye la comprobación profesional de los datos.
- No debe mezclar datos de distintos informes sin confirmación.

---

## 9. Fases del proyecto

| Fase | Qué incluye                                                      | Estado                                                                                      |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F0   | Arquitectura, modelo de datos, análisis técnico de las tres webs | ✅ Hecho                                                                                    |
| F1   | Carga de imagen/PDF + modelo biométrico normalizado              | ✅ Hecho                                                                                    |
| F2   | Extracción ANTERION / IOLMaster + pantalla de confirmación       | ⚠️ Construido y probado con documentos sintéticos; **sin validar con informes reales** (O5) |
| F3   | Primer adapter funcional: EVO                                    | ✅ Hecho y comprobado contra la web real                                                    |
| F4   | Adapter Kane                                                     | ✅ Verificado contra su formulario real y ejecutado de punta a punta. Sin su modo tórico    |
| F5   | Adapter Barrett                                                  | ✅ Hecho y comprobado contra la web real                                                    |
| F6   | Recogida y comparación de resultados                             | ✅ Hecho                                                                                    |
| F7   | Informe PDF                                                      | ✅ Hecho                                                                                    |
| F8   | Robustez, errores, cambios de las webs y tests end-to-end        | ✅ 478 tests y 27 pruebas de interfaz                                                       |
| F9   | Empaquetado sencillo para el ordenador del usuario               | ⬜ Pendiente: falta el instalador `.exe`                                                    |

El orden puede modificarse por razones técnicas documentadas.

---

## 10. Contexto de negocio relevante

El problema no es calcular una nueva fórmula.

El problema es que el usuario ya utiliza varias calculadoras y actualmente tiene
que leer y copiar manualmente los mismos datos varias veces.

El producto tiene que sentirse más parecido a:

    "subir → comprobar → calcular → comparar"

que a un software clínico complejo.

La interfaz debe ser extremadamente sencilla.

La mayor prioridad es evitar errores de transcripción.

Los informes pueden contener OD y OS.

También pueden recibirse varias imágenes de un mismo caso.

Nunca debe asumirse que dos imágenes pertenecen al mismo paciente/caso simplemente
porque se han cargado juntas.

Las páginas de terceros pueden cambiar su HTML. Los adapters deben diseñarse para
que ese cambio sea localizable y reparable.

---

## 11. Privacidad y datos clínicos

- No guardar imágenes reales en el repositorio.
- No incluir nombres, identificadores, fechas de nacimiento u otros datos personales
  en fixtures de test.
- Los fixtures serán sintéticos o correctamente anonimizados.
- Los archivos temporales deben eliminarse cuando deje de necesitarlos la sesión.
- No imprimir información identificativa en logs.
- Si se utiliza una API externa de visión, la arquitectura debe separar previamente
  la información identificativa cuando sea técnicamente viable y documentar
  exactamente qué se envía.
- Ninguna API key se almacena en Git.

### Qué se envía al lector de visión, exactamente

Este apartado cumple el requisito anterior. Cuando —y solo cuando— hay una clave
configurada y el lector de visión está encendido, cada lectura envía a la API de
Anthropic tres cosas y ninguna más:

1. **El documento tal y como lo subió el usuario**, en base64: el PDF o la imagen,
   sin recortar y sin modificar.
2. **Las instrucciones de transcripción**, que son fijas y están a la vista en
   `instrucciones()`, en `apps/desktop/src/main/extraccion/vision-claude.ts`.
3. **El catálogo de campos** que se pueden devolver, generado desde el dominio.

No se envía el código del caso, ni el nombre del fichero, ni resultados
anteriores, ni ningún otro dato del programa.

**Lo que eso implica, dicho sin rodeos:** si el informe lleva impreso el nombre del
paciente, su fecha de nacimiento o su número de historia, **eso viaja con él**.
Separarlo antes de enviarlo no es técnicamente viable: para localizar un nombre en
la imagen habría que leerla primero, y recortar a ciegas se llevaría por delante
datos biométricos. La cláusula «cuando sea técnicamente viable» de este apartado
se invoca aquí de forma explícita, no por omisión.

De ahí que el lector **venga apagado** (D26) y que encenderlo sea la decisión
abierta O8: exige valorar el encargado de tratamiento, qué lleva impreso el
informe que se sube y la política de retención del proveedor.

Con el lector apagado —el estado por defecto— **el programa no manda nada a
internet** salvo lo que las tres calculadoras necesitan: datos biométricos y un
código local, nunca un nombre (D23).

---

## 12. Métricas de éxito

Para considerar logrado el MVP:

| #   | Métrica                                                                          | Estado                                                    |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Puede cargar al menos los principales informes utilizados por el usuario         | ⚠️ Sin validar con informes reales (O5)                   |
| 2   | Extrae los campos biométricos relevantes y los presenta claramente para revisión | ✅                                                        |
| 3   | El usuario puede corregir cualquier dato antes de continuar                      | ✅                                                        |
| 4   | Nunca completa silenciosamente un dato clínico ausente                           | ✅ con test que lo vigila                                 |
| 5   | Puede ejecutar/preparar el flujo de las tres calculadoras objetivo               | ⚠️ EVO y Barrett sí; Kane cede el control al usuario (O7) |
| 6   | Recupera los resultados de las tres o informa claramente qué integración falló   | ✅                                                        |
| 7   | Produce una comparación comprensible                                             | ✅                                                        |
| 8   | Genera un PDF trazable con inputs y outputs                                      | ✅                                                        |
| 9   | El proceso completo requiere sustancialmente menos trabajo manual                | ✅ 47 s medidos, frente a media hora a mano               |
| 10  | Las rutas críticas tienen tests automatizados                                    | ✅ 254 tests y 8 de interfaz                              |
| 11  | Puede instalarse y utilizarse sin entorno de desarrollo                          | ⬜ Falta el instalador `.exe`                             |

---

## 13. Principio rector

Cuando haya conflicto entre:

    AUTOMATIZAR MÁS

y

    SABER CON SEGURIDAD QUÉ DATOS SE ESTÁN UTILIZANDO

gana siempre la segunda opción.

Calculator Vilamar debe ahorrar trabajo manual sin convertir un error automático
en un error clínico invisible.

> Este principio se escribió el 10/08/2026, antes de construir nada. El 11/08/2026
> una medición lo confirmó de la peor forma posible: ver el apartado siguiente. De
> él sale D28, que es este mismo principio aplicado al dato concreto.

---

## 14. Lo que se ha medido sobre la lectura de informes

Este apartado existe porque el principio rector no es una aspiración: es la
respuesta a unos datos.

### La confianza que declara el OCR no sirve de filtro

Sobre un informe convertido a PDF desde una imagen comprimida:

| Pone en el informe | Leyó      | Confianza que declaró |
| ------------------ | --------- | --------------------- |
| AL 24.01           | **24.81** | **93 %**              |
| AL 24.07           | **24.87** | 80 %                  |
| K1 40.27           | **48.27** | 68 %                  |

Y en el mismo documento, un **24.07 leído bien** declaraba un 79 %.

Dos conclusiones, y las dos importan:

1. **La confianza del OCR no distingue lo correcto de lo incorrecto.** El plan era
   usarla como filtro; la medición lo tumbó, porque el peor error tenía la
   confianza más alta de todas.
2. **La validación por rangos tampoco lo detecta.** 24.81 es una longitud axial
   perfectamente normal: es un error invisible que cambia la lente.

La causa es de raíz. Tesseract es un **reconocedor de caracteres**: un «8» bien
dibujado donde había un «0» es un 8 nítido, o sea alta confianza y valor
equivocado.

### Cuánto acierta, sobre seis documentos

`pnpm comparar:lectores`, 6 documentos × 20 datos = 120 comparaciones. Cada dato
cae en una de tres casillas, y **no valen lo mismo**: uno ausente se ve y lo
escribe la persona; uno equivocado que parece razonable no se ve.

| Documento                              | bien     | MAL   | falta  |
| -------------------------------------- | -------- | ----- | ------ |
| PDF con texto dentro                   | 20/20    | —     | —      |
| Captura de pantalla nítida             | 20/20    | —     | —      |
| PDF que por dentro es una imagen       | 19/20    | —     | 1      |
| JPEG pequeño y muy comprimido          | 18/20    | —     | 2      |
| Esa imagen convertida a PDF            | 13/20    | **1** | 6      |
| **Foto de una pantalla, algo torcida** | **1/20** | —     | **19** |
| **Total**                              | **91**   | **1** | **28** |

Lo que solo se ve con la tabla delante:

- **Un PDF con texto dentro se lee perfecto.** Si el aparato puede exportar así,
  ese es el camino y no hace falta nada más.
- **Una foto de la pantalla del aparato lo hunde: 1 de 20.** La imagen es
  perfectamente legible para cualquier persona —basta un giro de 2,4° y algo de
  desenfoque—. Y es justo lo que hace un usuario real cuando no puede exportar.

### Qué se hizo con esto

- **D28**: un dato leído por una máquina nunca se enseña como correcto. Sale en
  ámbar y hay que comprobarlo uno a uno contra el informe. Lo escrito a mano y el
  texto nativo de un PDF sí se confirman de una vez, porque son exactos.
- **D26**: existe un lector de visión, que sí entiende el documento, y viene
  apagado por lo que dice el apartado 11.
- **La regla para elegir lector** queda escrita en el propio comparador: _el más
  barato que no cometa ni un error_. A estos precios la diferencia entre modelos
  son céntimos por informe, así que lo útil no es «cuál es el mejor» sino «a
  partir de cuál deja de mejorar».

---

## 15. La cuestión de Kane

Kane exige aceptar un acuerdo de licencia antes de calcular, y su web declara
reCAPTCHA. El adaptador **detecta esa pantalla, avisa al usuario con un mensaje
claro y le cede el control**: no acepta condiciones en nombre de nadie ni intenta
rodear la protección (D9).

Sus condiciones prohíben, entre otras cosas, «operar un service bureau». Un
profesional que consulta la calculadora para sus propios pacientes no es
evidentemente eso, pero tampoco es evidentemente lo contrario.

Por eso está en O7 y **requiere revisión jurídica antes de cerrarse**. Hasta
entonces el adaptador queda como está: construido, sin verificar contra el
formulario real, y con la intervención humana como parte del diseño y no como un
apaño.

---

## 16. Dónde mirar

| Si buscas…                                      | Está en…                                |
| ----------------------------------------------- | --------------------------------------- |
| Qué funciona HOY de verdad, y qué no            | `PROJECT_STATUS.md`                     |
| Cómo se comporta Claude en este proyecto        | `.claude/CLAUDE.md`                     |
| El estado técnico y la estructura               | `docs/ARQUITECTURA.md`                  |
| Cómo es cada web externa por dentro             | `docs/INTEGRACIONES.md`                 |
| Cómo reparar un adaptador cuando una web cambie | `docs/MANTENIMIENTO.md`                 |
| Qué significa cada etapa del proyecto           | `docs/ESTADOS_DEL_PROYECTO.md`          |
| Guía para el dueño del proyecto                 | `docs/GETTING-STARTED.md`               |
| Vocabulario del dominio                         | `docs/DICCIONARIO.md`                   |
| Lecciones de sesiones anteriores                | `.claude/skills/lessons-learned/log.md` |
| Antes de compartir el repositorio con alguien   | `docs/ANTES_DE_COMPARTIR.md`            |

---

Última actualización: 25/08/2026
