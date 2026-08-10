#!/usr/bin/env node
/**
 * probar-barrett.mjs — Rellena Barrett Toric con el fixture SINTÉTICO y captura
 * el resultado, para saber cómo hay que leerlo.
 *
 * Barrett vive en un iframe de calc.apacrs.org dentro de la página de la ASCRS,
 * y ese dominio rechaza al navegador sin ventana. Por eso esta sonda abre un
 * navegador REAL y VISIBLE, que es además como funcionará el producto.
 *
 * Los campos de identificación (Doctor Name, Patient Name, Patient ID) se dejan
 * VACÍOS a propósito.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PADRE = 'https://www.ascrs.org/en/tools/barrett-toric-calculator'
const SALIDA = join(process.cwd(), 'local', 'reconocimiento')
const PERFIL = join(process.cwd(), 'local', 'perfil-navegador', 'reconocimiento')
mkdirSync(SALIDA, { recursive: true })

const contexto = await chromium.launchPersistentContext(PERFIL, {
  headless: false,
  viewport: { width: 1500, height: 1200 },
})
const pagina = contexto.pages()[0] ?? (await contexto.newPage())
await pagina.goto(PADRE, { waitUntil: 'domcontentloaded', timeout: 90_000 })

// El aviso de cookies de la ASCRS tapa toda la página y se come los clics.
// Se elige RECHAZAR: declinar cookies opcionales no es aceptar nada en nombre
// de nadie, y es la opción que menos datos comparte.
try {
  const rechazar = pagina.locator('[data-cky-tag="reject-button"]').first()
  await rechazar.waitFor({ state: 'visible', timeout: 15000 })
  await rechazar.click()
  console.log('✓ Aviso de cookies rechazado')
  await pagina.waitForTimeout(1500)
} catch {
  console.log('· No apareció aviso de cookies (o ya estaba resuelto)')
}

// Esperar al marco de la calculadora
const LIMITE = Date.now() + 180000
let calc = null
while (Date.now() < LIMITE && !calc) {
  for (const m of pagina.frames()) {
    if (!m.url().includes('calc.apacrs.org')) continue
    if ((await m.locator('#MainContent_AxLength').count()) > 0) {
      calc = m
      break
    }
  }
  if (!calc) await pagina.waitForTimeout(2000)
}
if (!calc) {
  console.error('✗ La calculadora no cargó.')
  await contexto.close()
  process.exit(2)
}
console.log('✓ Calculadora cargada')

await calc.check('#MainContent_Rad1') // Right (OD)
await pagina.waitForTimeout(2000)
await calc.selectOption('#MainContent_IOLModel', { label: 'Alcon SN6ATx' })
await pagina.waitForTimeout(2000)
// Barrett marca "Patient Name" como campo obligatorio. Se le manda el CÓDIGO
// LOCAL del caso, que es un identificador del propio programa. Doctor Name y
// Patient ID se quedan vacíos.
await calc.fill('#MainContent_PatientName', 'CV-FIXTURE-001')
await calc.fill('#MainContent_MeasuredK', '41.22')
await calc.fill('#MainContent_MeasuredAxis', '175')
await calc.fill('#MainContent_MeasuredK0', '42.52')
await calc.fill('#MainContent_MeasuredAxis0', '85')
await calc.fill('#MainContent_AxLength', '24.07')
await calc.fill('#MainContent_OpticalACD', '3.18')
await calc.fill('#MainContent_Refraction', '0.00')
await calc.fill('#MainContent_InducedCyl', '0.00')
await calc.fill('#MainContent_IncisionAxis', '0')
await calc.fill('#MainContent_LensThickness', '4.53')
await calc.fill('#MainContent_WTW', '11.9')

await pagina.screenshot({ path: join(SALIDA, 'barrett-relleno.png'), fullPage: true })
console.log('→ Pulsando Calculate…')
await calc.click('#MainContent_Button1')
await pagina.waitForTimeout(8000)
await pagina.screenshot({ path: join(SALIDA, 'barrett-calculado.png'), fullPage: true })

// Los resultados de la lente viven en la pestaña "Toric IOL", que es otro
// postback de ASP.NET dentro del mismo iframe.
console.log('→ Abriendo la pestaña Toric IOL…')
await calc.getByRole("link", { name: "Toric IOL" }).first().click()
await pagina.waitForTimeout(7000)

const DESCRIBIR_RESULTADO = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  return {
    url: location.href,
    titulo: document.title,
    conId: [...document.querySelectorAll('[id]')]
      .filter((el) => visible(el) && el.children.length === 0 && el.innerText.trim())
      .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase(), texto: el.innerText.trim().slice(0, 120) })),
    tablas: [...document.querySelectorAll('table')]
      .filter(visible)
      .map((t) => ({ id: t.id || '', filas: [...t.rows].map((r) => [...r.cells].map((c) => c.innerText.trim())) }))
      .filter((t) => t.filas.length > 0),
    texto: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 6000),
  }
}

const informes = []
for (const p of contexto.pages()) {
  for (const m of p.frames()) {
    if (!m.url().includes('calc.apacrs.org')) continue
    try {
      informes.push(await m.evaluate(DESCRIBIR_RESULTADO))
    } catch (e) {
      informes.push({ url: m.url(), error: String(e).slice(0, 200) })
    }
  }
}
writeFileSync(
  join(SALIDA, 'barrett-resultado.json'),
  JSON.stringify({ paginas: contexto.pages().length, informes }, null, 2),
)
for (const p of contexto.pages()) {
  const marco = p.frames().find((m) => m.url().includes('calc.apacrs.org'))
  if (marco) writeFileSync(join(SALIDA, 'barrett-resultado.html'), await marco.content())
}
await pagina.screenshot({ path: join(SALIDA, 'barrett-resultado.png'), fullPage: true })
console.log(`Páginas abiertas: ${contexto.pages().length}`)
for (const i of informes) {
  console.log('--- marco:', i.url)
  console.log((i.texto || i.error || '').slice(0, 2500))
}
await contexto.close()
