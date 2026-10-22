/**
 * aspecto.ts — Qué aspecto tiene la aplicación: el de siempre («actual») o el
 * «nuevo», de la misma familia que la web Resumen Calculadores (23/10/2026,
 * petición del dueño). Se recuerda entre sesiones en este ordenador.
 *
 * Es solo una preferencia de aspecto: nunca afecta a los datos ni a las funciones.
 * Si el almacenamiento del navegador no está disponible, se usa «actual».
 */

export type Aspecto = 'actual' | 'familia'

const CLAVE = 'vilamar.aspecto'

export function leerAspecto(): Aspecto {
  try {
    return window.localStorage.getItem(CLAVE) === 'familia' ? 'familia' : 'actual'
  } catch {
    return 'actual'
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
