#!/usr/bin/env node
/**
 * reconocer.mjs — Sonda de reconocimiento de las calculadoras externas.
 *
 * Abre la página pública de una calculadora con un navegador real y describe
 * SU FORMULARIO tal y como está hoy: qué campos hay, cómo se llaman, de qué
 * tipo son y qué etiqueta los acompaña.
 *
 * Para qué sirve: escribir los adaptadores mirando el HTML de verdad en lugar
 * de adivinarlo. La lección está registrada en el log del proyecto — cuando hay
 * que copiar algo, se copia de la fuente.
 *
 * Lo que esta sonda NO hace, a propósito:
 *   - no rellena nada,
 *   - no pulsa "calcular",
 *   - no acepta términos en nombre de nadie,
 *   - no intenta rodear ninguna protección.
 * Solo mira y describe.
 *
 * Uso:  node scripts/sondas/reconocer.mjs <kane|evo|barrett> [--headed]
 *
 * La salida va a `local/reconocimiento/`, que está fuera del repositorio.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SITIOS = {
  kane: { url: 'https://www.iolformula.com', nombre: 'Kane' },
  evo: { url: 'https://www.evoiolcalculator.com/toric.aspx', nombre: 'EVO Toric' },
  barrett: {
    url: 'https://www.ascrs.org/en/tools/barrett-toric-calculator',
    nombre: 'Barrett Toric',
  },
  'barrett-directo': {
    url: 'https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx',
    nombre: 'Barrett Toric (calculadora embebida)',
  },
  'barrett-true-k': {
    url: 'https://www.ascrs.org/en/tools/barrett-true-k-calculator',
    nombre: 'Barrett True K, esférica (para córnea post-LASIK/PRK/RK o queratocono)',
  },
  'barrett-true-k-toric': {
    url: 'https://www.ascrs.org/en/tools/barrett-true-k-toric-calculator',
    nombre: 'Barrett True K Toric (la que se usa: da cilindro y eje)',
  },
}

const clave = process.argv[2]
const headed = process.argv.includes('--headed')
const sitio = SITIOS[clave]
if (!sitio) {
  console.error(`Sitio desconocido: ${clave}. Opciones: ${Object.keys(SITIOS).join(', ')}`)
  process.exit(1)
}

const SALIDA = join(process.cwd(), 'local', 'reconocimiento')
mkdirSync(SALIDA, { recursive: true })

/**
 * Describe un documento (página o iframe) sin salir de él.
 * Se ejecuta dentro del navegador.
 */
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
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (l) return l.innerText.trim()
    }
    // Texto de la celda anterior en una tabla, patrón habitual en formularios viejos
    const td = el.closest('td')
    if (td && td.previousElementSibling)
      return td.previousElementSibling.innerText.trim().slice(0, 80)
    const padre = el.parentElement
    if (padre) return padre.innerText.trim().slice(0, 80)
    return ''
  }
  const campos = [...document.querySelectorAll('input, select, textarea')].map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    id: el.id || '',
    name: el.getAttribute('name') || '',
    placeholder: el.getAttribute('placeholder') || '',
    value:
      el.getAttribute('type') === 'password' ? '(oculto)' : String(el.value ?? '').slice(0, 40),
    etiqueta: etiqueta(el),
    visible: visible(el),
    requerido: el.hasAttribute('required'),
    opciones:
      el.tagName === 'SELECT'
        ? [...el.options].slice(0, 40).map((o) => ({ value: o.value, texto: o.text.trim() }))
        : undefined,
  }))
  const botones = [
    ...document.querySelectorAll('button, input[type=submit], input[type=button], a[role=button]'),
  ].map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    id: el.id || '',
    name: el.getAttribute('name') || '',
    texto: (el.innerText || el.value || '').trim().slice(0, 60),
    visible: visible(el),
  }))
  const formularios = [...document.querySelectorAll('form')].map((f) => ({
    id: f.id || '',
    name: f.getAttribute('name') || '',
    action: f.getAttribute('action') || '',
    method: f.getAttribute('method') || '',
  }))
  const iframes = [...document.querySelectorAll('iframe')].map((f) => ({
    id: f.id || '',
    name: f.getAttribute('name') || '',
    src: f.getAttribute('src') || '',
  }))
  const marcadores = {
    recaptcha: !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], [data-sitekey]'),
    hcaptcha: !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"]'),
    cloudflare: document.documentElement.innerHTML.includes('cf-challenge'),
    palabrasLogin: /sign in|log in|login|username|password/i.test(document.body.innerText),
    palabrasTerminos: /terms|agree|accept|disclaimer|i understand/i.test(document.body.innerText),
  }
  return {
    titulo: document.title,
    url: location.href,
    formularios,
    campos,
    botones,
    iframes,
    marcadores,
    textoVisible: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 6000),
  }
}

const navegador = await chromium.launch({ headless: !headed })
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
const pagina = await contexto.newPage()

const errores = []
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
pagina.on('console', (m) => {
  if (m.type() === 'error') errores.push(`console: ${m.text().slice(0, 200)}`)
})

console.log(`→ ${sitio.nombre}: ${sitio.url}`)
const respuesta = await pagina.goto(sitio.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await pagina.waitForTimeout(4000)

const informe = {
  sitio: sitio.nombre,
  urlPedida: sitio.url,
  estadoHttp: respuesta ? respuesta.status() : null,
  capturadoEn: new Date().toISOString(),
  principal: await pagina.evaluate(DESCRIBIR),
  marcos: [],
  errores,
}

for (const marco of pagina.frames()) {
  if (marco === pagina.mainFrame()) continue
  try {
    informe.marcos.push({
      url: marco.url(),
      nombre: marco.name(),
      ...(await marco.evaluate(DESCRIBIR)),
    })
  } catch (e) {
    informe.marcos.push({ url: marco.url(), error: String(e).slice(0, 200) })
  }
}

writeFileSync(join(SALIDA, `${clave}.json`), JSON.stringify(informe, null, 2))
writeFileSync(join(SALIDA, `${clave}.html`), await pagina.content())
await pagina.screenshot({ path: join(SALIDA, `${clave}.png`), fullPage: true })

console.log(`   HTTP ${informe.estadoHttp} · "${informe.principal.titulo}"`)
console.log(
  `   campos: ${informe.principal.campos.length} · botones: ${informe.principal.botones.length} · marcos: ${informe.marcos.length}`,
)
console.log(`   marcadores: ${JSON.stringify(informe.principal.marcadores)}`)
console.log(`   guardado en local/reconocimiento/${clave}.{json,html,png}`)

await navegador.close()
