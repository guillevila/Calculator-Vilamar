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
  return {
    screenshot: comportamiento,
    waitForTimeout: async () => undefined,
    evaluate: async () => undefined,
  } as unknown as Page
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

  it('prueba varias fotos y se queda con la que pesa más — la señal de que de verdad tiene contenido (D67, 02/09/2026)', async () => {
    // Comprobado con Kane real: una tabla en blanco comprime a un PNG mucho
    // más pequeño que la misma tabla con números — este test reproduce esa
    // diferencia con tres «fotos» de tamaño distinto y ninguna decodifica
    // ningún píxel.
    const fotos = [new Uint8Array(5), new Uint8Array(50), new Uint8Array(20)]
    let llamada = 0
    const recibidos: DatosCaptura[] = []
    const ctx = contexto({
      guardarCaptura: async (d) => {
        recibidos.push(d)
        return 'captura-mejor'
      },
    })

    const id = await capturarResultado(
      paginaFalsa(async () => fotos[llamada++] ?? new Uint8Array(0)),
      ctx,
      'KANE',
    )

    expect(id).toBe('captura-mejor')
    expect(recibidos).toHaveLength(1)
    expect(recibidos[0]?.png).toBe(fotos[1]) // la de 50 bytes, la más grande
  })

  it('si una foto falla a mitad, se queda con la mejor que ya tenía en vez de perderla', async () => {
    let llamada = 0
    const buena = new Uint8Array(50)
    const ctx = contexto()

    const id = await capturarResultado(
      paginaFalsa(async () => {
        llamada++
        if (llamada === 1) return buena
        throw new Error('el navegador se ha cerrado a mitad de los intentos')
      }),
      ctx,
      'EVO_TORIC',
    )

    expect(id).toBe('captura-1') // el `guardarCaptura` por defecto del contexto de prueba
  })
})
