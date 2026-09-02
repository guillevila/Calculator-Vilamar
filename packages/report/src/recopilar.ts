/**
 * recopilar.ts — Reúne lo que necesita el informe a partir de un caso.
 *
 * Está separado de la plantilla para que la plantilla solo se ocupe de pintar y
 * esto solo se ocupe de decidir qué se cuenta. Es función pura.
 */

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Comparativa,
  Lateralidad,
  Aviso,
} from '@vilamar/domain'
import {
  camposQueFaltan,
  COLUMNAS_COMPARATIVA,
  compararOjo,
  ojoDe,
  ojosDelCaso,
  resultadoDe,
  validarOjo,
} from '@vilamar/domain'

import type { DatosInforme, ResultadoInforme } from './plantilla.js'

export interface OpcionesInforme {
  readonly version: string
  readonly generadoEn: string
  /** El orden de las columnas de la tabla comparativa. */
  readonly ordenColumnas?: readonly Calculadora[]
  /**
   * Lo que se enseña de cada casilla (captura, lente recomendada, aviso de
   * fallo), ya resuelto por quien tiene acceso a disco. `recopilarInforme` es
   * una función pura y no lee ficheros: solo traslada lo que se le pasa.
   */
  readonly resultados?: readonly ResultadoInforme[]
  /**
   * Recopila solo este ojo (D47, 27/08/2026) — es lo que permite un PDF por
   * ojo en vez de uno por caso: `generarPdf()` llama a esto una vez por cada
   * ojo del caso, con `soloOjo` puesto y `resultados` ya filtrado a ese ojo.
   * Sin especificarlo, se recopilan todos los ojos del caso, como antes.
   */
  readonly soloOjo?: Lateralidad
}

/**
 * ⚠️ `comparativas`, `avisos` y `ausenciasRelevantes` de este resultado
 * reflejan solo el aparato PRINCIPAL de cada ojo — no se han hecho
 * conscientes de que un ojo puede tener varios aparatos en paralelo (D47),
 * porque el informe que de verdad genera la aplicación (`generarHtmlInforme`,
 * D39) no los usa: solo usa `resultados` y `caso`, que sí llevan el aparato
 * de cada uno. Si algún día se retoma el informe detallado
 * (`generarHtmlInformeDetallado`) con varios aparatos, esto necesitará
 * revisarse.
 */
export function recopilarInforme(caso: Caso, opciones: OpcionesInforme): DatosInforme {
  const ojos =
    opciones.soloOjo !== undefined
      ? ojosDelCaso(caso).filter((o) => o === opciones.soloOjo)
      : ojosDelCaso(caso)
  // Si no se fuerza un orden desde fuera, se usan las cinco columnas de
  // siempre (D45/D48: cada variante de córnea posterior es su propia
  // casilla, ya no depende de si ESE ojo tiene PK1 o PK2 — ver
  // `COLUMNAS_COMPARATIVA`).
  const orden = opciones.ordenColumnas ?? COLUMNAS_COMPARATIVA

  const comparativas: Comparativa[] = ojos.map((ojo) => {
    const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
    for (const c of orden) {
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
    for (const c of orden) {
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
    resultados: opciones.resultados ?? [],
  }
}
