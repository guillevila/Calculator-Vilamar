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
 */

import type { Calculadora } from '@vilamar/domain'
import type { Page } from 'playwright'

import type { ContextoEjecucion } from './contrato.js'

export async function capturarResultado(
  pagina: Page,
  ctx: ContextoEjecucion,
  calculadora: Calculadora,
): Promise<string | undefined> {
  try {
    const png = await pagina.screenshot({ fullPage: true })
    return await ctx.guardarCaptura({ calculadora, ojo: ctx.entradas.ojo, png })
  } catch {
    return undefined
  }
}
