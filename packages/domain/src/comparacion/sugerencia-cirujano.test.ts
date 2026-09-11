/**
 * sugerencia-cirujano.test.ts — El criterio del cirujano, no el del programa.
 *
 * Todas las tablas de aquí son inventadas, con la misma FORMA que las tablas
 * reales que trajo el dueño del proyecto (25/08/2026) pero ningún número suyo.
 */

import { describe, expect, it } from 'vitest'

import type { OpcionLente } from '../modelo/calculadoras.js'
import {
  familiaDeLente,
  sugerirCilindroSinCambioDeEje,
  sugerirEsferaPorFamilia,
  sugerirOpcion,
} from './sugerencia-cirujano.js'

function opcion(o: Partial<OpcionLente>): OpcionLente {
  return { recomendada: false, ...o }
}

describe('de qué familia es un modelo, por su nombre', () => {
  it('reconoce Envista con distintas formas de abreviarlo', () => {
    expect(familiaDeLente('B&L Env Aspire')).toBe('ENVISTA')
    expect(familiaDeLente('Bausch & Lomb enVista MX60')).toBe('ENVISTA')
    expect(familiaDeLente('B&L Env Envy')).toBe('ENVISTA')
  })

  it('reconoce Lux con distintas formas de abreviarlo', () => {
    expect(familiaDeLente('LUX SMART')).toBe('LUX')
    expect(familiaDeLente('B&L Lux Life')).toBe('LUX')
  })

  it('un modelo de otra familia, o sin modelo, no tiene regla', () => {
    expect(familiaDeLente('AcrySof IQ')).toBeUndefined()
    expect(familiaDeLente(undefined)).toBeUndefined()
  })
})

describe('la esfera de una Envista: el residual negativo más cercano a cero', () => {
  // Misma forma que la tabla real: al bajar la potencia, el residual sube.
  const TABLA_ENVISTA: readonly OpcionLente[] = [
    opcion({ esfera: 20.5, refraccionPrevista: -0.86 }),
    opcion({ esfera: 20.0, refraccionPrevista: -0.51 }),
    opcion({ esfera: 19.5, refraccionPrevista: -0.16 }),
    opcion({ esfera: 19.0, refraccionPrevista: 0.18 }),
    opcion({ esfera: 18.5, refraccionPrevista: 0.51 }),
  ]

  it('elige la última negativa antes de pasar a positivo, no la primera de la tabla', () => {
    const s = sugerirEsferaPorFamilia(TABLA_ENVISTA, 'ENVISTA')
    expect(s?.opcion.esfera).toBe(19.5)
    expect(s?.opcion.refraccionPrevista).toBe(-0.16)
  })

  it('el motivo explica el criterio, no solo el número', () => {
    const s = sugerirEsferaPorFamilia(TABLA_ENVISTA, 'ENVISTA')
    expect(s?.motivo).toMatch(/Envista/)
    expect(s?.motivo).toMatch(/negativo/)
    expect(s?.motivo).toContain('-0.16')
  })

  it('si no hay ningún residual negativo, no sugiere nada — no adivina', () => {
    const todasPositivas = TABLA_ENVISTA.map((o) => ({
      ...o,
      refraccionPrevista: Math.abs(o.refraccionPrevista!),
    }))
    expect(sugerirEsferaPorFamilia(todasPositivas, 'ENVISTA')).toBeUndefined()
  })
})

describe('la esfera de una Lux: el residual positivo más cercano a cero', () => {
  const TABLA_LUX: readonly OpcionLente[] = [
    opcion({ esfera: 19.5, refraccionPrevista: -0.63 }),
    opcion({ esfera: 19.0, refraccionPrevista: -0.27 }),
    opcion({ esfera: 18.5, refraccionPrevista: 0.08 }),
    opcion({ esfera: 18.0, refraccionPrevista: 0.43 }),
    opcion({ esfera: 17.5, refraccionPrevista: 0.77 }),
  ]

  it('elige el primer residual positivo, el más cercano a cero desde arriba', () => {
    const s = sugerirEsferaPorFamilia(TABLA_LUX, 'LUX')
    expect(s?.opcion.esfera).toBe(18.5)
    expect(s?.opcion.refraccionPrevista).toBe(0.08)
  })

  it('si no hay ningún residual positivo, no sugiere nada', () => {
    const todasNegativas = TABLA_LUX.map((o) => ({
      ...o,
      refraccionPrevista: -Math.abs(o.refraccionPrevista!),
    }))
    expect(sugerirEsferaPorFamilia(todasNegativas, 'LUX')).toBeUndefined()
  })

  it('un residual exactamente 0.00 no se cuenta como positivo ni negativo, y no rompe nada', () => {
    const conCero: readonly OpcionLente[] = [
      opcion({ esfera: 19.0, refraccionPrevista: -0.1 }),
      opcion({ esfera: 18.5, refraccionPrevista: 0 }),
      opcion({ esfera: 18.0, refraccionPrevista: 0.3 }),
    ]
    const s = sugerirEsferaPorFamilia(conCero, 'LUX')
    expect(s?.opcion.esfera).toBe(18.0)
  })
})

describe('el cilindro tórico: el mayor que no cambia el eje residual', () => {
  it('se para en cuanto el eje salta unos 90° respecto a la fila anterior', () => {
    // Las tres primeras se quedan cerca del mismo eje (infracorregidas); la
    // cuarta salta a un eje casi perpendicular: sobrecorregida.
    const tabla: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 10 }),
      opcion({ cilindro: 1.5, ejeResidual: 12 }),
      opcion({ cilindro: 2.0, ejeResidual: 8 }),
      opcion({ cilindro: 2.5, ejeResidual: 101 }),
      opcion({ cilindro: 3.0, ejeResidual: 99 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(tabla)
    expect(s?.opcion.cilindro).toBe(2.0)
  })

  it('si el eje no salta en toda la tabla, se queda con el cilindro mayor', () => {
    const tabla: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 15 }),
      opcion({ cilindro: 1.5, ejeResidual: 17 }),
      opcion({ cilindro: 2.0, ejeResidual: 14 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(tabla)
    expect(s?.opcion.cilindro).toBe(2.0)
  })

  it('funciona igual si las opciones no vienen ordenadas por cilindro', () => {
    const desordenada: readonly OpcionLente[] = [
      opcion({ cilindro: 2.5, ejeResidual: 101 }),
      opcion({ cilindro: 1.0, ejeResidual: 10 }),
      opcion({ cilindro: 2.0, ejeResidual: 8 }),
      opcion({ cilindro: 1.5, ejeResidual: 12 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(desordenada)
    expect(s?.opcion.cilindro).toBe(2.0)
  })

  it('un eje que cruza 0°/180° (176° a 4°) no se confunde con un salto de 90°', () => {
    // 176 y 4 están a solo 8° de distancia real (180 - 176 + 4), aunque la
    // resta directa dé 172.
    const tabla: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 176 }),
      opcion({ cilindro: 1.5, ejeResidual: 4 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(tabla)
    expect(s?.opcion.cilindro).toBe(1.5)
  })

  it('ignora las opciones sin cilindro o sin eje residual', () => {
    const conHuecos: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 10 }),
      opcion({ esfera: 20.0 }), // sin cilindro: no es una fila tórica
      opcion({ cilindro: 1.5, ejeResidual: 12 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(conHuecos)
    expect(s?.opcion.cilindro).toBe(1.5)
  })

  it('el motivo explica el criterio', () => {
    const tabla: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 10 }),
      opcion({ cilindro: 2.0, ejeResidual: 101 }),
    ]
    const s = sugerirCilindroSinCambioDeEje(tabla)
    expect(s?.motivo).toMatch(/cilindro/)
    expect(s?.motivo).toMatch(/eje/)
  })
})

describe('sugerirOpcion: decide sola qué regla toca', () => {
  it('con cilindro y eje, usa la regla del cilindro sin mirar la familia', () => {
    const tabla: readonly OpcionLente[] = [
      opcion({ cilindro: 1.0, ejeResidual: 10 }),
      opcion({ cilindro: 2.0, ejeResidual: 101 }),
    ]
    expect(sugerirOpcion(tabla, undefined)?.opcion.cilindro).toBe(1.0)
    expect(sugerirOpcion(tabla, 'LUX')?.opcion.cilindro).toBe(1.0)
  })

  it('sin cilindro, usa la regla de la familia', () => {
    const tabla: readonly OpcionLente[] = [
      opcion({ esfera: 19.5, refraccionPrevista: -0.16 }),
      opcion({ esfera: 19.0, refraccionPrevista: 0.18 }),
    ]
    expect(sugerirOpcion(tabla, 'ENVISTA')?.opcion.esfera).toBe(19.5)
  })

  it('sin cilindro y sin familia conocida, no sugiere nada', () => {
    const tabla: readonly OpcionLente[] = [opcion({ esfera: 19.5, refraccionPrevista: -0.16 })]
    expect(sugerirOpcion(tabla, undefined)).toBeUndefined()
  })
})

describe('esto no es una recomendación clínica de la aplicación (D14)', () => {
  it('el motivo siempre dice de dónde sale, nunca lo pinta como si lo dijera la calculadora', () => {
    const s = sugerirEsferaPorFamilia(
      [opcion({ esfera: 19.5, refraccionPrevista: -0.16 })],
      'ENVISTA',
    )
    expect(s?.motivo).toMatch(/fabricante/i)
  })

  it('la opción sugerida no se marca como recomendada por la calculadora', () => {
    // Esta es la trampa histórica que documenta comparar.ts: una opción
    // elegida por el programa no puede parecer una opción que la web destacó.
    const s = sugerirEsferaPorFamilia(
      [opcion({ esfera: 19.5, refraccionPrevista: -0.16, recomendada: false })],
      'ENVISTA',
    )
    expect(s?.opcion.recomendada).toBe(false)
  })
})
