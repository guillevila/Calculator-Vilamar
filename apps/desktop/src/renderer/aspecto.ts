/**
 * aspecto.ts — Qué aspecto tiene la aplicación: el de siempre («actual») o el
 * «nuevo», de la misma familia que la web Resumen Calculadores (23/10/2026,
 * petición del dueño). El nuevo es el de partida; se puede volver al de siempre con
 * el botón «Aspecto» de la barra, y se recuerda entre sesiones en este ordenador.
 *
 * Es solo una preferencia de aspecto: nunca afecta a los datos ni a las funciones.
 * Si el almacenamiento del navegador no está disponible, se usa el nuevo.
 */

export type Aspecto = 'actual' | 'familia'

const CLAVE = 'vilamar.aspecto'

export function leerAspecto(): Aspecto {
  try {
    // El nuevo es el de partida (23/10/2026); solo se vuelve al de siempre si se eligió.
    return window.localStorage.getItem(CLAVE) === 'actual' ? 'actual' : 'familia'
  } catch {
    return 'familia'
  }
}

/** Pone el aspecto en la ventana y lo recuerda. */
export function aplicarAspecto(aspecto: Aspecto): void {
  if (aspecto === 'familia') document.documentElement.dataset['aspecto'] = 'familia'
  else delete document.documentElement.dataset['aspecto']
  try {
    window.localStorage.setItem(CLAVE, aspecto)
  } catch {
    // sin almacenamiento: se aplica igual en esta sesión
  }
}
