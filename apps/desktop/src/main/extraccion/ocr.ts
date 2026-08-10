/**
 * ocr.ts — Reconocimiento de texto sobre imagen, en local.
 *
 * Usa tesseract.js, que es WebAssembly puro: no compila nada y funciona sin
 * conexión una vez tiene los datos del idioma.
 *
 * Dos cosas que hubo que resolver y conviene no volver a tropezar:
 *
 *  1. tesseract.js **descarga los datos del idioma la primera vez** (unos 5 MB)
 *     y, por defecto, los deja en la carpeta desde la que se ejecuta el
 *     programa. La primera prueba dejó un `eng.traineddata` de 5 MB en la raíz
 *     del repositorio. Aquí se le dice explícitamente que los guarde en la
 *     carpeta de datos de la aplicación.
 *
 *  2. Esa primera descarga necesita internet. Si no hay, se dice claramente en
 *     lugar de devolver un texto vacío como si el informe no tuviera nada.
 */

import { mkdirSync } from 'node:fs'

import type { BloqueTexto, MotorOcr } from '@vilamar/extraction'

export interface OpcionesOcr {
  /** Dónde guardar los datos del idioma. Nunca la carpeta del proyecto. */
  readonly carpetaDatos: string
  /** Idiomas de tesseract. «eng» va bien para informes de biometría. */
  readonly idioma?: string
}

export function crearMotorOcr(opciones: OpcionesOcr): MotorOcr {
  const idioma = opciones.idioma ?? 'eng'
  mkdirSync(opciones.carpetaDatos, { recursive: true })

  return {
    nombre: `tesseract.js (${idioma})`,

    async reconocer(imagen: Uint8Array) {
      const { createWorker } = await import('tesseract.js')

      let trabajador: Awaited<ReturnType<typeof createWorker>> | null = null
      try {
        trabajador = await createWorker(idioma, undefined, {
          // Que los 5 MB de datos del idioma vayan a la carpeta de la
          // aplicación, y no a donde se haya ejecutado el programa.
          cachePath: opciones.carpetaDatos,
        })
      } catch (error) {
        throw new Error(
          'No se han podido preparar los datos del reconocimiento de texto. ' +
            'La primera vez hacen falta unos 5 MB de descarga y conexión a internet. ' +
            `Detalle técnico: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      try {
        const { data } = await trabajador.recognize(Buffer.from(imagen))

        // Las palabras vienen con su caja en píxeles; se pasan a proporción para
        // que valgan igual si la imagen se reescala.
        //
        // tesseract.js no publica el tamaño de la página en su resultado, así
        // que se toma la esquina inferior derecha de la palabra más lejana. Es
        // una aproximación por defecto —el margen derecho de la hoja se pierde—
        // pero lo que usa la separación por columnas son posiciones RELATIVAS
        // entre sí, y esas no cambian por escalar todo el mapa.
        const palabras = data.words ?? []
        const ancho = Math.max(1, ...palabras.map((p) => p.bbox.x1))
        const alto = Math.max(1, ...palabras.map((p) => p.bbox.y1))
        const bloques: BloqueTexto[] = palabras
          .filter((p) => p.text.trim() !== '')
          .map((p) => ({
            texto: p.text,
            x: p.bbox.x0 / ancho,
            y: p.bbox.y0 / alto,
            ancho: (p.bbox.x1 - p.bbox.x0) / ancho,
            alto: (p.bbox.y1 - p.bbox.y0) / alto,
            confianza: p.confidence / 100,
          }))

        return {
          texto: data.text,
          bloques,
          confianzaMedia: (data.confidence ?? 0) / 100,
        }
      } finally {
        await trabajador.terminate().catch(() => undefined)
      }
    },
  }
}
