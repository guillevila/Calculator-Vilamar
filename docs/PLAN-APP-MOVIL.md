# Plan: acceso desde el móvil (servidor + PWA)

> Empezado el 19/09/2026. Es un proyecto NUEVO, separado del día a día de la
> app de escritorio — trabájalo en su propia rama de git
> (`feature/app-movil-servidor` o similar) y, si es posible, en una
> conversación de Claude aparte de la que sigue tocando la app de escritorio.
> Este documento existe precisamente para que esa conversación nueva no tenga
> que reconstruir el contexto desde cero: léelo entero antes de proponer nada.

## El objetivo

El dueño del proyecto quiere poder usar la aplicación desde el móvil —
principalmente para que su mujer (y él mismo) puedan calcular un caso sin
depender de tener el ordenador de escritorio delante. La primera idea que le
llegó (de otra IA, sin conocer este código) proponía una PWA en Python; se
descartó porque **este proyecto no está en Python, está en TypeScript**, y el
plan repetía además el error de no darle importancia a la pieza más difícil
del cambio (ver más abajo). Este documento recoge la estrategia decidida
después, con el dueño ya conociendo el código real.

## La ventaja de partida: esto no se construye desde cero

Tres decisiones que ya existían en la app de escritorio, tomadas sin pensar en
el móvil, hacen este cambio mucho más barato de lo que parece a primera vista:

1. **`packages/domain` no depende de Electron, React, Playwright ni del
   sistema de ficheros.** Toda la lógica clínica (biometría, invariantes,
   comparación de lentes, cálculo del dashboard) es TypeScript puro. Funciona
   igual en un servidor Node que en el escritorio — **se reutiliza sin tocar
   una línea.**
2. **`ServicioCasos`** (`apps/desktop/src/main/servicio-casos.ts`), el
   orquestador de todo el flujo (cargar documentos, calcular, generar PDF),
   recibe sus dependencias inyectadas (`DependenciasServicio`: cómo imprimir
   el PDF, dónde guardar archivos, cómo abrir el navegador) en vez de tenerlas
   fijas. Para que corra en un servidor en vez de en el PC del dueño, basta con
   darle OTRAS implementaciones de esas mismas piezas — la lógica de negocio
   de la clase no cambia.
3. **Toda la interfaz de escritorio habla con el resto de la app por un único
   canal** (`apps/desktop/src/renderer/api.ts`, sobre IPC de Electron). Si ese
   canal, en una versión web, habla por HTTP con un servidor en vez de por
   IPC, gran parte de las pantallas de React (`FormularioManual`,
   `PanelRevision`, `PanelCalculo`, `PanelResultados`…) se pueden reaprovechar
   casi tal cual, cambiando solo esa capa de comunicación.

## La pieza de verdad difícil, que no cambia con el móvil

`packages/integrations` automatiza EVO/Barrett/Kane con Playwright, abriendo
un navegador real y rellenando sus formularios — no hay ninguna API oficial.
Eso necesita un navegador corriendo en algún sitio SIEMPRE, tanto si la
pantalla final es de escritorio como si es un móvil. Hoy corre en el propio
ordenador del dueño; para el móvil, tiene que correr en un **servidor**
(un VPS barato, encendido 24h). Esta es la única pieza realmente nueva del
proyecto — todo lo demás es reutilizar y conectar.

## Decisiones ya tomadas con el dueño (19/09/2026)

- **La privacidad de que los datos viajen por internet queda descartada como
  preocupación, a petición expresa del dueño.** Dicho literalmente: «no me
  preocupa que los datos viajen por internet, aunque sean médicos, pienso que
  son parámetros de un ojo, nada se puede hacer con ellos, ya hay apps que lo
  hacen». Se le explicó la alternativa (cifrado, borrado automático) antes de
  que decidiera saltársela; la decisión es suya, informada. **Esto no reabre
  ninguna de las reglas de D2/D3 sobre confirmación humana o no inventar
  datos** — esas siguen intactas, es solo la pregunta de si los datos pueden
  salir del ordenador del usuario, que hasta ahora era que no (D1) y pasa a
  ser que sí, con su cuenta clara.
- **El servidor será un VPS alquilado (tipo Hetzner/DigitalOcean/Railway,
  5-10€/mes), no un ordenador propio encendido todo el día.**
- **Se construye y se prueba primero en un ordenador local, y solo cuando
  funcione bien se sube al VPS de verdad.** Es el proceso normal de
  desarrollo: mismo código, dos sitios.
- **El ordenador de pruebas NO debe ser el portátil de empresa del dueño.**
  Motivo explícito: el proyecto entero ya vive dentro de su OneDrive
  corporativo (Bausch & Lomb, Inc), y añadir un servidor en segundo plano con
  puertos de red y Chromium automatizando páginas constantemente es
  exactamente el tipo de actividad que puede llamar la atención de IT, aunque
  sea inocente. Se recomendó usar el ordenador personal/de casa (el de su
  mujer, o cualquier equipo no corporativo) para todo el desarrollo y pruebas
  de este proyecto.

## Lo que se pierde al pasar a un modelo cliente-servidor

Hoy cada instalación de escritorio es independiente (D1: «uso local, para un
único usuario») — los datos de cada persona viven solo en su propio PC, sin
sincronizarse con nadie. Un servidor compartido cambia esto de raíz: hace
falta **login por persona** y **aislamiento de datos por cuenta**, para que
el dueño y su mujer (y quien más use la app) no vean los casos de las demás
sin querer. Esto es una pieza de diseño nueva, no solo «montar un servidor».

## La estrategia, en cuatro fases

1. ✅ **Sacar `ServicioCasos` a un servidor Node**, con otras piezas
   inyectadas: generar el PDF con Playwright (`page.pdf()`, que ya se usa
   para las calculadoras) en vez de con `Electron.webContents.printToPDF`;
   guardar los archivos en el disco del servidor en vez de en el Escritorio
   del usuario. **Hecho y verificado en vivo el 20/09/2026**: las tres
   calculadoras (EVO, Barrett, Kane) funcionan de punta a punta contra las
   webs reales, hasta un PDF válido — ver `PROJECT_STATUS.md`. Pendiente
   solo para cuando se despliegue en el VPS de verdad: una pantalla virtual
   (`Xvfb` o similar), porque Barrett y Kane necesitan ventana y un Linux
   sin monitor no la tiene por defecto (`apps/server/src/navegador.ts`).
2. ✅ **Login sencillo + una carpeta de datos por persona** en el servidor —
   equivalente a como hoy cada PC tiene la suya, solo que compartiendo
   máquina. **Hecho y verificado en vivo el 20/09/2026**: cuentas en
   `usuarios.json` (creadas con `pnpm crear-usuario-servidor`, sin registro
   público), cookie de sesión firmada, y un `ServicioCasos` —con su propia
   carpeta de casos y su propio perfil de navegador— por cada cuenta, nunca
   uno compartido. Sin probar todavía CON una calculadora real de por medio
   (las pruebas de login no tocaron EVO/Barrett/Kane). Ver `PROJECT_STATUS.md`
   para la consecuencia de diseño sobre el código legible del caso
   (`CV-2026-0001…`), que puede repetirse entre dos cuentas distintas.
3. **Interfaz web (PWA)**, reaprovechando componentes de
   `apps/desktop/src/renderer` donde se pueda, cambiando la capa `api.ts` de
   IPC a `fetch()`/HTTP. `manifest.json` + Service Worker para que se pueda
   «instalar» en la pantalla de inicio del móvil. Sin empezar.
4. **Subida de foto directa desde el móvil** (cámara/galería) — esto además
   SIMPLIFICA el flujo actual para uso móvil: sustituye el rodeo de
   WhatsApp → OneDrive → «carpeta de entrada» (D84/D86) por una subida
   directa, sin mover ficheros a mano. Sin empezar.

## Lo que se mantiene exactamente igual

Todas las reglas clínicas, invariantes, el cálculo en sí, el contenido y
formato del PDF, el dashboard, la agenda de doctores — todo eso es el mismo
código, con las mismas comprobaciones que ya tiene hoy en el escritorio. No es
reconstruir la aplicación: es ponerle una puerta de entrada nueva al mismo
motor.

## Próximo paso

Fases 1 y 2 hechas y verificadas en vivo (20/09/2026) — ver el detalle en
`PROJECT_STATUS.md`. Sigue la Fase 3 (interfaz web/PWA) o, antes, decidir
con el dueño si hace falta resolver ya la pantalla virtual del VPS (Fase 1)
y la consecuencia del código de caso repetido entre cuentas (Fase 2), o si
pueden esperar a que haya algo que enseñar en el móvil.
