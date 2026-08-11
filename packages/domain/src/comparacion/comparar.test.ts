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
    expect(texto).toMatch(/rango entre las esferas recomendadas es 0\.50 D/)
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
    expect(evo?.esfera).toBe(21)
    // …y Barrett aparece con su motivo, en lenguaje normal.
    const barrett = c.celdas.find((x) => x.calculadora === 'BARRETT_TORIC')
    expect(barrett?.esfera).toBeUndefined()
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
    expect(c.observaciones.some((o) => /No hay nada con lo que compararlo/.test(o.texto))).toBe(
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
    expect(kane?.cilindro).toBeUndefined()
    expect(kane?.eje).toBeUndefined()
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
