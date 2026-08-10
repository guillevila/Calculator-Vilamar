/**
 * Lateralidad — de qué ojo hablamos.
 *
 * OD (oculus dexter) es el ojo derecho; OS (oculus sinister), el izquierdo.
 * Son dos ojos distintos de la misma persona y sus datos NO son
 * intercambiables: mezclarlos es uno de los errores más caros que puede
 * cometer este programa, porque el resultado sigue pareciendo razonable.
 *
 * Por eso la lateralidad no es una etiqueta que se pone al final: viaja dentro
 * de cada medida, y las funciones del dominio comprueban que coincide.
 */
export type Lateralidad = 'OD' | 'OS'

export const LATERALIDADES: readonly Lateralidad[] = ['OD', 'OS'] as const

/** Nombre para enseñar en pantalla, en español. */
export function nombreLateralidad(lado: Lateralidad): string {
  return lado === 'OD' ? 'Ojo derecho (OD)' : 'Ojo izquierdo (OS)'
}

/** Nombre corto, para tablas. */
export function nombreCortoLateralidad(lado: Lateralidad): string {
  return lado === 'OD' ? 'OD' : 'OS'
}

export function esLateralidad(valor: unknown): valor is Lateralidad {
  return valor === 'OD' || valor === 'OS'
}

/**
 * Traduce las formas en que un informe puede nombrar el ojo.
 *
 * Devuelve `null` cuando no está claro. Adivinar aquí sería peor que no
 * responder: un informe que dice «R» puede ser «Right» o el principio de otra
 * palabra, y equivocarse significa calcular el ojo que no es.
 */
export function interpretarLateralidad(texto: string): Lateralidad | null {
  const t = texto.trim().toUpperCase()
  if (/^(OD|R|RIGHT|DERECHO|DCHO|DER|OCULUS DEXTER)$/.test(t)) return 'OD'
  if (/^(OS|OI|L|LEFT|IZQUIERDO|IZQDO|IZQ|OCULUS SINISTER)$/.test(t)) return 'OS'
  return null
}
