import { describe, expect, it } from 'vitest'

import { casoNuevo } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import { calcularResumenDashboard, casosCalculadosDeDoctor } from './dashboard.js'

const CUANDO = '2026-09-15T10:00:00.000Z'

function casoCompletado(id: string, datos: Partial<Caso> = {}): Caso {
  return {
    ...casoNuevo(id, `CV-2026-${id}`, CUANDO),
    estado: 'COMPLETADO',
    ...datos,
  }
}

describe('calcularResumenDashboard', () => {
  it('sin ningún caso, sale vacío', () => {
    expect(calcularResumenDashboard([])).toEqual({
      totalCalculados: 0,
      porDoctor: [],
      porModeloLente: [],
    })
  })

  it('un caso sin lente elegida no cuenta, aunque esté COMPLETADO', () => {
    const resumen = calcularResumenDashboard([
      casoCompletado('1', { nombreCirujano: 'Dra. López' }),
    ])
    expect(resumen.totalCalculados).toBe(0)
  })

  it('un caso que no ha terminado (aunque tenga lente elegida) no cuenta', () => {
    const resumen = calcularResumenDashboard([
      { ...casoCompletado('1'), estado: 'CALCULANDO', lente: { modelo: 'LuxSmart' } },
    ])
    expect(resumen.totalCalculados).toBe(0)
  })

  it('cuenta por doctor, más casos primero', () => {
    const resumen = calcularResumenDashboard([
      casoCompletado('1', { nombreCirujano: 'Dra. López', lente: { modelo: 'LuxSmart' } }),
      casoCompletado('2', { nombreCirujano: 'Dra. López', lente: { modelo: 'LuxSmart' } }),
      casoCompletado('3', { nombreCirujano: 'Dr. Ruiz', lente: { modelo: 'LuxSmart' } }),
    ])
    expect(resumen.porDoctor).toEqual([
      { etiqueta: 'Dra. López', cantidad: 2 },
      { etiqueta: 'Dr. Ruiz', cantidad: 1 },
    ])
  })

  it('un caso sin doctor se agrupa aparte, no se pierde', () => {
    const resumen = calcularResumenDashboard([
      casoCompletado('1', { lente: { modelo: 'LuxSmart' } }),
    ])
    expect(resumen.porDoctor).toEqual([{ etiqueta: 'Sin doctor', cantidad: 1 }])
  })

  it('cuenta por modelo de lente, combinando fabricante cuando no está ya en el nombre', () => {
    const resumen = calcularResumenDashboard([
      casoCompletado('1', { lente: { modelo: 'LuxSmart', fabricante: 'B&L' } }),
      casoCompletado('2', { lente: { modelo: 'B&L LuxSmart' } }),
      casoCompletado('3', { lente: { modelo: 'Eyhance' } }),
    ])
    // Las dos primeras son la misma lente, escrita de dos formas distintas
    // que ya incluyen el fabricante en el modelo o lo combinan aparte.
    expect(resumen.porModeloLente).toEqual(
      expect.arrayContaining([
        { etiqueta: 'B&L LuxSmart', cantidad: 2 },
        { etiqueta: 'Eyhance', cantidad: 1 },
      ]),
    )
  })

  it(
    'junta variantes de escritura del mismo modelo (D90, 17/09/2026) — caso real reportado ' +
      'por el dueño: «Bausch & Lomb B&L Aspire», «bausch and lomb aspire», «bausch& lomb aspire» ' +
      'y «BAUSCH AND LOMB ENVY» no debían salir como barras aparte',
    () => {
      const resumen = calcularResumenDashboard([
        ...Array.from({ length: 30 }, (_, i) =>
          casoCompletado(`aspire-catalogo-${i}`, {
            lente: { modelo: 'B&L Aspire', fabricante: 'Bausch & Lomb' },
          }),
        ),
        casoCompletado('aspire-1', { lente: { modelo: 'bausch & lomb aspire' } }),
        casoCompletado('aspire-2', { lente: { modelo: 'bausch and lomb aspire' } }),
        casoCompletado('aspire-3', { lente: { modelo: 'bausch& lomb aspire' } }),
        ...Array.from({ length: 22 }, (_, i) =>
          casoCompletado(`envy-catalogo-${i}`, {
            lente: { modelo: 'B&L Envy', fabricante: 'Bausch & Lomb' },
          }),
        ),
        casoCompletado('envy-1', { lente: { modelo: 'BAUSCH AND LOMB ENVY' } }),
      ])

      expect(resumen.porModeloLente).toEqual([
        { etiqueta: 'Bausch & Lomb B&L Aspire', cantidad: 33 },
        { etiqueta: 'Bausch & Lomb B&L Envy', cantidad: 23 },
      ])
    },
  )

  it('dos modelos de verdad distintos (Aspire y Envy) nunca se juntan, aunque compartan fabricante', () => {
    const resumen = calcularResumenDashboard([
      casoCompletado('1', { lente: { modelo: 'B&L Aspire', fabricante: 'Bausch & Lomb' } }),
      casoCompletado('2', { lente: { modelo: 'B&L Envy', fabricante: 'Bausch & Lomb' } }),
    ])
    expect(resumen.porModeloLente).toEqual(
      expect.arrayContaining([
        { etiqueta: 'Bausch & Lomb B&L Aspire', cantidad: 1 },
        { etiqueta: 'Bausch & Lomb B&L Envy', cantidad: 1 },
      ]),
    )
    expect(resumen.porModeloLente).toHaveLength(2)
  })

  it('filtra por rango de fechas, comparando el día de actualizadoEn', () => {
    const casos = [
      {
        ...casoCompletado('1', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2026-08-01T09:00:00.000Z',
      },
      {
        ...casoCompletado('2', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2026-09-10T09:00:00.000Z',
      },
      {
        ...casoCompletado('3', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2026-09-30T09:00:00.000Z',
      },
    ]
    const resumen = calcularResumenDashboard(casos, {
      rango: { desde: '2026-09-01', hasta: '2026-09-15' },
    })
    expect(resumen.totalCalculados).toBe(1)
  })

  it('el rango es inclusivo en los dos extremos', () => {
    const casos = [
      {
        ...casoCompletado('1', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2026-09-01T00:00:00.000Z',
      },
      {
        ...casoCompletado('2', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2026-09-15T23:59:59.000Z',
      },
    ]
    const resumen = calcularResumenDashboard(casos, {
      rango: { desde: '2026-09-01', hasta: '2026-09-15' },
    })
    expect(resumen.totalCalculados).toBe(2)
  })

  it('sin rango (los dos campos vacíos), no filtra nada — el total de siempre', () => {
    const casos = [
      {
        ...casoCompletado('1', { lente: { modelo: 'LuxSmart' } }),
        actualizadoEn: '2020-01-01T00:00:00.000Z',
      },
    ]
    expect(calcularResumenDashboard(casos, { rango: {} }).totalCalculados).toBe(1)
  })

  it('un doctor excluido no cuenta ni en el total ni en ningún gráfico', () => {
    const resumen = calcularResumenDashboard(
      [
        casoCompletado('1', { nombreCirujano: 'Dra. Prueba', lente: { modelo: 'LuxSmart' } }),
        casoCompletado('2', { nombreCirujano: 'Dr. Ruiz', lente: { modelo: 'LuxSmart' } }),
      ],
      { doctoresExcluidos: ['Dra. Prueba'] },
    )
    expect(resumen.totalCalculados).toBe(1)
    expect(resumen.porDoctor).toEqual([{ etiqueta: 'Dr. Ruiz', cantidad: 1 }])
    expect(resumen.porModeloLente).toEqual([{ etiqueta: 'LuxSmart', cantidad: 1 }])
  })

  it('excluir compara sin mayúsculas ni espacios de sobra', () => {
    const resumen = calcularResumenDashboard(
      [casoCompletado('1', { nombreCirujano: '  Dra. Prueba  ', lente: { modelo: 'LuxSmart' } })],
      { doctoresExcluidos: ['dra. prueba'] },
    )
    expect(resumen.totalCalculados).toBe(0)
  })

  it('excluir «Sin doctor» sí quita los casos sin doctor — fallo real reportado por el dueño (16/09/2026): el botón «Excluir» de esa fila no hacía nada', () => {
    const resumen = calcularResumenDashboard(
      [
        casoCompletado('1', { lente: { modelo: 'LuxSmart' } }),
        casoCompletado('2', { nombreCirujano: 'Dr. Ruiz', lente: { modelo: 'LuxSmart' } }),
      ],
      { doctoresExcluidos: ['Sin doctor'] },
    )
    expect(resumen.totalCalculados).toBe(1)
    expect(resumen.porDoctor).toEqual([{ etiqueta: 'Dr. Ruiz', cantidad: 1 }])
  })
})

describe('casosCalculadosDeDoctor', () => {
  it('devuelve solo los casos «lente calculada» de ese doctor', () => {
    const deLopez1 = casoCompletado('1', {
      nombreCirujano: 'Dra. López',
      lente: { modelo: 'LuxSmart' },
    })
    const deLopez2 = casoCompletado('2', {
      nombreCirujano: 'Dra. López',
      lente: { modelo: 'Eyhance' },
    })
    const deRuiz = casoCompletado('3', {
      nombreCirujano: 'Dr. Ruiz',
      lente: { modelo: 'LuxSmart' },
    })
    const sinTerminar = {
      ...casoCompletado('4', { nombreCirujano: 'Dra. López' }),
      estado: 'CALCULANDO' as const,
    }

    const resultado = casosCalculadosDeDoctor(
      [deLopez1, deLopez2, deRuiz, sinTerminar],
      'Dra. López',
    )
    expect(resultado.map((c) => c.id)).toEqual(['1', '2'])
  })

  it('coincide con «Sin doctor», igual que la etiqueta que se enseña', () => {
    const sinDoctor = casoCompletado('1', { lente: { modelo: 'LuxSmart' } })
    const conDoctor = casoCompletado('2', {
      nombreCirujano: 'Dr. Ruiz',
      lente: { modelo: 'LuxSmart' },
    })
    expect(casosCalculadosDeDoctor([sinDoctor, conDoctor], 'Sin doctor').map((c) => c.id)).toEqual([
      '1',
    ])
  })

  it('respeta el mismo rango de fechas que el dashboard — solo se borra lo que se ve', () => {
    const dentro = {
      ...casoCompletado('1', { nombreCirujano: 'Dra. López', lente: { modelo: 'LuxSmart' } }),
      actualizadoEn: '2026-09-10T00:00:00.000Z',
    }
    const fuera = {
      ...casoCompletado('2', { nombreCirujano: 'Dra. López', lente: { modelo: 'LuxSmart' } }),
      actualizadoEn: '2020-01-01T00:00:00.000Z',
    }
    const resultado = casosCalculadosDeDoctor([dentro, fuera], 'Dra. López', {
      rango: { desde: '2026-09-01', hasta: '2026-09-30' },
    })
    expect(resultado.map((c) => c.id)).toEqual(['1'])
  })
})
