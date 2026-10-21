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

// ── Una fila de «Calcular» ──────────────────────────────────────────────────

/** La tanda de cálculo en marcha: desde cuándo y con qué calculadoras y ojo. */
export interface TandaEnMarcha {
  readonly desde: number
  readonly calculadoras?: readonly string[]
  readonly ojo?: string
}

export interface EntradaDeFila {
  readonly clave: string
  readonly ojo: string
  /** Lo que el caso tiene guardado de esta calculadora y ojo, sea de cuando sea. */
  readonly resultado?: {
    readonly estado: string
    readonly mensaje?: string | undefined
    readonly obtenidoEn: string
  }
  /** El último aviso de progreso de esta calculadora y ojo, de la tanda actual. */
  readonly progreso?: {
    readonly fase: string
    readonly mensaje: string
    readonly requiereUsuario: boolean
  }
  readonly ocupado: boolean
  readonly tanda: TandaEnMarcha | null
  /** El texto de un estado sin mensaje propio (`textoEstado` del dominio). */
  readonly textoDeEstado: (estado: string) => string
}

export interface FilaDeCalculo {
  readonly clase: '' | 'exito' | 'requiere-usuario' | 'fallo'
  readonly marca: string
  readonly detalle: string
  /** `undefined` = sin barra; `null` = no se puede saber (espera a la persona). */
  readonly porcentaje: number | null | undefined
  readonly tono: 'normal' | 'exito' | 'atencion'
  /** Hay un resultado de ESTA tanda (o no hay tanda): vale para decidir si ya salió. */
  readonly hayResultadoVigente: boolean
  /** Ese resultado vigente no es un éxito: se puede reintentar. */
  readonly sePuedeReintentar: boolean
}

/**
 * Cómo se pinta una fila de «Calcular» (21/10/2026, fallo real del dueño: al
 * volver a calcular, todas las calculadoras salían «Completado» desde el primer
 * segundo, con el resultado de la tanda ANTERIOR).
 *
 * Reglas:
 *  - Un resultado guardado ANTES de que empezara la tanda en marcha, de una
 *    calculadora que SÍ está en esa tanda, no cuenta: la fila vuelve a «En cola»
 *    y va avanzando con los avisos reales de progreso hasta que llegue el nuevo.
 *  - Una calculadora que NO está en la tanda conserva su resultado de antes, dicho
 *    como tal y sin barra.
 *  - Sin tanda en marcha, cada resultado guardado vale tal cual.
 */
export function estadoDeFila(e: EntradaDeFila): FilaDeCalculo {
  const { resultado, progreso, ocupado, tanda } = e
  const enLaTanda =
    ocupado &&
    tanda !== null &&
    (tanda.calculadoras === undefined || tanda.calculadoras.includes(e.clave)) &&
    (tanda.ojo === undefined || tanda.ojo === e.ojo)

  // De una tanda anterior: ocurrió antes de que empezara la actual.
  const esDeTandaAnterior =
    enLaTanda && resultado !== undefined && Date.parse(resultado.obtenidoEn) < tanda.desde
  const vigente = esDeTandaAnterior ? undefined : resultado

  const sinResultado = (): FilaDeCalculo => {
    if (progreso) {
      const espera = progreso.requiereUsuario
      return {
        clase: espera ? 'requiere-usuario' : '',
        marca: espera ? '!' : '…',
        detalle: progreso.mensaje,
        porcentaje: espera ? null : porcentajeDeFase(progreso.fase),
        tono: espera ? 'atencion' : 'normal',
        hayResultadoVigente: false,
        sePuedeReintentar: false,
      }
    }
    return {
      clase: '',
      marca: '·',
      detalle: ocupado ? 'En cola' : 'Pendiente',
      porcentaje: ocupado ? 0 : undefined,
      tono: 'normal',
      hayResultadoVigente: false,
      sePuedeReintentar: false,
    }
  }

  // Con la aplicación calculando, una calculadora fuera de la tanda enseña su resultado de antes.
  if (ocupado && tanda !== null && !enLaTanda && resultado !== undefined) {
    return {
      clase: 'exito',
      marca: '✓',
      detalle: 'Resultado de antes (no se vuelve a calcular)',
      porcentaje: undefined,
      tono: 'normal',
      hayResultadoVigente: true,
      sePuedeReintentar: resultado.estado !== 'SUCCESS',
    }
  }
  if (!vigente) return sinResultado()

  if (vigente.estado === 'SUCCESS') {
    return {
      clase: 'exito',
      marca: '✓',
      detalle: 'Completado',
      porcentaje: 100,
      tono: 'exito',
      hayResultadoVigente: true,
      sePuedeReintentar: false,
    }
  }
  if (vigente.estado === 'PARTIAL') {
    return {
      clase: 'exito',
      marca: '~',
      detalle: vigente.mensaje ?? 'Completado, con el resultado incompleto',
      porcentaje: 100,
      tono: 'exito',
      hayResultadoVigente: true,
      sePuedeReintentar: true,
    }
  }
  if (vigente.estado === 'NEEDS_USER_ACTION') {
    return {
      clase: 'requiere-usuario',
      marca: '!',
      detalle: vigente.mensaje ?? e.textoDeEstado(vigente.estado),
      porcentaje: null,
      tono: 'atencion',
      hayResultadoVigente: true,
      sePuedeReintentar: true,
    }
  }
  return {
    clase: 'fallo',
    marca: '✕',
    detalle: vigente.mensaje ?? e.textoDeEstado(vigente.estado),
    porcentaje: undefined,
    tono: 'normal',
    hayResultadoVigente: true,
    sePuedeReintentar: true,
  }
}
