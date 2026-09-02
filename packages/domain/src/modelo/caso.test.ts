/**
 * caso.test.ts — `COLUMNAS_COMPARATIVA` (D48, 28/08/2026).
 *
 * Desde que cada variante de córnea posterior (D45) es una casilla que se
 * pide por su cuenta —con su propio botón en la pantalla de cálculo, no algo
 * que se añade solo cuando el dataset tiene PK1/PK2—, esta lista dejó de
 * depender de ningún caso concreto: son siempre las mismas cinco columnas,
 * en el mismo orden. Es justo esa lista la que tienen que compartir la
 * comparativa en pantalla, el informe y la pantalla de cálculo, o una
 * enseñaría una casilla que otra no ofrece.
 */

import { describe, expect, it } from 'vitest'

import { COLUMNAS_COMPARATIVA } from './caso.js'

describe('COLUMNAS_COMPARATIVA', () => {
  it('son las cinco casillas, Predicted antes que Measured PCA en cada pareja', () => {
    expect(COLUMNAS_COMPARATIVA).toEqual([
      'EVO_TORIC_SIN_CARA_POSTERIOR',
      'EVO_TORIC',
      'BARRETT_TORIC',
      'BARRETT_TORIC_CON_CARA_POSTERIOR',
      'KANE',
    ])
  })

  it('Kane no lleva ninguna variante: su web no tiene córnea posterior', () => {
    expect(COLUMNAS_COMPARATIVA.filter((c) => c === 'KANE')).toHaveLength(1)
  })
})
