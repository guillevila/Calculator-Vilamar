/**
 * progreso.ts — Los porcentajes de las barras de progreso (21/10/2026, petición
 * del dueño): al cargar fotos y al calcular con cada calculadora.
 *
 * Son ESTIMACIONES honestas, no medidas: ni el lector de fotos ni las webs dicen
 * cuánto les falta. Lo que sí se sabe es en qué punto está cada cosa (qué
 * documento de cuántos; en qué fase está una calculadora), y de ahí salen
 * porcentajes razonables que nunca llegan a 100 antes de terminar de verdad.
 */

/** Un aviso del proceso principal: «empieza a leerse el documento N de M». */
export interface ProgresoCarga {
  /** Posición del documento que EMPIEZA a leerse, desde 1. */
  readonly indice: number
  readonly total: number
  readonly nombre: string
}

/** Cuánto tarda, más o menos, la lectura de un documento (foto con lector de visión o texto escaneado). */
export const SEGUNDOS_POR_DOCUMENTO = 12

/**
 * El porcentaje de una carga de `total` documentos, con `completados` ya leídos
 * y `segundosEnElActual` desde que empezó el actual. El documento en curso suma
 * una fracción que crece despacio y no llega a 1 (se acerca, sin cruzar), así
 * que la barra nunca se queda quieta pero tampoco llega a 100 sola.
 */
export function porcentajeDeCarga(
  total: number,
  completados: number,
  segundosEnElActual: number,
  segundosPorDocumento: number = SEGUNDOS_POR_DOCUMENTO,
): number {
  if (total <= 0) return 0
  const t = Math.max(0, segundosEnElActual)
  const fraccion = Math.min(0.95, 1 - Math.exp(-t / segundosPorDocumento))
  const valor = ((Math.min(completados, total) + fraccion) / total) * 100
  return Math.min(99, Math.max(0, Math.round(valor)))
}

/**
 * Los segundos que, más o menos, faltan: lo que queda del documento actual más
 * lo que tardarán los siguientes, a `segundosPorDocumento` cada uno.
 */
export function segundosQueFaltan(
  total: number,
  completados: number,
  segundosEnElActual: number,
  segundosPorDocumento: number = SEGUNDOS_POR_DOCUMENTO,
): number {
  const restantes = Math.max(0, total - completados)
  if (restantes === 0) return 0
  const porDocumento = Math.max(1, segundosPorDocumento)
  const delActual = Math.max(0, porDocumento - Math.max(0, segundosEnElActual))
  return Math.round(delActual + (restantes - 1) * porDocumento)
}

/**
 * El avance de una calculadora según la fase en que va (las fases reales de
 * los conectores). `null` en «esperando al usuario»: ahí el tiempo lo decide la
 * persona, no hay porcentaje que valga.
 */
const PORCENTAJE_POR_FASE: Readonly<Record<string, number>> = {
  NAVEGANDO: 10,
  PREPARANDO: 25,
  RELLENANDO: 45,
  CALCULANDO: 65,
  LEYENDO_RESULTADO: 85,
  TERMINADO: 100,
}

export function porcentajeDeFase(fase: string): number | null {
  return PORCENTAJE_POR_FASE[fase] ?? null
}
