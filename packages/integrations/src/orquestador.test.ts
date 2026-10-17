/**
 * orquestador.test.ts — Que un fallo no se lleve por delante a los demás.
 *
 * Estos tests NO abren ninguna web. Sustituyen los adaptadores por dobles que
 * fallan de las formas en que fallan los de verdad —devolviendo un resultado
 * con estado, y también lanzando una excepción, que es el caso que de verdad
 * pone a prueba la red de seguridad—.
 */

import { describe, expect, it, vi } from 'vitest'

import type { Calculadora, Caso, EntradasCalculadora, ResultadoCalculadora } from '@vilamar/domain'
import {
  casoNuevo,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  crearMedida,
  ojoVacio,
  sinMedida,
} from '@vilamar/domain'
import type { BrowserContext } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion, DatosCaptura } from './contrato.js'
import { ejecutarCaso, necesitaVentana, ORDEN_POR_DEFECTO } from './orquestador.js'

const CUANDO = '2026-08-10T10:00:00.000Z'
const ahora = () => CUANDO

/** Caso sintético con el ojo derecho completo y confirmado. */
function casoListo(quitar: readonly Parameters<typeof crearMedida>[0][] = []): Caso {
  let ojo = ojoVacio('OD')
  const datos: [Parameters<typeof crearMedida>[0], number][] = [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K1_EJE', 175],
    ['K2', 42.52],
    ['K2_EJE', 85],
    ['ACD', 3.18],
    ['LT', 4.53],
    ['CCT', 530],
    ['WTW', 11.9],
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0],
    ['EJE_INCISION', 0],
    ['CONSTANTE_A', 119],
  ]
  for (const [campo, valor] of datos) {
    ojo = conMedida(
      ojo,
      crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
    )
  }
  for (const campo of quitar) ojo = sinMedida(ojo, campo)
  ojo = confirmarTodas(ojo)
  const caso = confirmar(conOjo(casoNuevo('c1', 'CV-2026-0001', CUANDO), ojo, CUANDO), CUANDO)
  // Kane pide el sexo del paciente. Sin él no calcularía, y estos tests
  // comprueban el aislamiento entre calculadoras, no el bloqueo por sexo.
  const conSexo = {
    ...caso,
    sexo: {
      valor: 'MUJER' as const,
      procedencia: { metodo: 'MANUAL' as const, registradoEn: CUANDO },
      confirmadoPorUsuario: true,
    },
  }
  return conSexo
}

/** Un doble que devuelve un resultado bueno. */
function adaptadorOk(calculadora: Calculadora, esfera: number): AdaptadorCalculadora {
  return {
    calculadora,
    nombre: calculadora,
    url: 'https://ejemplo.local',
    requiereNavegadorVisible: false,
    validarEntradas: () => [],
    ejecutar: async (ctx: ContextoEjecucion): Promise<ResultadoCalculadora> => ({
      calculadora,
      ojo: ctx.entradas.ojo,
      estado: 'SUCCESS',
      obtenidoEn: ctx.ahora(),
      opciones: [{ esfera, recomendada: true }],
      recomendada: { esfera, recomendada: true },
    }),
  }
}

/** Un doble que devuelve un fallo controlado, como hacen los de verdad. */
function adaptadorFallaControlado(calculadora: Calculadora): AdaptadorCalculadora {
  return {
    calculadora,
    nombre: calculadora,
    url: 'https://ejemplo.local',
    requiereNavegadorVisible: false,
    validarEntradas: () => [],
    ejecutar: async (ctx): Promise<ResultadoCalculadora> => ({
      calculadora,
      ojo: ctx.entradas.ojo,
      estado: 'EXTERNAL_ERROR',
      obtenidoEn: ctx.ahora(),
      opciones: [],
      mensaje: 'La web no respondió como se esperaba.',
    }),
  }
}

/**
 * Un doble que REVIENTA.
 *
 * Es el importante: si el orquestador no lo contuviera, un fallo inesperado de
 * una calculadora se llevaría por delante las otras dos. Un doble que solo
 * sabe fallar bien no probaría esta red.
 */
function adaptadorRevienta(calculadora: Calculadora): AdaptadorCalculadora {
  return {
    calculadora,
    nombre: calculadora,
    url: 'https://ejemplo.local',
    requiereNavegadorVisible: false,
    validarEntradas: () => [],
    ejecutar: async () => {
      throw new Error('el navegador se ha cerrado de golpe')
    },
  }
}

/** Un doble que guarda su captura, como hacen los adaptadores de verdad al tener éxito. */
function adaptadorQueCaptura(calculadora: Calculadora): AdaptadorCalculadora {
  return {
    calculadora,
    nombre: calculadora,
    url: 'https://ejemplo.local',
    requiereNavegadorVisible: false,
    validarEntradas: () => [],
    ejecutar: async (ctx: ContextoEjecucion): Promise<ResultadoCalculadora> => {
      const capturaId = await ctx.guardarCaptura({
        calculadora,
        ojo: ctx.entradas.ojo,
        png: new Uint8Array([1, 2, 3]),
      })
      return {
        calculadora,
        ojo: ctx.entradas.ojo,
        estado: 'SUCCESS',
        obtenidoEn: ctx.ahora(),
        opciones: [{ esfera: 21, recomendada: true }],
        recomendada: { esfera: 21, recomendada: true },
        capturaId,
      }
    },
  }
}

/** Doble del contexto de navegador: solo se usa `close()`. */
function contextoFalso(): BrowserContext {
  return { close: async () => undefined } as unknown as BrowserContext
}

interface Escenario {
  // Los tests de este fichero solo conocen las tres calculadoras «de
  // verdad» — la variante «sin córnea posterior» (D45) no participa en el
  // aislamiento de fallos, así que `ejecutar()` le pone un doble neutro por
  // defecto para no tener que tocar cada escenario existente.
  readonly adaptadores: Partial<Record<Calculadora, AdaptadorCalculadora>>
  readonly caso?: Caso
  readonly calculadoras?: readonly Calculadora[]
}

async function ejecutar(escenario: Escenario) {
  const recibidos: ResultadoCalculadora[] = []
  const diagnosticos: string[] = []
  const capturas: DatosCaptura[] = []
  const resultados = await ejecutarCaso({
    caso: escenario.caso ?? casoListo(),
    ojos: ['OD'],
    calculadoras: escenario.calculadoras,
    navegador: {} as never,
    contexto: contextoFalso(),
    progreso: () => undefined,
    alTerminarUna: (r) => recibidos.push(r),
    ahora,
    guardarDiagnostico: async (d) => {
      diagnosticos.push(d.errorTecnico)
      return 'diag-1'
    },
    guardarCaptura: async (d) => {
      capturas.push(d)
      return 'captura-1'
    },
    cancelado: () => false,
    adaptadores: {
      EVO_TORIC_SIN_CARA_POSTERIOR: adaptadorOk('EVO_TORIC_SIN_CARA_POSTERIOR', 0),
      ...escenario.adaptadores,
    } as Record<Calculadora, AdaptadorCalculadora>,
  })
  return { resultados, recibidos, diagnosticos, capturas }
}

describe('aislamiento de fallos', () => {
  it('si una revienta, las otras dos conservan su resultado', async () => {
    const { resultados } = await ejecutar({
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21.5),
        KANE: adaptadorRevienta('KANE'),
      },
    })

    expect(resultados).toHaveLength(3)
    const porClave = new Map(resultados.map((r) => [r.calculadora, r]))
    expect(porClave.get('EVO_TORIC')?.estado).toBe('SUCCESS')
    expect(porClave.get('EVO_TORIC')?.recomendada?.esfera).toBe(21)
    expect(porClave.get('BARRETT_TORIC')?.estado).toBe('SUCCESS')
    expect(porClave.get('BARRETT_TORIC')?.recomendada?.esfera).toBe(21.5)
    expect(porClave.get('KANE')?.estado).toBe('EXTERNAL_ERROR')
  })

  it('una excepción inesperada no sale del orquestador', async () => {
    await expect(
      ejecutar({
        adaptadores: {
          EVO_TORIC: adaptadorRevienta('EVO_TORIC'),
          BARRETT_TORIC: adaptadorRevienta('BARRETT_TORIC'),
          KANE: adaptadorRevienta('KANE'),
        },
      }),
    ).resolves.toBeDefined()
  })

  it('un fallo inesperado deja rastro de diagnóstico', async () => {
    const { diagnosticos, resultados } = await ejecutar({
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorRevienta('KANE'),
      },
    })
    expect(diagnosticos.join(' ')).toContain('el navegador se ha cerrado de golpe')
    expect(resultados.find((r) => r.calculadora === 'KANE')?.diagnosticoId).toBe('diag-1')
  })

  it('el mensaje de un fallo es para una persona, no una traza técnica', async () => {
    const { resultados } = await ejecutar({
      adaptadores: {
        EVO_TORIC: adaptadorRevienta('EVO_TORIC'),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    const evo = resultados.find((r) => r.calculadora === 'EVO_TORIC')
    expect(evo?.mensaje).toBeDefined()
    expect(evo?.mensaje).not.toMatch(/locator|selector|timeout|#\w+|Error:/i)
    expect(evo?.mensaje).toMatch(/no se han perdido|conservan/i)
  })

  it('va avisando de cada resultado en cuanto lo tiene', async () => {
    const { recibidos } = await ejecutar({
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorFallaControlado('BARRETT_TORIC'),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(recibidos).toHaveLength(3)
    // El orden es el de ejecución, y EVO va primero por diseño.
    expect(recibidos[0]?.calculadora).toBe('EVO_TORIC')
  })
})

describe('la captura de un resultado', () => {
  it('guardarCaptura llega hasta el adaptador, con la calculadora y el ojo correctos', async () => {
    const { resultados, capturas } = await ejecutar({
      adaptadores: {
        EVO_TORIC: adaptadorQueCaptura('EVO_TORIC'),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturas).toHaveLength(1)
    expect(capturas[0]).toMatchObject({ calculadora: 'EVO_TORIC', ojo: 'OD' })
    expect(resultados.find((r) => r.calculadora === 'EVO_TORIC')?.capturaId).toBe('captura-1')
  })
})

describe('faltar un dato bloquea solo a quien lo necesita', () => {
  it('sin WTW, Barrett calcula igual porque para él es opcional', async () => {
    const { resultados } = await ejecutar({
      caso: casoListo(['WTW']),
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(resultados.every((r) => r.estado === 'SUCCESS')).toBe(true)
  })

  it('sin SIA, Barrett se bloquea y EVO sigue calculando', async () => {
    const { resultados } = await ejecutar({
      caso: casoListo(['SIA']),
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    const porClave = new Map(resultados.map((r) => [r.calculadora, r]))
    // SIA es obligatorio en Barrett y opcional en EVO.
    expect(porClave.get('BARRETT_TORIC')?.estado).toBe('MISSING_INPUTS')
    expect(porClave.get('BARRETT_TORIC')?.faltan).toContain('SIA')
    expect(porClave.get('EVO_TORIC')?.estado).toBe('SUCCESS')
    expect(porClave.get('KANE')?.estado).toBe('SUCCESS')
  })

  it('el motivo del bloqueo se explica en lenguaje normal', async () => {
    const { resultados } = await ejecutar({
      caso: casoListo(['SIA']),
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    const barrett = resultados.find((r) => r.calculadora === 'BARRETT_TORIC')
    expect(barrett?.mensaje).toContain('Barrett')
    expect(barrett?.mensaje).toMatch(/SIA/)
  })

  it('un caso sin confirmar no llega a ningún adaptador', async () => {
    // Caso con datos, pero SIN el acto de confirmar.
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.07, { metodo: 'MANUAL', registradoEn: CUANDO }))
    const sinConfirmar = conOjo(
      casoNuevo('c2', 'CV-2026-0002', CUANDO),
      confirmarTodas(ojo),
      CUANDO,
    )

    const espia = vi.fn()
    const adaptadorEspia: AdaptadorCalculadora = {
      ...adaptadorOk('EVO_TORIC', 21),
      ejecutar: async (ctx) => {
        espia()
        return adaptadorOk('EVO_TORIC', 21).ejecutar(ctx)
      },
    }

    const { resultados } = await ejecutar({
      caso: sinConfirmar,
      calculadoras: ['EVO_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorEspia,
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })

    expect(espia).not.toHaveBeenCalled()
    expect(resultados[0]?.estado).toBe('MISSING_INPUTS')
    expect(resultados[0]?.mensaje).toMatch(/confirmado/i)
  })
})

describe('decisiones de ejecución', () => {
  it('EVO va primero, y las que piden intervención al final', () => {
    expect(ORDEN_POR_DEFECTO[0]).toBe('EVO_TORIC')
    expect(ORDEN_POR_DEFECTO[ORDEN_POR_DEFECTO.length - 1]).toBe('KANE')
  })

  it('Barrett obliga a abrir el navegador con ventana', () => {
    expect(necesitaVentana(['BARRETT_TORIC'])).toBe(true)
    expect(necesitaVentana(['KANE'])).toBe(true)
    expect(necesitaVentana(['EVO_TORIC'])).toBe(false)
    expect(necesitaVentana(['EVO_TORIC', 'BARRETT_TORIC'])).toBe(true)
  })

  it('se puede reintentar una sola calculadora', async () => {
    const { resultados } = await ejecutar({
      calculadoras: ['BARRETT_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorRevienta('EVO_TORIC'),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21.5),
        KANE: adaptadorRevienta('KANE'),
      },
    })
    expect(resultados).toHaveLength(1)
    expect(resultados[0]?.calculadora).toBe('BARRETT_TORIC')
    expect(resultados[0]?.estado).toBe('SUCCESS')
  })
})

describe('lo que se envía a una web', () => {
  it('nunca lleva más que el código local del caso como identificador', async () => {
    let capturadas: EntradasCalculadora | undefined
    const capturador: AdaptadorCalculadora = {
      ...adaptadorOk('EVO_TORIC', 21),
      ejecutar: async (ctx) => {
        capturadas = ctx.entradas
        return adaptadorOk('EVO_TORIC', 21).ejecutar(ctx)
      },
    }
    await ejecutar({
      calculadoras: ['EVO_TORIC'],
      adaptadores: {
        EVO_TORIC: capturador,
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })

    expect(capturadas).toBeDefined()
    const serializado = JSON.stringify(capturadas)
    expect(capturadas?.codigoCaso).toBe('CV-2026-0001')
    // Ni nombres, ni fechas de nacimiento, ni identificadores de paciente.
    expect(serializado).not.toMatch(/nombre|paciente|nacimiento|dni|nhc/i)
  })
})

describe('ejecutarCaso — las calculadoras y los dos ojos A LA VEZ (D126, 16/10/2026)', () => {
  const PAUSA = 120

  /** Un doble lento, con su propia URL, que apunta cuándo empieza y cuándo acaba. */
  function lento(
    calculadora: Calculadora,
    url: string,
    registro: { calculadora: Calculadora; ojo: string; ini: number; fin: number }[],
  ): AdaptadorCalculadora {
    return {
      calculadora,
      nombre: calculadora,
      url,
      requiereNavegadorVisible: false,
      validarEntradas: () => [],
      ejecutar: async (ctx: ContextoEjecucion): Promise<ResultadoCalculadora> => {
        const ini = Date.now()
        await new Promise((r) => setTimeout(r, PAUSA))
        registro.push({ calculadora, ojo: ctx.entradas.ojo, ini, fin: Date.now() })
        return {
          calculadora,
          ojo: ctx.entradas.ojo,
          estado: 'SUCCESS',
          obtenidoEn: ctx.ahora(),
          opciones: [{ esfera: 20, recomendada: true }],
          recomendada: { esfera: 20, recomendada: true },
        }
      },
    }
  }

  function casoConLosDosOjos(): Caso {
    const base = casoListo()
    const od = base.ojos.OD![0]!
    let os = ojoVacio('OS')
    for (const m of Object.values(od.medidas)) {
      if (!m) continue
      os = conMedida(
        os,
        crearMedida(m.campo, 'OS', m.valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    return conOjo(base, confirmarTodas(os), CUANDO)
  }

  async function lanzar(enParalelo: boolean | undefined) {
    const registro: { calculadora: Calculadora; ojo: string; ini: number; fin: number }[] = []
    const inicio = Date.now()
    const resultados = await ejecutarCaso({
      caso: casoConLosDosOjos(),
      ojos: ['OD', 'OS'],
      calculadoras: ['EVO_TORIC', 'BARRETT_TORIC', 'KANE'],
      navegador: {} as never,
      contexto: contextoFalso(),
      progreso: () => undefined,
      alTerminarUna: () => undefined,
      ahora,
      guardarDiagnostico: async () => 'd',
      guardarCaptura: async () => 'c',
      cancelado: () => false,
      ...(enParalelo !== undefined ? { enParalelo } : {}),
      adaptadores: {
        EVO_TORIC: lento('EVO_TORIC', 'https://evo.ejemplo.local/x', registro),
        BARRETT_TORIC: lento('BARRETT_TORIC', 'https://barrett.ejemplo.local/x', registro),
        KANE: lento('KANE', 'https://kane.ejemplo.local/x', registro),
        EVO_TORIC_SIN_CARA_POSTERIOR: adaptadorOk('EVO_TORIC_SIN_CARA_POSTERIOR', 0),
      } as Record<Calculadora, AdaptadorCalculadora>,
    })
    return { resultados, registro, duracion: Date.now() - inicio }
  }

  it('por defecto: EVO, Barrett y Kane a la vez, y OD y OS a la vez (salvo Kane)', async () => {
    const { registro, duracion } = await lanzar(undefined)
    expect(registro).toHaveLength(6)
    // En serie serían 6 × PAUSA; en paralelo, lo que tarda Kane (2 ojos en serie).
    expect(duracion).toBeLessThan(PAUSA * 3.5)

    const de = (c: Calculadora, o: string) =>
      registro.find((r) => r.calculadora === c && r.ojo === o)!
    // Los dos ojos de EVO se pisan en el tiempo…
    expect(de('EVO_TORIC', 'OS').ini).toBeLessThan(de('EVO_TORIC', 'OD').fin)
    // …pero los dos ojos de Kane NO: una sola carretera.
    const k = [de('KANE', 'OD'), de('KANE', 'OS')].sort((a, b) => a.ini - b.ini)
    expect(k[1]!.ini).toBeGreaterThanOrEqual(k[0]!.fin - 5)
  })

  it('con enParalelo: false vuelve a ser todo en serie, como antes', async () => {
    const { registro, duracion } = await lanzar(false)
    expect(registro).toHaveLength(6)
    expect(duracion).toBeGreaterThanOrEqual(PAUSA * 5.5)
    const ordenados = [...registro].sort((a, b) => a.ini - b.ini)
    for (let i = 1; i < ordenados.length; i++) {
      expect(ordenados[i]!.ini).toBeGreaterThanOrEqual(ordenados[i - 1]!.fin - 5)
    }
  })

  it('los resultados salen en el orden en que se pidieron, acaben en el orden que acaben', async () => {
    const serie = await lanzar(false)
    const paralelo = await lanzar(true)
    const clave = (r: ResultadoCalculadora) => `${r.calculadora}:${r.ojo}`
    expect(paralelo.resultados.map(clave)).toEqual(serie.resultados.map(clave))
  })
})
