/**
 * Lo que se prueba aquí, en una frase: `lentesQueCubren` es un filtro por
 * número, y no elige ni destaca ninguna lente aunque varias encajen — es la
 * misma regla que `comparar.ts` (D14: compara, no recomienda), aplicada al
 * catálogo propio en vez de a las calculadoras externas.
 */

import { describe, expect, it } from 'vitest'

import {
  describirLenteDeCatalogo,
  erroresDeLenteCatalogo,
  lentesQueCubren,
  rangoValido,
  type LenteDeCatalogo,
} from './catalogo-lentes.js'

function lente(datos: Partial<LenteDeCatalogo> & { readonly id: string }): LenteDeCatalogo {
  return {
    modelo: 'Lente de prueba',
    constantesA: { EVO_TORIC: 119.1 },
    torica: false,
    rangoEsfera: { min: 10, max: 30 },
    ...datos,
  }
}

describe('rangoValido', () => {
  it('acepta un intervalo con el mínimo por debajo o igual al máximo', () => {
    expect(rangoValido({ min: 10, max: 30 })).toBe(true)
    expect(rangoValido({ min: 10, max: 10 })).toBe(true)
  })

  it('rechaza un intervalo invertido', () => {
    expect(rangoValido({ min: 30, max: 10 })).toBe(false)
  })
})

describe('erroresDeLenteCatalogo', () => {
  it('no da ningún error para una lente esférica bien formada', () => {
    expect(
      erroresDeLenteCatalogo({
        modelo: 'Akreos AO MI60',
        constantesA: { BARRETT_TORIC: 119.1 },
        torica: false,
        rangoEsfera: { min: 10, max: 30 },
      }),
    ).toEqual([])
  })

  it('exige rango de cilindro en una tórica, y no lo exige en una esférica', () => {
    const base = {
      modelo: 'X',
      constantesA: { BARRETT_TORIC: 119.1 },
      rangoEsfera: { min: 10, max: 30 },
    }
    expect(erroresDeLenteCatalogo({ ...base, torica: false })).toEqual([])
    expect(erroresDeLenteCatalogo({ ...base, torica: true })).toEqual([
      'Una lente tórica necesita su rango de cilindro.',
    ])
  })

  it('exige la constante A de al menos una calculadora', () => {
    const base = { modelo: 'X', torica: false, rangoEsfera: { min: 10, max: 30 } }
    expect(erroresDeLenteCatalogo({ ...base, constantesA: {} })).toEqual([
      'Hace falta la constante A de al menos una calculadora (Kane, EVO o Barrett).',
    ])
  })

  it('acepta varias constantes a la vez, una por calculadora', () => {
    expect(
      erroresDeLenteCatalogo({
        modelo: 'enVista ENVY',
        torica: false,
        rangoEsfera: { min: 6, max: 34 },
        constantesA: { EVO_TORIC: 119.24, BARRETT_TORIC: 119.28, KANE: 119.33 },
      }),
    ).toEqual([])
  })

  it('rechaza una constante A que no sea un número positivo, nombrando la calculadora', () => {
    const base = { modelo: 'X', torica: false, rangoEsfera: { min: 10, max: 30 } }
    expect(erroresDeLenteCatalogo({ ...base, constantesA: { KANE: 0 } })).toEqual([
      'La constante A de Kane tiene que ser mayor que 0.',
    ])
    expect(erroresDeLenteCatalogo({ ...base, constantesA: { EVO_TORIC: -119.1 } })).toEqual([
      'La constante A de EVO Toric tiene que ser mayor que 0.',
    ])
  })

  it('acumula varios errores a la vez, no solo el primero', () => {
    const errores = erroresDeLenteCatalogo({
      modelo: '',
      constantesA: {},
      torica: true,
      rangoEsfera: { min: 30, max: 10 },
    })
    expect(errores).toHaveLength(4)
  })
})

describe('describirLenteDeCatalogo', () => {
  it('lista cada calculadora con su propia constante, en orden fijo', () => {
    const l = lente({
      id: 'x',
      modelo: 'enVista ENVY',
      fabricante: 'Bausch & Lomb',
      constantesA: { KANE: 119.33, EVO_TORIC: 119.24, BARRETT_TORIC: 119.28 },
    })
    expect(describirLenteDeCatalogo(l)).toBe(
      'Bausch & Lomb enVista ENVY — EVO Toric A 119.24 · Barrett Toric A 119.28 · Kane A 119.33',
    )
  })

  it('no revienta si no hay ninguna constante declarada', () => {
    const l = lente({ id: 'x', modelo: 'X', constantesA: {} })
    expect(describirLenteDeCatalogo(l)).toBe('X')
  })
})

describe('lentesQueCubren', () => {
  const esferica = lente({ id: 'esferica', modelo: 'MX60', rangoEsfera: { min: 10, max: 30 } })
  const torica = lente({
    id: 'torica',
    modelo: 'MX60T',
    torica: true,
    rangoEsfera: { min: 10, max: 30 },
    rangoCilindro: { min: 1, max: 4 },
  })
  const catalogo = [esferica, torica]

  it('sin cilindro, mira solo la esfera y no distingue tórica de esférica', () => {
    expect(lentesQueCubren(catalogo, 21.5)).toEqual([esferica, torica])
  })

  it('fuera del rango de esfera, no cubre aunque el cilindro encaje', () => {
    expect(lentesQueCubren(catalogo, 40, 2)).toEqual([])
  })

  it('con cilindro, solo cubren las tóricas cuyo rango lo incluye', () => {
    expect(lentesQueCubren(catalogo, 21.5, 2)).toEqual([torica])
  })

  it('con cilindro fuera del rango de la tórica, no cubre ninguna', () => {
    expect(lentesQueCubren(catalogo, 21.5, 8)).toEqual([])
  })

  it('una esférica nunca cubre si se pide cilindro, aunque la esfera encaje', () => {
    expect(lentesQueCubren([esferica], 21.5, 1)).toEqual([])
  })

  it('respeta los límites del intervalo, inclusive', () => {
    expect(lentesQueCubren(catalogo, 10)).toContainEqual(esferica)
    expect(lentesQueCubren(catalogo, 30)).toContainEqual(esferica)
    expect(lentesQueCubren(catalogo, 9.99)).not.toContainEqual(esferica)
  })

  it('no elige ni destaca ninguna cuando varias cubren lo mismo', () => {
    const otraEsferica = lente({ id: 'otra', modelo: 'Akreos', rangoEsfera: { min: 10, max: 30 } })
    const resultado = lentesQueCubren([esferica, otraEsferica], 21.5)
    expect(resultado).toEqual([esferica, otraEsferica])
  })
})
