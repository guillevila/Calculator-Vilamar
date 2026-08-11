# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
