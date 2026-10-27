import { describe, expect, it } from 'vitest'

import type { Calculadora } from '../modelo/calculadoras.js'
import { casoNuevo } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import { conMedida, crearMedida, ojoVacio } from '../modelo/medida.js'
import { datosQueFaltanParaCalcular, hayFaltantes, textoDeFaltantes } from './antes-de-calcular.js'

const CUANDO = '2026-10-27T10:00:00.000Z'
const AUTOR = { metodo: 'MANUAL', registradoEn: CUANDO } as const
const COMPLETO = {
  AL: 23.5,
  K1: 43,
  K1_EJE: 10,
  K2: 44,
  K2_EJE: 100,
  ACD: 3.1,
  SIA: 0.1,
  EJE_INCISION: 90,
  CONSTANTE_A: 119,
  REFRACCION_OBJETIVO: 0,
} as const

type Medidas = Partial<Record<keyof typeof COMPLETO, number>>

/** `datos`: «OD:Principal» → medidas de ese aparato. */
function caso(datos: Record<string, Medidas>, extra: Partial<Caso> = {}): Caso {
  const ojos: Partial<Record<'OD' | 'OS', ReturnType<typeof ojoVacio>[]>> = {}
  for (const [clave, medidas] of Object.entries(datos)) {
    const [ojo, aparato] = clave.split(':') as ['OD' | 'OS', string]
    let o = ojoVacio(ojo, aparato)
    for (const [campo, valor] of Object.entries(medidas)) {
      o = conMedida(o, crearMedida(campo as never, ojo, valor, AUTOR))
    }
    ojos[ojo] = [...(ojos[ojo] ?? []), o]
  }
  return {
    ...casoNuevo('1', 'CV-2026-0001', CUANDO),
    nombrePaciente: 'Paciente Prueba',
    nombreCirujano: 'Dra. Prueba',
    lente: { modelo: 'B&L LuxSmart' },
    sexo: { valor: 'F', confirmadoPorUsuario: true } as never,
    ojos,
    ...extra,
  }
}

const T = (calculadora: Calculadora, ojo: 'OD' | 'OS', aparato = 'Principal') => ({
  calculadora,
  ojo,
  aparato,
})

describe('datosQueFaltanParaCalcular', () => {
  it('con todo lo necesario no falta nada', () => {
    const f = datosQueFaltanParaCalcular(caso({ 'OD:Principal': COMPLETO }), [T('KANE', 'OD')])
    expect(hayFaltantes(f)).toBe(false)
    expect(textoDeFaltantes(f)).toBe('')
  })

  it('con dos aparatos, uno completo y otro sin ACD, avisa del segundo y de qué le falta', () => {
    const { ACD: _sin, ...sinAcd } = COMPLETO
    const c = caso({ 'OD:ZEISS IOLMaster 700': COMPLETO, 'OD:Pentacam': sinAcd })
    const f = datosQueFaltanParaCalcular(c, [
      T('EVO_TORIC', 'OD', 'ZEISS IOLMaster 700'),
      T('EVO_TORIC', 'OD', 'Pentacam'),
    ])
    expect(f.porAparato).toEqual([{ ojo: 'OD', aparato: 'Pentacam', faltan: ['la ACD'] }])
    expect(textoDeFaltantes(f)).toContain('Ojo derecho (OD), aparato «Pentacam»: la ACD.')
    expect(textoDeFaltantes(f)).toMatch(/^No se puede calcular porque faltan datos necesarios\./)
  })

  it('exige siempre el SIA y su eje, y los ejes de K, aunque la calculadora no los pida', () => {
    const { SIA: _a, EJE_INCISION: _b, K1_EJE: _c, ...resto } = COMPLETO
    const f = datosQueFaltanParaCalcular(caso({ 'OS:Principal': resto }), [T('KANE', 'OS')])
    expect(f.porAparato[0]?.faltan).toEqual(['el eje de K1', 'el SIA', 'el eje de la incisión'])
  })

  it('lo del caso: paciente, doctor, lente y sexo (solo si entra Kane)', () => {
    const vacio = caso(
      { 'OD:Principal': COMPLETO },
      { nombrePaciente: '  ', nombreCirujano: undefined, lente: undefined, sexo: undefined },
    )
    expect(datosQueFaltanParaCalcular(vacio, [T('KANE', 'OD')]).generales).toEqual([
      'el nombre del paciente',
      'el doctor',
      'el tipo de lente',
      'el sexo del paciente (lo pide Kane)',
    ])
    expect(datosQueFaltanParaCalcular(vacio, [T('EVO_TORIC', 'OD')]).generales).toEqual([
      'el nombre del paciente',
      'el doctor',
      'el tipo de lente',
    ])
  })

  it('un sexo sin comprobar por una persona también falta', () => {
    const c = caso(
      { 'OD:Principal': COMPLETO },
      { sexo: { valor: 'F', confirmadoPorUsuario: false } as never },
    )
    expect(datosQueFaltanParaCalcular(c, [T('KANE', 'OD')]).generales).toEqual([
      'el sexo del paciente, comprobado (lo pide Kane)',
    ])
  })

  it('solo mira los ojos y aparatos que se van a calcular', () => {
    const c = caso({ 'OD:Principal': COMPLETO, 'OS:Principal': { AL: 23 } })
    expect(datosQueFaltanParaCalcular(c, [T('KANE', 'OD')]).porAparato).toEqual([])
    expect(datosQueFaltanParaCalcular(c, [T('KANE', 'OS')]).porAparato).toHaveLength(1)
  })

  it('sin nada que calcular, no hay nada que comprobar', () => {
    expect(hayFaltantes(datosQueFaltanParaCalcular(caso({}), []))).toBe(false)
  })

  it('suma lo que exige la ficha de cada calculadora (p. ej. la refracción objetivo)', () => {
    const { REFRACCION_OBJETIVO: _r, ...sinRefraccion } = COMPLETO
    const f = datosQueFaltanParaCalcular(caso({ 'OD:Principal': sinRefraccion }), [
      T('EVO_TORIC', 'OD'),
    ])
    expect(f.porAparato[0]?.faltan).toEqual(['la refracción objetivo'])
  })
})
