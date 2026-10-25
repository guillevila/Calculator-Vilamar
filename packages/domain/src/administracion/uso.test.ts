import { describe, expect, it } from 'vitest'

import { casoNuevo, claveResultado } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import { PLAN_DE_PARTIDA, cantidadSegunMetrica, situacionDeTramo, usoPorMes } from './uso.js'

const CUANDO = '2026-09-15T10:00:00.000Z'

function caso(
  id: string,
  datos: {
    documentos?: readonly string[]
    resultados?: readonly { ojo: 'OD' | 'OS'; calc: string; cuando: string; estado?: string }[]
    importado?: boolean
  } = {},
): Caso {
  const resultados: Record<string, unknown> = {}
  for (const r of datos.resultados ?? []) {
    resultados[claveResultado(r.calc as never, r.ojo)] = {
      calculadora: r.calc,
      ojo: r.ojo,
      estado: r.estado ?? 'SUCCESS',
      obtenidoEn: r.cuando,
      opciones: [],
    }
  }
  return {
    ...casoNuevo(id, `CV-2026-${id}`, CUANDO),
    documentos: (datos.documentos ?? []).map((cargadoEn, i) => ({
      id: `d${i}`,
      nombre: 'x.pdf',
      cargadoEn,
    })) as never,
    resultados: resultados as Caso['resultados'],
    ...(datos.importado
      ? {
          importado: {
            origen: 'RESUMEN_CALCULADORES' as const,
            ficheroOriginal: 'a.pdf',
            rutaPdf: 'x',
            huella: 'h',
            ojo: 'OD' as const,
            aparatos: [],
            calculadoras: [],
          } as never,
        }
      : {}),
  }
}

describe('usoPorMes', () => {
  it('cuenta informes leídos, ojos calculados y resultados de calculadora por mes', () => {
    const uso = usoPorMes([
      caso('1', {
        documentos: ['2026-10-02T10:00:00.000Z', '2026-10-02T10:01:00.000Z'],
        resultados: [
          { ojo: 'OD', calc: 'KANE', cuando: '2026-10-03T10:00:00.000Z' },
          { ojo: 'OD', calc: 'EVO_TORIC', cuando: '2026-10-03T10:00:30.000Z' },
          { ojo: 'OS', calc: 'KANE', cuando: '2026-10-03T10:01:00.000Z' },
        ],
      }),
    ])
    expect(uso).toEqual([
      { mes: '2026-10', informesLeidos: 2, ojosCalculados: 2, resultadosDeCalculadora: 3 },
    ])
  })

  it('un resultado fallido no cuenta; los meses salen de más reciente a más antiguo', () => {
    const uso = usoPorMes([
      caso('1', { resultados: [{ ojo: 'OD', calc: 'KANE', cuando: '2026-09-03T10:00:00.000Z' }] }),
      caso('2', {
        resultados: [
          { ojo: 'OD', calc: 'KANE', cuando: '2026-10-03T10:00:00.000Z', estado: 'EXTERNAL_ERROR' },
          { ojo: 'OS', calc: 'KANE', cuando: '2026-10-04T10:00:00.000Z' },
        ],
      }),
    ])
    expect(uso.map((u) => u.mes)).toEqual(['2026-10', '2026-09'])
    expect(uso[0]).toMatchObject({ ojosCalculados: 1, resultadosDeCalculadora: 1 })
  })

  it('un ojo recalculado otro mes cuenta una sola vez, en el mes del primer resultado', () => {
    const uso = usoPorMes([
      caso('1', {
        resultados: [
          { ojo: 'OD', calc: 'KANE', cuando: '2026-09-30T10:00:00.000Z' },
          { ojo: 'OD', calc: 'EVO_TORIC', cuando: '2026-10-02T10:00:00.000Z' },
        ],
      }),
    ])
    expect(uso.find((u) => u.mes === '2026-09')?.ojosCalculados).toBe(1)
    expect(uso.find((u) => u.mes === '2026-10')?.ojosCalculados).toBe(0)
  })

  it('los casos importados de otra app no cuentan', () => {
    const uso = usoPorMes([
      caso('1', { importado: true, documentos: ['2026-10-02T10:00:00.000Z'] }),
    ])
    expect(uso).toEqual([])
  })

  it('la métrica elige qué cifra se cobra', () => {
    const u = { mes: '2026-10', informesLeidos: 5, ojosCalculados: 7, resultadosDeCalculadora: 21 }
    expect(cantidadSegunMetrica(u, 'INFORMES_LEIDOS')).toBe(5)
    expect(cantidadSegunMetrica(u, 'OJOS_CALCULADOS')).toBe(7)
    expect(cantidadSegunMetrica(u, 'RESULTADOS_DE_CALCULADORA')).toBe(21)
  })
})

describe('situacionDeTramo (100 por tramo, 10 € cada uno, aviso a los 80)', () => {
  const plan = PLAN_DE_PARTIDA
  it('el plan de partida cuenta ojos, de 100 en 100', () => {
    expect(plan).toMatchObject({ metrica: 'OJOS_CALCULADOS', tamanoTramo: 100, precioPorTramo: 10 })
  })
  it('de 0 a 100 es el primer tramo, y 0 también paga la cuota', () => {
    expect(situacionDeTramo(0, plan)).toMatchObject({ tramo: 1, precio: 10, avisar: false })
    expect(situacionDeTramo(100, plan)).toMatchObject({ tramo: 1, precio: 10, hastaElSiguiente: 0 })
  })
  it('cada 100 más suma un tramo y 10 €', () => {
    expect(situacionDeTramo(101, plan)).toMatchObject({
      tramo: 2,
      precio: 20,
      hastaElSiguiente: 99,
    })
    expect(situacionDeTramo(200, plan)).toMatchObject({ tramo: 2, precio: 20 })
    expect(situacionDeTramo(201, plan)).toMatchObject({ tramo: 3, precio: 30 })
  })
  it('avisa al llegar al umbral dentro de su tramo', () => {
    expect(situacionDeTramo(79, plan).avisar).toBe(false)
    expect(situacionDeTramo(80, plan)).toMatchObject({ avisar: true, hastaElSiguiente: 20 })
    expect(situacionDeTramo(101, plan).avisar).toBe(false)
    expect(situacionDeTramo(180, plan).avisar).toBe(true)
  })
})
