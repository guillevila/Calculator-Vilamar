import { describe, expect, it } from 'vitest'

import { casoNuevo, claveResultado, conOjo } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import type { Procedencia } from '../modelo/procedencia.js'
import { conMedida, crearMedida, ojoVacio } from '../modelo/medida.js'
import { filasDeEstudio } from './estudio.js'

const CUANDO = '2026-09-15T10:00:00.000Z'
const DEL_INFORME: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }

describe('filasDeEstudio', () => {
  function casoConBiometria(): Caso {
    let ojo = ojoVacio('OD')
    for (const [campo, valor] of [
      ['AL', 23.5],
      ['K1', 43.25],
      ['K1_EJE', 10],
      ['K2', 44.75],
      ['K2_EJE', 100],
    ] as const) {
      ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, DEL_INFORME))
    }
    const base = conOjo(casoNuevo('1', 'CV-2026-0001', CUANDO), ojo, CUANDO)
    return {
      ...base,
      estado: 'COMPLETADO',
      nombrePaciente: 'Paciente Sintético',
      nombreCirujano: 'Dra. Prueba',
      lente: { modelo: 'LuxSmart' },
      resultados: {
        [claveResultado('KANE', 'OD', ojo.aparato)]: {
          calculadora: 'KANE',
          ojo: 'OD',
          estado: 'SUCCESS',
          obtenidoEn: CUANDO,
          opciones: [
            { esfera: 22, refraccionPrevista: 0.4 },
            { esfera: 22.5, refraccionPrevista: -0.1 },
          ],
        },
      } as never,
    }
  }

  it('una fila por caso, ojo y aparato, con el preoperatorio y la lente estimada', () => {
    const filas = filasDeEstudio([casoConBiometria()])
    expect(filas).toHaveLength(1)
    const f = filas[0]!
    expect(f).toMatchObject({
      nombrePaciente: 'Paciente Sintético',
      codigo: 'CV-2026-0001',
      fecha: '2026-09-15',
      doctor: 'Dra. Prueba',
      ojo: 'OD',
      longitudAxial: 23.5,
      k1: 43.25,
      ejeK1: 10,
      k2: 44.75,
      ejeK2: 100,
      tipoDeLente: 'LuxSmart',
    })
    expect(f.lentes.KANE).toMatchObject({ esfera: 22.5, residualEsferico: -0.1 })
  })

  it('un dato que el aparato no dio queda ausente, no a cero', () => {
    const f = filasDeEstudio([casoConBiometria()])[0]!
    expect('acd' in f).toBe(false)
    expect(f.lentes.KANE?.cilindro).toBeUndefined()
  })

  it('respeta el filtro: otro ojo no da filas', () => {
    expect(filasDeEstudio([casoConBiometria()], { ojo: 'OS' })).toHaveLength(0)
  })
})
