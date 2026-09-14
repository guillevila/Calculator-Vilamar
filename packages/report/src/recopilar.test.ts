/**
 * recopilar.test.ts — Que `soloOjo` recorte de verdad (D47, 27/08/2026).
 *
 * Es lo que permite un PDF por ojo en vez de uno por caso: `generarPdf()`
 * llama a `recopilarInforme` una vez por ojo, con `soloOjo` puesto.
 */

import { describe, expect, it } from 'vitest'

import { casoNuevo, confirmar, confirmarTodas, conMedida, conOjo, crearMedida, ojoVacio } from '@vilamar/domain'

import { recopilarInforme } from './recopilar.js'

const CUANDO = '2026-08-27T10:00:00.000Z'
const A_MANO = { metodo: 'MANUAL', registradoEn: CUANDO } as const

function casoDosOjos() {
  let od = ojoVacio('OD')
  let os = ojoVacio('OS')
  for (const [campo, valor] of [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K2', 42.52],
    ['ACD', 3.18],
    ['REFRACCION_OBJETIVO', 0],
    ['CONSTANTE_A', 119],
  ] as const) {
    od = conMedida(od, crearMedida(campo, 'OD', valor, A_MANO))
    os = conMedida(os, crearMedida(campo, 'OS', valor, A_MANO))
  }
  let caso = casoNuevo('c1', 'CV-2026-0300', CUANDO)
  caso = conOjo(caso, confirmarTodas(od), CUANDO)
  caso = conOjo(caso, confirmarTodas(os), CUANDO)
  return confirmar(caso, CUANDO)
}

describe('recopilarInforme con soloOjo', () => {
  it('sin soloOjo, recopila los dos ojos', () => {
    const datos = recopilarInforme(casoDosOjos(), { version: '0.1.0', generadoEn: CUANDO })
    expect(datos.comparativas.map((c) => c.ojo).sort()).toEqual(['OD', 'OS'])
  })

  it('con soloOjo, recopila solo ese ojo', () => {
    const datos = recopilarInforme(casoDosOjos(), {
      version: '0.1.0',
      generadoEn: CUANDO,
      soloOjo: 'OD',
    })
    expect(datos.comparativas.map((c) => c.ojo)).toEqual(['OD'])
  })

  it('con soloOjo del otro lado, recopila solo ese', () => {
    const datos = recopilarInforme(casoDosOjos(), {
      version: '0.1.0',
      generadoEn: CUANDO,
      soloOjo: 'OS',
    })
    expect(datos.comparativas.map((c) => c.ojo)).toEqual(['OS'])
  })
})
