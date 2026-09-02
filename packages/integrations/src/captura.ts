/**
 * captura.ts — Fotografía la pantalla de resultado, sin decidir dónde se guarda.
 *
 * Los tres adaptadores llaman a esto en el mismo punto: justo antes de
 * devolver un resultado de éxito o parcial. Vive fuera de `adapters/` porque
 * no sabe nada de HTML de ninguna web: solo pide una foto de lo que haya en
 * pantalla ahora.
 *
 * Si la captura falla —el navegador ya no responde, por ejemplo— no se lanza
 * ninguna excepción: un resultado ya leído no se puede perder por no haberle
 * podido hacer una foto.
 *
 * ⚠️ **Varios intentos, no uno.** Investigado a fondo con Kane (02/09/2026,
 * varios casos reales): `page.screenshot()` de Playwright, sobre Chromium
 * headless, a veces devuelve un fotograma que no refleja el último cambio
 * del DOM —una tabla con datos de verdad sale en blanco en la foto—, y esto
 * pasa de forma inconsistente entre ejecuciones idénticas. Se probaron
 * varias técnicas para forzar UN solo intento correcto —esperar más
 * tiempo, forzar un reflow, un evento de ratón real, un scroll real— y
 * ninguna lo garantiza siempre. En vez de perseguir la técnica perfecta,
 * se toman varias fotos seguidas y se guarda la que **pesa más**: una
 * región en blanco comprime a un PNG mucho más pequeño que la misma
 * región con una tabla llena de texto y líneas, así que el tamaño del
 * fichero es una señal barata y fiable de cuál salió con contenido de
 * verdad — sin tener que decodificar ni un solo píxel.
 */

import type { Calculadora } from '@vilamar/domain'
import type { Page } from 'playwright'

import type { ContextoEjecucion } from './contrato.js'

/** Cuántas fotos se prueban, y cuánto se espera entre una y la siguiente. */
const INTENTOS_DE_CAPTURA = 3
const ESPERA_ENTRE_INTENTOS_MS = 350

export async function capturarResultado(
  pagina: Page,
  ctx: ContextoEjecucion,
  calculadora: Calculadora,
): Promise<string | undefined> {
  let mejor: Uint8Array | undefined
  for (let intento = 0; intento < INTENTOS_DE_CAPTURA; intento++) {
    if (intento > 0) {
      try {
        await pagina.waitForTimeout(ESPERA_ENTRE_INTENTOS_MS)
        // Esperar más tiempo, por sí solo, ya se comprobó que NO cambia
        // nada (el PNG sale idéntico byte a byte) — hace falta un evento
        // real, no solo dejar pasar el reloj. Un scroll de verdad es lo
        // que más fiablemente obliga a Chromium a recomponer la página
        // antes de la siguiente foto, y no depende de ningún selector
        // propio de una web en concreto: sirve igual para las tres.
        await pagina.evaluate(() => {
          window.scrollBy(0, 1)
          window.scrollBy(0, -1)
        })
      } catch {
        // Si ni siquiera se puede esperar o desplazar, la página ya no
        // responde: el intento de foto que sigue lo confirmará y se sale
        // del bucle con lo que ya se tenga.
      }
    }
    try {
      const png = await pagina.screenshot({ fullPage: true })
      if (mejor === undefined || png.length > mejor.length) mejor = png
    } catch {
      // Un intento que falla no se lleva por delante el que ya salió bien.
      // Si el navegador se ha cerrado de verdad, seguir intentando no va a
      // arreglarlo: se corta aquí.
      break
    }
  }

  if (mejor === undefined) return undefined
  try {
    return await ctx.guardarCaptura({ calculadora, ojo: ctx.entradas.ojo, png: mejor })
  } catch {
    return undefined
  }
}
