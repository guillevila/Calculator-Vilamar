/**
 * laboratorio.ts — A qué email se pide cada lente, según su fabricante (D93,
 * 20/09/2026).
 *
 * Vive fuera de cualquier caso concreto, igual que la agenda de doctores
 * (D80): el email del laboratorio de Bausch & Lomb es el mismo para todos
 * los casos, no algo que se vuelva a escribir cada vez. Petición expresa del
 * dueño del proyecto: el email varía según el FABRICANTE de la lente, no es
 * uno solo fijo para todo — por eso es una lista, no un único ajuste.
 */

export interface Laboratorio {
  readonly id: string
  readonly fabricante: string
  readonly email: string
}

export function laboratorioVacio(id: string, fabricante: string, email: string): Laboratorio {
  return { id, fabricante, email }
}
