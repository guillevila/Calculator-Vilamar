/**
 * estudio.ts — Los datos de un «estudio de casos» (21/10/2026, petición del
 * dueño): una fila por caso, ojo y aparato, con el preoperatorio (biometría del
 * aparato) y la lente que cada calculadora da según el criterio propio.
 *
 * Es solo una VISTA de lo que ya hay en cada caso: no inventa ningún dato. Un dato
 * que el aparato o la calculadora no dieron sale ausente (`undefined`), nunca como
 * un cero. Sirve de base para el Excel, pero no sabe nada de Excel.
 *
 * Los valores de lente son la ESTIMACIÓN PROPIA (D43/D52): la primera esfera con
 * refracción prevista negativa y el cilindro más alto que comparte el eje curvo
 * —positiva en la familia Lux—. No es lo que la calculadora señaló, ni una
 * recomendación: es el criterio fijo del proyecto, el mismo del informe.
 */

import type { Calculadora } from '../modelo/calculadoras.js'
import type { Caso } from '../modelo/caso.js'
import {
  COLUMNAS_COMPARATIVA,
  datasetsActivosDe,
  ojosDelCaso,
  resultadoDe,
} from '../modelo/caso.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import { valorDe } from '../modelo/medida.js'
import { casosDelAnalisis } from './analisis.js'
import type { FiltroAnalisis } from './analisis.js'
import { etiquetaDoctor, etiquetaLente } from './dashboard.js'
import { criterioEsferaPara, ejeCurvoDe, estimarLenteRecomendada } from './recomendacion.js'

/** La lente que una calculadora da para un ojo y aparato. */
export interface LenteDeEstudio {
  /** Potencia esférica de la lente (D). */
  readonly esfera?: number
  /** Potencia cilíndrica de la lente (D); ausente si la lente no es tórica. */
  readonly cilindro?: number
  /** Eje (°): el que la propia calculadora publica para esa opción. */
  readonly eje?: number
  /** Residual esférico: la refracción prevista (D). */
  readonly residualEsferico?: number
  /** Residual cilíndrico (D). */
  readonly residualCilindrico?: number
}

export interface FilaEstudio {
  readonly nombrePaciente?: string
  readonly codigo: string
  /** Día del caso, «AAAA-MM-DD». */
  readonly fecha: string
  readonly doctor: string
  readonly ojo: Lateralidad
  readonly aparato: string
  // ── Preoperatorio: la biometría de ESTE aparato ──
  readonly longitudAxial?: number
  readonly k1?: number
  readonly ejeK1?: number
  readonly k2?: number
  readonly ejeK2?: number
  readonly acd?: number
  // ── Lente ──
  /** Tipo de lente elegido para el caso («B&L LuxSmart»…); «Sin modelo» si no hay. */
  readonly tipoDeLente: string
  /** Por calculadora; solo las que tienen resultado para este ojo y aparato. */
  readonly lentes: Readonly<Partial<Record<Calculadora, LenteDeEstudio>>>
}

/** Una fila por caso, ojo y aparato de los casos que ve el análisis con este filtro. */
export function filasDeEstudio(
  casos: readonly Caso[],
  filtro: FiltroAnalisis = {},
  doctoresExcluidos: readonly string[] = [],
): readonly FilaEstudio[] {
  const elegidos = [...casosDelAnalisis(casos, filtro, doctoresExcluidos)].sort((a, b) =>
    a.actualizadoEn.localeCompare(b.actualizadoEn),
  )
  const filas: FilaEstudio[] = []
  for (const caso of elegidos) {
    if (caso.importado) {
      // Importado de otra app (22/10/2026): sin biometría ni lentes por calculadora;
      // solo lo que dice el PDF. Una fila por aparato que enseña.
      if (filtro.ojo && caso.importado.ojo !== filtro.ojo) continue
      for (const aparato of caso.importado.aparatos.length > 0 ? caso.importado.aparatos : ['']) {
        filas.push({
          ...(caso.nombrePaciente ? { nombrePaciente: caso.nombrePaciente } : {}),
          codigo: caso.codigo,
          fecha: caso.actualizadoEn.slice(0, 10),
          doctor: etiquetaDoctor(caso),
          ojo: caso.importado.ojo,
          aparato: aparato || 'Importado de otra app',
          tipoDeLente: etiquetaLente(caso.lente),
          lentes: {},
        })
      }
      continue
    }
    const criterio = criterioEsferaPara(caso.lente?.modelo)
    for (const ojo of ojosDelCaso(caso)) {
      if (filtro.ojo && ojo !== filtro.ojo) continue
      for (const dataset of datasetsActivosDe(caso, ojo)) {
        const lentes: Partial<Record<Calculadora, LenteDeEstudio>> = {}
        for (const calculadora of COLUMNAS_COMPARATIVA) {
          const r = resultadoDe(caso, calculadora, ojo, dataset.aparato)
          if (!r || (r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL')) continue
          const e = estimarLenteRecomendada(r.opciones, ejeCurvoDe(dataset), criterio)
          if (!e) continue
          lentes[calculadora] = {
            esfera: e.esfera,
            ...(e.cilindro !== undefined ? { cilindro: e.cilindro } : {}),
            ...(e.ejeResidual !== undefined ? { eje: e.ejeResidual } : {}),
            ...(e.refraccionPrevista !== undefined
              ? { residualEsferico: e.refraccionPrevista }
              : {}),
            ...(e.cilindroResidual !== undefined ? { residualCilindrico: e.cilindroResidual } : {}),
          }
        }
        const medida = (campo: Parameters<typeof valorDe>[1]): number | undefined =>
          valorDe(dataset, campo)
        filas.push({
          ...(caso.nombrePaciente ? { nombrePaciente: caso.nombrePaciente } : {}),
          codigo: caso.codigo,
          fecha: caso.actualizadoEn.slice(0, 10),
          doctor: etiquetaDoctor(caso),
          ojo,
          aparato: dataset.aparato,
          ...conValor('longitudAxial', medida('AL')),
          ...conValor('k1', medida('K1')),
          ...conValor('ejeK1', medida('K1_EJE')),
          ...conValor('k2', medida('K2')),
          ...conValor('ejeK2', medida('K2_EJE')),
          ...conValor('acd', medida('ACD')),
          tipoDeLente: etiquetaLente(caso.lente),
          lentes,
        })
      }
    }
  }
  return filas
}

/** `{ clave: valor }` si hay valor; nada si no — un dato que falta no se rellena. */
function conValor<K extends string>(
  clave: K,
  valor: number | undefined,
): Partial<Record<K, number>> {
  return valor === undefined ? {} : ({ [clave]: valor } as Record<K, number>)
}
