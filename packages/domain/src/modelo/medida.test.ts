/**
 * medida.test.ts — Los ejes se guardan en grados enteros (D121, 07/10/2026).
 */

import { describe, expect, it } from 'vitest'

import { conMedida, crearMedida, ojoVacio } from './medida.js'
import { procedenciaManual } from './procedencia.js'
import { hayInvalidos, validarOjo } from '../validacion/validar.js'

const medida = (campo: 'K1_EJE' | 'K1', valor: number) =>
  crearMedida(campo, 'OD', valor, procedenciaManual('2026-10-07T10:00:00.000Z'))

describe('crearMedida — los ejes se redondean a grados enteros', () => {
  it('113.8° pasa a 114°, y 23.4° a 23°', () => {
    expect(medida('K1_EJE', 113.8).valor).toBe(114)
    expect(medida('K1_EJE', 23.4).valor).toBe(23)
  })

  it('lo que no es un eje no se redondea', () => {
    expect(medida('K1', 43.27).valor).toBe(43.27)
  })

  it('180.4° pasa a 180°, que sigue siendo un eje válido (0-180)', () => {
    const m = medida('K1_EJE', 180.4)
    expect(m.valor).toBe(180)
    const ojo = conMedida(ojoVacio('OD'), m)
    expect(hayInvalidos(validarOjo(ojo).filter((a) => a.campo === 'K1_EJE'))).toBe(false)
  })
})
