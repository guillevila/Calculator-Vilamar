import { describe, expect, it } from 'vitest'

import { conMedida, crearMedida, ojoVacio } from '../modelo/medida.js'
import type { OpcionLente } from '../modelo/calculadoras.js'
import { ejeCurvoDe, estimarLenteRecomendada } from './recomendacion.js'

const CUANDO = new Date().toISOString()
const AUTOR = { metodo: 'MANUAL', registradoEn: CUANDO } as const

function opcion(parcial: Partial<OpcionLente>): OpcionLente {
  return { recomendada: false, ...parcial }
}

describe('ejeCurvoDe', () => {
  it('da el eje de K2 cuando K2 es la más curva', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1', 'OD', 41.22, AUTOR))
    ojo = conMedida(ojo, crearMedida('K1_EJE', 'OD', 175, AUTOR))
    ojo = conMedida(ojo, crearMedida('K2', 'OD', 42.52, AUTOR))
    ojo = conMedida(ojo, crearMedida('K2_EJE', 'OD', 85, AUTOR))
    expect(ejeCurvoDe(ojo)).toBe(85)
  })

  it('da el eje de K1 cuando K1 es la más curva', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1', 'OD', 44.0, AUTOR))
    ojo = conMedida(ojo, crearMedida('K1_EJE', 'OD', 10, AUTOR))
    ojo = conMedida(ojo, crearMedida('K2', 'OD', 42.0, AUTOR))
    ojo = conMedida(ojo, crearMedida('K2_EJE', 'OD', 100, AUTOR))
    expect(ejeCurvoDe(ojo)).toBe(10)
  })

  it('no da nada si falta cualquiera de los cuatro datos', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1', 'OD', 41.22, AUTOR))
    ojo = conMedida(ojo, crearMedida('K2', 'OD', 42.52, AUTOR))
    expect(ejeCurvoDe(ojo)).toBeUndefined()
  })
})

describe('estimarLenteRecomendada', () => {
  it('esfera: la primera opción cuya refracción prevista ya es negativa', () => {
    const opciones = [
      opcion({ esfera: 20.5, refraccionPrevista: 0.42 }),
      opcion({ esfera: 21.0, refraccionPrevista: 0.18 }),
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ esfera: 22.0, refraccionPrevista: -0.31 }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({ esfera: 21.5 })
  })

  it('esfera: funciona igual si la calculadora las devuelve de MAYOR a menor potencia (Kane, Barrett)', () => {
    // Caso real (26/08/2026): Kane pinta su tabla de 24.0 a 22.0, y el código
    // cogía «la primera del array» —24.0, la de mayor potencia— en vez de la
    // primera negativa subiendo desde la más baja, que es 22.5.
    const opciones = [
      opcion({ esfera: 24.0, refraccionPrevista: -1.11 }),
      opcion({ esfera: 23.5, refraccionPrevista: -0.76 }),
      opcion({ esfera: 23.0, refraccionPrevista: -0.42 }),
      opcion({ esfera: 22.5, refraccionPrevista: -0.09 }),
      opcion({ esfera: 22.0, refraccionPrevista: 0.24 }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({ esfera: 22.5 })
  })

  it('sin ninguna opción con refracción negativa, no estima nada', () => {
    const opciones = [
      opcion({ esfera: 20.5, refraccionPrevista: 0.42 }),
      opcion({ esfera: 21.0, refraccionPrevista: 0.18 }),
    ]
    expect(estimarLenteRecomendada(opciones, 85)).toBeUndefined()
  })

  it('cilindro: la última opción tórica cuyo eje residual coincide con el eje curvo, antes de que cambie', () => {
    const ejeCurvo = 89
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 89, designacion: 'T2' }),
      opcion({ cilindro: 1.5, ejeResidual: 89, designacion: 'T3' }),
      opcion({ cilindro: 2.25, ejeResidual: 89, designacion: 'T4' }),
      opcion({ cilindro: 3.0, ejeResidual: 179, designacion: 'T5' }),
    ]
    expect(estimarLenteRecomendada(opciones, ejeCurvo)).toEqual({
      esfera: 21.5,
      cilindro: 2.25,
      eje: 89,
    })
  })

  it('sin eje curvo, no se aplica el criterio del cilindro aunque haya opciones tóricas', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.5, ejeResidual: 89, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({ esfera: 21.5 })
  })

  it('con una sola fila tórica que coincide con el eje curvo, esa es la elegida (EVO, Barrett)', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 82, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, 82)).toEqual({ esfera: 21.5, cilindro: 1.0, eje: 82 })
  })

  it('si la única fila tórica no coincide con el eje curvo, solo se estima la esfera', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 20, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, 82)).toEqual({ esfera: 21.5 })
  })
})
