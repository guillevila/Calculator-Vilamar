/**
 * procedencia.ts — De dónde salió cada dato.
 *
 * En este programa un número nunca viaja solo. Siempre lleva pegado de dónde
 * vino, quién lo puso y si una persona lo ha mirado. Sin eso, el informe final
 * no se podría auditar y la pantalla de revisión no podría distinguir lo que
 * leyó el ordenador de lo que escribió el cirujano.
 */

/** Cómo llegó el dato al programa. */
export type MetodoExtraccion =
  /** El PDF traía el texto dentro y se ha leído tal cual. */
  | 'TEXTO_PDF'
  /** Se ha reconocido sobre una imagen (OCR). */
  | 'OCR'
  /** Lo ha leído un modelo de visión. */
  | 'VISION'
  /** Lo ha escrito una persona. */
  | 'MANUAL'
  /** Se ha calculado a partir de otros datos. Siempre declarado, nunca oculto. */
  | 'DERIVADO'

export const NOMBRE_METODO: Readonly<Record<MetodoExtraccion, string>> = {
  TEXTO_PDF: 'Leído del texto del PDF',
  OCR: 'Reconocido de la imagen (OCR)',
  VISION: 'Leído por un modelo de visión',
  MANUAL: 'Escrito a mano',
  DERIVADO: 'Derivado de otros datos',
}

/**
 * El rastro que permite volver al sitio exacto del que salió un número.
 *
 * `texto` es lo que se leyó literalmente, antes de interpretarlo. Guardarlo es
 * lo que permite que la pantalla de revisión enseñe «he leído esto» en lugar de
 * «créeme».
 */
export interface EvidenciaExtraccion {
  /** El trozo de texto tal cual apareció: «AL: 24.07 mm». */
  readonly texto: string
  /** Página del documento, empezando en 1. */
  readonly pagina?: number
  /**
   * Dónde estaba en la página, en proporción del ancho y alto (0–1). Se guarda
   * en proporción y no en píxeles para que siga valiendo si la imagen se
   * reescala.
   */
  readonly region?: {
    readonly x: number
    readonly y: number
    readonly ancho: number
    readonly alto: number
  }
  /** Qué regla o plantilla lo reconoció. Sirve para arreglar un parser que falle. */
  readonly regla?: string
}

/**
 * Un dato derivado no es una medida. Esta estructura obliga a decir de qué se
 * derivó y con qué criterio, para que nunca se confunda con algo medido.
 */
export interface Derivacion {
  readonly deCampos: readonly string[]
  /** En lenguaje normal: «AQD = ACD − CCT». */
  readonly explicacion: string
}

export interface Procedencia {
  readonly metodo: MetodoExtraccion
  /** Identificador del documento del que salió, si salió de uno. */
  readonly documentoId?: string
  /** Aparato que generó el informe, si se ha podido reconocer. */
  readonly dispositivoId?: string
  /**
   * Cuánto se fía el extractor de lo que leyó, de 0 a 1.
   *
   * Solo existe cuando el método la produce de verdad. Un dato escrito a mano
   * no tiene confianza: tiene autor. Inventar aquí un 1.0 para que la pantalla
   * quede bonita sería exactamente la clase de dato falso que este programa
   * existe para evitar.
   */
  readonly confianza?: number
  readonly evidencia?: EvidenciaExtraccion
  readonly derivacion?: Derivacion
  /** Cuándo entró el dato. ISO 8601. */
  readonly registradoEn: string
}

/** Lo escribió una persona. */
export function esManual(p: Procedencia): boolean {
  return p.metodo === 'MANUAL'
}

/** Lo midió un aparato y lo leyó el programa. */
export function esMedido(p: Procedencia): boolean {
  return p.metodo === 'TEXTO_PDF' || p.metodo === 'OCR' || p.metodo === 'VISION'
}

/** Se calculó a partir de otros datos. */
export function esDerivado(p: Procedencia): boolean {
  return p.metodo === 'DERIVADO'
}

export function procedenciaManual(cuando: string): Procedencia {
  return { metodo: 'MANUAL', registradoEn: cuando }
}

/**
 * Describe la procedencia en una frase, para la pantalla y para el PDF.
 */
export function describirProcedencia(p: Procedencia): string {
  const base = NOMBRE_METODO[p.metodo]
  if (p.metodo === 'DERIVADO' && p.derivacion) return `${base}: ${p.derivacion.explicacion}`
  if (p.confianza !== undefined) return `${base} · fiabilidad ${Math.round(p.confianza * 100)} %`
  return base
}
