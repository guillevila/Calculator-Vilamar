/**
 * tipos.ts — Los tipos propios de `ServicioCasos` que antes vivían en
 * `apps/desktop/src/compartido/ipc.ts`.
 *
 * Se movieron aquí junto al servicio (20/09/2026, Fase 1 del plan móvil,
 * `docs/PLAN-APP-MOVIL.md`) porque son parte de su contrato público, no del
 * IPC de Electron en sí — un servidor Node que use `ServicioCasos` los
 * necesita igual, sin saber nada de canales ni de `ipcRenderer`.
 * `apps/desktop/src/compartido/ipc.ts` los reexporta desde aquí para que
 * nada más en la app de escritorio tenga que cambiar su import.
 */

import type { Calculadora, EstadoCaso, Lateralidad } from '@vilamar/domain'

/**
 * Un fichero que se va a leer. Llega por RUTA o, si no hay ruta, por contenido.
 *
 * Se admiten los dos caminos porque ninguno funciona siempre:
 *
 *  - **La ruta** es lo preferible: quien tiene `ServicioCasos` lee el fichero
 *    una sola vez, donde tiene acceso al disco, y no se copia nada de más.
 *  - **El contenido** hace falta cuando no hay ruta en disco —un fichero
 *    arrastrado a la ventana de Electron, o subido desde un formulario web—.
 *    Un `Uint8Array` es un camino perfectamente válido; solo copia datos de
 *    más.
 *
 * Exactamente uno de los dos tiene que venir.
 */
export interface ArchivoEntrante {
  readonly nombre: string
  readonly ruta?: string
  readonly datos?: Uint8Array
}

export interface ResumenExtraccion {
  readonly documentoId: string
  readonly nombreArchivo: string
  readonly dispositivo: string
  readonly nombreDispositivo: string
  readonly confianzaDispositivo: number
  readonly explicacionOjos: string
  readonly ojosEncontrados: readonly Lateralidad[]
  readonly avisos: readonly string[]
}

/**
 * Lo mínimo de un caso guardado para poder elegirlo en una lista, sin tener
 * que cargarlo entero (02/09/2026: «Casos guardados», para volver a abrir
 * uno después de cerrar la aplicación).
 */
export interface ResumenCasoGuardado {
  readonly codigo: string
  readonly estado: EstadoCaso
  readonly actualizadoEn: string
  /** Si el caso lo tiene — nunca sale de este ordenador (D44), y aquí tampoco. */
  readonly nombrePaciente?: string
}

export interface EstadoCalculo {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly fase: string
  readonly mensaje: string
  readonly requiereUsuario: boolean
}
