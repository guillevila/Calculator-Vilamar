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
  casoNuevo,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
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
    BARRETT_TORIC: adaptadorOk('BARRETT_TORIC'),
    KANE: adaptadorOk('KANE'),
    // No está en ORDEN_POR_DEFECTO (D53): estos tests no la piden
    // explícitamente, así que este doble no debería llegar a ejecutarse.
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
      caso = conOjo(caso, sinMedida(caso.ojos[lado]!, 'SIA'), CUANDO)
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
      tareas: [{ calculadora: 'EVO_TORIC', ojo: 'OS' }],
    })

    expect(r).toHaveLength(1)
    expect(`${r[0]?.calculadora}:${r[0]?.ojo}`).toBe('EVO_TORIC:OS')

    // Los que ya había siguen, y la clave es calculadora+ojo: no hay duplicados.
    const tras = con(caso, r)
    expect(Object.keys(tras.resultados).sort()).toEqual(['EVO_TORIC:OD', 'EVO_TORIC:OS', 'KANE:OD'])
  })
})
