import { describe, expect, it } from 'vitest'

import { casoNuevo, claveResultado } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import { analizarCasos } from './analisis.js'

const CUANDO = '2026-09-15T10:00:00.000Z'

function caso(id: string, datos: Partial<Caso> & { ojos?: readonly ('OD' | 'OS')[] } = {}): Caso {
  const { ojos = ['OD'], ...resto } = datos
  const resultados: Record<string, unknown> = {}
  for (const ojo of ojos) {
    resultados[claveResultado('KANE', ojo, 'Principal')] = {
      calculadora: 'KANE',
      ojo,
      estado: 'SUCCESS',
      obtenidoEn: CUANDO,
      opciones: [],
    }
  }
  return {
    ...casoNuevo(id, `CV-2026-${id}`, CUANDO),
    estado: 'COMPLETADO',
    lente: { modelo: 'LuxSmart' },
    nombreCirujano: 'Dra. López',
    resultados: resultados as Caso['resultados'],
    ...resto,
  }
}

describe('analizarCasos', () => {
  it('por defecto solo entran los terminados; con «a medias», también los leídos, nunca los borradores', () => {
    const casos = [
      caso('1'),
      caso('2', { estado: 'EN_REVISION' }),
      caso('3', { estado: 'BORRADOR' }),
    ]
    expect(analizarCasos(casos).filas.map((f) => f.codigo)).toEqual(['CV-2026-1'])
    expect(
      analizarCasos(casos, { incluirAMedias: true })
        .filas.map((f) => f.codigo)
        .sort(),
    ).toEqual(['CV-2026-1', 'CV-2026-2'])
  })

  it('filtra entre fechas (inclusive), por doctor y por lente', () => {
    const casos = [
      caso('1', { actualizadoEn: '2026-09-01T10:00:00.000Z', nombreCirujano: 'Dr. Ruiz' }),
      caso('2', { actualizadoEn: '2026-09-10T10:00:00.000Z', lente: { modelo: 'Eyhance' } }),
      caso('3', { actualizadoEn: '2026-09-20T10:00:00.000Z' }),
    ]
    expect(
      analizarCasos(casos, { rango: { desde: '2026-09-10', hasta: '2026-09-20' } }).filas.map(
        (f) => f.codigo,
      ),
    ).toEqual(['CV-2026-3', 'CV-2026-2'])
    expect(analizarCasos(casos, { doctor: 'dr. ruiz' }).filas.map((f) => f.codigo)).toEqual([
      'CV-2026-1',
    ])
    const eyhance = analizarCasos(casos).opciones.lentes.find((l) => l.etiqueta === 'Eyhance')!
    expect(analizarCasos(casos, { lente: eyhance.clave }).filas.map((f) => f.codigo)).toEqual([
      'CV-2026-2',
    ])
  })

  it('las listas desplegables no se encogen al filtrar', () => {
    const casos = [caso('1', { nombreCirujano: 'Dr. Ruiz' }), caso('2')]
    expect(analizarCasos(casos, { doctor: 'Dr. Ruiz' }).opciones.doctores).toEqual([
      'Dr. Ruiz',
      'Dra. López',
    ])
  })

  it('busca por texto en el código y en el paciente, sin mayúsculas ni tildes', () => {
    const casos = [caso('1', { nombrePaciente: 'José Pérez' }), caso('2')]
    expect(analizarCasos(casos, { texto: 'jose perez' }).filas).toHaveLength(1)
    expect(analizarCasos(casos, { texto: 'cv-2026-2' }).filas).toHaveLength(1)
  })

  it('cuenta ojos, y filtra por ojo', () => {
    const casos = [caso('1', { ojos: ['OD', 'OS'] }), caso('2', { ojos: ['OS'] })]
    const r = analizarCasos(casos)
    expect(r.totalCasos).toBe(2)
    expect(r.totalOjos).toBe(3)
    expect(r.ojosOD).toBe(1)
    expect(r.ojosOS).toBe(2)
    expect(r.porDoctor).toEqual([{ etiqueta: 'Dra. López', cantidad: 3 }])
    expect(analizarCasos(casos, { ojo: 'OD' }).totalCasos).toBe(1)
  })

  it('no cuenta los doctores excluidos del dashboard', () => {
    const casos = [caso('1', { nombreCirujano: 'Prueba' }), caso('2')]
    expect(analizarCasos(casos, {}, ['prueba']).filas.map((f) => f.codigo)).toEqual(['CV-2026-2'])
  })

  it('cada fila lleva lo necesario para abrir el caso, más reciente primero', () => {
    const casos = [
      caso('1', { actualizadoEn: '2026-09-01T10:00:00.000Z' }),
      caso('2', { actualizadoEn: '2026-09-05T10:00:00.000Z' }),
    ]
    const filas = analizarCasos(casos).filas
    expect(filas.map((f) => f.codigo)).toEqual(['CV-2026-2', 'CV-2026-1'])
    expect(filas[0]).toMatchObject({ doctor: 'Dra. López', lente: 'LuxSmart', ojos: ['OD'] })
    expect(filas[0]?.calculadoras).toEqual(['KANE'])
  })
})
