/**
 * bilateral.test.ts — Que un solo «Calcular» procese los dos ojos.
 *
 * El fallo que se corrige aquí no estaba en ninguna web: **nadie pedía el
 * segundo ojo**. La pantalla mandaba el de la pestaña activa, el servicio lo
 * pasaba tal cual y el orquestador solo sabía de un ojo. EVO calculaba
 * perfectamente el que le pedían y se quedaba ahí.
 *
 * Estos tests NO abren ninguna web: sustituyen los adaptadores por dobles. Lo
 * que comprueban es la capa que decide QUÉ hay que ejecutar, que es donde
 * estaba el problema.
 *
 * Y el caso de prueba tiene valores DISTINTOS en cada ojo a propósito: es la
 * única forma de comprobar que a cada uno le llegan los suyos.
 */

import { describe, expect, it } from 'vitest'

import type {
  Calculadora,
  Caso,
  EntradasCalculadora,
  Lateralidad,
  ResultadoCalculadora,
} from '@vilamar/domain'
import {
  APARATO_PRINCIPAL,
  casoNuevo,
  confirmar,
  confirmarTodas,
  conExclusion,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
  ojoDe,
  ojoVacio,
  sinMedida,
} from '@vilamar/domain'
import type { BrowserContext } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion } from './contrato.js'
import type { TareaCalculo } from './orquestador.js'
import { ejecutarCaso, planificarCaso, tareasPendientes } from './orquestador.js'

const CUANDO = '2026-08-12T10:00:00.000Z'
const ahora = () => CUANDO

/** Caso con los DOS ojos completos y confirmados, con valores distintos. */
function casoDosOjos(): Caso {
  const datos: Record<Lateralidad, [Parameters<typeof crearMedida>[0], number][]> = {
    OD: [
      ['AL', 24.07],
      ['K1', 41.22],
      ['K1_EJE', 175],
      ['K2', 42.52],
      ['K2_EJE', 85],
      ['ACD', 3.18],
      ['REFRACCION_OBJETIVO', 0],
      ['SIA', 0],
      ['EJE_INCISION', 0],
      ['CONSTANTE_A', 119],
    ],
    OS: [
      ['AL', 23.11],
      ['K1', 40.27],
      ['K1_EJE', 8],
      ['K2', 42.68],
      ['K2_EJE', 98],
      ['ACD', 3.23],
      ['REFRACCION_OBJETIVO', -0.25],
      ['SIA', 0],
      ['EJE_INCISION', 0],
      ['CONSTANTE_A', 119],
    ],
  }
  let caso = casoNuevo('c2', 'CV-2026-0002', CUANDO)
  for (const lado of ['OD', 'OS'] as const) {
    let ojo = ojoVacio(lado)
    for (const [campo, valor] of datos[lado]) {
      ojo = conMedida(
        ojo,
        crearMedida(campo, lado, valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    caso = conOjo(caso, confirmarTodas(ojo), CUANDO)
  }
  // Kane pide el sexo: sin él, sus dos casillas saldrían bloqueadas y estos
  // tests no estarían comprobando el recorrido de los dos ojos.
  caso = {
    ...caso,
    sexo: {
      valor: 'MUJER' as const,
      procedencia: { metodo: 'MANUAL' as const, registradoEn: CUANDO },
      confirmadoPorUsuario: true,
    },
  }
  return confirmar(caso, CUANDO)
}

/** Caso de un solo ojo, para comprobar que no se inventa el que falta. */
function casoUnOjo(lado: Lateralidad): Caso {
  const completo = casoDosOjos()
  const otro = lado === 'OD' ? 'OS' : 'OD'
  const ojos = { ...completo.ojos }
  delete ojos[otro]
  return { ...completo, ojos }
}

function contextoFalso(): BrowserContext {
  return { close: async () => undefined } as unknown as BrowserContext
}

function adaptadorOk(calculadora: Calculadora): AdaptadorCalculadora {
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
      opciones: [{ esfera: 21.5, recomendada: true }],
      recomendada: { esfera: 21.5, recomendada: true },
    }),
  }
}

/** Un doble que apunta qué entradas recibió, para poder comprobarlas después. */
function adaptadorEspia(
  calculadora: Calculadora,
  recibidas: EntradasCalculadora[],
): AdaptadorCalculadora {
  return {
    ...adaptadorOk(calculadora),
    ejecutar: async (ctx: ContextoEjecucion): Promise<ResultadoCalculadora> => {
      recibidas.push(ctx.entradas)
      return {
        calculadora,
        ojo: ctx.entradas.ojo,
        estado: 'SUCCESS',
        obtenidoEn: ctx.ahora(),
        opciones: [{ esfera: 21.5, recomendada: true }],
      }
    },
  }
}

function todosOk(): Record<Calculadora, AdaptadorCalculadora> {
  return {
    EVO_TORIC: adaptadorOk('EVO_TORIC'),
    EVO_TORIC_SIN_CARA_POSTERIOR: adaptadorOk('EVO_TORIC_SIN_CARA_POSTERIOR'),
    BARRETT_TORIC: adaptadorOk('BARRETT_TORIC'),
    BARRETT_TORIC_CON_CARA_POSTERIOR: adaptadorOk('BARRETT_TORIC_CON_CARA_POSTERIOR'),
    KANE: adaptadorOk('KANE'),
    BARRETT_TRUE_K_TORIC: adaptadorOk('BARRETT_TRUE_K_TORIC'),
  }
}

async function ejecutar(
  caso: Caso,
  adaptadores: Record<Calculadora, AdaptadorCalculadora>,
  extra?: { tareas?: readonly TareaCalculo[]; calculadoras?: readonly Calculadora[] },
) {
  const resultados = await ejecutarCaso({
    caso,
    ...(extra?.tareas ? { tareas: extra.tareas } : {}),
    ...(extra?.calculadoras ? { calculadoras: extra.calculadoras } : {}),
    navegador: {} as never,
    contexto: contextoFalso(),
    progreso: () => undefined,
    alTerminarUna: () => undefined,
    ahora,
    guardarDiagnostico: async () => 'diag-1',
    guardarCaptura: async () => 'captura-1',
    cancelado: () => false,
    adaptadores,
  })
  return resultados
}

// ═══════════════════════════════════════════════════════════════════════════
//  1-4 · Un solo «Calcular» procesa los dos ojos
// ═══════════════════════════════════════════════════════════════════════════

describe('los dos ojos en el mismo ciclo', () => {
  it('EVO produce OD y OS de una vez', async () => {
    const r = await ejecutar(casoDosOjos(), todosOk(), { calculadoras: ['EVO_TORIC'] })
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.ojo)).toEqual(['OD', 'OS'])
    expect(r.every((x) => x.calculadora === 'EVO_TORIC')).toBe(true)
  })

  it('las tres calculadoras por los dos ojos son seis casillas', async () => {
    const r = await ejecutar(casoDosOjos(), todosOk())
    expect(r).toHaveLength(6)
    expect(r.map((x) => `${x.calculadora}:${x.ojo}`)).toEqual([
      'EVO_TORIC:OD',
      'EVO_TORIC:OS',
      'BARRETT_TORIC:OD',
      'BARRETT_TORIC:OS',
      'KANE:OD',
      'KANE:OS',
    ])
  })

  it('el orden es calculadora a calculadora, y dentro los dos ojos', () => {
    // Kane pide aceptar sus condiciones: así se aceptan UNA vez y los dos ojos
    // entran seguidos. Recorriendo por ojos habría que atenderlo dos veces.
    const plan = planificarCaso(casoDosOjos())
    expect(plan.map((t) => t.calculadora)).toEqual([
      'EVO_TORIC',
      'EVO_TORIC',
      'BARRETT_TORIC',
      'BARRETT_TORIC',
      'KANE',
      'KANE',
    ])
  })

  for (const lado of ['OD', 'OS'] as const) {
    it(`un caso de solo ${lado} calcula solo ${lado}, sin inventar el otro`, async () => {
      const r = await ejecutar(casoUnOjo(lado), todosOk(), { calculadoras: ['EVO_TORIC'] })
      expect(r).toHaveLength(1)
      expect(r[0]?.ojo).toBe(lado)
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
//  Un aparato excluido no se calcula (D100, 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════

describe('un aparato excluido no entra en el plan de cálculo', () => {
  /** OD con DOS aparatos — «Principal» (de casoDosOjos) y «Pentacam», excluido. */
  function casoConAparatoExcluido(): Caso {
    let caso = casoDosOjos()
    let pentacam = ojoVacio('OD', 'Pentacam')
    for (const [campo, valor] of [
      ['AL', 24.1],
      ['K1', 41.0],
      ['K1_EJE', 170],
      ['K2', 42.4],
      ['K2_EJE', 80],
      ['ACD', 3.2],
      ['REFRACCION_OBJETIVO', 0],
      ['SIA', 0],
      ['EJE_INCISION', 0],
      ['CONSTANTE_A', 119],
    ] as const) {
      pentacam = conMedida(
        pentacam,
        crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    pentacam = conExclusion(confirmarTodas(pentacam), true)
    caso = conOjo(caso, pentacam, CUANDO)
    return confirmar(caso, CUANDO)
  }

  it('no aparece en el plan, aunque no se pida ningún filtro de aparato', () => {
    const plan = planificarCaso(casoConAparatoExcluido(), { calculadoras: ['EVO_TORIC'] })
    const deOD = plan.filter((t) => t.ojo === 'OD')
    expect(deOD.map((t) => t.aparato)).toEqual([APARATO_PRINCIPAL])
  })

  it('sigue sin aparecer aunque se pida su nombre explícitamente — la exclusión es un veto', () => {
    const plan = planificarCaso(casoConAparatoExcluido(), {
      calculadoras: ['EVO_TORIC'],
      aparatos: ['Pentacam'],
    })
    expect(plan.filter((t) => t.ojo === 'OD')).toHaveLength(0)
  })

  it('volver a incluirlo (excluido: false) lo devuelve al plan', () => {
    let caso = casoConAparatoExcluido()
    const pentacam = ojoDe(caso, 'OD', 'Pentacam')
    caso = conOjo(caso, conExclusion(pentacam, false), CUANDO)

    const plan = planificarCaso(caso, { calculadoras: ['EVO_TORIC'] })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toContain('Pentacam')
  })

  it('no toca al otro ojo, que no tiene ningún aparato excluido', () => {
    const plan = planificarCaso(casoConAparatoExcluido(), { calculadoras: ['EVO_TORIC'] })
    expect(plan.filter((t) => t.ojo === 'OS')).toHaveLength(1)
  })
})

/**
 * Fallo real reportado por el dueño del proyecto (01/10/2026): con dos
 * aparatos del mismo ojo, uno con córnea posterior medida (PK1/PK2) y
 * otro sin ella, pedir «EVO con posterior» y «Barrett con posterior»
 * sacaba también esas dos casillas para el aparato SIN esos datos — como
 * no hay córnea posterior que añadir o quitar, calculaban exactamente lo
 * mismo que su base, sin comparar nada de verdad, y el PDF sacaba una
 * hoja de más por cada una. «El pdf que sale en el aparato que no tiene
 * datos de posterior repite el cálculo con estimada y ocupa espacio».
 */
describe('D111 (01/10/2026): una variante de córnea posterior nunca se planifica sin PK1/PK2', () => {
  /** OD con DOS aparatos: «Principal» (de casoDosOjos, SIN PK1/PK2) y «Pentacam», CON PK1/PK2. */
  function casoConUnAparatoSinCaraPosterior(): Caso {
    let caso = casoDosOjos()
    let pentacam = ojoVacio('OD', 'Pentacam')
    for (const [campo, valor] of [
      ['AL', 24.1],
      ['K1', 41.0],
      ['K1_EJE', 170],
      ['K2', 42.4],
      ['K2_EJE', 80],
      ['ACD', 3.2],
      ['REFRACCION_OBJETIVO', 0],
      ['SIA', 0],
      ['EJE_INCISION', 0],
      ['CONSTANTE_A', 119],
      ['PK1', 6.1],
      ['PK2', 6.3],
    ] as const) {
      pentacam = conMedida(
        pentacam,
        crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    pentacam = confirmarTodas(pentacam)
    caso = conOjo(caso, pentacam, CUANDO)
    return confirmar(caso, CUANDO)
  }

  it('«EVO Toric sin cara posterior» solo se planifica para el aparato que SÍ tiene PK1/PK2', () => {
    const plan = planificarCaso(casoConUnAparatoSinCaraPosterior(), {
      calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR'],
    })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toEqual(['Pentacam'])
    expect(deOD).not.toContain(APARATO_PRINCIPAL)
  })

  it('«Barrett Toric con cara posterior» solo se planifica para el aparato que SÍ tiene PK1/PK2', () => {
    const plan = planificarCaso(casoConUnAparatoSinCaraPosterior(), {
      calculadoras: ['BARRETT_TORIC_CON_CARA_POSTERIOR'],
    })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toEqual(['Pentacam'])
    expect(deOD).not.toContain(APARATO_PRINCIPAL)
  })

  it('las calculadoras BASE (no variante) se siguen planificando para los dos aparatos', () => {
    const plan = planificarCaso(casoConUnAparatoSinCaraPosterior(), {
      calculadoras: ['EVO_TORIC', 'BARRETT_TORIC', 'KANE'],
    })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD.filter((a) => a === APARATO_PRINCIPAL)).toHaveLength(3)
    expect(deOD.filter((a) => a === 'Pentacam')).toHaveLength(3)
  })

  it('con los dos aparatos teniendo córnea posterior, las dos variantes se planifican para los dos', () => {
    let caso = casoConUnAparatoSinCaraPosterior()
    let principal = ojoDe(caso, 'OD', APARATO_PRINCIPAL)
    for (const [campo, valor] of [
      ['PK1', 6.0],
      ['PK2', 6.2],
    ] as const) {
      principal = conMedida(
        principal,
        crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    caso = conOjo(caso, confirmarTodas(principal), CUANDO)

    const plan = planificarCaso(caso, { calculadoras: ['BARRETT_TORIC_CON_CARA_POSTERIOR'] })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD.sort()).toEqual([APARATO_PRINCIPAL, 'Pentacam'].sort())
  })
})

describe('D114 (02/10/2026): una variante pedida SOLA, sin córnea posterior en ningún aparato, no se queda sin planificar', () => {
  // `casoDosOjos()` no tiene PK1/PK2 en ningún aparato — es el caso real que
  // se reportó: «EVO Toric — Predicted PCA» (`EVO_TORIC_SIN_CARA_POSTERIOR`)
  // es una de las tres casillas marcadas por defecto en la pantalla de
  // cálculo, y con el filtro de D111 sin esta corrección, un caso sin
  // córnea posterior la dejaba sin ningún aparato que planificar — la
  // casilla se quedaba muda, sin resultado y sin error, hasta reintentarla.
  it('«EVO Toric sin cara posterior» pedida sola SÍ se planifica si es el único aparato del ojo', () => {
    const plan = planificarCaso(casoDosOjos(), { calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR'] })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toEqual([APARATO_PRINCIPAL])
  })

  it('«Barrett Toric con cara posterior» pedida sola SÍ se planifica si es el único aparato del ojo', () => {
    const plan = planificarCaso(casoDosOjos(), {
      calculadoras: ['BARRETT_TORIC_CON_CARA_POSTERIOR'],
    })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toEqual([APARATO_PRINCIPAL])
  })

  it('con un segundo aparato que SÍ tiene córnea posterior, la variante sigue excluyendo al que no la tiene (D111 no se pierde)', () => {
    let caso = casoDosOjos()
    let pentacam = ojoVacio('OD', 'Pentacam')
    for (const [campo, valor] of [
      ['AL', 24.1],
      ['K1', 41.0],
      ['K1_EJE', 170],
      ['K2', 42.4],
      ['K2_EJE', 80],
      ['ACD', 3.2],
      ['REFRACCION_OBJETIVO', 0],
      ['SIA', 0],
      ['EJE_INCISION', 0],
      ['CONSTANTE_A', 119],
      ['PK1', 6.1],
      ['PK2', 6.3],
    ] as const) {
      pentacam = conMedida(
        pentacam,
        crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
      )
    }
    caso = conOjo(caso, confirmarTodas(pentacam), CUANDO)
    caso = confirmar(caso, CUANDO)

    const plan = planificarCaso(caso, { calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR'] })
    const deOD = plan.filter((t) => t.ojo === 'OD').map((t) => t.aparato)
    expect(deOD).toEqual(['Pentacam'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2-4 · A cada ojo, los suyos
// ═══════════════════════════════════════════════════════════════════════════

describe('la lateralidad no se intercambia', () => {
  it('a OD le llegan los valores de OD y a OS los de OS', async () => {
    const recibidas: EntradasCalculadora[] = []
    await ejecutar(
      casoDosOjos(),
      { ...todosOk(), EVO_TORIC: adaptadorEspia('EVO_TORIC', recibidas) },
      { calculadoras: ['EVO_TORIC'] },
    )

    expect(recibidas).toHaveLength(2)
    const od = recibidas.find((e) => e.ojo === 'OD')
    const os = recibidas.find((e) => e.ojo === 'OS')

    expect(od?.valores.AL).toBe(24.07)
    expect(od?.valores.K1).toBe(41.22)
    expect(od?.valores.REFRACCION_OBJETIVO).toBe(0)

    expect(os?.valores.AL).toBe(23.11)
    expect(os?.valores.K1).toBe(40.27)
    expect(os?.valores.REFRACCION_OBJETIVO).toBe(-0.25)

    // Y ninguno lleva nada del otro.
    expect(od?.valores.AL).not.toBe(os?.valores.AL)
  })

  it('un adaptador que devuelva el ojo cambiado NO contamina el caso', async () => {
    // El fallo más peligroso posible: un resultado del ojo equivocado parece
    // perfectamente válido y produce una lente para el ojo que no es.
    const alReves: AdaptadorCalculadora = {
      ...adaptadorOk('EVO_TORIC'),
      ejecutar: async (ctx) => ({
        calculadora: 'EVO_TORIC',
        ojo: ctx.entradas.ojo === 'OD' ? 'OS' : 'OD',
        estado: 'SUCCESS',
        obtenidoEn: ctx.ahora(),
        opciones: [{ esfera: 21.5, recomendada: true }],
      }),
    }

    const r = await ejecutar(
      casoDosOjos(),
      { ...todosOk(), EVO_TORIC: alReves },
      { calculadoras: ['EVO_TORIC'] },
    )

    for (const x of r) {
      expect(x.estado).toBe('ADAPTER_BROKEN')
      expect(x.opciones).toHaveLength(0)
      expect(x.mensaje).toMatch(/se le pidió/i)
    }
    // Cada resultado queda en la casilla que se PIDIÓ, no en la devuelta.
    expect(r.map((x) => x.ojo)).toEqual(['OD', 'OS'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  5-6 · Un ojo que falla no se lleva al otro
// ═══════════════════════════════════════════════════════════════════════════

describe('aislamiento entre ojos', () => {
  function evoQueFallaCon(ojoMalo: Lateralidad): AdaptadorCalculadora {
    return {
      ...adaptadorOk('EVO_TORIC'),
      ejecutar: async (ctx) => {
        if (ctx.entradas.ojo === ojoMalo) throw new Error('la web se ha caído')
        return {
          calculadora: 'EVO_TORIC' as const,
          ojo: ctx.entradas.ojo,
          estado: 'SUCCESS' as const,
          obtenidoEn: ctx.ahora(),
          opciones: [{ esfera: 21.5, recomendada: true }],
        }
      },
    }
  }

  for (const malo of ['OD', 'OS'] as const) {
    const bueno = malo === 'OD' ? 'OS' : 'OD'
    it(`si falla ${malo}, ${bueno} se conserva`, async () => {
      const r = await ejecutar(
        casoDosOjos(),
        { ...todosOk(), EVO_TORIC: evoQueFallaCon(malo) },
        { calculadoras: ['EVO_TORIC'] },
      )
      expect(r.find((x) => x.ojo === malo)?.estado).toBe('EXTERNAL_ERROR')
      expect(r.find((x) => x.ojo === bueno)?.estado).toBe('SUCCESS')
      expect(r.find((x) => x.ojo === bueno)?.opciones).toHaveLength(1)
    })
  }

  it('que a Barrett le falte el SIA no bloquea a EVO, ni a Kane, ni al otro ojo', async () => {
    let caso = casoDosOjos()
    for (const lado of ['OD', 'OS'] as const) {
      caso = conOjo(caso, sinMedida(ojoDe(caso, lado), 'SIA'), CUANDO)
    }

    const r = await ejecutar(caso, todosOk())
    expect(r).toHaveLength(6)
    for (const x of r) {
      if (x.calculadora === 'BARRETT_TORIC') {
        expect(x.estado, `${x.calculadora}:${x.ojo}`).toBe('MISSING_INPUTS')
        expect(x.faltan).toContain('SIA')
      } else {
        expect(x.estado, `${x.calculadora}:${x.ojo}`).toBe('SUCCESS')
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  7-8 · Reintentar es repetir lo que falló
// ═══════════════════════════════════════════════════════════════════════════

describe('reintentar', () => {
  function resultado(
    calculadora: Calculadora,
    ojo: Lateralidad,
    estado: ResultadoCalculadora['estado'],
  ): ResultadoCalculadora {
    return { calculadora, ojo, estado, obtenidoEn: CUANDO, opciones: [] }
  }
  function con(caso: Caso, rs: readonly ResultadoCalculadora[]): Caso {
    return rs.reduce((c, r) => conResultado(c, r, CUANDO), caso)
  }

  it('pendiente es lo que no tiene resultado o falló de forma reintentable', () => {
    const caso = con(casoDosOjos(), [
      resultado('EVO_TORIC', 'OD', 'SUCCESS'),
      resultado('EVO_TORIC', 'OS', 'EXTERNAL_ERROR'),
    ])
    expect(tareasPendientes(caso, { calculadoras: ['EVO_TORIC'] }).map((t) => t.ojo)).toEqual([
      'OS',
    ])
  })

  it('reintentar EVO NO vuelve a ejecutar el ojo que ya salió', async () => {
    const caso = con(casoDosOjos(), [
      resultado('EVO_TORIC', 'OD', 'SUCCESS'),
      resultado('EVO_TORIC', 'OS', 'EXTERNAL_ERROR'),
    ])
    const recibidas: EntradasCalculadora[] = []

    await ejecutar(
      caso,
      { ...todosOk(), EVO_TORIC: adaptadorEspia('EVO_TORIC', recibidas) },
      { tareas: tareasPendientes(caso, { calculadoras: ['EVO_TORIC'] }) },
    )

    expect(recibidas).toHaveLength(1)
    expect(recibidas[0]?.ojo).toBe('OS')
  })

  it('lo que falta por un dato clínico no se reintenta solo', () => {
    // Repetirlo daría el mismo fallo: lo arregla el usuario escribiendo el dato.
    // Y un selector roto lo arregla quien mantiene el programa, no insistir.
    const caso = con(casoDosOjos(), [
      resultado('BARRETT_TORIC', 'OD', 'MISSING_INPUTS'),
      resultado('BARRETT_TORIC', 'OS', 'ADAPTER_BROKEN'),
    ])
    expect(tareasPendientes(caso, { calculadoras: ['BARRETT_TORIC'] })).toHaveLength(0)
  })

  it('reintentar una casilla no toca las demás ni duplica resultados', async () => {
    const caso = con(casoDosOjos(), [
      resultado('EVO_TORIC', 'OD', 'SUCCESS'),
      resultado('KANE', 'OD', 'SUCCESS'),
    ])

    const r = await ejecutar(caso, todosOk(), {
      tareas: [{ calculadora: 'EVO_TORIC', ojo: 'OS', aparato: APARATO_PRINCIPAL }],
    })

    expect(r).toHaveLength(1)
    expect(`${r[0]?.calculadora}:${r[0]?.ojo}`).toBe('EVO_TORIC:OS')

    // Los que ya había siguen, y la clave es calculadora+ojo+aparato: no hay duplicados.
    const tras = con(caso, r)
    expect(Object.keys(tras.resultados).sort()).toEqual([
      'EVO_TORIC:OD:Principal',
      'EVO_TORIC:OS:Principal',
      'KANE:OD:Principal',
    ])
  })
})
