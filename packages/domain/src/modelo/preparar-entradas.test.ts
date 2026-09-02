/**
 * EVO y Barrett piden, cada una en su propio desplegable, qué aparato midió
 * la córnea posterior (D58, 01/09/2026) — sin decírselo, las dos se quedan
 * en su propio valor por defecto aunque el aparato real fuera otro.
 *
 * Lo que se prueba aquí: que `prepararEntradas` traduce el aparato del caso
 * (D47) al texto exacto de CADA web cuando lo conoce, que no manda nada
 * cuando no lo conoce (nunca se adivina), y que a Kane —sin córnea
 * posterior, D51— y a las variantes «sin cara posterior» no les llega este
 * dato aunque el caso lo tenga.
 */

import { describe, expect, it } from 'vitest'

import { casoNuevo, confirmar, conOjo, ojoDe } from './caso.js'
import { conAparatoCaraPosterior, conMedida, crearMedida, ojoVacio } from './medida.js'
import { prepararEntradas } from './preparar-entradas.js'
import type { Procedencia } from './procedencia.js'

const CUANDO = '2026-09-01T10:00:00.000Z'

function manual(): Procedencia {
  return { metodo: 'MANUAL', registradoEn: CUANDO }
}

function casoConAparato(aparato: string) {
  let ojo = ojoVacio('OD', aparato)
  const valores: Record<string, number> = {
    AL: 24.07,
    K1: 41.22,
    K1_EJE: 175,
    K2: 42.52,
    K2_EJE: 85,
    ACD: 3.18,
    REFRACCION_OBJETIVO: 0,
    CONSTANTE_A: 119.0,
    SIA: 0.3,
    EJE_INCISION: 90,
    PK1: -6.0,
    PK1_EJE: 175,
    PK2: -6.3,
    PK2_EJE: 85,
  }
  for (const [campo, valor] of Object.entries(valores)) {
    ojo = conMedida(ojo, {
      ...crearMedida(campo as Parameters<typeof crearMedida>[0], 'OD', valor, manual()),
      confirmadoPorUsuario: true,
    })
  }
  const caso = {
    ...conOjo(casoNuevo('c1', 'CV-2026-0200', CUANDO), ojo, CUANDO),
    sexo: { valor: 'MUJER' as const, procedencia: manual(), confirmadoPorUsuario: true },
  }
  return confirmar(caso, CUANDO)
}

describe('dispositivo de córnea posterior — traducido al texto exacto de cada web (D58, 01/09/2026)', () => {
  it('EVO: un aparato que EVO reconoce se manda con el texto exacto de su desplegable', () => {
    const aparato = 'ZEISS IOLMaster 700'
    const r = prepararEntradas(casoConAparato(aparato), 'EVO_TORIC', 'OD', aparato)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBe('IOLMaster 700')
  })

  it('Barrett: el mismo aparato se traduce a SU propio texto, distinto del de EVO', () => {
    const aparato = 'ZEISS IOLMaster 700'
    const r = prepararEntradas(
      casoConAparato(aparato),
      'BARRETT_TORIC_CON_CARA_POSTERIOR',
      'OD',
      aparato,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBe('IOLMaster 700 TK')
  })

  it('Barrett no tiene «Anterion» en su lista: no se manda nada, no se adivina', () => {
    const aparato = 'Heidelberg ANTERION'
    const r = prepararEntradas(
      casoConAparato(aparato),
      'BARRETT_TORIC_CON_CARA_POSTERIOR',
      'OD',
      aparato,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBeUndefined()
  })

  it('un aparato en texto libre que ninguna web reconoce no manda nada', () => {
    const aparato = 'Aparato del hospital'
    const r = prepararEntradas(casoConAparato(aparato), 'EVO_TORIC', 'OD', aparato)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBeUndefined()
  })

  it('las variantes «sin cara posterior» no llevan este dato aunque el caso lo tenga', () => {
    const aparato = 'ZEISS IOLMaster 700'
    const r = prepararEntradas(
      casoConAparato(aparato),
      'EVO_TORIC_SIN_CARA_POSTERIOR',
      'OD',
      aparato,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBeUndefined()
  })

  it('Kane no tiene córnea posterior (D51): este dato nunca le llega', () => {
    const aparato = 'ZEISS IOLMaster 700'
    const r = prepararEntradas(casoConAparato(aparato), 'KANE', 'OD', aparato)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBeUndefined()
  })
})

describe('la córnea posterior puede venir de OTRO aparato que el resto de la biometría (02/09/2026, corrige D58)', () => {
  it('con un aparato de córnea posterior propio, se manda ESE, no el general', () => {
    const general = 'ZEISS IOLMaster 700'
    const caraPosterior = 'OCULUS Pentacam'
    const caso = casoConAparato(general)
    const ojoAjustado = conAparatoCaraPosterior(ojoDe(caso, 'OD', general), caraPosterior)
    const conElAjuste = conOjo(caso, ojoAjustado, CUANDO)

    const r = prepararEntradas(conElAjuste, 'EVO_TORIC', 'OD', general)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBe('Pentacam')
  })

  it('sin aparato de córnea posterior propio, se sigue usando el general de siempre', () => {
    const general = 'ZEISS IOLMaster 700'
    const r = prepararEntradas(casoConAparato(general), 'EVO_TORIC', 'OD', general)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.dispositivoCaraPosterior).toBe('IOLMaster 700')
  })
})
