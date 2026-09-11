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
  /**
   * Lo ha puesto la aplicación como valor de partida, sin que nadie lo pida.
   *
   * Solo existe para campos QUIRÚRGICOS —una decisión del cirujano, no una
   * medida del aparato— donde hay un valor de partida habitual. No es MANUAL
   * —no lo ha escrito una persona— ni DERIVADO —no sale de una cuenta sobre
   * otros datos del caso—: es la propia aplicación proponiendo un punto de
   * partida que el cirujano puede dejar o cambiar.
   */
  | 'POR_DEFECTO'

export const NOMBRE_METODO: Readonly<Record<MetodoExtraccion, string>> = {
  TEXTO_PDF: 'Leído del texto del PDF',
  OCR: 'Reconocido de la imagen (OCR)',
  VISION: 'Leído por un modelo de visión',
  MANUAL: 'Escrito a mano',
  DERIVADO: 'Derivado de otros datos',
  POR_DEFECTO: 'Puesto por la aplicación como valor de partida',
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

/** Lo ha puesto la aplicación como valor de partida, no una persona ni una cuenta. */
export function esPorDefecto(p: Procedencia): boolean {
  return p.metodo === 'POR_DEFECTO'
}

/**
 * ¿Lo ha leído una máquina de una imagen, adivinando?
 *
 * Esta distinción es la más importante de este fichero, y está medida:
 *
 *   Sobre un informe convertido a PDF, el reconocimiento leyó **24.81 donde
 *   ponía 24.01, con un 93 % de fiabilidad**. En el mismo documento, un 24.07
 *   leído CORRECTAMENTE tenía un 79 %.
 *
 * O sea: **la fiabilidad que da el OCR no distingue lo correcto de lo
 * incorrecto.** No sirve como filtro, y por tanto el programa NO PUEDE saber si
 * un número reconocido es bueno.
 *
 * De ahí la regla: un dato leído por OCR o por visión nunca se presenta como
 * correcto. Se presenta como pendiente de comprobar, y hay que comprobarlo uno a
 * uno contra el informe. El texto nativo de un PDF es exacto y no necesita eso;
 * lo escrito a mano lo ha puesto una persona mirando.
 */
export function esLecturaAutomatica(p: Procedencia): boolean {
  return p.metodo === 'OCR' || p.metodo === 'VISION'
}

/**
 * ¿Tiene que mirar este dato una persona antes de que salga hacia una web?
 *
 * Son dos casos, y por motivos distintos:
 *
 *  - **Lo ha leído una máquina de una imagen** → puede estar mal y el programa
 *    no puede saberlo (ver arriba).
 *  - **Lo ha calculado el programa** → no está mal, pero **nadie lo ha visto**.
 *    Una ACD obtenida de AQD + CCT es aritmética correcta sobre dos números que
 *    quizá se leyeran mal, y va a las tres calculadoras. Que la cuenta sea
 *    exacta no la convierte en un dato revisado.
 *
 * Se separa de `esLecturaAutomatica` en vez de meter el derivado ahí porque una
 * cuenta NO es una lectura, y confundir las dos cosas haría que la pantalla
 * dijera «leído de la imagen» de algo que no se ha leído de ninguna parte.
 */
export function necesitaComprobacionHumana(p: Procedencia): boolean {
  return esLecturaAutomatica(p) || esDerivado(p)
}

export function procedenciaManual(cuando: string): Procedencia {
  return { metodo: 'MANUAL', registradoEn: cuando }
}

/** La procedencia de un valor que ha puesto la aplicación, no una persona. */
export function procedenciaPorDefecto(cuando: string): Procedencia {
  return { metodo: 'POR_DEFECTO', registradoEn: cuando }
}

// ═══════════════════════════════════════════════════════════════════════════
//  De dónde salió el valor, dicho como lo entiende una persona
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El origen de un dato, tal y como se le enseña a quien revisa.
 *
 * Es una lectura del estado del dato, no un campo que se guarde: se deduce de la
 * procedencia y de si hay un valor original conservado. Guardarlo aparte
 * permitiría que se desincronizara del dato al que describe.
 *
 * **El origen pertenece al VALOR, no al tipo de campo.** El mismo campo puede
 * venir del informe en un caso y escribirse a mano en otro. Un `TARGET
 * REFRACTION` impreso en el informe es DEL_INFORME aunque sea, conceptualmente,
 * una decisión del cirujano.
 *
 * Y es información **distinta de la validación**. Que un dato venga del informe
 * no dice si es correcto, si está confirmado o si está fuera de rango. Son dos
 * preguntas y se responden por separado.
 */
export type OrigenDato =
  /** Lo traía el documento: texto del PDF, OCR o modelo de visión. */
  | 'DEL_INFORME'
  /**
   * No lo traía el documento, pero se ha calculado con otros datos suyos.
   *
   * El ejemplo real es la ACD de un ANTERION que no la imprime: se obtiene
   * sumando su AQD y su grosor corneal. **No es lo mismo que «del informe»** —el
   * papel no lo dice— **ni que «aportado»** —no lo ha escrito una persona—, y
   * mezclarlo con cualquiera de los dos haría imposible auditar de dónde salió.
   * Siempre lleva escrita la cuenta que se hizo.
   */
  | 'DERIVADO_DEL_INFORME'
  /** No venía en el informe y lo ha escrito una persona. */
  | 'APORTADO'
  /** El informe traía un valor y una persona lo cambió. Se conserva el de antes. */
  | 'CORREGIDO'
  /**
   * No lo ha traído el informe ni lo ha escrito una persona: lo ha puesto la
   * aplicación como valor de partida, para un campo que decide el cirujano.
   */
  | 'POR_DEFECTO'
  /** No está en el informe y todavía nadie lo ha aportado. */
  | 'NO_CONSTA'

/**
 * Lo mínimo que hace falta para saber el origen de un dato.
 *
 * Se declara así, y no pidiendo una `Medida` entera, para que esta función viva
 * junto a la procedencia y no tenga que importar el módulo de medidas —que ya
 * importa este—. Evita una dependencia circular sin partir el concepto en dos.
 */
export interface DatoConOrigen {
  readonly procedencia: Procedencia
  /**
   * Lo que había antes, si había algo.
   *
   * Se declara como «algo o nada» y no con un tipo concreto porque a `origenDe`
   * solo le importa **si existe**, no qué es: sirve igual para una `Medida`
   * —cuyo original es un número— que para el sexo del caso —cuyo original es una
   * de dos opciones—. Fijar aquí `{ valor: number }` obligaba a que todo dato
   * corregible fuera numérico, y el sexo no lo es.
   */
  readonly original?: unknown
}

/**
 * De dónde salió este valor.
 *
 * `undefined` significa que el dato no está, que es exactamente NO_CONSTA: en
 * este modelo un dato ausente se representa por su ausencia, no por un valor
 * especial.
 */
export function origenDe(dato: DatoConOrigen | undefined): OrigenDato {
  if (!dato) return 'NO_CONSTA'
  // Un dato calculado tiene estado propio. No es «del informe» —el papel no lo
  // dice— ni «aportado» —no lo ha escrito nadie—, y decir cualquiera de las dos
  // cosas haría imposible saber después de dónde salió el número.
  //
  // Ojo al orden: esto va ANTES que la comprobación de `original`, pero después
  // de nada más. Si una persona corrige un dato derivado, `corregirMedida` deja
  // la procedencia en MANUAL y guarda la derivada como original, así que ese
  // caso no llega hasta aquí y sale como CORREGIDO, que es lo correcto.
  if (esDerivado(dato.procedencia)) return 'DERIVADO_DEL_INFORME'
  if (esMedido(dato.procedencia)) return 'DEL_INFORME'
  // Puesto por la aplicación, sin que nadie lo pidiera: ni informe, ni persona.
  if (esPorDefecto(dato.procedencia)) return 'POR_DEFECTO'
  // Manual. Lo que decide entre corregido y aportado es si pisó algo.
  return dato.original !== undefined ? 'CORREGIDO' : 'APORTADO'
}

/**
 * Cómo se llama cada origen en pantalla.
 *
 * `NO_CONSTA` no está aquí porque **tiene dos textos**, y cuál toca depende de
 * quién se espera que aporte el campo. Ver `textoDeOrigen`.
 */
export const TEXTO_ORIGEN: Readonly<Record<Exclude<OrigenDato, 'NO_CONSTA'>, string>> = {
  DEL_INFORME: 'Del informe',
  DERIVADO_DEL_INFORME: 'Derivado del informe',
  APORTADO: 'Aportado',
  CORREGIDO: 'Corregido',
  POR_DEFECTO: 'Valor por defecto (editable)',
}

/** Los dos textos posibles cuando no hay valor. */
export const TEXTO_NO_CONSTA = 'No consta en el informe'
export const TEXTO_PENDIENTE = 'Pendiente de aportar'

/**
 * El texto que ve el usuario para el origen de un campo.
 *
 * Cuando NO hay valor, el texto depende de **quién se espera que lo aporte**:
 *
 *  - Un dato que mide el aparato y no aparece → «No consta en el informe». Es
 *    información sobre el documento: ese informe no lo trae.
 *  - Un dato que decide el cirujano y no aparece → «Pendiente de aportar». No es
 *    un fallo de lectura; sencillamente todavía no lo ha puesto nadie.
 *
 * Esa diferencia es la que arregla el problema de fondo: hasta ahora los dos
 * casos decían «NO ENCONTRADO», y eso hacía parecer que el extractor había
 * fallado cuando muchas veces el dato simplemente no venía en el documento.
 *
 * Ojo: `loAportaElCirujano` describe **quién suele aportar el campo**, y solo se
 * usa para elegir el texto del hueco. No decide el origen de un valor que sí
 * existe — eso siempre sale del propio valor.
 */
export function textoDeOrigen(origen: OrigenDato, loAportaElCirujano: boolean): string {
  if (origen !== 'NO_CONSTA') return TEXTO_ORIGEN[origen]
  return loAportaElCirujano ? TEXTO_PENDIENTE : TEXTO_NO_CONSTA
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
