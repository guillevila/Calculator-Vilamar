/**
 * La constante A pertenece al modelo de lente, no al informe.
 *
 * Es la regla que gobierna todo este fichero. Un informe con cuatro lentes tiene
 * cuatro constantes posibles y **ninguna es la del caso** hasta que alguien elige
 * qué se va a implantar. Calcular con la constante de una lente que no se pone da
 * un resultado perfectamente creíble y equivocado, que es el peor de los fallos.
 *
 * Lo que se prueba aquí, en una frase: que no exista ningún camino por el que una
 * constante acabe pegada a la lente que no le corresponde.
 */

import { describe, expect, it } from 'vitest'

import { CALCULADORAS, FICHAS } from './calculadoras.js'
import type { Caso } from './caso.js'
import { casoNuevo, confirmar, conOjo } from './caso.js'
import type { LenteDetectada } from './lente.js'
import {
  claveLente,
  describirLente,
  emparejarLente,
  lentesContradictorias,
  normalizarNombreLente,
  sinRepetidas,
} from './lente.js'
import {
  camposPresentes,
  confirmarTodas,
  conMedida,
  corregirMedida,
  crearMedida,
  obtener,
  ojoVacio,
} from './medida.js'
import { prepararEntradas } from './preparar-entradas.js'
import type { Procedencia } from './procedencia.js'
import { origenDe } from './procedencia.js'
import { elegirLente } from './seleccion-lente.js'

const CUANDO = '2026-08-12T10:00:00.000Z'
const LUEGO = '2026-08-12T10:05:00.000Z'

function delInforme(evidencia: string): Procedencia {
  return {
    metodo: 'TEXTO_PDF',
    documentoId: 'doc-1',
    dispositivoId: 'ANTERION',
    registradoEn: CUANDO,
    evidencia: { texto: evidencia, pagina: 1, regla: 'Tabla de lentes: constante por fórmula' },
  }
}

function lente(modelo: string, constanteA?: number, fabricante?: string): LenteDetectada {
  return {
    modelo,
    ...(fabricante !== undefined ? { fabricante } : {}),
    ...(constanteA !== undefined ? { constanteA } : {}),
    etiquetaConstante: 'SRK/T',
    procedencia: delInforme(`${modelo} — SRK/T: ${constanteA ?? '?'}`),
  }
}

/** Las cuatro lentes del informe con el que se está trabajando. */
const LAS_CUATRO: readonly LenteDetectada[] = [
  lente('LUX SMART', 118.5),
  lente('ZEISS AT ELANA 841P', 119.6, 'ZEISS'),
  lente('Bausch&Lomb Akreos AO MI60', 119.1, 'Bausch&Lomb'),
  lente('Bausch&Lomb enVista MX60', 119.2, 'Bausch&Lomb'),
]

/** Un caso con un ojo completo salvo la constante A, y las lentes del informe. */
function casoConLentes(lentes: readonly LenteDetectada[] = LAS_CUATRO): Caso {
  let ojo = ojoVacio('OD')
  const valores: Record<string, number> = {
    AL: 24.07,
    K1: 41.22,
    K1_EJE: 175,
    K2: 42.52,
    K2_EJE: 85,
    ACD: 3.18,
    REFRACCION_OBJETIVO: 0,
    SIA: 0.3,
    EJE_INCISION: 90,
  }
  for (const [campo, valor] of Object.entries(valores)) {
    ojo = conMedida(
      ojo,
      crearMedida(campo as Parameters<typeof crearMedida>[0], 'OD', valor, delInforme(campo)),
    )
  }
  return {
    ...conOjo(casoNuevo('c1', 'CV-2026-0100', CUANDO), ojo, CUANDO),
    lentesDelInforme: lentes,
  }
}

function constanteDe(caso: Caso, lado: 'OD' | 'OS' = 'OD') {
  return caso.ojos[lado]?.medidas.CONSTANTE_A
}

// ═══════════════════════════════════════════════════════════════════════════
//  1-3 · Detectar y conservar la relación modelo ↔ constante
// ═══════════════════════════════════════════════════════════════════════════

describe('la relación entre cada modelo y su constante', () => {
  it('una sola lente con su constante se conserva entera', () => {
    const l = lente('Bausch&Lomb enVista MX60', 119.2, 'Bausch&Lomb')
    expect(l.modelo).toBe('Bausch&Lomb enVista MX60')
    expect(l.constanteA).toBe(119.2)
    expect(l.etiquetaConstante).toBe('SRK/T')
  })

  it('cuatro lentes son cuatro relaciones distintas, no cuatro constantes sueltas', () => {
    const porModelo = new Map(LAS_CUATRO.map((l) => [l.modelo, l.constanteA]))
    expect(porModelo.get('LUX SMART')).toBe(118.5)
    expect(porModelo.get('ZEISS AT ELANA 841P')).toBe(119.6)
    expect(porModelo.get('Bausch&Lomb Akreos AO MI60')).toBe(119.1)
    expect(porModelo.get('Bausch&Lomb enVista MX60')).toBe(119.2)
    expect(porModelo.size).toBe(4)
  })

  it('cada constante lleva pegada la evidencia de la que salió', () => {
    for (const l of LAS_CUATRO) {
      expect(l.procedencia.evidencia?.texto).toContain(l.modelo)
      expect(l.procedencia.evidencia?.texto).toContain(String(l.constanteA))
    }
  })

  it('una lente sin constante es un caso legítimo, no un error', () => {
    const sinConstante = lente('Modelo Raro X1')
    expect(sinConstante.constanteA).toBeUndefined()
    expect(describirLente(sinConstante)).toBe('Modelo Raro X1')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Normalizar nombres sin pasarse de listo
// ═══════════════════════════════════════════════════════════════════════════

describe('comparar nombres de lente', () => {
  it('ignora mayúsculas, espacios de más y puntuación de adorno', () => {
    const iguales = [
      'Bausch&Lomb enVista MX60',
      'BAUSCH & LOMB ENVISTA MX60',
      'bausch and lomb  envista  mx60',
      'Bausch-Lomb enVista MX60',
    ]
    const claves = new Set(iguales.map((n) => normalizarNombreLente(n)))
    expect(claves.size).toBe(1)
  })

  it('NO empareja dos modelos distintos aunque se parezcan mucho', () => {
    // MX60 y MX60T son lentes distintas con constantes distintas. Un
    // emparejamiento generoso las confundiría y el cálculo saldría creíble.
    expect(normalizarNombreLente('enVista MX60')).not.toBe(normalizarNombreLente('enVista MX60T'))
    expect(emparejarLente(LAS_CUATRO, { modelo: 'Bausch&Lomb enVista MX60T' }).estado).toBe(
      'NO_ESTA',
    )
  })

  it('junta fabricante y modelo cuando vienen separados', () => {
    // El informe lo escribe junto; la aplicación, separado. Es el mismo modelo.
    expect(claveLente({ fabricante: 'Bausch & Lomb', modelo: 'Akreos AO MI60' })).toBe(
      claveLente({ modelo: 'Bausch&Lomb Akreos AO MI60' }),
    )
  })

  it('no duplica el fabricante si el modelo ya lo lleva dentro', () => {
    expect(claveLente({ fabricante: 'ZEISS', modelo: 'ZEISS AT ELANA 841P' })).toBe(
      'zeiss at elana 841p',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4-7 · Elegir cada lente da SU constante
// ═══════════════════════════════════════════════════════════════════════════

describe('elegir una lente trae su constante, y solo la suya', () => {
  const esperado: readonly [string, number][] = [
    ['LUX SMART', 118.5],
    ['ZEISS AT ELANA 841P', 119.6],
    ['Bausch&Lomb Akreos AO MI60', 119.1],
    ['Bausch&Lomb enVista MX60', 119.2],
  ]

  for (const [modelo, constante] of esperado) {
    it(`«${modelo}» → ${constante}`, () => {
      const r = elegirLente(casoConLentes(), { modelo }, LUEGO)
      expect(r.emparejamiento.estado).toBe('ENCONTRADA')
      expect(constanteDe(r.caso)?.valor).toBe(constante)
      expect(r.caso.lente?.modelo).toBe(modelo)
    })
  }

  it('la constante elegida sale como DEL INFORME, con su evidencia', () => {
    const r = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb Akreos AO MI60' }, LUEGO)
    const m = constanteDe(r.caso)
    expect(origenDe(m)).toBe('DEL_INFORME')
    expect(m?.procedencia.evidencia?.texto).toContain('Akreos AO MI60')
    expect(m?.procedencia.evidencia?.texto).toContain('119.1')
    expect(m?.procedencia.dispositivoId).toBe('ANTERION')
  })

  it('sin elegir lente NO hay constante, aunque el informe traiga cuatro', () => {
    // La regla entera en un test: cuatro constantes en el papel y cero en el caso.
    const caso = casoConLentes()
    expect(caso.lentesDelInforme).toHaveLength(4)
    expect(constanteDe(caso)).toBeUndefined()
  })

  it('no se elige sola la primera lente de la lista', () => {
    const caso = casoConLentes()
    expect(caso.lente).toBeUndefined()
    expect(constanteDe(caso)?.valor).not.toBe(118.5)
  })

  it('las cuatro constantes NO se guardan como cuatro medidas del ojo', () => {
    // Es estructuralmente imposible —una clave por campo y ojo— y aquí queda
    // fijado: elegir una lente escribe UNA constante, no cuatro.
    const r = elegirLente(casoConLentes(), { modelo: 'LUX SMART' }, LUEGO)
    const constantes = camposPresentes(r.caso.ojos.OD!).filter((c) => c === 'CONSTANTE_A')
    expect(constantes).toHaveLength(1)
    expect(constanteDe(r.caso)?.valor).toBe(118.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  8 · Cambiar de lente cambia la constante
// ═══════════════════════════════════════════════════════════════════════════

describe('cambiar de lente', () => {
  it('cambia también la constante, sin dejar la anterior', () => {
    const primero = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb Akreos AO MI60' }, LUEGO)
    expect(constanteDe(primero.caso)?.valor).toBe(119.1)

    const segundo = elegirLente(primero.caso, { modelo: 'Bausch&Lomb enVista MX60' }, LUEGO)
    expect(constanteDe(segundo.caso)?.valor).toBe(119.2)
    expect(segundo.caso.lente?.modelo).toBe('Bausch&Lomb enVista MX60')
    expect(segundo.caso.lente?.constanteDeLaTabla?.valor).toBe(119.2)
  })

  it('ir y volver deja cada constante en su sitio', () => {
    let caso = casoConLentes()
    for (const [modelo, valor] of [
      ['LUX SMART', 118.5],
      ['ZEISS AT ELANA 841P', 119.6],
      ['LUX SMART', 118.5],
    ] as const) {
      caso = elegirLente(caso, { modelo }, LUEGO).caso
      expect(constanteDe(caso)?.valor).toBe(valor)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  9-10 · Lo que NO se hereda ni se adivina
// ═══════════════════════════════════════════════════════════════════════════

describe('una lente que no está en el informe', () => {
  it('no hereda ninguna constante', () => {
    const r = elegirLente(casoConLentes(), { modelo: 'Alcon SN6ATx' }, LUEGO)
    expect(r.emparejamiento.estado).toBe('NO_ESTA')
    expect(constanteDe(r.caso)).toBeUndefined()
  })

  it('quita la de la lente anterior en vez de arrastrarla', () => {
    // Es el fallo silencioso que más importa: calcular la lente nueva con la
    // constante de la vieja da un número creíble.
    const conAkreos = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb Akreos AO MI60' }, LUEGO)
    expect(constanteDe(conAkreos.caso)?.valor).toBe(119.1)

    const otra = elegirLente(conAkreos.caso, { modelo: 'Alcon SN6ATx' }, LUEGO)
    expect(constanteDe(otra.caso)).toBeUndefined()
    expect(otra.avisos.join(' ')).toMatch(/no aparece en el informe/i)
  })

  it('no coge la más parecida ni otra de la misma marca', () => {
    // «Bausch&Lomb enVista MX70» no existe en el informe. Que haya dos Bausch&Lomb
    // no la convierte en ninguna de ellas.
    const r = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb enVista MX70' }, LUEGO)
    expect(r.emparejamiento.estado).toBe('NO_ESTA')
    expect(constanteDe(r.caso)).toBeUndefined()
  })
})

describe('dos lentes ambiguas no se emparejan solas', () => {
  const contradictorias = [lente('enVista MX60', 119.2), lente('enVista MX60', 118.9)]

  it('la misma lente con constantes distintas es AMBIGUA', () => {
    const r = emparejarLente(contradictorias, { modelo: 'enVista MX60' })
    expect(r.estado).toBe('AMBIGUA')
  })

  it('no se escribe ninguna constante, y se pide revisión', () => {
    const caso = { ...casoConLentes(contradictorias) }
    const r = elegirLente(caso, { modelo: 'enVista MX60' }, LUEGO)
    expect(constanteDe(r.caso)).toBeUndefined()
    expect(r.avisos.join(' ')).toMatch(/constantes distintas/i)
  })

  it('la misma lente repetida con la MISMA constante no es ambigua', () => {
    // El informe la nombra dos veces (tabla y resumen). No hay contradicción.
    const repetida = [lente('enVista MX60', 119.2), lente('enVista MX60', 119.2)]
    expect(emparejarLente(repetida, { modelo: 'enVista MX60' }).estado).toBe('ENCONTRADA')
    expect(sinRepetidas(repetida)).toHaveLength(1)
    expect(lentesContradictorias(repetida)).toHaveLength(0)
  })

  it('las contradictorias se conservan las dos, no se unifican', () => {
    expect(sinRepetidas(contradictorias)).toHaveLength(2)
    expect(lentesContradictorias(contradictorias)).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  11-12 · Evidencia y corrección manual
// ═══════════════════════════════════════════════════════════════════════════

describe('corregir a mano la constante', () => {
  it('conserva la del informe como valor original', () => {
    const r = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb Akreos AO MI60' }, LUEGO)
    const corregido = corregirMedida(r.caso.ojos.OD!, 'CONSTANTE_A', 119.0, LUEGO)
    const m = obtener(corregido, 'CONSTANTE_A')

    expect(m?.valor).toBe(119.0)
    expect(origenDe(m)).toBe('CORREGIDO')
    expect(m?.original?.valor).toBe(119.1)
    // Y la evidencia de dónde salía la original sigue ahí.
    expect(m?.original?.procedencia.evidencia?.texto).toContain('Akreos AO MI60')
  })

  it('elegir otra lente NO pisa lo que ha escrito una persona', () => {
    const r = elegirLente(casoConLentes(), { modelo: 'Bausch&Lomb Akreos AO MI60' }, LUEGO)
    const conMano = {
      ...r.caso,
      ojos: { OD: corregirMedida(r.caso.ojos.OD!, 'CONSTANTE_A', 119.0, LUEGO) },
    }

    const cambiada = elegirLente(conMano, { modelo: 'Bausch&Lomb enVista MX60' }, LUEGO)
    expect(constanteDe(cambiada.caso)?.valor).toBe(119.0)
    // Pero se dice, para que nadie calcule con una constante que ya no toca.
    expect(cambiada.avisos.join(' ')).toMatch(/la escribiste tú/i)
  })

  it('una constante escrita a mano sin lente en el informe se respeta', () => {
    // Viene de otro sitio, no de la tabla: elegir una lente ausente no la borra.
    let caso = casoConLentes()
    caso = { ...caso, ojos: { OD: corregirMedida(caso.ojos.OD!, 'CONSTANTE_A', 118.0, LUEGO) } }
    const r = elegirLente(caso, { modelo: 'Alcon SN6ATx' }, LUEGO)
    expect(constanteDe(r.caso)?.valor).toBe(118.0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  13-16 · La constante llega a las calculadoras
// ═══════════════════════════════════════════════════════════════════════════

describe('la constante elegida llega a las calculadoras', () => {
  function preparado(modelo: string) {
    const r = elegirLente(casoConLentes(), { modelo }, LUEGO)
    const ojo = confirmarTodas(r.caso.ojos.OD!)
    return confirmar(conOjo(r.caso, ojo, LUEGO), LUEGO)
  }

  it('EVO recibe la constante de la lente elegida, y el modelo', () => {
    const caso = preparado('Bausch&Lomb Akreos AO MI60')
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.valores.CONSTANTE_A).toBe(119.1)
      expect(r.entradas.modeloLente).toBe('Bausch&Lomb Akreos AO MI60')
    }
  })

  it('Kane recibe la misma', () => {
    const caso = preparado('Bausch&Lomb enVista MX60')
    const r = prepararEntradas(caso, 'KANE', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.valores.CONSTANTE_A).toBe(119.2)
  })

  it('Barrett sigue igual: le vale la constante A o el factor de lente', () => {
    // No se cambia su comportamiento. La constante es opcional para Barrett y
    // sigue siéndolo; lo que cambia es de dónde sale cuando está.
    expect(FICHAS.BARRETT_TORIC.requeridos).not.toContain('CONSTANTE_A')
    expect(FICHAS.BARRETT_TORIC.opcionales).toContain('CONSTANTE_A')
    expect(FICHAS.BARRETT_TORIC.opcionales).toContain('FACTOR_LENTE')

    const caso = preparado('LUX SMART')
    const r = prepararEntradas(caso, 'BARRETT_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.valores.CONSTANTE_A).toBe(118.5)
  })

  it('sin lente elegida, quien exige constante A no puede calcular', () => {
    const ojo = confirmarTodas(casoConLentes().ojos.OD!)
    const caso = confirmar(conOjo(casoConLentes(), ojo, LUEGO), LUEGO)
    for (const c of CALCULADORAS) {
      const r = prepararEntradas(caso, c, 'OD')
      if (FICHAS[c].requeridos.includes('CONSTANTE_A')) {
        expect(r.ok, `${c} no debería poder calcular sin constante`).toBe(false)
      }
    }
  })

  it('cambiar de lente cambia lo que reciben las calculadoras', () => {
    const a = prepararEntradas(preparado('LUX SMART'), 'KANE', 'OD')
    const b = prepararEntradas(preparado('ZEISS AT ELANA 841P'), 'KANE', 'OD')
    if (a.ok && b.ok) {
      expect(a.entradas.valores.CONSTANTE_A).toBe(118.5)
      expect(b.entradas.valores.CONSTANTE_A).toBe(119.6)
    } else {
      throw new Error('las dos preparaciones deberían haber salido bien')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Los dos ojos
// ═══════════════════════════════════════════════════════════════════════════

describe('la lente es del caso, no de un ojo', () => {
  it('elegirla escribe la constante en los dos ojos', () => {
    // Se implanta el mismo modelo en los dos, así que la constante es la misma.
    // Lo que NO se hace es asignar lateralidad a una tabla que no habla de ojos.
    let caso = casoConLentes()
    caso = conOjo(
      caso,
      conMedida(ojoVacio('OS'), crearMedida('AL', 'OS', 24.01, delInforme('AL'))),
      CUANDO,
    )

    const r = elegirLente(caso, { modelo: 'LUX SMART' }, LUEGO)
    expect(constanteDe(r.caso, 'OD')?.valor).toBe(118.5)
    expect(constanteDe(r.caso, 'OS')?.valor).toBe(118.5)
  })

  it('las lentes del informe no se guardan por ojo', () => {
    const caso = casoConLentes()
    expect(caso.lentesDelInforme).toHaveLength(4)
    for (const lado of ['OD', 'OS'] as const) {
      const ojo = caso.ojos[lado]
      if (!ojo) continue
      expect(Object.keys(ojo.medidas)).not.toContain('lentes')
    }
  })
})
