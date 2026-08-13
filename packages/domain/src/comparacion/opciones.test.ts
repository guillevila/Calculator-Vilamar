/**
 * opciones.test.ts — Cuando una calculadora devuelve VARIAS y no señala ninguna.
 *
 * Es lo que hace Kane: devuelve una escalera de potencias. Si señala una, esa es
 * su respuesta. Si no señala ninguna, **no existe «el resultado de Kane»** —
 * existen sus opciones, y la elección es de quien opera.
 *
 * La comparativa tenía una línea que resolvía ese caso por su cuenta:
 *
 *     const op = r.recomendada ?? r.opciones.find((o) => o.recomendada) ?? r.opciones[0]
 *                                                                       └────────────┘
 *
 * Ese tramo final elegía la primera opción y la pintaba igual que una destacada
 * por la web. Nadie podía distinguir lo que decía Kane de lo que había decidido el
 * programa. Estos tests existen para que no vuelva, en ninguna de sus formas.
 */

import { describe, expect, it } from 'vitest'

import { compararOjo } from './comparar.js'
import type { Calculadora, OpcionLente, ResultadoCalculadora } from '../modelo/calculadoras.js'

const CUANDO = '2026-08-13T10:00:00.000Z'

/** Un resultado con las opciones que se le den, y opcionalmente una destacada. */
function conOpciones(
  calculadora: Calculadora,
  opciones: readonly Partial<OpcionLente>[],
  destacadaEn?: number,
): ResultadoCalculadora {
  const lista = opciones.map((o, i) => ({ ...o, recomendada: i === destacadaEn }))
  const destacada = destacadaEn === undefined ? undefined : lista[destacadaEn]
  return {
    calculadora,
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    opciones: lista,
    ...(destacada ? { recomendada: destacada } : {}),
  }
}

/** Un resultado normal con una sola opción destacada, para las otras columnas. */
function conDestacada(calculadora: Calculadora, esfera: number): ResultadoCalculadora {
  return conOpciones(calculadora, [{ esfera }], 0)
}

const kaneDe = (r: ResultadoCalculadora) =>
  compararOjo('OD', { KANE: r }).celdas.find((x) => x.calculadora === 'KANE')

/** Las tres del caso observado: solo esfera y refracción, ninguna destacada. */
const TRES_SIN_DESTACAR: readonly Partial<OpcionLente>[] = [
  { esfera: 21.5, refraccionPrevista: 0.4 },
  { esfera: 22.0, refraccionPrevista: 0.1 },
  { esfera: 22.5, refraccionPrevista: -0.17 },
]

// ═══════════════════════════════════════════════════════════════════════════
//  1 · Tres opciones y ninguna destacada por la web
// ═══════════════════════════════════════════════════════════════════════════

describe('1 · tres opciones y ninguna destacada', () => {
  const celda = () => kaneDe(conOpciones('KANE', TRES_SIN_DESTACAR))

  it('ninguna se convierte en destacada', () => {
    const r = conOpciones('KANE', TRES_SIN_DESTACAR)
    expect(r.opciones.some((o) => o.recomendada)).toBe(false)
    expect(r.recomendada).toBeUndefined()
    expect(celda()?.seleccion.clase).toBe('VARIAS')
  })

  it('la comparación NO escoge una esfera', () => {
    const e = celda()?.esfera
    expect(e?.estado).toBe('VARIAS')
    // Y no hay ningún número escondido dentro de la celda.
    expect(e && 'valor' in e).toBe(false)
  })

  it('la comparación NO escoge una refracción', () => {
    const r = celda()?.refraccionPrevista
    expect(r?.estado).toBe('VARIAS')
    expect(r && 'valor' in r).toBe(false)
  })

  it('dice que existen 3 opciones', () => {
    expect(celda()?.seleccion).toEqual({ clase: 'VARIAS', cuantas: 3 })
    const e = celda()?.esfera
    expect(e?.estado === 'VARIAS' && e.cuantas).toBe(3)
  })

  it('el detalle enseña exactamente las tres, en su orden', () => {
    expect(celda()?.opciones).toHaveLength(3)
    expect(celda()?.opciones.map((o) => o.esfera)).toEqual([21.5, 22.0, 22.5])
    expect(celda()?.opciones.map((o) => o.refraccionPrevista)).toEqual([0.4, 0.1, -0.17])
  })

  it('no entra en las comparaciones entre calculadoras', () => {
    // Meterla obligaría a elegir cuál de las tres es «la suya».
    const c = compararOjo('OD', {
      KANE: conOpciones('KANE', TRES_SIN_DESTACAR),
      EVO_TORIC: conDestacada('EVO_TORIC', 22),
    })
    expect(c.comparables).toBe(1)
    expect(c.observaciones.some((o) => /coinciden/.test(o.texto))).toBe(false)
  })

  it('se avisa sin alarmismo: es un resultado, no un fallo', () => {
    const c = compararOjo('OD', { KANE: conOpciones('KANE', TRES_SIN_DESTACAR) })
    const aviso = c.observaciones.find((o) => /3 alternativas/.test(o.texto))
    expect(aviso?.tipo).toBe('AVISO')
    expect(c.conResultado).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · Los campos que NINGUNA opción trae
// ═══════════════════════════════════════════════════════════════════════════

describe('2 · un campo ausente en todas las opciones no dice «3 opciones»', () => {
  const celda = () => kaneDe(conOpciones('KANE', TRES_SIN_DESTACAR))

  it.each(['cilindro', 'eje', 'designacion', 'cilindroResidual', 'ejeResidual'] as const)(
    '%s sale como dato no disponible',
    (campo) => {
      // Ninguna de las tres trae este campo. Poner «3 opciones» haría pensar que
      // hay tres cilindros propuestos, y no hay ninguno: ese dato no lo publica.
      expect(celda()?.[campo]).toEqual({ estado: 'NO_DISPONIBLE' })
    },
  )

  it('y los campos que las tres SÍ traen son los que dicen «3 opciones»', () => {
    expect(celda()?.esfera.estado).toBe('VARIAS')
    expect(celda()?.refraccionPrevista.estado).toBe('VARIAS')
  })

  it('lo que decide no es la calculadora, es si el dato está en las opciones', () => {
    const k = kaneDe(
      conOpciones('KANE', [
        { esfera: 22, cilindro: 1, designacion: 'T2' },
        { esfera: 22, cilindro: 1.5, designacion: 'T3' },
      ]),
    )
    expect(k?.cilindro).toMatchObject({ estado: 'VARIAS', cuantas: 2 })
    expect(k?.designacion).toMatchObject({ estado: 'VARIAS', cuantas: 2 })
    // La esfera es la misma en las dos: no hay nada que elegir, así que se enseña.
    expect(k?.esfera).toEqual({ estado: 'VALOR', valor: 22 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · Una sola opción
// ═══════════════════════════════════════════════════════════════════════════

describe('3 · una sola opción devuelta', () => {
  const unica = () => kaneDe(conOpciones('KANE', [{ esfera: 21.5, refraccionPrevista: -0.06 }]))

  it('se puede enseñar: es la única salida que dio', () => {
    expect(unica()?.esfera).toEqual({ estado: 'VALOR', valor: 21.5 })
    expect(unica()?.refraccionPrevista).toEqual({ estado: 'VALOR', valor: -0.06 })
  })

  it('pero NO se llama destacada, porque la web no ha dicho nada', () => {
    expect(unica()?.seleccion.clase).toBe('UNICA')
    expect(unica()?.opciones[0]?.recomendada).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4 · La web SÍ destaca una
// ═══════════════════════════════════════════════════════════════════════════

describe('4 · la web destaca una opción de verdad', () => {
  const con = () => kaneDe(conOpciones('KANE', TRES_SIN_DESTACAR, 2))

  it('esa opción, y solo esa, alimenta la tabla comparativa', () => {
    expect(con()?.seleccion.clase).toBe('DESTACADA')
    expect(con()?.esfera).toEqual({ estado: 'VALOR', valor: 22.5 })
    expect(con()?.refraccionPrevista).toEqual({ estado: 'VALOR', valor: -0.17 })
  })

  it('queda marcada en el detalle, que sigue enseñando las tres', () => {
    expect(con()?.opciones).toHaveLength(3)
    expect(con()?.opciones.filter((o) => o.recomendada)).toHaveLength(1)
    expect(con()?.opciones.find((o) => o.recomendada)?.esfera).toBe(22.5)
  })

  it('vuelve a ser comparable con las demás', () => {
    const c = compararOjo('OD', {
      KANE: conOpciones('KANE', TRES_SIN_DESTACAR, 2),
      EVO_TORIC: conDestacada('EVO_TORIC', 22.5),
    })
    expect(c.comparables).toBe(2)
    expect(c.observaciones.some((o) => /coinciden/.test(o.texto))).toBe(true)
  })

  it('una destacada que no trae cilindro no impide ver las alternativas tóricas', () => {
    // Es la forma real del resultado tórico de Kane: destaca una potencia
    // esférica y, aparte, da opciones tóricas sin destacar ninguna.
    const k = kaneDe(
      conOpciones(
        'KANE',
        [
          { esfera: 22, refraccionPrevista: -0.32 },
          { esfera: 22, cilindro: 1, designacion: 'T2', cilindroResidual: 0.15 },
          { esfera: 22, cilindro: 1.5, designacion: 'T3', cilindroResidual: 0.18 },
        ],
        0,
      ),
    )
    expect(k?.esfera).toEqual({ estado: 'VALOR', valor: 22 })
    // El cilindro no está en la destacada, pero sí en dos opciones: son
    // alternativas de verdad, no un dato que falte.
    expect(k?.cilindro).toMatchObject({ estado: 'VARIAS', cuantas: 2 })
    // El eje de la lente no lo trae ninguna: eso sí es «no disponible».
    expect(k?.eje).toEqual({ estado: 'NO_DISPONIBLE' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  5 · Que no vuelva NINGUNA selección implícita
// ═══════════════════════════════════════════════════════════════════════════

describe('5 · no se escoge la del medio, ni la primera, ni la última', () => {
  /**
   * Cinco opciones con esferas bien separadas y ninguna destacada. Si alguien
   * reintrodujera una selección implícita —da igual con qué criterio— aquí
   * aparecería un número donde no puede haber ninguno.
   *
   * La del medio lleva además la refracción más cercana a cero, a propósito: así
   * el test cubre de una vez las dos reglas más tentadoras.
   */
  const CINCO: readonly Partial<OpcionLente>[] = [
    { esfera: 20.0, refraccionPrevista: 0.9 },
    { esfera: 21.0, refraccionPrevista: 0.5 },
    { esfera: 22.0, refraccionPrevista: 0.05 },
    { esfera: 23.0, refraccionPrevista: -0.4 },
    { esfera: 24.0, refraccionPrevista: -0.8 },
  ]
  const celda = () => kaneDe(conOpciones('KANE', CINCO))

  it('la celda no contiene NINGUNA de las cinco esferas', () => {
    const e = celda()?.esfera
    expect(e?.estado).toBe('VARIAS')
    for (const o of CINCO) {
      expect(JSON.stringify(e)).not.toContain(String(o.esfera))
    }
  })

  it.each([
    ['la del medio, opciones[Math.floor(n / 2)]', 22.0],
    ['la primera, opciones[0]', 20.0],
    ['la última', 24.0],
  ])('no se cuela %s', (_cual, valor) => {
    expect(celda()?.esfera).not.toEqual({ estado: 'VALOR', valor })
  })

  it('tampoco la de refracción más cercana a cero', () => {
    const r = celda()?.refraccionPrevista
    expect(r).not.toEqual({ estado: 'VALOR', valor: 0.05 })
    expect(r?.estado).toBe('VARIAS')
  })

  it('si ninguna calculadora destaca, no hay nada comparable', () => {
    const c = compararOjo('OD', {
      KANE: conOpciones('KANE', CINCO),
      EVO_TORIC: conOpciones('EVO_TORIC', CINCO),
    })
    expect(c.comparables).toBe(0)
    expect(c.observaciones.some((o) => /coinciden/.test(o.texto))).toBe(false)
  })
})
