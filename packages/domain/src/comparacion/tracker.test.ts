import { describe, expect, it } from 'vitest'

import { casoNuevo, claveResultado, conOjo } from '../modelo/caso.js'
import type { Caso } from '../modelo/caso.js'
import type { Procedencia } from '../modelo/procedencia.js'
import { conMedida, crearMedida, ojoVacio } from '../modelo/medida.js'
import { filasDeTracker, MAX_APARATOS_TRACKER } from './tracker.js'

const CUANDO = '2026-11-24T10:00:00.000Z'
const MANUAL: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }

function ojoCon(
  lado: 'OD' | 'OS',
  aparato: string,
  medidas: readonly (readonly [Parameters<typeof crearMedida>[0], number])[],
): ReturnType<typeof ojoVacio> {
  let ojo = ojoVacio(lado, aparato)
  for (const [campo, valor] of medidas) {
    ojo = conMedida(ojo, crearMedida(campo, lado, valor, MANUAL))
  }
  return ojo
}

function casoCon(ojos: ReturnType<typeof ojoVacio>[]): Caso {
  let caso = casoNuevo('1', 'CV-2026-0001', CUANDO)
  for (const o of ojos) caso = conOjo(caso, o, CUANDO)
  return {
    ...caso,
    estado: 'COMPLETADO',
    nombrePaciente: 'Paciente Sintético',
    nombreCirujano: 'Dra. Prueba',
    lente: { modelo: 'LuxSmart' },
    resultados: {
      [claveResultado('KANE', 'OD', ojos[0]!.aparato)]: {
        calculadora: 'KANE',
        ojo: 'OD',
        estado: 'SUCCESS',
        obtenidoEn: CUANDO,
        opciones: [{ esfera: 22.5, refraccionPrevista: -0.1 }],
      },
    } as never,
  }
}

describe('filasDeTracker', () => {
  const OD_IOL = ojoCon('OD', 'IOLMaster', [
    ['AL', 23.5],
    ['K1', 44.75],
    ['K1_EJE', 100],
    ['K2', 43.25],
    ['K2_EJE', 10],
    ['ACD', 3.1],
    ['LT', 4.5],
    ['CCT', 540],
    ['WTW', 11.8],
    ['REFRACCION_OBJETIVO', -0.25],
  ])
  const OS_IOL = ojoCon('OS', 'IOLMaster', [['AL', 23.9]])
  const OD_PENT = ojoCon('OD', 'Pentacam', [
    ['K1', 43.3],
    ['K1_EJE', 12],
    ['K2', 44.7],
    ['K2_EJE', 102],
    ['PK1', -6.1],
    ['PK1_EJE', 12],
    ['PK2', -6.6],
    ['PK2_EJE', 102],
  ])

  it('un aparato en cada ojo: una sola fila con OD y OS, plana y curva ordenadas', () => {
    const { filas } = filasDeTracker([casoCon([OD_IOL, OS_IOL])])
    expect(filas).toHaveLength(1)
    const f = filas[0]!
    expect(f).toMatchObject({
      nombrePaciente: 'Paciente Sintético',
      codigo: 'CV-2026-0001',
      doctor: 'Dra. Prueba',
      aparato: 'IOLMaster',
    })
    // En el caso K1 era la más curva: aquí la plana es la de menor valor, con su propio eje.
    expect(f.od).toMatchObject({
      kPlana: 43.25,
      ejeKPlana: 10,
      kCurva: 44.75,
      ejeKCurva: 100,
      longitudAxial: 23.5,
      acd: 3.1,
      lt: 4.5,
      cct: 540,
      wtw: 11.8,
      objetivo: -0.25,
    })
    expect(f.os).toMatchObject({ longitudAxial: 23.9 })
  })

  it('un dato que falta queda ausente, no a cero', () => {
    const f = filasDeTracker([casoCon([OD_IOL, OS_IOL])]).filas[0]!
    expect('pkPlana' in (f.od ?? {})).toBe(false)
    expect('acd' in (f.os ?? {})).toBe(false)
  })

  it('con dos aparatos salen dos filas, cada una con los datos de su aparato', () => {
    const { filas } = filasDeTracker([casoCon([OD_IOL, OD_PENT])])
    expect(filas.map((f) => f.aparato)).toEqual(['IOLMaster', 'Pentacam'])
    expect(filas[1]!.od).toMatchObject({ kPlana: 43.3, pkPlana: -6.1, pkCurva: -6.6 })
    expect(filas[1]!.od?.longitudAxial).toBeUndefined()
  })

  it('el segundo aparato de un ojo que no lo tiene deja ese ojo vacío', () => {
    const { filas } = filasDeTracker([casoCon([OD_IOL, OS_IOL, OD_PENT])])
    expect(filas).toHaveLength(2)
    expect(filas[1]!.os).toBeUndefined()
  })

  it('más de dos aparatos: el tercero no sale y se cuenta', () => {
    const tercero = ojoCon('OD', 'Argos', [['AL', 23.4]])
    const r = filasDeTracker([casoCon([OD_IOL, OD_PENT, tercero])])
    expect(r.filas).toHaveLength(MAX_APARATOS_TRACKER)
    expect(r.casosConAparatosOmitidos).toBe(1)
  })

  it('la lente elegida sale con nombre, esfera, cilindro y eje, y sin ninguna de las calculadoras', () => {
    const caso = {
      ...casoCon([OD_IOL]),
      pedidosLente: {
        OD: {
          fabricante: 'Bausch & Lomb',
          modelo: 'LuxSmart',
          esfera: 22,
          cilindro: 1.5,
          eje: 85,
          decididoEn: CUANDO,
        },
      },
    }
    const f = filasDeTracker([caso]).filas[0]!
    expect(f.lenteOd).toEqual({ nombre: 'LuxSmart', esfera: 22, cilindro: 1.5, eje: 85 })
    expect(f.lenteOs).toBeUndefined()
    expect(JSON.stringify(f)).not.toContain('22.5')
  })

  it('el sexo sale como en la lista de la plantilla y el filtro de ojo se respeta', () => {
    const base = casoCon([OD_IOL, OS_IOL])
    const caso = {
      ...base,
      resultados: {
        ...base.resultados,
        [claveResultado('KANE', 'OS', 'IOLMaster')]: {
          calculadora: 'KANE',
          ojo: 'OS',
          estado: 'SUCCESS',
          obtenidoEn: CUANDO,
          opciones: [{ esfera: 21, refraccionPrevista: 0 }],
        },
      } as never,
      sexo: {
        valor: 'MUJER',
        procedencia: MANUAL,
        confirmadoPorUsuario: true,
      } as never,
    }
    expect(filasDeTracker([caso]).filas[0]!.sexo).toBe('Female')
    const soloOs = filasDeTracker([caso], { ojo: 'OS' }).filas[0]!
    expect(soloOs.od).toBeUndefined()
    expect(soloOs.os).toBeDefined()
  })
})
