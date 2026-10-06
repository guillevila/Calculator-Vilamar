/**
 * doctor.ts — La agenda de doctores, para no tener que preguntar su SIA cada vez.
 *
 * No es un dato del CASO (como el nombre del cirujano en `caso.nombreCirujano`,
 * que es libre y puede no coincidir con nadie guardado aquí): es una lista aparte,
 * que vive fuera de cualquier caso concreto (D80, 15/09/2026, petición expresa
 * del dueño del proyecto). El SIA y el eje de incisión suelen ser los mismos en
 * todos los casos de un mismo cirujano — dependen de SU técnica, no del paciente
 * — así que guardarlos una vez y aplicarlos al elegir el doctor evita
 * preguntárselo, o dudar de memoria, en cada caso nuevo.
 *
 * `sia`/`ejeIncision` en `null` significa «todavía no se ha guardado el suyo» —
 * un doctor recién añadido puede quedarse así; elegirlo entonces solo pone su
 * nombre y no toca los valores de partida de siempre (D38: 0.25 D y 135°).
 */

export interface Doctor {
  readonly id: string
  readonly nombre: string
  readonly sia: number | null
  readonly ejeIncision: number | null
}

export function doctorVacio(id: string, nombre: string): Doctor {
  return { id, nombre, sia: null, ejeIncision: null }
}
