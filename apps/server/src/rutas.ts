/**
 * rutas.ts — La parte de las rutas HTTP que tiene lógica propia y vale la
 * pena probar sin arrancar el servidor de verdad.
 *
 * El resto (llamar al método de `ServicioCasos` que toca) es delegación
 * pura, igual que cada `ipcMain.handle(...)` de la app de escritorio — eso
 * vive en `servidor.ts`, junto con Express, porque no tiene nada que probar
 * que no sea ya la propia prueba de `ServicioCasos`.
 */

import type { ArchivoEntrante } from '@vilamar/casos'

/** Un fichero tal y como lo entrega `multer` tras un `multipart/form-data`. */
export interface FicheroSubido {
  readonly originalname: string
  readonly buffer: Uint8Array
}

/** Convierte un fichero subido en el `ArchivoEntrante` que espera `cargarDocumentos`. */
export function archivoEntranteDesdeSubida(fichero: FicheroSubido): ArchivoEntrante {
  return { nombre: fichero.originalname, datos: fichero.buffer }
}

/**
 * Qué código HTTP le corresponde a un fallo de `ServicioCasos`.
 *
 * `ServicioCasos` lanza un `Error` normal para lo que rechaza a propósito
 * (una invariante clínica, un doctor que ya no existe, un caso sin
 * confirmar…) — eso es un 400, culpa de la petición, no del servidor. Lo
 * que no sea un `Error` reconocible se trata como un fallo de verdad: 500.
 */
export function estadoHttpDelError(error: unknown): number {
  return error instanceof Error ? 400 : 500
}

export function mensajeDelError(error: unknown): string {
  return error instanceof Error ? error.message : 'Fallo inesperado del servidor.'
}
