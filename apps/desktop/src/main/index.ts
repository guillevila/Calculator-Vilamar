/**
 * index.ts — Proceso principal de Electron.
 *
 * Abre la ventana, prepara las carpetas de datos y conecta la interfaz con el
 * servicio de casos por IPC. La interfaz no tiene acceso ni al disco ni a
 * Playwright: todo pasa por aquí, con `contextIsolation` puesto.
 */

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Browser } from 'playwright'

import type { ArchivoEntrante, EstadoCalculo } from '../compartido/ipc.js'
import { CANALES } from '../compartido/ipc.js'
import { prepararCarpetas } from './almacen.js'
import { crearDiagnosticador } from './diagnostico.js'
import { crearMotorOcr } from './extraccion/ocr.js'
import { crearLectorPdf } from './extraccion/lector-pdf.js'
import { crearRasterizador } from './extraccion/rasterizador.js'
import { ProveedorDocumentos } from './extraccion/proveedor.js'
import { crearLectorVision } from './extraccion/vision-claude.js'
import { cargarEnv } from './ajustes.js'
import { ServicioCasos } from './servicio-casos.js'

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

/** La versión que se enseña en la pantalla y en el PDF. */
function versionDelProducto(): string {
  try {
    const paquete = JSON.parse(
      readFileSync(join(carpetaActual, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string }
    return paquete.version ?? app.getVersion()
  } catch {
    return app.getVersion()
  }
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
 */
async function imprimirPdf(html: string, destino: string): Promise<void> {
  const oculta = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false },
  })
  try {
    await oculta.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
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
    const { writeFileSync } = await import('node:fs')
    writeFileSync(destino, pdf)
  } finally {
    oculta.destroy()
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
    show: false,
    webPreferences: {
      preload: join(carpetaActual, '..', 'preload', 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  ventana.once('ready-to-show', () => ventana?.show())

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
    version,
    ahora: () => new Date(),
    abrirNavegador: (conVentana) => abrirNavegador(conVentana, carpetas.sesiones),
    imprimirPdf,
    emitirProgreso: (estado: EstadoCalculo) => enviarAlaInterfaz(CANALES.progreso, estado),
    emitirCaso: (caso) => enviarAlaInterfaz(CANALES.casoCambiado, caso),
  })

  const s = (): ServicioCasos => {
    if (!servicio) throw new Error('El servicio todavía no está listo.')
    return servicio
  }

  ipcMain.handle(CANALES.version, () => version)
  ipcMain.handle(CANALES.casoNuevo, () => s().nuevo())
  ipcMain.handle(CANALES.casoActual, () => s().obtener())

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

  ipcMain.handle(CANALES.editarMedida, (_e, ojo, campo, valor) =>
    s().editarMedida(ojo, campo, valor),
  )
  ipcMain.handle(CANALES.confirmarCampo, (_e, ojo, campo) => s().confirmarCampo(ojo, campo))
  ipcMain.handle(CANALES.elegirSexo, (_e, sexo) => s().elegirSexo(sexo))
  ipcMain.handle(CANALES.confirmarSexo, () => s().confirmarSexo())
  ipcMain.handle(CANALES.confirmarTodo, () => s().confirmarTodo())
  ipcMain.handle(CANALES.validar, () => s().validar())
  ipcMain.handle(CANALES.elegirLente, (_e, fabricante, modelo) =>
    s().elegirLente(fabricante, modelo),
  )
  ipcMain.handle(CANALES.calcular, (_e, calculadoras) => s().calcular(calculadoras))
  ipcMain.handle(CANALES.reintentar, (_e, calculadora, ojo) => s().reintentar(calculadora, ojo))
  ipcMain.handle(CANALES.cancelarCalculo, () => s().cancelarCalculo())
  ipcMain.handle(CANALES.generarPdf, () => s().generarPdf())
  ipcMain.handle(CANALES.abrirCarpetaInformes, () => shell.openPath(carpetas.informes))
}

instalarRedDeSeguridad()

void app.whenReady().then(() => {
  const carpetas = prepararCarpetas(app.getPath('userData'))
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
