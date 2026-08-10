/**
 * comparar.ts — Poner los tres resultados uno al lado del otro.
 *
 * Lo que este módulo PUEDE decir:
 *   «Kane y EVO coinciden en +21.0 D.»
 *   «2 de 3 calculadoras eligen +21.0 D.»
 *   «El rango entre las esferas recomendadas es 0.50 D.»
 *   «Barrett no pudo ejecutarse porque falta el WTW.»
 *
 * Lo que este módulo NO puede decir, ni ahora ni nunca:
 *   «Debes implantar +21.0 D.»
 *   «Nuestra recomendación es…»
 *
 * Calculator Vilamar compara. No hace de cuarta calculadora ni de médico. Si
 * algún día alguien añade aquí una frase que aconseje, estará cambiando lo que
 * es el producto, no mejorándolo.
 */

import type { Calculadora, ResultadoCalculadora } from '../modelo/calculadoras.js'
import { fichaDe } from '../modelo/calculadoras.js'
import type { Lateralidad } from '../modelo/lateralidad.js'

export interface CeldaComparativa {
  readonly calculadora: Calculadora
  readonly nombre: string
  readonly ejecutada: boolean
  readonly estado: ResultadoCalculadora['estado'] | 'NO_EJECUTADA'
  readonly esfera?: number
  readonly cilindro?: number
  readonly eje?: number
  readonly designacion?: string
  readonly refraccionPrevista?: number
  readonly cilindroResidual?: number
  readonly ejeResidual?: number
  /** Por qué no hay datos, en lenguaje normal. */
  readonly motivo?: string
}

export type TipoObservacion = 'CONCORDANCIA' | 'DISCREPANCIA' | 'AVISO' | 'FALLO'

export interface Observacion {
  readonly tipo: TipoObservacion
  readonly texto: string
}

export interface Comparativa {
  readonly ojo: Lateralidad
  readonly celdas: readonly CeldaComparativa[]
  readonly observaciones: readonly Observacion[]
  /** Cuántas calculadoras dieron un resultado utilizable. */
  readonly conResultado: number
}

const TEXTO_ESTADO: Record<ResultadoCalculadora['estado'] | 'NO_EJECUTADA', string> = {
  SUCCESS: 'Correcto',
  PARTIAL: 'Resultado incompleto',
  NEEDS_USER_ACTION: 'Necesita que hagas algo en el navegador',
  MISSING_INPUTS: 'Faltan datos',
  EXTERNAL_ERROR: 'La web no respondió como se esperaba',
  ADAPTER_BROKEN: 'La web ha cambiado y hay que actualizar el conector',
  NO_EJECUTADA: 'No se ha lanzado',
}

export function textoEstado(estado: ResultadoCalculadora['estado'] | 'NO_EJECUTADA'): string {
  return TEXTO_ESTADO[estado]
}

function aCelda(calculadora: Calculadora, r: ResultadoCalculadora | undefined): CeldaComparativa {
  const nombre = fichaDe(calculadora).nombre
  if (!r) {
    return { calculadora, nombre, ejecutada: false, estado: 'NO_EJECUTADA' }
  }
  const op = r.recomendada ?? r.opciones.find((o) => o.recomendada) ?? r.opciones[0]
  const utilizable = (r.estado === 'SUCCESS' || r.estado === 'PARTIAL') && op !== undefined
  return {
    calculadora,
    nombre,
    ejecutada: true,
    estado: r.estado,
    esfera: utilizable ? op?.esfera : undefined,
    cilindro: utilizable ? op?.cilindro : undefined,
    eje: utilizable ? op?.eje : undefined,
    designacion: utilizable ? op?.designacion : undefined,
    refraccionPrevista: utilizable ? op?.refraccionPrevista : undefined,
    cilindroResidual: utilizable ? op?.cilindroResidual : undefined,
    ejeResidual: utilizable ? op?.ejeResidual : undefined,
    motivo: r.mensaje,
  }
}

/** Distancia entre dos ejes entendidos como orientación (0–90). */
export function distanciaEntreEjes(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 180
  return bruta > 90 ? 180 - bruta : bruta
}

function formatearD(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)} D`
}

/**
 * Agrupa valores que son iguales y cuenta cuántas calculadoras los eligen.
 * Se compara con dos decimales para que 21 y 21.00 sean el mismo valor.
 */
function agrupar(valores: readonly { calculadora: string; valor: number }[]) {
  const grupos = new Map<string, { valor: number; quienes: string[] }>()
  for (const v of valores) {
    const clave = v.valor.toFixed(2)
    const g = grupos.get(clave)
    if (g) g.quienes.push(v.calculadora)
    else grupos.set(clave, { valor: v.valor, quienes: [v.calculadora] })
  }
  return [...grupos.values()].sort((a, b) => b.quienes.length - a.quienes.length)
}

function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Construye la comparativa de un ojo.
 *
 * `resultados` puede tener huecos: una calculadora que no se ejecutó, o que
 * falló, aparece igualmente en la tabla con su motivo. Un fallo no borra a las
 * demás.
 */
export function compararOjo(
  ojo: Lateralidad,
  resultados: Partial<Record<Calculadora, ResultadoCalculadora>>,
  ordenColumnas: readonly Calculadora[] = ['KANE', 'EVO_TORIC', 'BARRETT_TORIC'],
): Comparativa {
  const celdas = ordenColumnas.map((c) => aCelda(c, resultados[c]))
  const observaciones: Observacion[] = []
  const conDatos = celdas.filter((c) => c.esfera !== undefined)

  // ── Esferas ───────────────────────────────────────────────────────────────
  if (conDatos.length >= 2) {
    const esferas = conDatos.map((c) => ({ calculadora: c.nombre, valor: c.esfera as number }))
    const grupos = agrupar(esferas)
    const mayoritario = grupos[0]

    if (mayoritario && mayoritario.quienes.length === conDatos.length) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `Las ${conDatos.length} calculadoras coinciden en ${formatearD(mayoritario.valor)} de esfera.`,
      })
    } else if (mayoritario && mayoritario.quienes.length >= 2) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto:
          `${enumerar(mayoritario.quienes)} coinciden en ${formatearD(mayoritario.valor)} ` +
          `(${mayoritario.quienes.length} de ${conDatos.length}).`,
      })
    }

    const valores = esferas.map((e) => e.valor)
    const rango = Math.max(...valores) - Math.min(...valores)
    if (rango > 0) {
      observaciones.push({
        tipo: rango >= 0.5 ? 'DISCREPANCIA' : 'CONCORDANCIA',
        texto: `El rango entre las esferas recomendadas es ${rango.toFixed(2)} D.`,
      })
    }
  } else if (conDatos.length === 1) {
    observaciones.push({
      tipo: 'AVISO',
      texto: `Solo una calculadora ha dado resultado (${conDatos[0]?.nombre}). No hay nada con lo que compararlo.`,
    })
  }

  // ── Cilindro ──────────────────────────────────────────────────────────────
  const conCilindro = celdas.filter((c) => c.cilindro !== undefined)
  if (conCilindro.length >= 2) {
    const grupos = agrupar(
      conCilindro.map((c) => ({ calculadora: c.nombre, valor: c.cilindro as number })),
    )
    const mayoritario = grupos[0]
    if (mayoritario && mayoritario.quienes.length >= 2) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `${enumerar(mayoritario.quienes)} coinciden en un cilindro de ${mayoritario.valor.toFixed(2)} D.`,
      })
    } else {
      observaciones.push({
        tipo: 'DISCREPANCIA',
        texto: `Cada calculadora propone un cilindro distinto: ${conCilindro
          .map((c) => `${c.nombre} ${(c.cilindro as number).toFixed(2)} D`)
          .join(', ')}.`,
      })
    }
  }

  // ── Eje ───────────────────────────────────────────────────────────────────
  const conEje = celdas.filter((c) => c.eje !== undefined)
  if (conEje.length >= 2) {
    let maxima = 0
    let entre: [string, string] = ['', '']
    for (let i = 0; i < conEje.length; i++) {
      for (let j = i + 1; j < conEje.length; j++) {
        const a = conEje[i]
        const b = conEje[j]
        if (!a || !b) continue
        const d = distanciaEntreEjes(a.eje as number, b.eje as number)
        if (d > maxima) {
          maxima = d
          entre = [a.nombre, b.nombre]
        }
      }
    }
    if (maxima === 0) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `Todas las calculadoras coinciden en el eje (${conEje[0]?.eje}°).`,
      })
    } else {
      observaciones.push({
        tipo: maxima >= 5 ? 'DISCREPANCIA' : 'CONCORDANCIA',
        texto: `${entre[0]} y ${entre[1]} difieren ${maxima.toFixed(0)}° en el eje.`,
      })
    }
  }

  // ── Lo que no salió ───────────────────────────────────────────────────────
  for (const c of celdas) {
    if (c.esfera !== undefined) continue
    const explicacion = c.motivo ? ` ${c.motivo}` : ''
    observaciones.push({
      tipo: c.estado === 'NO_EJECUTADA' ? 'AVISO' : 'FALLO',
      texto: `${c.nombre}: ${textoEstado(c.estado).toLowerCase()}.${explicacion}`,
    })
  }

  return { ojo, celdas, observaciones, conResultado: conDatos.length }
}
