import { describe, expect, it } from 'vitest'

import {
  porcentajeDeCarga,
  porcentajeDeFase,
  segundosQueFaltan,
  SEGUNDOS_POR_DOCUMENTO,
} from '../compartido/progreso.js'

describe('porcentajeDeCarga', () => {
  it('empieza en 0 y nunca llega a 100 antes de terminar', () => {
    expect(porcentajeDeCarga(3, 0, 0)).toBe(0)
    expect(porcentajeDeCarga(3, 2, 10_000)).toBeLessThan(100)
    expect(porcentajeDeCarga(1, 0, 10_000)).toBe(95)
  })

  it('crece con el tiempo y con los documentos ya leídos', () => {
    const a = porcentajeDeCarga(4, 0, 2)
    const b = porcentajeDeCarga(4, 0, 8)
    const c = porcentajeDeCarga(4, 2, 0)
    expect(b).toBeGreaterThan(a)
    expect(c).toBe(50)
  })

  it('sin documentos no hay porcentaje', () => {
    expect(porcentajeDeCarga(0, 0, 5)).toBe(0)
  })
})

describe('segundosQueFaltan', () => {
  it('cuenta lo que queda del actual y los siguientes', () => {
    expect(segundosQueFaltan(3, 0, 0)).toBe(SEGUNDOS_POR_DOCUMENTO * 3)
    expect(segundosQueFaltan(3, 1, SEGUNDOS_POR_DOCUMENTO)).toBe(SEGUNDOS_POR_DOCUMENTO)
    expect(segundosQueFaltan(1, 1, 3)).toBe(0)
  })
})

describe('porcentajeDeFase', () => {
  it('sube con las fases y acaba en 100', () => {
    const fases = ['NAVEGANDO', 'PREPARANDO', 'RELLENANDO', 'CALCULANDO', 'LEYENDO_RESULTADO']
    const valores = fases.map((f) => porcentajeDeFase(f) ?? -1)
    expect([...valores].sort((a, b) => a - b)).toEqual(valores)
    expect(porcentajeDeFase('TERMINADO')).toBe(100)
  })

  it('esperando al usuario no tiene porcentaje', () => {
    expect(porcentajeDeFase('ESPERANDO_AL_USUARIO')).toBeNull()
  })
})
