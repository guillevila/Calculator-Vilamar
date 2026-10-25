/**
 * uso.ts — Cuánto se ha usado la aplicación y en qué tramo de precio cae
 * (25/10/2026, petición del dueño: un departamento de administración, solo para
 * él, con el control del uso y de los tramos).
 *
 * Es solo una VISTA de lo que ya hay en los casos guardados de ESTE ordenador: no
 * guarda nada y no inventa nada. Los casos importados de otra app no cuentan:
 * no han gastado nada aquí.
 *
 * «Qué es un cálculo» todavía no lo ha decidido el dueño, así que se miden las
 * tres cosas y el plan elige cuál se cobra (`MetricaDeCobro`).
 */

import type { Caso } from '../modelo/caso.js'

export type MetricaDeCobro = 'INFORMES_LEIDOS' | 'OJOS_CALCULADOS' | 'RESULTADOS_DE_CALCULADORA'

export const NOMBRE_METRICA: Readonly<Record<MetricaDeCobro, string>> = {
  INFORMES_LEIDOS: 'Informes leídos',
  OJOS_CALCULADOS: 'Ojos calculados',
  RESULTADOS_DE_CALCULADORA: 'Resultados de calculadora',
}

/** Las condiciones que se cobran: tamaño del tramo, precio de cada uno y cuándo se avisa. */
export interface PlanDeCobro {
  readonly metrica: MetricaDeCobro
  /** Cuántos entran en un tramo (p. ej. 150). */
  readonly tamanoTramo: number
  /** Lo que cuesta cada tramo, en euros (p. ej. 10). */
  readonly precioPorTramo: number
  /** A partir de cuántos, dentro del tramo, se avisa de que se acerca el siguiente (p. ej. 100). */
  readonly avisarDesde: number
}

/** De partida, lo que pidió el dueño; los valores concretos se deciden en la pantalla. */
export const PLAN_DE_PARTIDA: PlanDeCobro = {
  metrica: 'OJOS_CALCULADOS',
  tamanoTramo: 100,
  precioPorTramo: 10,
  avisarDesde: 80,
}

export interface UsoMensual {
  /** «AAAA-MM». */
  readonly mes: string
  readonly informesLeidos: number
  readonly ojosCalculados: number
  readonly resultadosDeCalculadora: number
}

const mesDe = (iso: string): string => iso.slice(0, 7)

/** El uso de cada mes, de más reciente a más antiguo. */
export function usoPorMes(casos: readonly Caso[]): readonly UsoMensual[] {
  const meses = new Map<string, { i: number; o: number; r: number }>()
  const de = (mes: string): { i: number; o: number; r: number } => {
    const v = meses.get(mes) ?? { i: 0, o: 0, r: 0 }
    meses.set(mes, v)
    return v
  }
  for (const caso of casos) {
    if (caso.importado) continue
    for (const d of caso.documentos) de(mesDe(d.cargadoEn)).i += 1

    // Un ojo cuenta una vez, en el mes de su PRIMER resultado de calculadora.
    const primerResultadoPorOjo = new Map<string, string>()
    for (const r of Object.values(caso.resultados)) {
      if (r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL') continue
      de(mesDe(r.obtenidoEn)).r += 1
      const antes = primerResultadoPorOjo.get(r.ojo)
      if (antes === undefined || r.obtenidoEn < antes)
        primerResultadoPorOjo.set(r.ojo, r.obtenidoEn)
    }
    for (const cuando of primerResultadoPorOjo.values()) de(mesDe(cuando)).o += 1
  }
  return [...meses.entries()]
    .map(([mes, v]) => ({
      mes,
      informesLeidos: v.i,
      ojosCalculados: v.o,
      resultadosDeCalculadora: v.r,
    }))
    .sort((a, b) => b.mes.localeCompare(a.mes))
}

export function cantidadSegunMetrica(uso: UsoMensual, metrica: MetricaDeCobro): number {
  if (metrica === 'INFORMES_LEIDOS') return uso.informesLeidos
  if (metrica === 'OJOS_CALCULADOS') return uso.ojosCalculados
  return uso.resultadosDeCalculadora
}

export interface SituacionDeTramo {
  readonly cantidad: number
  /** El tramo en el que cae (1 = el primero, aunque no haya usado nada: la cuota mensual). */
  readonly tramo: number
  readonly precio: number
  /** Cuántos faltan para pasar al siguiente tramo. */
  readonly hastaElSiguiente: number
  /** Ha llegado al umbral de aviso dentro de su tramo actual. */
  readonly avisar: boolean
}

/**
 * En qué tramo cae una cantidad: de 0 a `tamanoTramo` es el primero; cada
 * `tamanoTramo` más suma un tramo. El aviso salta al llegar a `avisarDesde` DENTRO
 * del tramo (en el primero, a los 100 de 150; en el segundo, a los 250 de 300).
 */
export function situacionDeTramo(cantidad: number, plan: PlanDeCobro): SituacionDeTramo {
  const tamano = Math.max(1, Math.floor(plan.tamanoTramo))
  const tramo = Math.max(1, Math.ceil(cantidad / tamano))
  const hastaElSiguiente = tramo * tamano - cantidad
  const dentroDelTramo = cantidad - (tramo - 1) * tamano
  const umbral = Math.min(Math.max(0, plan.avisarDesde), tamano)
  return {
    cantidad,
    tramo,
    precio: tramo * plan.precioPorTramo,
    hastaElSiguiente,
    avisar: cantidad > 0 && dentroDelTramo >= umbral,
  }
}
