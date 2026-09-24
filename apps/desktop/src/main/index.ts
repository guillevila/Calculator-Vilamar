/**
 * index.ts — Proceso principal de Electron.
 *
 * Abre la ventana, prepara las carpetas de datos y conecta la interfaz con el
 * servicio de casos por IPC. La interfaz no tiene acceso ni al disco ni a
 * Playwright: todo pasa por aquí, con `contextIsolation` puesto.
 */

import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Lateralidad } from '@vilamar/domain'
import type { Browser } from 'playwright'

import type { ArchivoEntrante, EstadoCalculo } from '../compartido/ipc.js'
import { CANALES } from '../compartido/ipc.js'
import { nuevoId, prepararCarpetas } from './almacen.js'
import { crearAlmacenCapturas } from './capturas.js'
import { crearDiagnosticador } from './diagnostico.js'
import { crearMotorOcr } from './extraccion/ocr.js'
import { crearLectorPdf } from './extraccion/lector-pdf.js'
import { crearRasterizador } from './extraccion/rasterizador.js'
import { ProveedorDocumentos } from './extraccion/proveedor.js'
import { crearLectorVision } from './extraccion/vision-claude.js'
import { cargarEnv } from './ajustes.js'
import { ServicioBandeja } from './servicio-bandeja.js'
import { ServicioCasos } from './servicio-casos.js'
import { ServicioDoctores } from './servicio-doctores.js'
import { ServicioLaboratorios } from './servicio-laboratorios.js'

const carpetaActual = join(fileURLToPath(import.meta.url), '..')

/**
 * El nombre con el que la aplicación guarda sus datos. Se fija ANTES de
 * preguntar por cualquier ruta.
 *
 * Sin esto, Electron lo saca del `name` del paquete —que es `@vilamar/desktop`—
 * y termina guardando en `%APPDATA%\@vilamar\desktop`: una carpeta con arroba,
 * imposible de encontrar para quien la busque, y distinta de la que documentamos
 * y de la que usan los scripts auxiliares. Los datos del OCR se descargaban en
 * un sitio y se buscaban en otro.
 */
app.setName('calculator-vilamar')

/**
 * Cuando la aplicación está empaquetada (`pnpm dist`), Playwright no puede
 * usar el Chromium del ordenador de quien la desarrolló — no existe en el
 * ordenador de quien la instala. `scripts/preparar-navegador-empaquetado.mjs`
 * descarga su propio Chromium dentro de `resources/playwright-browsers` en
 * el momento de empaquetar, y `electron-builder` lo copia junto al resto de
 * la aplicación (`build.extraResources`, en `package.json`). Esta línea le
 * dice a Playwright que lo busque ahí — nunca en la caché global del
 * sistema, que en el ordenador de destino no existe — antes de que
 * `abrirNavegador()` lo necesite. En desarrollo (`pnpm dev`) no se toca
 * nada: sigue usando la caché de siempre, la que deja `pnpm playwright:install`.
 */
if (app.isPackaged) {
  process.env['PLAYWRIGHT_BROWSERS_PATH'] = join(process.resourcesPath, 'playwright-browsers')
}

/**
 * La versión que se enseña en la pantalla (barra superior) y en el PDF —
 * para que el dueño del proyecto vea de un vistazo si está en la última
 * actualización. A propósito NO es el `version` de `package.json` (ese es
 * el número técnico que usa `electron-builder`, y npm exige que tenga forma
 * de semver: «0.1.0», nunca «1.01»): esto es un contador propio y más
 * simple, pensado para leerse sin conocimientos técnicos.
 *
 * Convención (pedida por el dueño el 15/09/2026): empieza en 1.01 y sube de
 * 0.01 en cada actualización que se le entrega — 1.01, 1.02, 1.03… Subir
 * este número es lo ÚLTIMO que se hace al cerrar un cambio en la aplicación
 * de escritorio, justo antes de avisar de que está listo para probar.
 */
const VERSION_VISIBLE = '1.24'

function versionDelProducto(): string {
  return VERSION_VISIBLE
}

let ventana: BrowserWindow | null = null
let servicio: ServicioCasos | null = null
const rasterizador = crearRasterizador()

/**
 * Red de seguridad: una excepción sin capturar NO puede cerrar la aplicación.
 *
 * Electron, por defecto, ante una excepción no capturada en el proceso principal
 * enseña un cuadro de diálogo con la traza y **mata el programa**. Para quien
 * está usando esto en una consulta, eso significa perder el caso que tenía a
 * medias por un fallo que casi nunca es grave.
 *
 * Pasó de verdad: sin conexión a internet, la librería de reconocimiento de
 * texto intentaba descargar sus datos y su fallo llegaba como evento del worker
 * —no como promesa rechazada—, así que se escapaba de todos los `try/catch` y
 * cerraba la aplicación.
 *
 * La causa concreta ya está arreglada en `extraccion/ocr.ts`. Esto es lo que
 * queda para la próxima vez que algo falle por un camino que no habíamos
 * previsto: se avisa, se apunta y **se sigue**.
 */
function instalarRedDeSeguridad(): void {
  const avisar = (titulo: string, error: unknown): void => {
    const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    // A la consola, el detalle técnico completo. Nunca lleva datos del paciente:
    // son fallos de librerías y de red.
    console.error(`[${titulo}]`, error)

    if (ventana && !ventana.isDestroyed()) {
      void dialog.showMessageBox(ventana, {
        type: 'warning',
        title: 'Algo no ha salido como esperaba',
        message: 'Ha fallado una parte del programa, pero tu caso no se ha perdido.',
        detail:
          'Puedes seguir trabajando: revisa los datos en pantalla y, si hace falta, escríbelos a mano.\n\n' +
          `Detalle técnico (por si hay que arreglarlo): ${detalle}`,
        buttons: ['Continuar'],
        noLink: true,
      })
    }
  }

  process.on('uncaughtException', (error) => avisar('excepción no capturada', error))
  process.on('unhandledRejection', (motivo) => avisar('promesa rechazada sin capturar', motivo))
}

function enviarAlaInterfaz(canal: string, carga: unknown): void {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send(canal, carga)
}

/**
 * Convierte HTML en PDF con el propio Electron.
 *
 * Se usa una ventana oculta y `printToPDF`. Así no hace falta ninguna librería
 * de PDF ni nada que compile.
 *
 * ⚠️ **El HTML se escribe a un fichero temporal y se carga con `loadFile`, no
 * con una URL `data:`.** Antes se metía el HTML entero, codificado, en la
 * propia URL (`data:text/html;charset=utf-8,...`) — funcionaba mientras el
 * informe era pequeño, pero Chromium **rechaza cualquier URL de más de
 * 2 097 152 caracteres** con `ERR_INVALID_URL` (-300), sin margen ni aviso
 * previo. Un informe de un ojo con varios biómetros (D47) junta varias
 * capturas de pantalla en base64 en el mismo HTML y lo cruza sin esfuerzo.
 * Un fichero no tiene ese límite: solo la ruta viaja por la URL.
 */
async function imprimirPdf(html: string, destino: string): Promise<void> {
  const oculta = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false },
  })
  const { writeFileSync, unlinkSync } = await import('node:fs')
  const rutaTemporal = `${destino}.tmp.html`
  try {
    writeFileSync(rutaTemporal, html, 'utf-8')
    await oculta.loadFile(rutaTemporal)
    // Un respiro para que termine de maquetar antes de imprimir.
    await new Promise((r) => setTimeout(r, 400))
    const pdf = await oculta.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      // ⚠️ **Margen CERO a propósito, y no es un descuido.**
      //
      // El informe está paginado a mano: cada `<section class="hoja">` es una hoja
      // A4 completa que lleva sus propios márgenes dentro (ver `plantilla.ts`). Es
      // el mismo contrato que usa el lienzo de diseño donde se maquetó —`@page {
      // margin: 0 }` y la hoja a sangre—, y las dos cosas tienen que coincidir.
      //
      // Con los 0.5 pulgadas de antes, cada hoja de 297 mm entraba en una página
      // de 273 mm útiles: se cortaba el pie y se colaba una página en blanco
      // detrás de cada una.
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
    writeFileSync(destino, pdf)
  } finally {
    oculta.destroy()
    try {
      unlinkSync(rutaTemporal)
    } catch {
      // No llegó a crearse, o ya se limpió. No es un fallo del PDF.
    }
  }
}

/**
 * Abre el navegador que usan las calculadoras.
 *
 * Con perfil persistente y en la carpeta de datos del usuario: así las sesiones
 * y las cookies se conservan entre ejecuciones y no hay que repetir pasos. Ese
 * perfil no sale nunca de la máquina.
 */
async function abrirNavegador(conVentana: boolean, perfil: string): Promise<Browser> {
  const { chromium } = await import('playwright')
  const contexto = await chromium.launchPersistentContext(perfil, {
    headless: !conVentana,
    viewport: { width: 1500, height: 1050 },
  })

  // ⚠️ **NO se devuelve `contexto.browser()`, aunque exista.** Aquí había un
  // fallo silencioso, y está MEDIDO:
  //
  //   Con perfil persistente, `contexto.browser()` SÍ devuelve un navegador. Y
  //   `navegador.newContext()` —que es lo que llama el orquestador— crea un
  //   contexto **nuevo y vacío que no hereda el perfil**. Comprobado: una cookie
  //   puesta en el contexto persistente se ve como 1 en él y como 0 en el nuevo.
  //
  // O sea: el perfil se cargaba y no se usaba nunca. Las cookies del cálculo
  // vivían en un contexto desechable y morían con él, así que **la aceptación de
  // las condiciones de Kane no podía recordarse jamás** — se pedía otra vez en
  // cada cálculo, hiciera el usuario lo que hiciera.
  //
  // Devolviendo el envoltorio, `newContext()` entrega EL contexto persistente y
  // todo lo que pase en el cálculo queda en el perfil de la carpeta de datos del
  // usuario. Ese perfil no sale nunca de la máquina.
  return {
    newContext: async () => contexto,
    contexts: () => [contexto],
    // Cerrar el contexto persistente es lo que vuelca cookies y sesión al disco.
    // Se llama dos veces —el orquestador cierra el contexto y el servicio el
    // navegador— y la segunda es inofensiva.
    close: async () => contexto.close(),
    isConnected: () => true,
  } as unknown as Browser
}

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: '#F5F7FA',
    title: 'Calculator Vilamar',
    show: true,
    webPreferences: {
      preload: join(carpetaActual, '..', 'preload', 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  ventana.webContents.setWindowOpenHandler(({ url }) => {
    // Nada se abre dentro de la aplicación: los enlaces van al navegador.
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void ventana.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void ventana.loadFile(join(carpetaActual, '..', 'renderer', 'index.html'))
  }

  ventana.show()
  ventana.focus()
}

function registrarCanales(carpetas: ReturnType<typeof prepararCarpetas>): void {
  const version = versionDelProducto()

  // Antes que nada: si hay un `.env`, se carga. Tiene que ir aquí arriba porque
  // el lector de visión mira `ANTHROPIC_API_KEY` al construirse, y una clave
  // cargada después no la vería nadie.
  cargarEnv(carpetas.raiz)

  const proveedor = new ProveedorDocumentos({
    lectorPdf: crearLectorPdf(),
    motorOcr: crearMotorOcr({ carpetaDatos: join(carpetas.raiz, 'datos-ocr') }),
    rasterizador,
    maximoPaginasOcr: 5,
  })

  // Se construye siempre, esté configurado o no: así la aplicación puede decir
  // «hay un lector mejor y está apagado» en lugar de comportarse distinto sin
  // explicar por qué. Sin clave, se declara no disponible y no se usa.
  const lectorVision = crearLectorVision()

  servicio = new ServicioCasos({
    carpetas,
    proveedor,
    lectorVision,
    diagnosticador: crearDiagnosticador(carpetas.diagnostico),
    capturas: crearAlmacenCapturas(carpetas.capturas),
    version,
    ahora: () => new Date(),
    abrirNavegador: (conVentana) => abrirNavegador(conVentana, carpetas.sesiones),
    imprimirPdf,
    emitirProgreso: (estado: EstadoCalculo) => enviarAlaInterfaz(CANALES.progreso, estado),
    emitirCaso: (caso) => enviarAlaInterfaz(CANALES.casoCambiado, caso),
  })

  const doctores = new ServicioDoctores({ carpetas, nuevoId })
  const laboratorios = new ServicioLaboratorios({ carpetas, nuevoId })
  const bandeja = new ServicioBandeja({ carpetas, nuevoId, ahora: () => new Date() })

  const s = (): ServicioCasos => {
    if (!servicio) throw new Error('El servicio todavía no está listo.')
    return servicio
  }

  ipcMain.handle(CANALES.version, () => version)
  ipcMain.handle(CANALES.casoNuevo, () => s().nuevo())
  ipcMain.handle(CANALES.casoActual, () => s().obtener())
  ipcMain.handle(CANALES.listarCasosGuardados, () => s().listarCasosGuardados())
  ipcMain.handle(CANALES.abrirCaso, (_e, codigo) => s().abrirCaso(codigo))
  ipcMain.handle(CANALES.resumenDashboard, (_e, rango) => s().resumenDashboard(rango))
  ipcMain.handle(CANALES.listarDoctoresExcluidosDeEstadisticas, () => s().listarDoctoresExcluidos())
  ipcMain.handle(CANALES.excluirDoctorDeEstadisticas, (_e, nombre) =>
    s().excluirDoctorDeEstadisticas(nombre),
  )
  ipcMain.handle(CANALES.incluirDoctorEnEstadisticas, (_e, nombre) =>
    s().incluirDoctorEnEstadisticas(nombre),
  )
  ipcMain.handle(CANALES.eliminarCasosDeDoctor, (_e, nombre, rango) =>
    s().eliminarCasosDeDoctor(nombre, rango),
  )

  /** Convierte rutas en documentos leídos del disco. El contenido no sale de aquí. */
  const desdeRutas = (rutas: readonly string[]): ArchivoEntrante[] =>
    rutas.map((ruta) => ({ nombre: basename(ruta), ruta }))

  ipcMain.handle(CANALES.cargarDocumentos, async (_e, archivos: readonly ArchivoEntrante[]) =>
    // Cada archivo trae su ruta o su contenido; el servicio se ocupa de los dos.
    s().cargarDocumentos(archivos),
  )

  ipcMain.handle(CANALES.elegirYCargarDocumentos, async () => {
    if (!ventana) return null
    const r = await dialog.showOpenDialog(ventana, {
      title: 'Elige el informe de biometría',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Informes de biometría', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    // Se lee y se procesa aquí mismo. El contenido del fichero no pasa por la
    // pantalla: antes hacía el viaje de ida y vuelta, y en ese viaje se perdía.
    return s().cargarDocumentos(desdeRutas(r.filePaths))
  })

  ipcMain.handle(CANALES.editarMedida, (_e, ojo, campo, valor, aparato) =>
    s().editarMedida(ojo, campo, valor, aparato),
  )
  ipcMain.handle(CANALES.establecerIdentificacion, (_e, datos) =>
    s().establecerIdentificacion(datos),
  )
  ipcMain.handle(CANALES.listarDoctores, () => doctores.listar())
  ipcMain.handle(CANALES.guardarDoctor, (_e, datos) => doctores.guardar(datos))
  ipcMain.handle(CANALES.eliminarDoctor, (_e, id) => doctores.eliminar(id))
  ipcMain.handle(CANALES.aplicarDoctor, (_e, id: string) => {
    const doctor = doctores.obtener(id)
    if (!doctor) throw new Error('Ese doctor ya no está guardado.')
    return s().aplicarDoctor(doctor)
  })
  ipcMain.handle(CANALES.listarLaboratorios, () => laboratorios.listar())
  ipcMain.handle(CANALES.guardarLaboratorio, (_e, datos) => laboratorios.guardar(datos))
  ipcMain.handle(CANALES.eliminarLaboratorio, (_e, id) => laboratorios.eliminar(id))
  ipcMain.handle(CANALES.guardarPedidoLente, (_e, lado, datos) =>
    s().guardarPedidoLente(lado, datos),
  )
  /**
   * Abre el programa de correo con el pedido ya redactado (D93, 20/09/2026)
   * — nunca se manda solo. `ServicioCasos` construye el texto sin depender
   * de `ServicioLaboratorios` (igual que `aplicarDoctor` no depende de
   * `ServicioDoctores`); el email de destino se resuelve aquí, mirando el
   * fabricante del pedido guardado.
   */
  ipcMain.handle(CANALES.pedirAlLaboratorio, async (_e, lado: Lateralidad) => {
    const caso = s().obtener()
    const pedido = caso?.pedidosLente?.[lado]
    if (!pedido) throw new Error('Todavía no se ha guardado ninguna lente a pedir para ese ojo.')
    const email = laboratorios.emailDe(pedido.fabricante)
    if (!email) {
      throw new Error(
        `No hay ningún email guardado para «${pedido.fabricante}». Añádelo en «Laboratorios».`,
      )
    }
    const { asunto, cuerpo } = s().mailtoPedidoLente(lado)
    const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    await shell.openExternal(url)
  })
  ipcMain.handle(CANALES.listarBandeja, () => bandeja.listar())
  ipcMain.handle(CANALES.crearEntradaBandeja, (_e, datos) => bandeja.crear(datos))
  ipcMain.handle(CANALES.editarEntradaBandeja, (_e, id, datos) => bandeja.editar(id, datos))
  ipcMain.handle(CANALES.vincularEntradaBandeja, (_e, id, casoCodigo) =>
    bandeja.vincularCaso(id, casoCodigo),
  )
  ipcMain.handle(CANALES.marcarEntradaBandejaEnviada, (_e, id, enviado) =>
    bandeja.marcarEnviado(id, enviado),
  )
  ipcMain.handle(CANALES.eliminarEntradaBandeja, (_e, id) => bandeja.eliminar(id))
  ipcMain.handle(CANALES.obtenerCarpetaEntrada, () => bandeja.carpetaEntrada())
  ipcMain.handle(CANALES.elegirYConfigurarCarpetaEntrada, async () => {
    if (!ventana) return null
    const r = await dialog.showOpenDialog(ventana, {
      title: 'Elige la carpeta de entrada (donde guardas las fotos de biometría)',
      properties: ['openDirectory'],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const ruta = r.filePaths[0]
    if (!ruta) return null
    bandeja.configurarCarpetaEntrada(ruta)
    return ruta
  })
  ipcMain.handle(CANALES.buscarFotosNuevasEnCarpeta, () => bandeja.buscarFotosNuevas())
  ipcMain.handle(CANALES.confirmarCampo, (_e, ojo, campo, aparato) =>
    s().confirmarCampo(ojo, campo, aparato),
  )
  ipcMain.handle(CANALES.confirmarTodoElOjo, (_e, ojo, aparato) =>
    s().confirmarTodoElOjo(ojo, aparato),
  )
  ipcMain.handle(CANALES.elegirSexo, (_e, sexo) => s().elegirSexo(sexo))
  ipcMain.handle(CANALES.confirmarSexo, () => s().confirmarSexo())
  ipcMain.handle(CANALES.confirmarTodo, () => s().confirmarTodo())
  ipcMain.handle(CANALES.validar, () => s().validar())
  ipcMain.handle(CANALES.discrepanciasDe, (_e, ojo) => s().discrepanciasDe(ojo))
  ipcMain.handle(CANALES.reconocerDiscrepancia, (_e, ojo) => s().reconocerDiscrepancia(ojo))
  ipcMain.handle(CANALES.renombrarAparato, (_e, ojo, aparatoViejo, aparatoNuevo) =>
    s().renombrarAparato(ojo, aparatoViejo, aparatoNuevo),
  )
  ipcMain.handle(CANALES.editarAparatoCaraPosterior, (_e, ojo, aparato, aparatoCaraPosterior) =>
    s().editarAparatoCaraPosterior(ojo, aparato, aparatoCaraPosterior),
  )
  ipcMain.handle(CANALES.editarSituacionCorneal, (_e, ojo, aparato, situacionCorneal) =>
    s().editarSituacionCorneal(ojo, aparato, situacionCorneal),
  )
  ipcMain.handle(
    CANALES.elegirLente,
    (_e, fabricante, modelo, nombreEnEvo, nombreEnKane, constanteConocida) =>
      s().elegirLente(fabricante, modelo, nombreEnEvo, nombreEnKane, constanteConocida),
  )
  ipcMain.handle(CANALES.elegirLenteSecundaria, (_e, eleccion) =>
    s().elegirLenteSecundaria(eleccion),
  )
  ipcMain.handle(CANALES.intercambiarLentes, () => s().intercambiarLentes())
  ipcMain.handle(CANALES.calcular, (_e, calculadoras, filtro) => s().calcular(calculadoras, filtro))
  ipcMain.handle(CANALES.reintentar, (_e, calculadora, ojo) => s().reintentar(calculadora, ojo))
  ipcMain.handle(CANALES.cancelarCalculo, () => s().cancelarCalculo())
  ipcMain.handle(CANALES.generarPdf, () => s().generarPdf())
  ipcMain.handle(CANALES.abrirCarpetaInformes, () => shell.openPath(carpetas.informes))
}

instalarRedDeSeguridad()

void app.whenReady().then(() => {
  // Los informes se guardan en el Escritorio, dentro de «Calculadora
  // Vilamar» (D57, 01/09/2026) — petición expresa del dueño del proyecto,
  // avisado de que en este ordenador eso los sube a la nube corporativa
  // (el Escritorio está sincronizado con OneDrive), y aun así decidió
  // seguir adelante. El resto de datos internos del programa se queda en
  // la carpeta de siempre, sin cambios.
  //
  // ⚠️ `VILAMAR_CARPETA_INFORMES`, si está puesta, manda sobre el
  // Escritorio real — es lo que usan las pruebas de interfaz
  // (`apps/desktop/e2e/flujo.spec.ts`) para no escribir PDF de prueba en
  // el Escritorio de verdad de quien las ejecute. `--user-data-dir` no
  // sirve para esto: solo mueve `userData`, y `app.getPath('desktop')` no
  // depende de ese flag.
  const carpetas = prepararCarpetas(
    app.getPath('userData'),
    process.env['VILAMAR_CARPETA_INFORMES'] ??
      join(app.getPath('desktop'), 'Calculadora Vilamar', 'informes'),
  )
  registrarCanales(carpetas)
  crearVentana()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  void rasterizador.cerrar()
  if (process.platform !== 'darwin') app.quit()
})
