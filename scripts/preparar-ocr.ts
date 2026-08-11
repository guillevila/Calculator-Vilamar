/**
 * preparar-ocr.ts — Descarga por adelantado los datos del reconocimiento de texto.
 *
 * Sirve para dejar el programa listo para trabajar SIN CONEXIÓN. Son unos 5 MB y
 * se bajan una sola vez.
 *
 *     pnpm ocr:preparar
 *
 * Si no se ejecuta, la aplicación los descarga sola la primera vez que lea un
 * documento escaneado — y si no hay internet en ese momento, lo dice con
 * claridad en lugar de cerrarse.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  datosDeIdiomaPresentes,
  descargarDatosDeIdioma,
} from '../apps/desktop/src/main/extraccion/ocr.js'

/** La misma carpeta que usa Electron para sus datos en Windows. */
function carpetaDeDatos(): string {
  const appData = process.env['APPDATA']
  if (appData) return join(appData, 'calculator-vilamar', 'datos-ocr')
  // macOS y Linux, por si acaso.
  return process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'calculator-vilamar', 'datos-ocr')
    : join(homedir(), '.config', 'calculator-vilamar', 'datos-ocr')
}

const carpeta = carpetaDeDatos()
const idioma = process.argv[2] ?? 'eng'

console.log(`Carpeta de datos: ${carpeta}`)

if (datosDeIdiomaPresentes(carpeta, idioma)) {
  console.log(`✓ Los datos de «${idioma}» ya están. No hace falta descargar nada.`)
  process.exit(0)
}

console.log(`→ Descargando los datos de «${idioma}» (unos 5 MB)…`)
try {
  await descargarDatosDeIdioma(carpeta, idioma)
  console.log('✓ Listo. El reconocimiento de texto ya funciona sin conexión.')
} catch (error) {
  console.error('')
  console.error('✗ No se ha podido descargar.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
