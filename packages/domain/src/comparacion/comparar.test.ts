/**
 * comparar.test.ts — La comparativa describe; no aconseja.
 *
 * Además de comprobar que las cuentas salen, aquí se fija por escrito el límite
 * del producto: Calculator Vilamar puede decir que dos calculadoras coinciden,
 * y no puede decir qué lente hay que poner.
 */

import { describe, expect, it } from 'vitest'

import { compararOjo, distanciaEntreEjes } from './comparar.js'
import type { Calculadora, ResultadoCalculadora } from '../modelo/calculadoras.js'

const CUANDO = '2026-08-10T10:00:00.000Z'

function resultado(
  calculadora: Calculadora,
  esfera: number,
  extra: Partial<ResultadoCalculadora['opciones'][number]> = {},
): ResultadoCalculadora {
  const opcion = { esfera, recomendada: true, ...extra }
  return {
    calculadora,
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    opciones: [opcion],
    recomendada: opcion,
  }
}

function fallo(calculadora: Calculadora, mensaje: string): ResultadoCalculadora {
  return {
    calculadora,
    ojo: 'OD',
    estado: 'MISSING_INPUTS',
    obtenidoEn: CUANDO,
    opciones: [],
    mensaje,
  }
}

describe('distancia entre ejes', () => {
  it('trata el eje como orientación, no como dirección', () => {
    expect(distanciaEntreEjes(175, 5)).toBe(10)
    expect(distanciaEntreEjes(10, 170)).toBe(20)
    expect(distanciaEntreEjes(81, 82)).toBe(1)
    expect(distanciaEntreEjes(0, 90)).toBe(90)
    expect(distanciaEntreEjes(45, 45)).toBe(0)
  })
})

describe('comparativa de un ojo', () => {
  it('dice cuándo coinciden todas', () => {
    const c = compararOjo('OD', {
      KANE: resultado('KANE', 21),
      EVO_TORIC: resultado('EVO_TORIC', 21),
      BARRETT_TORIC: resultado('BARRETT_TORIC', 21),
    })
    expect(c.conResultado).toBe(3)
    expect(c.observaciones.some((o) => /3 calculadoras coinciden/.test(o.texto))).toBe(true)
  })

  it('dice cuántas coinciden cuando no coinciden todas', () => {
    const c = compararOjo('OD', {
      KANE: resultado('KANE', 21),
      EVO_TORIC: resultado('EVO_TORIC', 21),
      BARRETT_TORIC: resultado('BARRETT_TORIC', 21.5),
    })
    const texto = c.observaciones.map((o) => o.texto).join(' | ')
    expect(texto).toMatch(/2 de 3/)
    expect(texto).toMatch(/rango entre las esferas destacadas es 0\.50 D/)
  })

  it('marca como discrepancia un rango de media dioptría o más', () => {
    const c = compararOjo('OD', {
      KANE: resultado('KANE', 21),
      EVO_TORIC: resultado('EVO_TORIC', 21.5),
    })
    const rango = c.observaciones.find((o) => o.texto.includes('rango'))
    expect(rango?.tipo).toBe('DISCREPANCIA')
  })

  it('compara los ejes y dice cuánto difieren', () => {
    const c = compararOjo('OD', {
      EVO_TORIC: resultado('EVO_TORIC', 21, { eje: 81 }),
      BARRETT_TORIC: resultado('BARRETT_TORIC', 21, { eje: 82 }),
    })
    expect(c.observaciones.some((o) => /difieren 1° en el eje/.test(o.texto))).toBe(true)
  })

  it('una calculadora que falla no borra a las demás', () => {
    const c = compararOjo('OD', {
      EVO_TORIC: resultado('EVO_TORIC', 21),
      BARRETT_TORIC: fallo('BARRETT_TORIC', 'Barrett necesita el diámetro corneal (WTW).'),
    })
    // EVO sigue teniendo su resultado…
    const evo = c.celdas.find((x) => x.calculadora === 'EVO_TORIC')
    expect(evo?.esfera).toEqual({ estado: 'VALOR', valor: 21 })
    // …y Barrett aparece con su motivo, en lenguaje normal.
    const barrett = c.celdas.find((x) => x.calculadora === 'BARRETT_TORIC')
    expect(barrett?.esfera).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(c.observaciones.some((o) => /WTW/.test(o.texto))).toBe(true)
  })

  it('una calculadora no lanzada aparece igualmente en la tabla', () => {
    const c = compararOjo('OD', { EVO_TORIC: resultado('EVO_TORIC', 21) })
    expect(c.celdas).toHaveLength(3)
    const kane = c.celdas.find((x) => x.calculadora === 'KANE')
    expect(kane?.ejecutada).toBe(false)
    expect(kane?.estado).toBe('NO_EJECUTADA')
  })

  it('avisa cuando solo hay un resultado y no hay nada que comparar', () => {
    const c = compararOjo('OD', { EVO_TORIC: resultado('EVO_TORIC', 21) })
    expect(c.observaciones.some((o) => /No hay nada con lo que compararla/.test(o.texto))).toBe(
      true,
    )
  })

  it('un campo que la calculadora no da se queda vacío, no se infiere', () => {
    // Kane no devuelve cilindro en este resultado.
    const c = compararOjo('OD', {
      KANE: resultado('KANE', 21),
      EVO_TORIC: resultado('EVO_TORIC', 21, { cilindro: 0.75, eje: 81 }),
    })
    const kane = c.celdas.find((x) => x.calculadora === 'KANE')
    expect(kane?.cilindro).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(kane?.eje).toEqual({ estado: 'NO_DISPONIBLE' })
  })
})

describe('el producto compara, no recomienda', () => {
  /**
   * Este test es el guardián del límite del producto. Si algún día alguien
   * añade una frase que aconseje qué implantar, se cae aquí.
   */
  const PROHIBIDO = [
    /\bdebes\b/i,
    /\bdeberías\b/i,
    /\brecomendamos\b/i,
    /nuestra recomendación/i,
    /\bimplanta\b/i,
    /\bimplantar\b/i,
    /\belige\b/i,
    /\bmejor opción\b/i,
    /\bte aconsejamos\b/i,
  ]

  it('ninguna observación aconseja qué lente poner', () => {
    const escenarios = [
      {
        KANE: resultado('KANE', 21),
        EVO_TORIC: resultado('EVO_TORIC', 21, { cilindro: 0.75, eje: 81 }),
        BARRETT_TORIC: resultado('BARRETT_TORIC', 21.5, { cilindro: 0.75, eje: 82 }),
      },
      {
        EVO_TORIC: resultado('EVO_TORIC', 21),
        BARRETT_TORIC: fallo('BARRETT_TORIC', 'Barrett necesita el diámetro corneal (WTW).'),
      },
      { KANE: resultado('KANE', 18.5) },
      {},
    ]
    for (const escenario of escenarios) {
      const c = compararOjo('OD', escenario)
      for (const o of c.observaciones) {
        for (const patron of PROHIBIDO) {
          expect(o.texto, `«${o.texto}» aconseja, y esto solo puede describir`).not.toMatch(patron)
        }
      }
    }
  })

  it('sin resultados no se inventa una conclusión', () => {
    const c = compararOjo('OD', {})
    expect(c.conResultado).toBe(0)
    expect(c.observaciones.every((o) => o.tipo === 'AVISO' || o.tipo === 'FALLO')).toBe(true)
  })
})

describe('«no hay dato» y «no elige» son cosas distintas', () => {
  /**
   * El resultado tórico REAL de Kane: destaca una potencia esférica y, aparte, da
   * las opciones tóricas SIN destacar ninguna. Los números están copiados de una
   * ejecución contra su web con datos sintéticos.
   */
  const KANE_TORICO: ResultadoCalculadora = {
    calculadora: 'KANE',
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    opciones: [
      { esfera: 21.5, refraccionPrevista: -0.06, recomendada: true },
      {
        esfera: 21.5,
        cilindro: 0,
        designacion: 'Non-toric',
        cilindroResidual: 0.42,
        ejeResidual: 80,
        recomendada: false,
      },
      {
        esfera: 21.5,
        cilindro: 1,
        designacion: 'T2',
        cilindroResidual: 0.24,
        ejeResidual: 170,
        recomendada: false,
      },
      {
        esfera: 21.5,
        cilindro: 1.5,
        designacion: 'T3',
        cilindroResidual: 0.57,
        ejeResidual: 170,
        recomendada: false,
      },
    ],
    recomendada: { esfera: 21.5, refraccionPrevista: -0.06, recomendada: true },
  }

  const kaneTorico = () =>
    compararOjo('OD', { KANE: KANE_TORICO }).celdas.find((x) => x.calculadora === 'KANE')

  it('la esfera que Kane destaca sí se enseña', () => {
    expect(kaneTorico()?.seleccion.clase).toBe('DESTACADA')
    expect(kaneTorico()?.esfera).toEqual({ estado: 'VALOR', valor: 21.5 })
    expect(kaneTorico()?.refraccionPrevista).toEqual({ estado: 'VALOR', valor: -0.06 })
  })

  it('el cilindro son tres alternativas, no un dato que falte', () => {
    // La opción destacada no trae cilindro, pero otras tres sí. Son alternativas
    // de verdad: Kane las da y deja la elección a quien opera.
    expect(kaneTorico()?.cilindro).toEqual({ estado: 'VARIAS', cuantas: 3 })
    expect(kaneTorico()?.designacion).toEqual({ estado: 'VARIAS', cuantas: 3 })
    expect(kaneTorico()?.cilindroResidual).toEqual({ estado: 'VARIAS', cuantas: 3 })
  })

  it('el eje de la lente sí es un dato que Kane no da', () => {
    // Ninguna de las cuatro opciones lo trae. Aquí «3 opciones» sería mentira.
    expect(kaneTorico()?.eje).toEqual({ estado: 'NO_DISPONIBLE' })
  })

  it('y NINGUNA de las tóricas sale como destacada', () => {
    const toricas = kaneTorico()?.opciones.filter((o) => o.designacion !== undefined) ?? []
    expect(toricas).toHaveLength(3)
    for (const o of toricas) expect(o.recomendada).toBe(false)
  })

  it('una calculadora que SÍ elige su tórica enseña el valor, no un recuento', () => {
    const c = compararOjo('OD', {
      EVO_TORIC: resultado('EVO_TORIC', 22, {
        cilindro: 3,
        designacion: 'T5',
        cilindroResidual: 0.31,
      }),
    })
    const evo = c.celdas.find((x) => x.calculadora === 'EVO_TORIC')
    expect(evo?.cilindro).toEqual({ estado: 'VALOR', valor: 3 })
    expect(evo?.designacion).toEqual({ estado: 'VALOR', valor: 'T5' })
  })

  it('sin cilindro ni opciones tóricas, la casilla es «no disponible»', () => {
    // Aquí la casilla vacía sí significa «no hay dato», y decir «0 opciones»
    // sería peor que no decir nada.
    const c = compararOjo('OD', { KANE: resultado('KANE', 21.5, { refraccionPrevista: -0.06 }) })
    const kane = c.celdas.find((x) => x.calculadora === 'KANE')
    expect(kane?.cilindro).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(kane?.designacion).toEqual({ estado: 'NO_DISPONIBLE' })
  })

  it('un fallo no se disfraza de «no elige»', () => {
    const c = compararOjo('OD', { KANE: fallo('KANE', 'Falta el sexo.') })
    const kane = c.celdas.find((x) => x.calculadora === 'KANE')
    expect(kane?.seleccion.clase).toBe('SIN_RESULTADO')
    expect(kane?.cilindro).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(kane?.esfera).toEqual({ estado: 'NO_DISPONIBLE' })
  })
})
