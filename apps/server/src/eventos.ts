/**
 * eventos.ts — Avisos hacia quien esté mirando, en vez de IPC de Electron.
 *
 * La app de escritorio manda `EstadoCalculo`/`Caso` a la interfaz con
 * `ventana.webContents.send(...)`, y el lado React escucha con
 * `ipcRenderer.on(...)` (ver `apps/desktop/src/compartido/ipc.ts`,
 * `alProgresar`/`alCambiarCaso`). Un servidor no tiene ese canal: aquí el
 * mismo aviso se guarda en un `EventEmitter` en memoria, y `GET /eventos`
 * (`servidor.ts`) lo reenvía a quien esté conectado por Server-Sent Events
 * — más simple que WebSocket para avisos en un solo sentido.
 *
 * Con un único caso en memoria a la vez (igual que la app de escritorio
 * hoy — el login y el aislamiento por persona son la Fase 2 del plan
 * móvil), no hace falta distinguir de quién es cada aviso todavía.
 */

import { EventEmitter } from 'node:events'

import type { Caso } from '@vilamar/domain'
import type { EstadoCalculo } from '@vilamar/casos'

export const EVENTO_PROGRESO = 'progreso'
export const EVENTO_CASO = 'caso'

export interface EmisorEventos {
  readonly emitirProgreso: (estado: EstadoCalculo) => void
  readonly emitirCaso: (caso: Caso) => void
  readonly suscribir: (
    escucha: (evento: { readonly tipo: 'progreso'; readonly datos: EstadoCalculo } | { readonly tipo: 'caso'; readonly datos: Caso }) => void,
  ) => () => void
}

export function crearEmisorEventos(): EmisorEventos {
  const emisor = new EventEmitter()
  // Puede haber varias pestañas/dispositivos escuchando el mismo caso.
  emisor.setMaxListeners(0)

  return {
    emitirProgreso: (estado) => emisor.emit(EVENTO_PROGRESO, estado),
    emitirCaso: (caso) => emisor.emit(EVENTO_CASO, caso),
    suscribir: (escucha) => {
      const alProgreso = (estado: EstadoCalculo): void => escucha({ tipo: 'progreso', datos: estado })
      const alCaso = (caso: Caso): void => escucha({ tipo: 'caso', datos: caso })
      emisor.on(EVENTO_PROGRESO, alProgreso)
      emisor.on(EVENTO_CASO, alCaso)
      return () => {
        emisor.off(EVENTO_PROGRESO, alProgreso)
        emisor.off(EVENTO_CASO, alCaso)
      }
    },
  }
}
