#!/usr/bin/env node
/**
 * reconocer-barrett.mjs — Reconocimiento de la calculadora Barrett Toric.
 *
 * Barrett no es una página normal: la calculadora vive en un iframe de
 * `calc.apacrs.org` incrustado dentro de la página de la ASCRS. Ese dominio
 * responde 403 ("Just a moment…") cuando se le entra directamente, así que hay
 * que llegar por donde llega una persona: abriendo la página de la ASCRS.
 *
 * Esta sonda NO intenta rodear esa protección. Usa un navegador real con perfil
 * persistente —el mismo que usará la aplicación— y, si aparece una comprobación,
 * espera a que la persona la resuelva.
 *
 * Uso: node scripts/sondas/reconocer-barrett.mjs [--headless]
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PADRE = 'https://www.ascrs.org/en/tools/barrett-toric-calculator'
const HOST_CALC = 'calc.apacrs.org'
const headless = process.argv.includes('--headless')

const SALIDA = join(process.cwd(), 'local', 'reconocimiento')
const PERFIL = join(process.cwd(), 'local', 'perfil-navegador', 'reconocimiento')
mkdirSync(SALIDA, { recursive: true })
mkdirSync(PERFIL, { recursive: true })

const DESCRIBIR = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const etiqueta = (el) => {
    if (el.labels && el.labels.length)
      return [...el.labels].map((l) => l.innerText.trim()).join(' | ')
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')
    const td = el.closest('td')
    if (td && td.previousElementSibling)
      return td.previousElementSibling.innerText.trim().slice(0, 80)
    return (el.parentElement?.innerText || '').trim().slice(0, 80)
  }
  return {
    titulo: document.title,
    url: location.href,
    campos: [...document.querySelectorAll('input, select, textarea')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      id: el.id || '',
      name: el.getAttribute('name') || '',
      etiqueta: etiqueta(el),
      visible: visible(el),
      opciones:
        el.tagName === 'SELECT'
          ? [...el.options].slice(0, 60).map((o) => ({ value: o.value, texto: o.text.trim() }))
          : undefined,
    })),
    botones: [...document.querySelectorAll('button, input[type=submit], input[type=button]')].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        id: el.id || '',
        name: el.getAttribute('name') || '',
        texto: (el.innerText || el.value || '').trim().slice(0, 60),
        visible: visible(el),
      }),
    ),
    texto: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 5000),
  }
}

const contexto = await chromium.launchPersistentContext(PERFIL, {
  headless,
  viewport: { width: 1500, height: 1100 },
})
const pagina = contexto.pages()[0] ?? (await contexto.newPage())

console.log(`→ Abriendo ${PADRE}`)
await pagina.goto(PADRE, { waitUntil: 'domcontentloaded', timeout: 90_000 })

// Esperar a que el iframe de la calculadora tenga formulario. Si Cloudflare
// muestra una comprobación, aquí es donde una persona la resolvería.
const LIMITE = Date.now() + (headless ? 45_000 : 180_000)
let marcoCalc = null
let campos = 0
while (Date.now() < LIMITE) {
  for (const m of pagina.frames()) {
    if (!m.url().includes(HOST_CALC)) continue
    try {
      const n = await m.locator('input, select').count()
      if (n > 2) {
        marcoCalc = m
        campos = n
        break
      }
    } catch {
      /* el marco puede estar navegando */
    }
  }
  if (marcoCalc) break
  const marcos = pagina.frames().map((m) => m.url())
  process.stdout.write(
    `   esperando la calculadora… marcos: ${marcos.filter((u) => u.includes(HOST_CALC)).length}\r`,
  )
  await pagina.waitForTimeout(2500)
}

console.log('')
if (!marcoCalc) {
  console.log('✗ La calculadora no llegó a cargar dentro del tiempo previsto.')
  console.log('  Marcos vistos:')
  for (const m of pagina.frames()) console.log('   -', m.url().slice(0, 120))
  await pagina.screenshot({ path: join(SALIDA, 'barrett-sin-cargar.png'), fullPage: true })
  await contexto.close()
  process.exit(2)
}

console.log(`✓ Calculadora cargada: ${campos} campos en ${marcoCalc.url()}`)
const informe = {
  sitio: 'Barrett Toric',
  paginaPadre: PADRE,
  urlCalculadora: marcoCalc.url(),
  capturadoEn: new Date().toISOString(),
  ...(await marcoCalc.evaluate(DESCRIBIR)),
}
writeFileSync(join(SALIDA, 'barrett-calculadora.json'), JSON.stringify(informe, null, 2))
writeFileSync(join(SALIDA, 'barrett-calculadora.html'), await marcoCalc.content())
await pagina.screenshot({ path: join(SALIDA, 'barrett-calculadora.png'), fullPage: true })
console.log(`   guardado en local/reconocimiento/barrett-calculadora.{json,html,png}`)
await contexto.close()
