/**
 * navegador.ts — Abre el navegador que usan las calculadoras (EVO/Barrett/Kane).
 *
 * Mismo patrón que ya usa la app de escritorio (`apps/desktop/src/main/index.ts`,
 * `abrirNavegador`): perfil persistente, para que las cookies y la sesión —
 * incluida la aceptación de las condiciones de Kane— sobrevivan entre
 * cálculos. Ese perfil no sale nunca de esta máquina.
 *
 * `conVentana` se respeta de verdad (20/09/2026, corrige el primer esqueleto
 * del 20/09/2026 que lo ignoraba y siempre abría sin cabeza): Barrett lo pide
 * siempre (`requiereNavegadorVisible`, ver `barrett.ts` — con el navegador
 * SIN cabeza, el iframe de la calculadora ni siquiera llega a cargar, medido
 * en vivo) y Kane lo pide para su primer acuerdo de licencia.
 *
 * ⚠️ **«Ventana visible» no significa «hay un monitor delante»**: en este
 * ordenador (con sesión de escritorio de verdad) funciona sin más. En un VPS
 * Linux sin monitor hace falta darle una PANTALLA VIRTUAL (`Xvfb` u
 * equivalente, `DISPLAY` apuntando a ella) — es la forma estándar de que un
 * navegador «con ventana» corra en un servidor sin pantalla física; Chromium
 * sigue siendo exactamente el mismo navegador, solo que nadie mira esa
 * pantalla en directo. Sin eso, `chromium.launchPersistentContext` con
 * `headless: false` falla al arrancar. Queda pendiente para cuando este
 * servidor se despliegue de verdad en el VPS — no se resuelve en esta sesión.
 *
 * Lo que esto NO resuelve, y no puede resolver un cambio de código: la
 * aceptación de las condiciones de Kane, y cualquier comprobación anti-robot
 * que le acompañe, la tiene que hacer una PERSONA viendo la pantalla en el
 * momento — con pantalla virtual, eso exige un escritorio remoto (VNC o
 * similar) al VPS solo para ese primer clic. Ver `docs/PLAN-APP-MOVIL.md`.
 */

import type { Browser } from 'playwright'

export async function abrirNavegadorServidor(conVentana: boolean, perfil: string): Promise<Browser> {
  const { chromium } = await import('playwright')
  const contexto = await chromium.launchPersistentContext(perfil, {
    headless: !conVentana,
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
