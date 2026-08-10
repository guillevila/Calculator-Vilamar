/**
 * recopilar.ts — Reúne lo que necesita el informe a partir de un caso.
 *
 * Está separado de la plantilla para que la plantilla solo se ocupe de pintar y
 * esto solo se ocupe de decidir qué se cuenta. Es función pura.
 */

import type { Calculadora, CampoBiometrico, Caso, Comparativa, Lateralidad, Aviso } from '@vilamar/domain'
import {
  camposQueFaltan,
  CALCULADORAS,
  compararOjo,
  ojoDe,
  ojosDelCaso,
  resultadoDe,
  validarOjo,
} from '@vilamar/domain'

import type { DatosInforme } from './plantilla.js'

export interface OpcionesInforme {
  readonly version: string
  readonly generadoEn: string
  /** El orden de las columnas de la tabla comparativa. */
  readonly ordenColumnas?: readonly Calculadora[]
}

export function recopilarInforme(caso: Caso, opciones: OpcionesInforme): DatosInforme {
  const ojos = ojosDelCaso(caso)
  const orden = opciones.ordenColumnas ?? (['KANE', 'EVO_TORIC', 'BARRETT_TORIC'] as const)

  const comparativas: Comparativa[] = ojos.map((ojo) => {
    const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
    for (const c of CALCULADORAS) {
      const r = resultadoDe(caso, c, ojo)
      if (r) resultados[c] = r
    }
    return compararOjo(ojo, resultados as never, orden)
  })

  const avisos: Aviso[] = ojos.flatMap((ojo) => [...validarOjo(ojoDe(caso, ojo))])

  // Qué le faltaba a cada calculadora. Solo se cuenta si de verdad se intentó o
  // si el dato es obligatorio para ella: enumerar todos los opcionales ausentes
  // llenaría el informe de ruido.
  const ausenciasRelevantes: {
    calculadora: Calculadora
    ojo: Lateralidad
    campos: readonly CampoBiometrico[]
  }[] = []
  for (const ojo of ojos) {
    for (const c of CALCULADORAS) {
      const faltan = camposQueFaltan(caso, c, ojo)
      if (faltan.length > 0) ausenciasRelevantes.push({ calculadora: c, ojo, campos: faltan })
    }
  }

  return {
    caso,
    version: opciones.version,
    generadoEn: opciones.generadoEn,
    comparativas,
    avisos,
    ausenciasRelevantes,
  }
}
