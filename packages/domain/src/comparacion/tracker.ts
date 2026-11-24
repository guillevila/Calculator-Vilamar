/**
 * tracker.ts — Las filas del Excel «LuxLife Experience Tracker» (24/11/2026, petición
 * del dueño): una fila por paciente Y aparato, con el ojo derecho y el izquierdo uno al
 * lado del otro, como en la plantilla.
 *
 * Qué lleva cada fila, y solo esto:
 *  - la identificación del caso;
 *  - la biometría y la topografía de ESE aparato, por ojo;
 *  - la lente que el cirujano ha decidido pedir (D93: `pedidosLente`), por ojo.
 *
 * NO lleva ninguna lente de las calculadoras ni la estimación propia: el dueño pidió que
 * saliera solo lo medido y lo elegido. Todo lo que ocurre después de operar (las
 * revisiones) se rellena a mano en el propio Excel.
 *
 * Un dato que falta se deja vacío: nunca se rellena con un cero.
 */

import type { Caso } from '../modelo/caso.js'
import { datasetsActivosDe, ojosDelCaso } from '../modelo/caso.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import type { OjoBiometrico } from '../modelo/medida.js'
import { valorDe } from '../modelo/medida.js'
import { casosDelAnalisis } from './analisis.js'
import type { FiltroAnalisis } from './analisis.js'
import { etiquetaDoctor } from './dashboard.js'

/** Más de dos aparatos en un mismo caso no caben: se dejan fuera (petición del dueño). */
export const MAX_APARATOS_TRACKER = 2

/** La biometría y la topografía de un ojo, medida con UN aparato. */
export interface BiometriaTracker {
  /** Meridiano más plano de la cara anterior (D) y su eje (°). */
  readonly kPlana?: number
  readonly ejeKPlana?: number
  /** Meridiano más curvo de la cara anterior (D) y su eje (°). */
  readonly kCurva?: number
  readonly ejeKCurva?: number
  readonly longitudAxial?: number
  readonly acd?: number
  readonly lt?: number
  readonly cct?: number
  readonly wtw?: number
  /** Cara posterior de la córnea (D), con su signo, y sus ejes (°). */
  readonly pkPlana?: number
  readonly ejePkPlana?: number
  readonly pkCurva?: number
  readonly ejePkCurva?: number
  /** Refracción objetivo del cálculo (equivalente esférico, D). */
  readonly objetivo?: number
}

/** La lente que se ha decidido pedir para un ojo (la misma para todos los aparatos). */
export interface LenteElegidaTracker {
  readonly nombre: string
  readonly esfera: number
  readonly cilindro?: number
  readonly eje?: number
}

export interface FilaTracker {
  readonly nombrePaciente?: string
  readonly codigo: string
  readonly doctor: string
  readonly aparato: string
  /** En inglés, como la lista desplegable de la plantilla. */
  readonly sexo?: 'Male' | 'Female'
  readonly od?: BiometriaTracker
  readonly os?: BiometriaTracker
  readonly lenteOd?: LenteElegidaTracker
  readonly lenteOs?: LenteElegidaTracker
}

export interface ResultadoTracker {
  readonly filas: readonly FilaTracker[]
  /** Casos con más aparatos de los que caben: sus aparatos de más NO salen. */
  readonly casosConAparatosOmitidos: number
}

/**
 * Plana y curva a partir de los dos meridianos tal como están en el caso. Si están los
 * dos, la plana es la de menor valor (en las córneas posteriores, de menor módulo): es
 * una clasificación, no una corrección — cada valor conserva su propio eje. Si solo hay
 * uno no se adivina cuál es: se queda en el sitio que tenía en el caso.
 */
interface Meridiano {
  readonly valor?: number
  readonly eje?: number
}

function plana(
  a: Meridiano,
  b: Meridiano,
): { readonly plana: Meridiano; readonly curva: Meridiano } {
  if (a.valor !== undefined && b.valor !== undefined && Math.abs(b.valor) < Math.abs(a.valor)) {
    return { plana: b, curva: a }
  }
  return { plana: a, curva: b }
}

function sinVacios<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function biometriaDe(ojo: OjoBiometrico): BiometriaTracker {
  const k = plana(
    { valor: valorDe(ojo, 'K1'), eje: valorDe(ojo, 'K1_EJE') },
    { valor: valorDe(ojo, 'K2'), eje: valorDe(ojo, 'K2_EJE') },
  )
  const pk = plana(
    { valor: valorDe(ojo, 'PK1'), eje: valorDe(ojo, 'PK1_EJE') },
    { valor: valorDe(ojo, 'PK2'), eje: valorDe(ojo, 'PK2_EJE') },
  )
  return sinVacios({
    kPlana: k.plana.valor,
    ejeKPlana: k.plana.eje,
    kCurva: k.curva.valor,
    ejeKCurva: k.curva.eje,
    longitudAxial: valorDe(ojo, 'AL'),
    acd: valorDe(ojo, 'ACD'),
    lt: valorDe(ojo, 'LT'),
    cct: valorDe(ojo, 'CCT'),
    wtw: valorDe(ojo, 'WTW'),
    pkPlana: pk.plana.valor,
    ejePkPlana: pk.plana.eje,
    pkCurva: pk.curva.valor,
    ejePkCurva: pk.curva.eje,
    objetivo: valorDe(ojo, 'REFRACCION_OBJETIVO'),
  })
}

function lenteElegida(caso: Caso, ojo: Lateralidad): LenteElegidaTracker | undefined {
  const pedido = caso.pedidosLente?.[ojo]
  if (!pedido) return undefined
  return sinVacios({
    nombre: pedido.modelo.trim() || pedido.fabricante.trim(),
    esfera: pedido.esfera,
    cilindro: pedido.cilindro,
    eje: pedido.eje,
  })
}

/** Los aparatos de un caso, sin repetir y en el orden en que aparecen (OD y luego OS). */
function aparatosDelCaso(caso: Caso, ojos: readonly Lateralidad[]): readonly string[] {
  const nombres: string[] = []
  for (const ojo of ojos) {
    for (const d of datasetsActivosDe(caso, ojo)) {
      if (!nombres.includes(d.aparato)) nombres.push(d.aparato)
    }
  }
  return nombres
}

/** Una fila por caso y aparato (hasta dos) de los casos que ve el análisis con este filtro. */
export function filasDeTracker(
  casos: readonly Caso[],
  filtro: FiltroAnalisis = {},
  doctoresExcluidos: readonly string[] = [],
): ResultadoTracker {
  const elegidos = [...casosDelAnalisis(casos, filtro, doctoresExcluidos)].sort((a, b) =>
    a.actualizadoEn.localeCompare(b.actualizadoEn),
  )
  const filas: FilaTracker[] = []
  let casosConAparatosOmitidos = 0

  for (const caso of elegidos) {
    const comun = {
      ...(caso.nombrePaciente ? { nombrePaciente: caso.nombrePaciente } : {}),
      codigo: caso.codigo,
      doctor: etiquetaDoctor(caso),
      ...(caso.sexo
        ? { sexo: (caso.sexo.valor === 'HOMBRE' ? 'Male' : 'Female') as 'Male' | 'Female' }
        : {}),
    }

    if (caso.importado) {
      // Importado de otra app: no tiene biometría ni lente elegida, solo qué aparatos
      // enseña su PDF. Una fila por aparato, con lo poco que hay.
      const aparatos = caso.importado.aparatos.length > 0 ? caso.importado.aparatos : ['']
      if (aparatos.length > MAX_APARATOS_TRACKER) casosConAparatosOmitidos += 1
      for (const aparato of aparatos.slice(0, MAX_APARATOS_TRACKER)) {
        filas.push({ ...comun, aparato: aparato || 'Importado de otra app' })
      }
      continue
    }

    const ojos = ojosDelCaso(caso).filter((o) => !filtro.ojo || o === filtro.ojo)
    const aparatos = aparatosDelCaso(caso, ojos)
    if (aparatos.length > MAX_APARATOS_TRACKER) casosConAparatosOmitidos += 1

    for (const aparato of aparatos.slice(0, MAX_APARATOS_TRACKER)) {
      const delOjo = (ojo: Lateralidad): BiometriaTracker | undefined => {
        if (!ojos.includes(ojo)) return undefined
        const dataset = datasetsActivosDe(caso, ojo).find((d) => d.aparato === aparato)
        return dataset ? biometriaDe(dataset) : undefined
      }
      const od = delOjo('OD')
      const os = delOjo('OS')
      const lenteOd = ojos.includes('OD') ? lenteElegida(caso, 'OD') : undefined
      const lenteOs = ojos.includes('OS') ? lenteElegida(caso, 'OS') : undefined
      filas.push({
        ...comun,
        aparato,
        ...(od ? { od } : {}),
        ...(os ? { os } : {}),
        ...(lenteOd ? { lenteOd } : {}),
        ...(lenteOs ? { lenteOs } : {}),
      })
    }
  }
  return { filas, casosConAparatosOmitidos }
}
