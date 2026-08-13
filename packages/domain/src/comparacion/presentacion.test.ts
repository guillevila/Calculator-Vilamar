/**
 * presentacion.test.ts — Cómo se DICE que hay varias alternativas.
 *
 * El paso anterior arregló lo importante: dejar de elegir una opción por la
 * calculadora. Pero lo dejó dicho mal. Cinco filas seguidas con «3 opciones»
 * repetido no contestan la única pregunta que importa —**tres opciones ¿de
 * qué?**— y, puestas en la fila del cilindro, se siguen leyendo como «tres
 * cilindros».
 *
 * Ahora **una fila las nombra** y las demás remiten a ella:
 *
 *     Esfera               22.50 D                  ← la que Kane destaca
 *     Cilindro             Ver alternativas
 *     Eje                  —
 *     Modelo tórico        3 alternativas tóricas   ← la que las nombra
 *     Refracción prevista  -0.17 D
 *     Cilindro residual    Ver alternativas
 *     Eje residual         Ver alternativas
 *
 * Lo que estos tests fijan por escrito es que el texto **no vuelva a ser
 * genérico** y que siga sin elegirse ninguna alternativa.
 */

import { describe, expect, it } from 'vitest'

import { compararOjo } from './comparar.js'
import type { DatoComparativo } from './comparar.js'
import type { Calculadora, OpcionLente, ResultadoCalculadora } from '../modelo/calculadoras.js'

const CUANDO = '2026-08-13T10:00:00.000Z'

function resultado(
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

const kaneDe = (r: ResultadoCalculadora) =>
  compararOjo('OD', { KANE: r }).celdas.find((x) => x.calculadora === 'KANE')

/** Qué se lee en la casilla, sea cual sea su estado. */
function textoDe(d: DatoComparativo | DatoComparativo<string> | undefined): string {
  if (!d) return ''
  if (d.estado === 'VALOR') return String(d.valor)
  if (d.estado === 'VARIAS') return d.etiqueta
  return '—'
}

// ═══════════════════════════════════════════════════════════════════════════
//  El caso real: Kane destaca una esfera y da tres alternativas tóricas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Copiado de una ejecución real contra la web de Kane, ojo izquierdo, con datos
 * sintéticos. Destaca la potencia de 22.50 D y da tres tóricas sin destacar
 * ninguna.
 */
const KANE_REAL: readonly Partial<OpcionLente>[] = [
  { esfera: 24, refraccionPrevista: -1.23 },
  { esfera: 23.5, refraccionPrevista: -0.87 },
  { esfera: 23, refraccionPrevista: -0.52 },
  { esfera: 22.5, refraccionPrevista: -0.17 },
  { esfera: 22, refraccionPrevista: 0.18 },
  { esfera: 22.5, cilindro: 1.5, designacion: 'T3', cilindroResidual: 0.67, ejeResidual: 98 },
  { esfera: 22.5, cilindro: 2.25, designacion: 'T4', cilindroResidual: 0.18, ejeResidual: 98 },
  { esfera: 22.5, cilindro: 3, designacion: 'T5', cilindroResidual: 0.32, ejeResidual: 8 },
]

describe('el caso real de Kane, celda por celda', () => {
  const celda = () => kaneDe(resultado('KANE', KANE_REAL, 3))

  it('la esfera y la refracción son las de la fila que Kane destaca', () => {
    // Demostrado: salen de su `table-active`, no de ninguna regla nuestra.
    expect(celda()?.esfera).toEqual({ estado: 'VALOR', valor: 22.5 })
    expect(celda()?.refraccionPrevista).toEqual({ estado: 'VALOR', valor: -0.17 })
  })

  it('el modelo tórico NOMBRA las alternativas, y dice que son tóricas', () => {
    expect(textoDe(celda()?.designacion)).toBe('3 alternativas tóricas')
    expect(celda()?.designacion).toMatchObject({ lasNombra: true, cuantas: 3 })
  })

  it.each(['cilindro', 'cilindroResidual', 'ejeResidual'] as const)(
    '%s remite al detalle en vez de repetir el recuento',
    (campo) => {
      expect(textoDe(celda()?.[campo])).toBe('Ver alternativas')
      expect(celda()?.[campo]).toMatchObject({ lasNombra: false })
    },
  )

  it('el eje sigue siendo «no disponible»: Kane no lo publica', () => {
    expect(celda()?.eje).toEqual({ estado: 'NO_DISPONIBLE' })
    expect(textoDe(celda()?.eje)).toBe('—')
  })

  it('el genérico «N opciones» no aparece en ninguna casilla', () => {
    // Era lo que hacía la tabla ilegible: el mismo texto cinco veces sin decir
    // de qué. Si alguien lo reintroduce, este test cae.
    const textos = [
      celda()?.esfera,
      celda()?.cilindro,
      celda()?.eje,
      celda()?.designacion,
      celda()?.refraccionPrevista,
      celda()?.cilindroResidual,
      celda()?.ejeResidual,
    ].map(textoDe)
    for (const t of textos) expect(t).not.toMatch(/^\d+ opciones$/)
  })

  it('solo UNA casilla nombra las alternativas', () => {
    const cuantasNombran = [
      celda()?.esfera,
      celda()?.cilindro,
      celda()?.eje,
      celda()?.designacion,
      celda()?.refraccionPrevista,
      celda()?.cilindroResidual,
      celda()?.ejeResidual,
    ].filter((d) => d?.estado === 'VARIAS' && d.lasNombra).length
    expect(cuantasNombran).toBe(1)
  })

  it('y las tres tóricas siguen enteras en el detalle, sin elegir ninguna', () => {
    const toricas = celda()?.opciones.filter((o) => o.designacion !== undefined) ?? []
    expect(toricas.map((o) => o.designacion)).toEqual(['T3', 'T4', 'T5'])
    expect(toricas.map((o) => o.cilindro)).toEqual([1.5, 2.25, 3])
    for (const o of toricas) expect(o.recomendada).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Alternativas que NO son tóricas
// ═══════════════════════════════════════════════════════════════════════════

describe('cuando las alternativas son de potencia, se dice así', () => {
  const SOLO_POTENCIA: readonly Partial<OpcionLente>[] = [
    { esfera: 21.5, refraccionPrevista: 0.4 },
    { esfera: 22.0, refraccionPrevista: 0.1 },
    { esfera: 22.5, refraccionPrevista: -0.17 },
  ]
  const celda = () => kaneDe(resultado('KANE', SOLO_POTENCIA))

  it('las nombra la esfera, y no las llama tóricas', () => {
    expect(textoDe(celda()?.esfera)).toBe('3 alternativas de potencia')
    expect(textoDe(celda()?.esfera)).not.toContain('tóricas')
  })

  it('la refracción remite al detalle', () => {
    expect(textoDe(celda()?.refraccionPrevista)).toBe('Ver alternativas')
  })

  it('y los campos tóricos siguen siendo «no disponible», no «Ver alternativas»', () => {
    // Aquí no hay ninguna alternativa tórica a la que remitir: el dato no existe.
    for (const campo of ['cilindro', 'eje', 'designacion', 'cilindroResidual'] as const) {
      expect(textoDe(celda()?.[campo])).toBe('—')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Nada de esto aparece cuando no hace falta
// ═══════════════════════════════════════════════════════════════════════════

describe('sin alternativas, no se habla de alternativas', () => {
  it('con una opción destacada completa, todas las casillas son valores', () => {
    const celda = kaneDe(
      resultado(
        'KANE',
        [{ esfera: 22, cilindro: 1.5, eje: 90, designacion: 'T3', refraccionPrevista: -0.1 }],
        0,
      ),
    )
    for (const campo of ['esfera', 'cilindro', 'eje', 'designacion'] as const) {
      expect(celda?.[campo].estado).toBe('VALOR')
    }
  })

  it('una calculadora que falló no dice «Ver alternativas»', () => {
    const c = compararOjo('OD', {
      KANE: {
        calculadora: 'KANE',
        ojo: 'OD',
        estado: 'MISSING_INPUTS',
        obtenidoEn: CUANDO,
        opciones: [],
        mensaje: 'Falta el sexo.',
      },
    })
    const kane = c.celdas.find((x) => x.calculadora === 'KANE')
    for (const campo of ['esfera', 'cilindro', 'designacion'] as const) {
      expect(textoDe(kane?.[campo])).toBe('—')
    }
  })
})
