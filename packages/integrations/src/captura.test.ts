/**
 * captura.test.ts — Que fotografiar un resultado nunca tumbe el resultado.
 *
 * No hay aquí ningún `Page` real de Playwright: solo el mínimo doble que
 * necesita `capturarResultado`, un `.screenshot()`. Los adaptadores ya
 * comprueban el ojo antes de llegar a este punto (ver evo.ts/kane.ts); esta
 * función no vuelve a decidir eso, solo guarda lo que se le pide.
 */

import { describe, expect, it } from 'vitest'

import type { EntradasCalculadora } from '@vilamar/domain'
import type { Page } from 'playwright'

import { capturarResultado } from './captura.js'
import type { ContextoEjecucion, DatosCaptura } from './contrato.js'

const ENTRADAS: EntradasCalculadora = {
  calculadora: 'EVO_TORIC',
  codigoCaso: 'CV-2026-0001',
  ojo: 'OD',
  valores: {},
}

function contexto(overrides: Partial<ContextoEjecucion> = {}): ContextoEjecucion {
  return {
    contexto: {} as never,
    entradas: ENTRADAS,
    progreso: () => undefined,
    ahora: () => '2026-08-24T10:00:00.000Z',
    guardarDiagnostico: async () => 'diag-1',
    guardarCaptura: async () => 'captura-1',
    cancelado: () => false,
    ...overrides,
  }
}

function paginaFalsa(comportamiento: () => Promise<Uint8Array>): Page {
  return { screenshot: comportamiento } as unknown as Page
}

describe('capturarResultado', () => {
  it('fotografía la página y la guarda con la calculadora y el ojo del contexto', async () => {
    const recibidos: DatosCaptura[] = []
    const png = new Uint8Array([1, 2, 3])
    const ctx = contexto({
      guardarCaptura: async (d) => {
        recibidos.push(d)
        return 'captura-9'
      },
    })

    const id = await capturarResultado(paginaFalsa(async () => png), ctx, 'EVO_TORIC')

    expect(id).toBe('captura-9')
    expect(recibidos).toEqual([{ calculadora: 'EVO_TORIC', ojo: 'OD', png }])
  })

  it('si el navegador ya no responde al hacer la foto, no lanza: devuelve undefined', async () => {
    const ctx = contexto()
    const id = await capturarResultado(
      paginaFalsa(async () => {
        throw new Error('el navegador se ha cerrado de golpe')
      }),
      ctx,
      'KANE',
    )
    expect(id).toBeUndefined()
  })

  it('si guardar la captura falla, tampoco lanza: el resultado ya leído no se pierde', async () => {
    const ctx = contexto({
      guardarCaptura: async () => {
        throw new Error('disco lleno')
      },
    })
    const id = await capturarResultado(
      paginaFalsa(async () => new Uint8Array([1])),
      ctx,
      'BARRETT_TORIC',
    )
    expect(id).toBeUndefined()
  })
})
