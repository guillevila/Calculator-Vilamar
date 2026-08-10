# SYSTEM_VISION.md — Calculator Vilamar

> Documento de visión del producto.
> Define QUÉ queremos construir, PARA QUIÉN y qué decisiones de producto
> están cerradas. La implementación técnica concreta la decide Claude cuando
> no esté expresamente fijada aquí.

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

---

## 4. Flujo ideal del producto

### Paso 1 — Nuevo caso

El usuario pulsa:

    NUEVO CÁLCULO

y arrastra o selecciona una o varias imágenes/PDF.

---

### Paso 2 — Detección del informe

El sistema intenta identificar:

- dispositivo / tipo de informe;
- ojo OD / OS;
- qué datos contiene;
- qué datos faltan.

Dispositivos iniciales prioritarios:

- Heidelberg Engineering ANTERION
- ZEISS IOLMaster 700
- Pentacam

La arquitectura debe permitir añadir más formatos posteriormente.

---

### Paso 3 — Extracción estructurada

El sistema no devuelve simplemente texto OCR.

Debe convertir el documento a un modelo de datos normalizado.

Ejemplo conceptual:

Case
 ├── reports[]
 └── eyes
      ├── OD
      │    ├── AL
      │    ├── K1
      │    ├── K1_axis
      │    ├── K2
      │    ├── K2_axis
      │    ├── ACD
      │    ├── LT
      │    ├── CCT
      │    ├── WTW
      │    ├── TK / posterior cornea si existe
      │    └── ...
      └── OS
           └── ...

Cada dato debe poder conservar, cuando sea posible:

- valor;
- unidad;
- ojo;
- procedencia;
- dispositivo;
- confianza de extracción;
- si fue leído directamente o derivado;
- si fue confirmado manualmente.

---

### Paso 4 — Revisión humana OBLIGATORIA

Antes de enviar ningún dato a una calculadora externa, el usuario ve una pantalla
de confirmación.

Ejemplo:

    OD — ANTERION

    AL        24.07 mm        ✓
    K1        41.22 D @175°   ✓
    K2        42.52 D @85°    ✓
    ACD       3.18 mm         ✓
    LT        4.53 mm         ✓
    CCT       530 µm          ✓

El usuario puede corregir cualquier campo.

NO existe un modo que envíe automáticamente datos extraídos por OCR/visión sin
esta confirmación previa.

---

### Paso 5 — Validación

Antes de continuar, el sistema comprueba:

- campos obligatorios;
- unidades;
- rangos plausibles;
- laterality OD/OS;
- ejes;
- coherencia básica entre campos;
- requisitos específicos de cada calculadora.

Un dato faltante NO se inventa.

Debe mostrarse:

    Barrett necesita WTW y este informe no lo contiene.

en lugar de introducir un valor por defecto oculto.

---

### Paso 6 — Adaptadores de calculadoras

Existe una capa independiente para cada calculadora:

    KaneAdapter
    EvoAdapter
    BarrettAdapter

Todos reciben el mismo modelo biométrico normalizado.

Cada adapter decide únicamente:

- qué campos necesita esa calculadora;
- cómo se llaman;
- cómo se introducen;
- cómo interpretar la respuesta.

La información clínica no debe duplicarse ni transformarse de forma opaca entre
calculadoras.

---

### Paso 7 — Automatización web

El objetivo es eliminar al máximo la entrada manual.

La herramienta puede:

- abrir las páginas;
- navegar;
- rellenar formularios;
- seleccionar opciones;
- ejecutar acciones permitidas;
- esperar resultados;
- leer los resultados.

Si una web exige:

- CAPTCHA;
- aceptación de condiciones;
- autenticación;
- alguna interacción que no deba automatizarse;

la aplicación debe detenerse y pedir al usuario esa acción.

NUNCA se implementarán mecanismos para evadir CAPTCHA, autenticación,
protecciones técnicas o condiciones de acceso.

---

### Paso 8 — Comparación

El usuario recibe una pantalla visual con los resultados de cada calculadora.

Ejemplo conceptual:

                    KANE       EVO       BARRETT
    Esfera          21.0       21.0      21.5
    Cilindro        ...        0.75      0.75
    Eje             ...        81°       82°
    Residual        ...        ...       ...

Además:

- concordancias;
- discrepancias;
- diferencia máxima de potencia;
- campos utilizados por cada calculadora;
- advertencias;
- datos que faltaron;
- fecha/hora del cálculo.

La herramienta puede destacar:

    Kane y EVO coinciden en +21.0 D.

pero no debe inventar una cuarta fórmula ni ocultar discrepancias.

---

### Paso 9 — Informe PDF

Debe poder generarse un PDF claro y profesional con:

1. identificación NO sensible del caso;
2. datos biométricos confirmados;
3. procedencia de los datos;
4. resultados de Kane;
5. resultados de EVO;
6. resultados de Barrett;
7. comparación visual;
8. advertencias y datos faltantes;
9. fecha del cálculo.

El PDF debe permitir comprobar exactamente qué datos fueron utilizados.

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

Claude debe realizar al inicio una pequeña evaluación técnica y escoger el stack
más sencillo y mantenible.

Candidato preferido si no aparece una razón mejor:

- TypeScript
- React
- aplicación de escritorio con Electron
- Playwright para automatización de navegador
- tests con Vitest/Playwright
- almacenamiento local mínimo

### Extracción de documentos

NO se fija todavía qué tecnología de visión/OCR utilizar.

Debe existir una interfaz desacoplada:

    DocumentExtractor

para poder comparar posteriormente:

- OCR local;
- modelo de visión;
- combinación OCR + reglas;
- extractor específico por dispositivo.

La elección debe hacerse por PRECISIÓN sobre informes reales, no por moda.

---

## 6. Decisiones cerradas ✅

| ID | Decisión | Razón |
|----|----------|-------|
| D1 | El producto inicial es de uso local y para un único usuario | No necesitamos SaaS ni infraestructura compleja |
| D2 | Los datos extraídos siempre requieren confirmación humana antes de enviarse | Un error OCR en biometría puede ser clínicamente relevante |
| D3 | Ningún campo clínico faltante se inventa ni se completa silenciosamente | Trazabilidad y seguridad |
| D4 | Kane, EVO Toric y Barrett Toric son las tres integraciones iniciales | Son las tres calculadoras que el usuario quiere consultar |
| D5 | Cada calculadora tendrá un adapter independiente | Las webs cambiarán y deben poder repararse por separado |
| D6 | Existirá un único modelo normalizado de biometría | Evita introducir tres veces información ligeramente diferente |
| D7 | El sistema conservará procedencia y estado de confirmación de cada dato | Debe poder auditarse qué se leyó y qué se corrigió |
| D8 | La herramienta no implementa ni replica las fórmulas de Kane, EVO o Barrett | Su función es automatizar el flujo de usuario |
| D9 | CAPTCHA, login y protecciones externas no se evaden | Si requieren intervención humana, se solicita |
| D10 | No se mezclan automáticamente informes de pacientes/casos diferentes | Mezclar ojos o pacientes sería un fallo crítico |
| D11 | Ninguna imagen clínica real se almacena en Git ni se incluye en el repositorio | Privacidad |
| D12 | No habrá base de datos clínica en la primera versión | No es necesaria para el caso de uso inicial |
| D13 | Los resultados deben poder exportarse a PDF | Es parte del flujo final del usuario |
| D14 | La primera versión no da una recomendación clínica propia | Compara las salidas de las calculadoras externas |
| D15 | El producto debe seguir funcionando aunque una de las tres calculadoras falle | Un adapter roto no debe bloquear necesariamente los demás |

---

## 7. Decisiones abiertas ❓

| ID | Pregunta | Quién decide |
|----|----------|--------------|
| O1 | ¿Electron es la mejor opción o conviene aplicación web local + extensión de navegador? | Claude propone; dueño valida |
| O2 | ¿OCR local, modelo de visión o sistema híbrido ofrece mayor precisión? | Se decide mediante benchmark |
| O3 | ¿Cómo gestionar de forma más robusta las sesiones/cookies de las tres webs? | Claude |
| O4 | ¿Qué campos exactos devuelve cada web y cuáles merece la pena incluir en el informe? | Se determina al implementar cada adapter |
| O5 | ¿Qué formatos exactos de ANTERION, IOLMaster y Pentacam soportará V1? | Dueño + pruebas reales |
| O6 | ¿Conviene guardar historial local de casos o trabajar sin persistencia? | Dueño, después del MVP |

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

| Fase | Qué incluye | Estado |
|------|-------------|--------|
| F0 | Arquitectura, modelo de datos, análisis técnico de las tres webs | ⬜ Pendiente |
| F1 | Carga de imagen/PDF + modelo biométrico normalizado | ⬜ Pendiente |
| F2 | Extracción ANTERION / IOLMaster + pantalla de confirmación | ⬜ Pendiente |
| F3 | Primer adapter funcional: EVO | ⬜ Pendiente |
| F4 | Adapter Kane | ⬜ Pendiente |
| F5 | Adapter Barrett | ⬜ Pendiente |
| F6 | Recogida y comparación de resultados | ⬜ Pendiente |
| F7 | Informe PDF | ⬜ Pendiente |
| F8 | Robustez, errores, cambios de las webs y tests end-to-end | ⬜ Pendiente |
| F9 | Empaquetado sencillo para el ordenador del usuario | ⬜ Pendiente |

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

---

## 12. Métricas de éxito

Para considerar logrado el MVP:

1. Puede cargar al menos los principales informes utilizados por el usuario.
2. Extrae los campos biométricos relevantes y los presenta claramente para revisión.
3. El usuario puede corregir cualquier dato antes de continuar.
4. Nunca completa silenciosamente un dato clínico ausente.
5. Puede ejecutar/preparar el flujo de las tres calculadoras objetivo.
6. Recupera los resultados de las tres o informa claramente qué integración falló.
7. Produce una comparación comprensible.
8. Genera un PDF trazable con inputs y outputs.
9. El proceso completo requiere sustancialmente menos trabajo manual que rellenar
   las tres webs por separado.
10. Las rutas críticas tienen tests automatizados.
11. Puede instalarse y utilizarse en el ordenador del usuario sin entorno de
    desarrollo.

---

## 13. Principio rector

Cuando haya conflicto entre:

    AUTOMATIZAR MÁS

y

    SABER CON SEGURIDAD QUÉ DATOS SE ESTÁN UTILIZANDO

gana siempre la segunda opción.

Calculator Vilamar debe ahorrar trabajo manual sin convertir un error automático
en un error clínico invisible.

---

Última actualización: 10/08/2026
