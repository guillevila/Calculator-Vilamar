import { describe, expect, it } from 'vitest'

import { conMedida, crearMedida, ojoVacio } from '../modelo/medida.js'
import type { OpcionLente } from '../modelo/calculadoras.js'
import { criterioEsferaPara, ejeCurvoDe, estimarLenteRecomendada } from './recomendacion.js'

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
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({
      esfera: 21.5,
      refraccionPrevista: -0.06,
    })
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
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({
      esfera: 22.5,
      refraccionPrevista: -0.09,
    })
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
      refraccionPrevista: -0.06,
      ejeResidual: 89,
    })
  })

  it('sin eje curvo, no se aplica el criterio del cilindro aunque haya opciones tóricas', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.5, ejeResidual: 89, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual({
      esfera: 21.5,
      refraccionPrevista: -0.06,
    })
  })

  it('con una sola fila tórica que coincide con el eje curvo, esa es la elegida (EVO, Barrett)', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 82, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, 82)).toEqual({
      esfera: 21.5,
      cilindro: 1.0,
      eje: 82,
      refraccionPrevista: -0.06,
      ejeResidual: 82,
    })
  })

  it('si la única fila tórica no coincide con el eje curvo, solo se estima la esfera', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 20, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, 82)).toEqual({
      esfera: 21.5,
      refraccionPrevista: -0.06,
    })
  })

  it('el cilindro residual de la opción elegida viaja con la estimación, cuando la calculadora lo da', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ cilindro: 1.0, ejeResidual: 82, cilindroResidual: 0.05, designacion: 'T3' }),
    ]
    expect(estimarLenteRecomendada(opciones, 82)).toEqual({
      esfera: 21.5,
      cilindro: 1.0,
      eje: 82,
      refraccionPrevista: -0.06,
      ejeResidual: 82,
      cilindroResidual: 0.05,
    })
  })

  // Familia Lux de Bausch & Lomb: criterio invertido (D52, 29/08/2026).
  it('con el criterio PRIMERA_POSITIVA, esfera: la de refracción prevista positiva MÁS CERCANA A CERO, no la primera de la lista', () => {
    // Caso real (29/08/2026, EVO con una B&L LuxSmart): al subir la potencia
    // la refracción baja de forma continua, así que «la primera positiva
    // subiendo» es la MÁS ALEJADA de cero (18 D, refracción 0.77), no la que
    // de verdad no llega a cruzar a miopía (19 D, refracción 0.14). El fallo
    // real: EVO devolvió 18 D en vez de 19 D con esta misma tabla.
    const opciones = [
      opcion({ esfera: 18, refraccionPrevista: 0.77 }),
      opcion({ esfera: 18.5, refraccionPrevista: 0.46 }),
      opcion({ esfera: 19, refraccionPrevista: 0.14 }),
      opcion({ esfera: 19.5, refraccionPrevista: -0.19 }),
      opcion({ esfera: 20, refraccionPrevista: -0.51 }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined, 'PRIMERA_POSITIVA')).toEqual({
      esfera: 19,
      refraccionPrevista: 0.14,
    })
  })

  it('con el criterio PRIMERA_POSITIVA, sin ninguna opción con refracción positiva, no estima nada', () => {
    const opciones = [
      opcion({ esfera: 21.5, refraccionPrevista: -0.06 }),
      opcion({ esfera: 22.0, refraccionPrevista: -0.31 }),
    ]
    expect(estimarLenteRecomendada(opciones, undefined, 'PRIMERA_POSITIVA')).toBeUndefined()
  })

  it('sin especificar criterio, se sigue usando PRIMERA_NEGATIVA (compatibilidad)', () => {
    const opciones = [opcion({ esfera: 21.5, refraccionPrevista: -0.06 })]
    expect(estimarLenteRecomendada(opciones, undefined)).toEqual(
      estimarLenteRecomendada(opciones, undefined, 'PRIMERA_NEGATIVA'),
    )
  })
})

describe('criterioEsferaPara', () => {
  it.each(['B&L LuxSmart', 'B&L LuxLife', 'B&L LuxGood'])(
    'la familia Lux (%s) usa PRIMERA_POSITIVA',
    (modelo) => {
      expect(criterioEsferaPara(modelo)).toBe('PRIMERA_POSITIVA')
    },
  )

  it.each(['B&L MX60T', 'B&L MX60ET/PT', 'B&L Aspire', 'B&L Envy'])(
    'la familia enVista (%s) sigue con PRIMERA_NEGATIVA',
    (modelo) => {
      expect(criterioEsferaPara(modelo)).toBe('PRIMERA_NEGATIVA')
    },
  )

  it('cualquier otra lente, o ninguna elegida, usa PRIMERA_NEGATIVA por defecto', () => {
    expect(criterioEsferaPara('Alcon Vivity')).toBe('PRIMERA_NEGATIVA')
    expect(criterioEsferaPara(undefined)).toBe('PRIMERA_NEGATIVA')
  })
})
