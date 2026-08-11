/**
 * documento.ts — Los ficheros que sube el usuario y el aparato que los generó.
 *
 * Un detalle que parece menor y no lo es: subir dos ficheros a la vez NO
 * significa que sean del mismo paciente. Aquí no se asume ninguna relación
 * entre documentos; si el programa cree que dos informes van juntos, tiene que
 * decir por qué y una persona tiene que confirmarlo.
 */

import type { Lateralidad } from './lateralidad.js'

export type TipoDocumento = 'PDF' | 'IMAGEN'

export type FormatoDocumento = 'pdf' | 'jpg' | 'jpeg' | 'png'

export const FORMATOS_ADMITIDOS: readonly FormatoDocumento[] = ['pdf', 'jpg', 'jpeg', 'png']

export function formatoDeNombre(nombre: string): FormatoDocumento | null {
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  return (FORMATOS_ADMITIDOS as readonly string[]).includes(ext) ? (ext as FormatoDocumento) : null
}

/**
 * Los aparatos que el programa sabe reconocer.
 *
 * `DESCONOCIDO` no es un fallo: es una respuesta legítima. Cuando no se
 * reconoce el aparato, se lee lo que se pueda con reglas genéricas y se dice
 * claramente que no se ha reconocido, en lugar de fingir que sí.
 */
export type Dispositivo = 'ANTERION' | 'IOLMASTER_700' | 'PENTACAM' | 'DESCONOCIDO'

export const NOMBRE_DISPOSITIVO: Readonly<Record<Dispositivo, string>> = {
  ANTERION: 'Heidelberg ANTERION',
  IOLMASTER_700: 'ZEISS IOLMaster 700',
  PENTACAM: 'OCULUS Pentacam',
  DESCONOCIDO: 'Informe no reconocido',
}

export interface DispositivoDetectado {
  readonly dispositivo: Dispositivo
  /** De 0 a 1. Cuánto encaja el documento con la plantilla de ese aparato. */
  readonly confianza: number
  /** Qué se encontró en el documento para decidirlo. Sirve para depurar. */
  readonly indicios: readonly string[]
}

/**
 * Un documento cargado por el usuario.
 *
 * `contenido` NO vive aquí: el dominio no toca ficheros. Solo se guarda lo
 * necesario para identificarlo y para poder auditar de dónde salió cada dato.
 */
export interface DocumentoCargado {
  readonly id: string
  /** Nombre del fichero tal cual lo subió el usuario. */
  readonly nombre: string
  readonly tipo: TipoDocumento
  readonly formato: FormatoDocumento
  readonly tamanoBytes: number
  /** Número de páginas. 1 para una imagen. */
  readonly paginas: number
  readonly cargadoEn: string
  readonly dispositivoDetectado?: DispositivoDetectado
  /**
   * Qué ojos dice contener este documento. Puede ser uno, los dos o ninguno
   * si no se ha podido determinar.
   */
  readonly ojosDetectados: readonly Lateralidad[]
  /** Si el documento no se pudo leer, por qué. En lenguaje normal. */
  readonly problema?: string
}
