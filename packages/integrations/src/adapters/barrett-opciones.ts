/**
 * barrett-opciones.ts — Convierte las dos tablas de Barrett (potencias y tóricas)
 * en las opciones del resultado. Lo comparten Barrett Toric y Barrett True K Toric.
 *
 * Barrett da DOS tablas:
 *
 *   1. «IOL Power | Toric Power | Refraction»: una fila por esfera, con la
 *      designación tórica que Barrett le asigna (T4, T4, T4…).
 *   2. «Toric Power | IOL Cylinder | Residual Astigmatism»: UNA FILA POR CADA
 *      LENTE TÓRICA —T3 (1.5 D), T4 (2.25 D), T5 (3 D)—, con su astigmatismo
 *      residual.
 *
 * ⚠️ Hasta la v1.62 (27/10/2026) solo se guardaba el cilindro de las designaciones
 * que usaba alguna fila de la tabla 1. Con todas las esferas en T4, T3 y T5 se
 * perdían. Fallo real encontrado por el dueño con el caso CV-2026-0437 (OD): en
 * la captura de Barrett T3 (1.5 D) dejaba 0.41 D @ 43° —el mismo eje que la
 * córnea— y T4 (2.25 D) 0.08 D @ 133°; el criterio propio (D43: el mayor cilindro
 * antes de que el eje cambie) necesita esa escalera para elegir T3, y sin ella
 * solo veía T4, ya con el eje cambiado. Ahora las filas tóricas que ninguna
 * esfera usa se guardan también, como opciones sin esfera —igual que EVO y Kane—.
 */

import type { OpcionLente } from '@vilamar/domain'

import { leerCilindroConEje, leerNumeroDeTexto } from '../normalizar.js'

export interface OpcionesDeBarrett {
  readonly opciones: OpcionLente[]
  /** Posición, dentro de `opciones`, de la esfera que Barrett destaca (la del medio). */
  readonly indiceDestacada: number
}

export function construirOpcionesDeBarrett(
  potencias: readonly (readonly string[])[],
  toricas: readonly (readonly string[])[],
): OpcionesDeBarrett {
  const opciones: OpcionLente[] = []

  // La fila del medio de la tabla de potencias es la que Barrett destaca.
  const filasPotencia = potencias.slice(1)
  const indiceDestacada = Math.floor(filasPotencia.length / 2)
  filasPotencia.forEach((fila, i) => {
    const esfera = leerNumeroDeTexto(fila[0])
    if (esfera === undefined) return
    opciones.push({
      esfera,
      designacion: fila[1]?.trim() || undefined,
      refraccionPrevista: leerNumeroDeTexto(fila[2]),
      recomendada: i === indiceDestacada,
    })
  })

  const toricaDe = (fila: readonly string[]) => {
    const residual = leerCilindroConEje(fila[2])
    return {
      cilindro: leerNumeroDeTexto(fila[1]),
      cilindroResidual: residual.magnitud,
      ejeResidual: residual.eje,
    }
  }

  // Cada esfera lleva el cilindro y el residual de SU designación.
  const porDesignacion = new Map<string, ReturnType<typeof toricaDe>>()
  for (const fila of toricas.slice(1)) {
    const designacion = fila[0]?.trim()
    if (designacion) porDesignacion.set(designacion.toLowerCase(), toricaDe(fila))
  }
  const usadas = new Set<string>()
  opciones.forEach((opcion, i) => {
    const clave = opcion.designacion?.toLowerCase()
    const torica = clave ? porDesignacion.get(clave) : undefined
    if (!clave || !torica) return
    usadas.add(clave)
    // Barrett no publica un «eje de la lente» aparte: usa el del astigmatismo
    // residual. No se inventa uno.
    opciones[i] = { ...opcion, ...torica, eje: torica.ejeResidual }
  })

  // Las lentes tóricas que ninguna esfera usa, también: son la escalera del criterio.
  for (const fila of toricas.slice(1)) {
    const designacion = fila[0]?.trim()
    if (!designacion || usadas.has(designacion.toLowerCase())) continue
    const torica = toricaDe(fila)
    if (torica.cilindro === undefined) continue
    opciones.push({
      designacion,
      ...torica,
      eje: torica.ejeResidual,
      recomendada: false,
    })
  }

  return { opciones, indiceDestacada }
}
