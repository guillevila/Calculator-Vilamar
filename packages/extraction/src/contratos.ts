/**
 * contratos.ts — Cómo se lee un documento, sin decir con qué.
 *
 * Aquí no hay ni OCR, ni PDF, ni ningún proveedor concreto. Solo la forma que
 * tiene un documento una vez leído y la interfaz que cumple cualquier cosa
 * capaz de leerlo.
 *
 * Existe por una razón práctica: hoy se lee el texto que trae el PDF dentro y
 * se reconoce lo demás con un OCR local. Mañana puede interesar un modelo de
 * visión, o una mezcla. Ese cambio tiene que poder hacerse sin tocar los
 * parsers de los aparatos ni el resto del programa.
 */

/**
 * Un trozo de texto con su sitio en la página.
 *
 * Las coordenadas van de 0 a 1 sobre el ancho y el alto de la página, no en
 * píxeles. Así siguen valiendo si la imagen se reescala o si el PDF viene con
 * otro tamaño, que es lo normal.
 *
 * Tener la POSICIÓN es lo que permite leer un informe a dos columnas sin
 * depender de que el texto salga en un orden concreto: el ojo derecho y el
 * izquierdo se distinguen por dónde están, no por el orden en que aparecen.
 */
export interface BloqueTexto {
  readonly texto: string
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
  /** De 0 a 1, si el proveedor la da. El texto nativo de un PDF no la tiene: es exacto. */
  readonly confianza?: number
}

export interface PaginaDocumento {
  /** Empieza en 1. */
  readonly numero: number
  /** Todo el texto de la página, en el orden en que lo dio el proveedor. */
  readonly texto: string
  /** Los trozos con su posición, si el proveedor sabe darlas. */
  readonly bloques: readonly BloqueTexto[]
}

export interface TextoDocumento {
  readonly paginas: readonly PaginaDocumento[]
  /** Qué proveedor lo leyó. Va a parar a la procedencia de cada dato. */
  readonly proveedor: string
  /** Cómo se leyó, para la procedencia. */
  readonly metodo: 'TEXTO_PDF' | 'OCR' | 'VISION'
  /** Media de confianza, si el método la produce. El texto nativo no la tiene. */
  readonly confianzaMedia?: number
  /** Avisos del proveedor: «el PDF no traía texto», «la imagen está muy borrosa»… */
  readonly avisos: readonly string[]
}

/** Lo que se le entrega a un proveedor para que lo lea. */
export interface DocumentoEntrada {
  readonly id: string
  readonly nombre: string
  readonly formato: 'pdf' | 'jpg' | 'jpeg' | 'png'
  /** El contenido en crudo. El dominio nunca lo ve. */
  readonly datos: Uint8Array
}

/**
 * Cualquier cosa capaz de convertir un documento en texto con posiciones.
 *
 * Es la pieza que se sustituye para cambiar de tecnología de lectura. Un
 * proveedor NO interpreta datos clínicos: solo devuelve lo que pone y dónde.
 * Decidir que «24.07» es una longitud axial es cosa de los parsers.
 */
export interface ProveedorExtraccion {
  readonly nombre: string
  /** Si este proveedor sabe leer ese formato. */
  puedeCon(documento: DocumentoEntrada): boolean
  extraer(documento: DocumentoEntrada): Promise<TextoDocumento>
}

/**
 * Lee el texto que un PDF ya trae dentro. Lo implementa la aplicación, porque
 * necesita una librería de PDF.
 */
export interface LectorPdf {
  /** Devuelve una página por cada página del PDF. */
  leer(datos: Uint8Array): Promise<readonly PaginaDocumento[]>
  /** Convierte una página del PDF en imagen, para poder pasarle el OCR. */
  rasterizar(datos: Uint8Array, pagina: number, escala: number): Promise<Uint8Array>
  /** Cuántas páginas tiene. */
  numeroDePaginas(datos: Uint8Array): Promise<number>
}

/** Un motor de reconocimiento de texto sobre imagen. */
export interface MotorOcr {
  readonly nombre: string
  reconocer(imagen: Uint8Array): Promise<{
    readonly texto: string
    readonly bloques: readonly BloqueTexto[]
    readonly confianzaMedia: number
  }>
}

/**
 * Cuánto texto hace falta para dar por bueno que un PDF «trae texto».
 *
 * Muchos informes de biometría son un PDF con una imagen dentro y cuatro
 * palabras de cabecera. Si se diera por bueno ese texto, el OCR no llegaría a
 * ejecutarse nunca y el informe saldría vacío sin explicación.
 */
export const MINIMO_CARACTERES_TEXTO_NATIVO = 120
