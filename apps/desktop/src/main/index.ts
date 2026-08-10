/**
 * index.ts — Proceso principal de Electron.
 *
 * Abre la ventana, prepara las carpetas de datos y conecta la interfaz con el
 * servicio de casos por IPC. La interfaz no tiene acceso ni al disco ni a
 * Playwright: todo pasa por aquí, con `contextIsolation` puesto.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
import { ServicioCasos } from './servicio-casos.js'

const carpetaActual = join(fileURLToPath(import.meta.url), '..')

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
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
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
  // `launchPersistentContext` devuelve un contexto, no un navegador. El
  // orquestador quiere un navegador: se le da el suyo, que es el que lo creó.
  const navegador = contexto.browser()
  if (navegador) return navegador

  // Con perfil persistente puede no haber objeto navegador. Se envuelve el
  // contexto en lo mínimo que el orquestador usa, y se cierra el contexto de
  // verdad al cerrar.
  return {
    newContext: async () => contexto,
    close: async () => contexto.close(),
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

  const proveedor = new ProveedorDocumentos({
    lectorPdf: crearLectorPdf(),
    motorOcr: crearMotorOcr({ carpetaDatos: join(carpetas.raiz, 'datos-ocr') }),
    rasterizador,
    maximoPaginasOcr: 5,
  })

  servicio = new ServicioCasos({
    carpetas,
    proveedor,
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

  ipcMain.handle(CANALES.cargarDocumentos, async (_e, archivos: readonly ArchivoEntrante[]) =>
    s().cargarDocumentos(archivos),
  )

  ipcMain.handle(CANALES.elegirArchivos, async (): Promise<readonly ArchivoEntrante[]> => {
    if (!ventana) return []
    const r = await dialog.showOpenDialog(ventana, {
      title: 'Elige el informe de biometría',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Informes de biometría', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    })
    if (r.canceled) return []
    const { readFileSync: leer, statSync } = await import('node:fs')
    const { basename } = await import('node:path')
    return r.filePaths.map((ruta) => ({
      nombre: basename(ruta),
      tamanoBytes: statSync(ruta).size,
      datos: new Uint8Array(leer(ruta)),
    }))
  })

  ipcMain.handle(CANALES.editarMedida, (_e, ojo, campo, valor) =>
    s().editarMedida(ojo, campo, valor),
  )
  ipcMain.handle(CANALES.confirmarCampo, (_e, ojo, campo) => s().confirmarCampo(ojo, campo))
  ipcMain.handle(CANALES.confirmarTodo, () => s().confirmarTodo())
  ipcMain.handle(CANALES.validar, () => s().validar())
  ipcMain.handle(CANALES.elegirLente, (_e, fabricante, modelo) =>
    s().elegirLente(fabricante, modelo),
  )
  ipcMain.handle(CANALES.calcular, (_e, ojo, calculadoras) => s().calcular(ojo, calculadoras))
  ipcMain.handle(CANALES.cancelarCalculo, () => s().cancelarCalculo())
  ipcMain.handle(CANALES.generarPdf, () => s().generarPdf())
  ipcMain.handle(CANALES.abrirCarpetaInformes, () => shell.openPath(carpetas.informes))
}

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
