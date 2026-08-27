import { describe, expect, it } from 'vitest'

import type { EntradasCalculadora, ResultadoCalculadora } from '@vilamar/domain'

import type { AdaptadorCalculadora, ContextoEjecucion } from './contrato.js'
import { AdaptadorSinCaraPosterior } from './variante-sin-cara-posterior.js'

function entradas(parcial: Partial<EntradasCalculadora> = {}): EntradasCalculadora {
  return {
    calculadora: 'EVO_TORIC',
    ojo: 'OD',
    codigoCaso: 'CV-2026-0001',
    valores: {},
    ...parcial,
  }
}

function adaptadorFalso(resultado: ResultadoCalculadora): AdaptadorCalculadora {
  return {
    calculadora: 'EVO_TORIC',
    nombre: 'EVO Toric',
    url: 'https://ejemplo.local',
    requiereNavegadorVisible: false,
    validarEntradas: (e) => (e.valores.AL === undefined ? ['Falta AL'] : []),
    ejecutar: async () => resultado,
  }
}

const RESULTADO_OK: ResultadoCalculadora = {
  calculadora: 'EVO_TORIC',
  ojo: 'OD',
  estado: 'SUCCESS',
  obtenidoEn: '2026-08-27T00:00:00.000Z',
  opciones: [{ esfera: 21.5, recomendada: true }],
}

describe('AdaptadorSinCaraPosterior', () => {
  it('reetiqueta el resultado con la calculadora de la variante, no la del adaptador interno', async () => {
    const envuelto = new AdaptadorSinCaraPosterior(
      adaptadorFalso(RESULTADO_OK),
      'EVO_TORIC_SIN_CARA_POSTERIOR',
    )
    const resultado = await envuelto.ejecutar({ entradas: entradas() } as ContextoEjecucion)
    expect(resultado.calculadora).toBe('EVO_TORIC_SIN_CARA_POSTERIOR')
    // El resto del resultado no se toca.
    expect(resultado.estado).toBe('SUCCESS')
    expect(resultado.opciones).toEqual(RESULTADO_OK.opciones)
  })

  it('su propia clave es la de la variante, no la del adaptador interno', () => {
    const envuelto = new AdaptadorSinCaraPosterior(
      adaptadorFalso(RESULTADO_OK),
      'EVO_TORIC_SIN_CARA_POSTERIOR',
    )
    expect(envuelto.calculadora).toBe('EVO_TORIC_SIN_CARA_POSTERIOR')
  })

  it('delega validarEntradas y requiereNavegadorVisible en el adaptador interno', () => {
    const interno = adaptadorFalso(RESULTADO_OK)
    const envuelto = new AdaptadorSinCaraPosterior(interno, 'EVO_TORIC_SIN_CARA_POSTERIOR')
    expect(envuelto.requiereNavegadorVisible).toBe(interno.requiereNavegadorVisible)
    expect(envuelto.validarEntradas(entradas())).toEqual(['Falta AL'])
    expect(envuelto.validarEntradas(entradas({ valores: { AL: 24 } }))).toEqual([])
  })
})
