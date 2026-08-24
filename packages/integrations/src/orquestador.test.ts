/**
 * orquestador.test.ts — Que un fallo no se lleve por delante a los demás.
 *
 * Estos tests NO abren ninguna web. Sustituyen los adaptadores por dobles que
 * fallan de las formas en que fallan los de verdad —devolviendo un resultado
 * con estado, y también lanzando una excepción, que es el caso que de verdad
 * pone a prueba la red de seguridad—.
 */

import { describe, expect, it, vi } from 'vitest'

import type {
  Calculadora,
  Caso,
  Catalogo,
  EntradasCalculadora,
  ResultadoCalculadora,
} from '@vilamar/domain'
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

import type { AdaptadorCalculadora, ContextoEjecucion } from './contrato.js'
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

/** Doble del contexto de navegador: solo se usa `close()`. */
function contextoFalso(): BrowserContext {
  return { close: async () => undefined } as unknown as BrowserContext
}

interface Escenario {
  readonly adaptadores: Record<Calculadora, AdaptadorCalculadora>
  readonly caso?: Caso
  readonly calculadoras?: readonly Calculadora[]
  readonly catalogo?: Catalogo
}

async function ejecutar(escenario: Escenario) {
  const recibidos: ResultadoCalculadora[] = []
  const diagnosticos: string[] = []
  const resultados = await ejecutarCaso({
    caso: escenario.caso ?? casoListo(),
    ojos: ['OD'],
    calculadoras: escenario.calculadoras,
    catalogo: escenario.catalogo,
    navegador: {} as never,
    contexto: contextoFalso(),
    progreso: () => undefined,
    alTerminarUna: (r) => recibidos.push(r),
    ahora,
    guardarDiagnostico: async (d) => {
      diagnosticos.push(d.errorTecnico)
      return 'diag-1'
    },
    guardarCaptura: async () => 'captura-1',
    cancelado: () => false,
    adaptadores: escenario.adaptadores,
  })
  return { resultados, recibidos, diagnosticos }
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

describe('la constante A del catálogo, una por calculadora', () => {
  /** Caso listo, con la lente elegida y su constante compartida en 119 D. */
  function casoConLente(): Caso {
    return { ...casoListo(), lente: { fabricante: 'Bausch & Lomb', modelo: 'enVista ENVY' } }
  }

  const catalogo: Catalogo = [
    {
      id: 'envy',
      modelo: 'enVista ENVY',
      fabricante: 'Bausch & Lomb',
      torica: false,
      constantesA: { BARRETT_TORIC: 119.15, KANE: 119.33 },
    },
  ]

  /** Un adaptador que solo captura las entradas que le llegan. */
  function capturador(calculadora: Calculadora, capturadas: { valor?: EntradasCalculadora }) {
    return {
      ...adaptadorOk(calculadora, 21),
      ejecutar: async (ctx: Parameters<AdaptadorCalculadora['ejecutar']>[0]) => {
        capturadas.valor = ctx.entradas
        return adaptadorOk(calculadora, 21).ejecutar(ctx)
      },
    }
  }

  it('Barrett usa la constante del catálogo para la lente elegida, no la del ojo', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLente(),
      catalogo,
      calculadoras: ['BARRETT_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: capturador('BARRETT_TORIC', capturadas),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.valores.CONSTANTE_A).toBe(119.15)
  })

  it('Kane usa SU PROPIA constante, distinta de la de Barrett para la misma lente', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLente(),
      catalogo,
      calculadoras: ['KANE'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: capturador('KANE', capturadas),
      },
    })
    expect(capturadas.valor?.valores.CONSTANTE_A).toBe(119.33)
  })

  it('EVO también recibe la del catálogo como reserva, pero es un FALLBACK: usarla o no lo decide el propio adaptador', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLente(),
      // A este nivel (orquestador) la sustitución es igual para las tres
      // calculadoras: aquí solo se decide QUÉ NÚMERO viaja en `entradas`. Que
      // EVO acabe usándolo de verdad o lo ignore porque reconoce el modelo en
      // su propia web y rellena la suya es una decisión de `evo.ts`, no de
      // este orquestador — y por eso no se puede comprobar aquí con un doble.
      catalogo: [{ ...catalogo[0]!, constantesA: { ...catalogo[0]!.constantesA, EVO_TORIC: 999 } }],
      calculadoras: ['EVO_TORIC'],
      adaptadores: {
        EVO_TORIC: capturador('EVO_TORIC', capturadas),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.valores.CONSTANTE_A).toBe(999)
  })

  it('sin catálogo, Barrett y Kane siguen usando la constante compartida del ojo — nada cambia', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLente(),
      calculadoras: ['BARRETT_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: capturador('BARRETT_TORIC', capturadas),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.valores.CONSTANTE_A).toBe(119)
  })

  it('si la lente elegida no está en el catálogo, se queda con la constante del ojo', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: { ...casoListo(), lente: { modelo: 'Una lente que no está en ningún sitio' } },
      catalogo,
      calculadoras: ['BARRETT_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: capturador('BARRETT_TORIC', capturadas),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.valores.CONSTANTE_A).toBe(119)
  })
})

describe('el nombre de la lente que se busca en el desplegable de cada web', () => {
  // El fallo real: el catálogo guardaba «Lux Life», pero Kane la llama
  // «B+L LuxLife» en su desplegable. Comparando el nombre bonito contra el
  // de la web, nunca se encontraba — aunque la lente SÍ estuviera en la
  // lista — y Kane terminaba diciendo «no tiene la lente» teniéndola.
  function casoConLuxLife(): Caso {
    return { ...casoListo(), lente: { fabricante: 'Bausch & Lomb', modelo: 'Lux Life' } }
  }

  const catalogo: Catalogo = [
    {
      id: 'luxlife',
      modelo: 'Lux Life',
      fabricante: 'Bausch & Lomb',
      torica: false,
      constantesA: { BARRETT_TORIC: 118.63 },
      nombresEnWeb: { EVO_TORIC: 'B&L LuxLife', KANE: 'B+L LuxLife' },
    },
  ]

  function capturador(calculadora: Calculadora, capturadas: { valor?: EntradasCalculadora }) {
    return {
      ...adaptadorOk(calculadora, 21),
      ejecutar: async (ctx: Parameters<AdaptadorCalculadora['ejecutar']>[0]) => {
        capturadas.valor = ctx.entradas
        return adaptadorOk(calculadora, 21).ejecutar(ctx)
      },
    }
  }

  it('a Kane se le manda el nombre exacto de su desplegable, no el del catálogo', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLuxLife(),
      catalogo,
      calculadoras: ['KANE'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: capturador('KANE', capturadas),
      },
    })
    expect(capturadas.valor?.modeloLente).toBe('B+L LuxLife')
  })

  it('a EVO se le manda el nombre exacto de SU desplegable, distinto del de Kane', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLuxLife(),
      catalogo,
      calculadoras: ['EVO_TORIC'],
      adaptadores: {
        EVO_TORIC: capturador('EVO_TORIC', capturadas),
        BARRETT_TORIC: adaptadorOk('BARRETT_TORIC', 21),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.modeloLente).toBe('B&L LuxLife')
  })

  it('sin nombre declarado para esa web (Barrett), se manda el nombre del catálogo tal cual', async () => {
    const capturadas: { valor?: EntradasCalculadora } = {}
    await ejecutar({
      caso: casoConLuxLife(),
      catalogo,
      calculadoras: ['BARRETT_TORIC'],
      adaptadores: {
        EVO_TORIC: adaptadorOk('EVO_TORIC', 21),
        BARRETT_TORIC: capturador('BARRETT_TORIC', capturadas),
        KANE: adaptadorOk('KANE', 21),
      },
    })
    expect(capturadas.valor?.modeloLente).toBe('Lux Life')
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
