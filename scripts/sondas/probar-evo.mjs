#!/usr/bin/env node
/**
 * probar-evo.mjs — Rellena EVO Toric con el fixture SINTÉTICO y captura el
 * resultado, para saber cómo hay que leerlo.
 *
 * Los datos son inventados (los del fixture del proyecto). No corresponden a
 * ninguna persona. Los campos de identificación del paciente se dejan VACÍOS
 * a propósito: el producto nunca los rellena.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = join(process.cwd(), 'local', 'reconocimiento')
mkdirSync(SALIDA, { recursive: true })
const headed = !process.argv.includes('--headless')

const navegador = await chromium.launch({ headless: !headed })
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1100 } })
await pagina.goto('https://www.evoiolcalculator.com/toric.aspx', { waitUntil: 'domcontentloaded' })

// EVO exige "Patient Name". Se le manda el CÓDIGO LOCAL del caso, nunca un
// nombre: es un identificador del propio programa, no un dato del paciente.
await pagina.fill('#TextBoxName', 'CV-FIXTURE-001')

// Ojo derecho
await pagina.check('#RadioButtonRLEye_0')
await pagina.fill('#txtAL', '24.07')
await pagina.fill('#txtK1', '41.22')
await pagina.fill('#TxtK1Axis', '175')
await pagina.fill('#txtK2', '42.52')
await pagina.fill('#TxtK2Axis', '85')
await pagina.fill('#txtACD', '3.18')
await pagina.fill('#txtLT', '4.53')
await pagina.fill('#txtCCT', '530')
await pagina.fill('#txtRefraction', '0.00')
await pagina.fill('#txtAConstant', '119.0')
await pagina.selectOption('#DropDownToric', { label: 'Alcon SN6ATx' })
await pagina.fill('#TxtSIA', '0.00')
await pagina.fill('#TxtSIAaxis', '0')

const antes = await pagina.content()
writeFileSync(join(SALIDA, 'evo-relleno.html'), antes)
await pagina.screenshot({ path: join(SALIDA, 'evo-relleno.png'), fullPage: true })

console.log('→ Pulsando Calculate…')
await Promise.all([
  pagina.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {}),
  pagina.click('#btnCalculate'),
])
await pagina.waitForTimeout(4000)

const html = await pagina.content()
writeFileSync(join(SALIDA, 'evo-resultado.html'), html)
await pagina.screenshot({ path: join(SALIDA, 'evo-resultado.png'), fullPage: true })

// Describir todo lo que ha aparecido: tablas y texto
const info = await pagina.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const tablas = [...document.querySelectorAll('table')]
    .filter(visible)
    .map((t) => ({
      id: t.id || '',
      className: t.className || '',
      filas: [...t.rows].map((r) => [...r.cells].map((c) => c.innerText.trim())),
    }))
    .filter((t) => t.filas.length > 0)
  const conId = [...document.querySelectorAll('[id]')]
    .filter((el) => visible(el) && el.children.length === 0 && el.innerText.trim())
    .map((el) => ({
      id: el.id,
      tag: el.tagName.toLowerCase(),
      texto: el.innerText.trim().slice(0, 120),
    }))
  return { tablas, conId, texto: document.body.innerText.replace(/\n{3,}/g, '\n\n') }
})
writeFileSync(join(SALIDA, 'evo-resultado.json'), JSON.stringify(info, null, 2))
console.log(
  `✓ ${info.tablas.length} tablas visibles, ${info.conId.length} elementos con id y texto`,
)
console.log('--- TEXTO DE LA PÁGINA TRAS CALCULAR ---')
console.log(info.texto.slice(0, 3000))
await navegador.close()
