/**
 * lineas.ts — Reconstruir líneas a partir de trozos con posición.
 *
 * Ni pdfjs ni el OCR devuelven líneas: devuelven **trozos**. En un informe, «AL»
 * y «24.07 mm» son elementos distintos que solo comparten la altura; el OCR llega
 * a devolver una palabra por trozo.
 *
 * Y las reglas de lectura buscan la etiqueta y el número **en la misma línea**.
 * Así que si estos trozos se juntan en el orden en que vienen, o peor, uno por
 * línea, no se encuentra absolutamente nada. Pasó: la lectura por OCR devolvía
 * cero datos y parecía que el reconocimiento no funcionaba, cuando el problema
 * era que se le entregaba una palabra por línea.
 *
 * Esta función vive aquí, y no en el lector de PDF, porque es un problema de
 * disposición de texto y lo tienen los dos: el PDF y el OCR.
 */

import type { BloqueTexto } from '../contratos.js'

/** Dos trozos están en la misma línea si su altura no difiere más que esto. */
const TOLERANCIA_LINEA = 0.006

/**
 * Hueco horizontal, en proporción del ancho, a partir del cual se considera que
 * hay una separación de verdad y no un espacio entre palabras.
 *
 * Importa porque es lo que separa la columna de un ojo de la del otro, y el
 * segmentador de dos columnas se apoya en ello.
 */
const HUECO_SEPARADOR = 0.02

/**
 * Junta los trozos en líneas: agrupa por altura y ordena por posición
 * horizontal.
 *
 * Entre dos trozos con un hueco apreciable se ponen dos espacios; con un hueco
 * normal, uno.
 */
export function reconstruirLineas(bloques: readonly BloqueTexto[]): string {
  const conTexto = bloques.filter((b) => b.texto.trim() !== '')
  if (conTexto.length === 0) return ''

  const ordenados = [...conTexto].sort((a, b) => a.y - b.y || a.x - b.x)
  const lineas: BloqueTexto[][] = []

  for (const trozo of ordenados) {
    const ultima = lineas[lineas.length - 1]
    const referencia = ultima?.[0]
    if (ultima && referencia && Math.abs(trozo.y - referencia.y) <= TOLERANCIA_LINEA) {
      ultima.push(trozo)
    } else {
      lineas.push([trozo])
    }
  }

  return lineas
    .map((linea) => {
      const enOrden = [...linea].sort((a, b) => a.x - b.x)
      let salida = ''
      let finAnterior = 0
      for (const [i, trozo] of enOrden.entries()) {
        if (i > 0) salida += trozo.x - finAnterior > HUECO_SEPARADOR ? '  ' : ' '
        salida += trozo.texto
        finAnterior = trozo.x + trozo.ancho
      }
      return salida.trim()
    })
    .filter((l) => l.length > 0)
    .join('\n')
}
