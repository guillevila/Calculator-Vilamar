/**
 * navegador.ts — Abre el navegador que usan las calculadoras (EVO/Barrett/Kane).
 *
 * Mismo patrón que ya usa la app de escritorio (`apps/desktop/src/main/index.ts`,
 * `abrirNavegador`): perfil persistente, para que las cookies y la sesión —
 * incluida la aceptación de las condiciones de Kane— sobrevivan entre
 * cálculos. Ese perfil no sale nunca de esta máquina.
 *
 * ⚠️ **Limitación conocida, sin resolver hoy**: aquí siempre se abre sin
 * cabeza (`headless: true`) — un servidor no tiene pantalla. La primera vez
 * que una calculadora pida un gesto humano visible (Kane, aceptar sus
 * condiciones de licencia) no hay quien lo vea ni lo pulse. En la app de
 * escritorio eso se resuelve abriendo una ventana real (`conVentana`); en un
 * servidor hace falta otra solución —por ejemplo, un escritorio remoto al
 * VPS solo para ese primer clic— que no se resuelve en esta sesión. Por eso
 * se avisa por consola si alguien pide `conVentana: true`, en vez de fingir
 * que se ha abierto una ventana que nadie puede ver.
 */

import type { Browser } from 'playwright'

export async function abrirNavegadorServidor(conVentana: boolean, perfil: string): Promise<Browser> {
  if (conVentana) {
    console.warn(
      '[navegador] Se ha pedido una ventana visible, pero el servidor no tiene pantalla — sigue sin cabeza. Ver la cabecera de navegador.ts.',
    )
  }

  const { chromium } = await import('playwright')
  const contexto = await chromium.launchPersistentContext(perfil, {
    headless: true,
    viewport: { width: 1500, height: 1050 },
  })

  // Mismo envoltorio que la app de escritorio, y por el mismo motivo medido
  // ahí: `contexto.browser()` existe pero su `newContext()` no hereda el
  // perfil persistente. Ver el comentario completo en
  // `apps/desktop/src/main/index.ts`, función `abrirNavegador`.
  return {
    newContext: async () => contexto,
    contexts: () => [contexto],
    close: async () => contexto.close(),
    isConnected: () => true,
  } as unknown as Browser
}
