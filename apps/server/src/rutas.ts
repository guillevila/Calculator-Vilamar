/**
 * rutas.ts — La parte de las rutas HTTP que tiene lógica propia y vale la
 * pena probar sin arrancar el servidor de verdad.
 *
 * El resto (llamar al método de `ServicioCasos` que toca) es delegación
 * pura, igual que cada `ipcMain.handle(...)` de la app de escritorio — eso
 * vive en `servidor.ts`, junto con Express, porque no tiene nada que probar
 * que no sea ya la propia prueba de `ServicioCasos`.
 */

import { resolve, sep } from 'node:path'

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

/**
 * La ruta absoluta de un informe a descargar, o `null` si `relativo` se sale
 * de `raizInformes` (por ejemplo, `../../../etc/passwd`).
 *
 * `POST /casos/pdf` nunca manda al cliente la ruta real del disco —solo esta
 * ruta relativa, ya generada por el propio servidor—, pero igualmente se
 * comprueba aquí que no se escapa: el cliente podría mandar cualquier cosa en
 * el parámetro, y esta es la única barrera entre eso y `res.download()`.
 */
export function rutaDescargaSegura(raizInformes: string, relativo: string): string | null {
  const raiz = resolve(raizInformes)
  const objetivo = resolve(raiz, relativo)
  if (objetivo !== raiz && !objetivo.startsWith(raiz + sep)) return null
  return objetivo
}
