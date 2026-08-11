/**
 * api.ts — El puente que expone el preload, con tipos.
 *
 * Si `window.vilamar` no existiera, la interfaz está corriendo fuera de
 * Electron y lo dice claramente en lugar de fallar con un «undefined» a media
 * pantalla.
 */

import type { ApiVilamar } from '../compartido/ipc.js'

declare global {
  interface Window {
    readonly vilamar?: ApiVilamar
  }
}

export function api(): ApiVilamar {
  const puente = window.vilamar
  if (!puente) {
    throw new Error(
      'Calculator Vilamar no se está ejecutando dentro de su aplicación. Arráncala con «pnpm dev».',
    )
  }
  return puente
}

export function hayApi(): boolean {
  return typeof window !== 'undefined' && window.vilamar !== undefined
}
