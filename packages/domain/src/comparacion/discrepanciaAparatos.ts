/**
 * discrepanciaAparatos.ts — Cuando dos biómetros del mismo ojo no coinciden.
 *
 * Desde D47 (27/08/2026), un ojo puede tener varios conjuntos de medidas en
 * paralelo, uno por aparato. Si dos de esos conjuntos, del MISMO ojo, dan
 * valores muy distintos del mismo campo, es una señal de que algo no cuadra
 * —un ojo confundido, una medición mala, un aparato mal calibrado— y no debe
 * pasar desapercibida: petición expresa del dueño del proyecto, con la misma
 * filosofía que el resto del programa («avisa y bloquea; corrige la
 * persona»), aplicada aquí entre aparatos en vez de entre lo leído y lo
 * corregido.
 *
 * Los umbrales de abajo son un punto de partida razonable, no una cifra
 * clínica validada — se dejan en una tabla, igual que la de resolución del
 * OCR, para poder ajustarlos sin buscar por el código si el dueño del
 * proyecto los quiere distintos.
 */

import type { CampoBiometrico } from '../modelo/campos.js'
import type { OjoBiometrico } from '../modelo/medida.js'
import { todasConfirmadas, valorDe } from '../modelo/medida.js'

/** A partir de qué diferencia, entre dos aparatos, un campo se considera discrepante. */
export const UMBRAL_DISCREPANCIA: Partial<Record<CampoBiometrico, number>> = {
  AL: 0.3,
  K1: 0.5,
  K2: 0.5,
  ACD: 0.3,
  LT: 0.3,
  CCT: 20,
  WTW: 0.5,
}

export interface Discrepancia {
  readonly campo: CampoBiometrico
  readonly aparatoA: string
  readonly valorA: number
  readonly aparatoB: string
  readonly valorB: number
  readonly diferencia: number
}

/**
 * Compara, campo a campo, todos los pares de datasets CONFIRMADOS del mismo
 * ojo, y señala los que superan su umbral.
 *
 * Solo mira datasets confirmados: comparar datos a medio revisar no dice
 * nada todavía — la persona puede estar en mitad de corregir justo el campo
 * que discreparía. Con un único dataset (el caso de hoy) esto no encuentra
 * nunca nada, porque no hay con qué comparar.
 */
export function detectarDiscrepancias(datasets: readonly OjoBiometrico[]): readonly Discrepancia[] {
  const confirmados = datasets.filter(todasConfirmadas)
  const discrepancias: Discrepancia[] = []

  for (let i = 0; i < confirmados.length; i++) {
    for (let j = i + 1; j < confirmados.length; j++) {
      const a = confirmados[i]
      const b = confirmados[j]
      if (!a || !b) continue
      for (const [campo, umbral] of Object.entries(UMBRAL_DISCREPANCIA) as [
        CampoBiometrico,
        number,
      ][]) {
        const valorA = valorDe(a, campo)
        const valorB = valorDe(b, campo)
        if (valorA === undefined || valorB === undefined) continue
        const diferencia = Math.abs(valorA - valorB)
        if (diferencia > umbral) {
          discrepancias.push({ campo, aparatoA: a.aparato, valorA, aparatoB: b.aparato, valorB, diferencia })
        }
      }
    }
  }
  return discrepancias
}
