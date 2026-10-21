import { describe, expect, it } from 'vitest'

import {
  estadoDeFila,
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

describe('estadoDeFila — no dar por completado un resultado de la tanda anterior', () => {
  const ANTES = '2026-10-21T22:00:00.000Z'
  const DESPUES = '2026-10-21T22:05:00.000Z'
  const tanda = { desde: Date.parse('2026-10-21T22:03:00.000Z') }
  const base = {
    clave: 'BARRETT_TORIC',
    ojo: 'OD',
    ocupado: true,
    tanda,
    textoDeEstado: (e: string) => e,
  }
  const guardado = (obtenidoEn: string, estado = 'SUCCESS') => ({ estado, obtenidoEn })

  it('un resultado de ANTES de la tanda vuelve a «En cola», no «Completado»', () => {
    const f = estadoDeFila({ ...base, resultado: guardado(ANTES) })
    expect(f.detalle).toBe('En cola')
    expect(f.porcentaje).toBe(0)
    expect(f.hayResultadoVigente).toBe(false)
  })

  it('con avisos de progreso de la tanda, avanza según la fase', () => {
    const f = estadoDeFila({
      ...base,
      resultado: guardado(ANTES),
      progreso: { fase: 'CALCULANDO', mensaje: 'Calculando en Barrett…', requiereUsuario: false },
    })
    expect(f.detalle).toBe('Calculando en Barrett…')
    expect(f.porcentaje).toBe(65)
  })

  it('cuando llega el resultado nuevo, ahora sí es «Completado»', () => {
    const f = estadoDeFila({ ...base, resultado: guardado(DESPUES) })
    expect(f.detalle).toBe('Completado')
    expect(f.porcentaje).toBe(100)
    expect(f.tono).toBe('exito')
  })

  it('una calculadora fuera de la tanda conserva su resultado de antes, sin barra', () => {
    const f = estadoDeFila({
      ...base,
      tanda: { ...tanda, calculadoras: ['KANE'] },
      resultado: guardado(ANTES),
    })
    expect(f.detalle).toContain('de antes')
    expect(f.porcentaje).toBeUndefined()
  })

  it('un ojo fuera de la tanda tampoco se recalcula', () => {
    const f = estadoDeFila({ ...base, tanda: { ...tanda, ojo: 'OS' }, resultado: guardado(ANTES) })
    expect(f.detalle).toContain('de antes')
  })

  it('sin tanda en marcha, un resultado guardado vale tal cual', () => {
    const f = estadoDeFila({ ...base, ocupado: false, tanda: null, resultado: guardado(ANTES) })
    expect(f.detalle).toBe('Completado')
  })

  it('un fallo de esta tanda se puede reintentar; uno de antes no se enseña como fallo', () => {
    const nuevo = estadoDeFila({ ...base, resultado: guardado(DESPUES, 'EXTERNAL_ERROR') })
    expect(nuevo.clase).toBe('fallo')
    expect(nuevo.sePuedeReintentar).toBe(true)
    const viejo = estadoDeFila({ ...base, resultado: guardado(ANTES, 'EXTERNAL_ERROR') })
    expect(viejo.clase).toBe('')
  })

  it('esperando a la persona: barra sin cifra', () => {
    const f = estadoDeFila({
      ...base,
      resultado: guardado(ANTES),
      progreso: { fase: 'ESPERANDO_AL_USUARIO', mensaje: 'Acepta', requiereUsuario: true },
    })
    expect(f.porcentaje).toBeNull()
    expect(f.tono).toBe('atencion')
  })
})
