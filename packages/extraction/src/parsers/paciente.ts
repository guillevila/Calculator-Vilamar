/**
 * paciente.ts — Los dos datos del informe que no son del ojo.
 *
 * Aquí se leen el **sexo** y el **nombre**, y los dos tienen historia:
 *
 *  - El **sexo** lo pide una de las calculadoras en su formulario. Otra no lo tiene —comprobado el
 *    12/08/2026: 36 campos y ninguno—, y la tercera tampoco.
 *  - El **nombre** entra en el programa por una decisión expresa del dueño del
 *    proyecto (12/08/2026): **deducir de él el sexo** cuando el informe no lo
 *    imprime.
 *
 * ⚠️ **El nombre es el único dato identificativo que este programa lee.** Antes
 * no leía ninguno. Las reglas que lo rodean no se relajan:
 *
 *  - No sale del ordenador: a las calculadoras se les manda el código local
 *    del caso (D23), nunca esto.
 *  - No sale en el PDF, y hay un test que lo comprueba.
 *  - No entra en el repositorio: los fixtures son sintéticos.
 *
 * Se lee del documento COMPLETO y no de los trozos por ojo, por lo mismo que la
 * tabla de lentes: una persona no tiene un nombre por ojo.
 */

import type { Sexo } from '@vilamar/domain'
import { interpretarSexo } from '@vilamar/domain'

export interface DatosDePaciente {
  readonly sexo?: Sexo
  /** La línea literal de la que salió el sexo. Es su evidencia. */
  readonly evidenciaSexo?: string
  readonly nombre?: string
  readonly evidenciaNombre?: string
}

/**
 * Cómo escriben el sexo los informes.
 *
 * **Los dos puntos son OPCIONALES**, y eso importa: el informe con el que se
 * probó esto es español y está en columnas, así que pone `Sexo   Femenino` con
 * espacios y sin ningún separador. Exigiendo los dos puntos no se leía, el caso
 * se quedaba sin sexo y una de las calculadoras no podía calcular.
 *
 * Aflojar el separador sería peligroso si no fuera por lo siguiente: la palabra
 * que se captura **tiene que ser reconocible** por `interpretarSexo`. Si detrás
 * de «Sexo» hay cualquier otra cosa, no se traduce y el campo se queda vacío —
 * traducir mal un dato cerrado es peor que no leerlo—. Eso es lo que hace que
 * admitir un espacio no abra la puerta a cualquier palabra.
 */
const PATRONES_SEXO: readonly RegExp[] = [
  /\bSex\s*[:=]?\s+([A-Za-zäöüÄÖÜ]+)/i,
  /\bGender\s*[:=]?\s+([A-Za-zäöüÄÖÜ]+)/i,
  /\bSexo\s*[:=]?\s+([A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+)/i,
]

/**
 * Cómo escriben el nombre.
 *
 * Se exige DOS PUNTOS después de la etiqueta a propósito: sin ellos, «Patient
 * Data» o «Name of the device» se llevarían por delante media cabecera. Y se
 * corta en el salto de línea, para no arrastrar el resto de la fila.
 */
const PATRONES_NOMBRE: readonly RegExp[] = [
  /\bPatient\s*Name\s*[:=]\s*([^\n\r|]{2,60})/i,
  /\bNombre\s*(?:del\s*)?paciente\s*[:=]\s*([^\n\r|]{2,60})/i,
  /\bPatient\s*[:=]\s*([^\n\r|]{2,60})/i,
  /\bName\s*[:=]\s*([^\n\r|]{2,60})/i,
]

/** Lo que NO es un nombre de persona aunque aparezca detrás de la etiqueta. */
const NO_ES_UN_NOMBRE =
  /^\s*(?:n\/?a|none|unknown|desconocido|an[oó]nimo|anonymous|test|demo|-+|_+|\d+)\s*$/i

export function extraerDatosDePaciente(texto: string): DatosDePaciente {
  const salida: {
    sexo?: Sexo
    evidenciaSexo?: string
    nombre?: string
    evidenciaNombre?: string
  } = {}

  for (const patron of PATRONES_SEXO) {
    const m = patron.exec(texto)
    if (!m?.[1]) continue
    const sexo = interpretarSexo(m[1])
    // Reconocida la etiqueta pero no el valor: se para. Probar el siguiente
    // patrón podría emparejar otra etiqueta y dar un sexo de otro sitio.
    if (sexo === null) break
    salida.sexo = sexo
    salida.evidenciaSexo = m[0].trim()
    break
  }

  for (const patron of PATRONES_NOMBRE) {
    const m = patron.exec(texto)
    if (!m?.[1]) continue
    const nombre = m[1].trim().replace(/\s{2,}/g, ' ')
    if (nombre === '' || NO_ES_UN_NOMBRE.test(nombre)) continue
    // Tiene que parecer un nombre: al menos dos letras seguidas.
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2}/.test(nombre)) continue
    salida.nombre = nombre
    salida.evidenciaNombre = m[0].trim()
    break
  }

  return salida
}
