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
| D23 | **A las webs se les manda el CÓDIGO LOCAL del caso**, nunca un nombre                                                         | Concreta D11. EVO y Barrett exigen «Patient Name»: se les da `CV-2026-0042`                                                                                                                                                                                                                                                                                                                                                          |
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

---

## 7. Decisiones abiertas ❓

| ID  | Pregunta                                                                                                              | Estado                                                                                                                            | Quién decide                  |
| --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| O1  | ¿Electron es la mejor opción o conviene aplicación web local + extensión de navegador?                                | **Cerrada** → D17. Electron, por el navegador controlado y las sesiones persistentes                                              | Claude propuso; falta validar |
| O2  | ¿OCR local, modelo de visión o sistema híbrido ofrece mayor precisión?                                                | **En curso, con herramienta**: `pnpm comparar:lectores`. La mitad local ya medida (apartado 14); la de los modelos necesita clave | Se decide mediante benchmark  |
| O3  | ¿Cómo gestionar de forma más robusta las sesiones/cookies de las tres webs?                                           | **Cerrada**: perfil de navegador persistente en la carpeta de datos del usuario, que nunca sale del ordenador                     | Claude                        |
| O4  | ¿Qué campos exactos devuelve cada web y cuáles merece la pena incluir en el informe?                                  | **Cerrada para EVO y Barrett** (ver `docs/INTEGRACIONES.md`). Abierta para Kane                                                   | Se determina al implementar   |
| O5  | ¿Qué formatos exactos de ANTERION, IOLMaster y Pentacam soportará V1?                                                 | **Abierta, y es hoy el bloqueo más importante del proyecto**: la lectura no se ha validado nunca contra un informe real           | Dueño + pruebas reales        |
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
| F4   | Adapter Kane                                                     | ⚠️ Construido: detecta su pantalla de condiciones y cede el control. **Sin verificar** (O7) |
| F5   | Adapter Barrett                                                  | ✅ Hecho y comprobado contra la web real                                                    |
| F6   | Recogida y comparación de resultados                             | ✅ Hecho                                                                                    |
| F7   | Informe PDF                                                      | ✅ Hecho                                                                                    |
| F8   | Robustez, errores, cambios de las webs y tests end-to-end        | ✅ 477 tests y 12 pruebas de interfaz                                                       |
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

Última actualización: 11/08/2026
