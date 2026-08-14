#!/usr/bin/env node
/**
 * reconocer-kane.mjs — Aprender el formulario REAL de Kane, con tu ayuda.
 *
 * Kane es distinto de las otras dos y por eso tiene su propia sonda: **su
 * calculadora no existe hasta que una persona acepta un acuerdo de licencia**.
 * Comprobado el 12/08/2026 abriendo la página: `iolformula.com` redirige a
 * `/agreement/`, que tiene CERO campos de formulario y un botón «I Agree». No
 * hay nada que copiar hasta que alguien pasa esa puerta.
 *
 * Lo que esta sonda hace:
 *
 *   abrir Kane con ventana
 *        ↓
 *   detectar la pantalla de condiciones
 *        ↓
 *   decir «acéptalas tú» y ESPERAR
 *        ↓
 *   esperar a que aparezca el FORMULARIO DE VERDAD
 *        ↓
 *   describirlo y guardarlo en local/
 *
 * Lo que NO hace, y no es un descuido:
 *
 *   - **No pulsa «I Agree».** Es un contrato entre el autor de la fórmula y quien
 *     la usa. Lo acepta una persona o no se acepta.
 *   - **No toca el reCAPTCHA.** La página dice estar protegida por él. Si aparece
 *     una comprobación, la resuelve la persona, en su navegador.
 *   - **No rellena nada ni pulsa «Calculate».** Solo mira y describe.
 *
 * Y no espera «unos segundos y a ver qué hay»: espera una **señal real del
 * formulario** —que existan campos de entrada y un botón de calcular—, porque
 * dormir un rato y capturar lo que haya es cómo se acaba escribiendo un
 * adaptador contra una pantalla de carga.
 *
 * Uso:  pnpm reconocer:kane
 *
 * La salida va a `local/reconocimiento/`, que está fuera del repositorio. Puede
 * contener lo que haya en pantalla, así que no se sube a ningún sitio.
 */

import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const URL = 'https://www.iolformula.com'
const SALIDA = join(process.cwd(), 'local', 'reconocimiento')
const ESPERA_MAXIMA_MS = 10 * 60 * 1000

/**
 * El perfil del navegador de la aplicación. **El mismo**, no uno propio.
 *
 * Esto era un fallo y costó una confusión real: la sonda abría un navegador
 * limpio cada vez, así que había TRES perfiles en juego —el Chrome del usuario,
 * el de la aplicación y el de la sonda—. Aceptaras donde aceptaras, los otros dos
 * seguían viendo la pantalla de condiciones.
 *
 * Compartiendo perfil pasan las dos cosas que tienen que pasar:
 *
 *  - Si ya aceptaste **en la aplicación**, la sonda entra directa.
 *  - Si aceptas **en la sonda**, la aplicación ya no te lo pide al calcular.
 *
 * Es la misma ruta que calcula Electron con `app.getPath('userData')` para el
 * nombre del paquete, más la carpeta que usa `prepararCarpetas`. Se puede forzar
 * con VILAMAR_PERFIL si algún día no coincidiera.
 */
function perfilDeLaAplicacion() {
  if (process.env.VILAMAR_PERFIL) return process.env.VILAMAR_PERFIL
  const nombre = 'calculator-vilamar'
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
  return join(base, nombre, 'sesion-navegador')
}

/** Cuántos campos hacen falta para creerse que esto es la calculadora. */
const CAMPOS_MINIMOS = 4

/**
 * Describe el documento sin salir de él. Se ejecuta dentro del navegador.
 *
 * Captura lo que hace falta para escribir un adaptador: qué campo es cada cosa,
 * cómo se llama, de qué tipo es, qué opciones tiene si es una lista, y qué
 * etiqueta lo acompaña.
 */
const DESCRIBIR = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }

  const etiquetaDe = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (l?.innerText.trim()) return l.innerText.trim()
    }
    const padre = el.closest('label')
    if (padre?.innerText.trim()) return padre.innerText.trim()
    // Formularios montados sobre tablas: la etiqueta está en la celda anterior.
    const celda = el.closest('td')
    const previa = celda?.previousElementSibling
    if (previa?.innerText?.trim()) return previa.innerText.trim()
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')
    return ''
  }

  const campos = [...document.querySelectorAll('input, select, textarea')].map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') ?? '',
    id: el.id ?? '',
    name: el.getAttribute('name') ?? '',
    etiqueta: etiquetaDe(el),
    placeholder: el.getAttribute('placeholder') ?? '',
    requerido: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    valor: el.tagName.toLowerCase() === 'select' ? el.value : '',
    // Para una lista, sus opciones REALES: es lo que hay que enviarle, no lo
    // que suponemos que acepta.
    opciones:
      el.tagName.toLowerCase() === 'select'
        ? [...el.options].map((o) => ({ valor: o.value, texto: o.text.trim() }))
        : undefined,
    visible: visible(el),
  }))

  const botones = [
    ...document.querySelectorAll('button, input[type=submit], input[type=button]'),
  ].map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') ?? '',
    id: el.id ?? '',
    name: el.getAttribute('name') ?? '',
    texto: (el.innerText || el.value || '').trim(),
    visible: visible(el),
  }))

  const tablas = [...document.querySelectorAll('table')].filter(visible).map((t) => ({
    id: t.id ?? '',
    clase: t.className ?? '',
    filas: t.rows.length,
    cabecera: [...(t.rows[0]?.cells ?? [])].map((c) => c.innerText.trim()),
    primeraFila: [...(t.rows[1]?.cells ?? [])].map((c) => c.innerText.trim()),
  }))

  return {
    titulo: document.title,
    url: location.href,
    campos,
    botones,
    tablas,
    textoVisible: (document.body.innerText ?? '').slice(0, 4000),
  }
}

/** ¿Estamos todavía en la puerta de las condiciones? */
async function enLasCondiciones(pagina) {
  if (/\/agreement/i.test(pagina.url())) return true
  const texto = await pagina.innerText('body').catch(() => '')
  return /terms of use/i.test(texto) && !/calculate/i.test(texto)
}

/** ¿Ha aparecido el formulario de verdad? Señal estructural, no un reloj. */
async function hayFormulario(pagina) {
  return pagina
    .evaluate((minimo) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }
      const campos = [...document.querySelectorAll('input, select')].filter(
        (el) => visible(el) && !['hidden', 'submit', 'button'].includes(el.getAttribute('type')),
      )
      const calcular = [
        ...document.querySelectorAll('button, input[type=submit], input[type=button], a'),
      ].some((el) => visible(el) && /calculate|calcular/i.test(el.innerText || el.value || ''))
      return campos.length >= minimo && calcular
    }, CAMPOS_MINIMOS)
    .catch(() => false)
}

async function main() {
  mkdirSync(SALIDA, { recursive: true })

  console.log('')
  console.log('  Kane — reconocimiento del formulario real')
  console.log('  ─────────────────────────────────────────')
  console.log('')

  const perfil = perfilDeLaAplicacion()
  console.log(`  Perfil del navegador: ${perfil}`)
  console.log(
    existsSync(perfil)
      ? '  (es el mismo que usa la aplicación: si ya aceptaste ahí, se entra directo)'
      : '  (se crea ahora; es el que usará también la aplicación al calcular)',
  )
  console.log('')

  let contexto
  try {
    contexto = await chromium.launchPersistentContext(perfil, {
      headless: false,
      viewport: { width: 1500, height: 1050 },
    })
  } catch (e) {
    // Chromium bloquea el perfil: dos navegadores no pueden usarlo a la vez.
    // Es un choque muy concreto y merece un mensaje concreto.
    console.error('')
    console.error('  No se ha podido abrir el perfil del navegador.')
    console.error('  Lo más probable: la aplicación está abierta y lo tiene cogido.')
    console.error('  Cierra Calculator Vilamar (y cualquier navegador que haya abierto)')
    console.error('  y vuelve a ejecutar esto.')
    console.error('')
    console.error(`  Detalle técnico: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
  const pagina = contexto.pages()[0] ?? (await contexto.newPage())

  try {
    console.log(`  Abriendo ${URL} …`)
    const respuesta = await pagina.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    console.log(`  HTTP ${respuesta?.status() ?? '?'} · ${await pagina.title()}`)
    console.log('')

    if (await enLasCondiciones(pagina)) {
      console.log('  ┌────────────────────────────────────────────────────────────┐')
      console.log('  │  TE TOCA A TI                                              │')
      console.log('  │                                                            │')
      console.log('  │  Kane enseña su acuerdo de licencia. Es un contrato entre   │')
      console.log('  │  el autor de la fórmula y quien la usa, así que lo tienes   │')
      console.log('  │  que leer y aceptar TÚ, en la ventana que se ha abierto.    │')
      console.log('  │                                                            │')
      console.log('  │  Calculator Vilamar no lo acepta por ti, ni ahora ni nunca. │')
      console.log('  │                                                            │')
      console.log('  │  Si aparece una comprobación anti-robot, resuélvela tú.     │')
      console.log('  │                                                            │')
      console.log('  │  Cuando veas el formulario, esta sonda sigue sola.          │')
      console.log('  └────────────────────────────────────────────────────────────┘')
      console.log('')
    }

    console.log('  Esperando al formulario…  (hasta 10 minutos; Ctrl+C para salir)')

    const empezado = Date.now()
    let visto = false
    while (Date.now() - empezado < ESPERA_MAXIMA_MS) {
      if (await hayFormulario(pagina)) {
        visto = true
        break
      }
      await pagina.waitForTimeout(1000)
    }

    if (!visto) {
      console.log('')
      console.log('  No ha aparecido ningún formulario reconocible.')
      console.log('  Si aceptaste las condiciones y aun así no se ha detectado, se guarda')
      console.log('  igualmente lo que hay en pantalla para poder mirarlo.')
    }

    // Un respiro para que termine de pintarse lo que haya cargado por JavaScript.
    // No sustituye a la señal de arriba: es solo para no capturar a medio pintar.
    await pagina.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)

    const descripcion = await pagina.evaluate(DESCRIBIR)
    const salida = {
      sitio: 'Kane',
      urlPedida: URL,
      capturadoEn: new Date().toISOString(),
      formularioDetectado: visto,
      principal: descripcion,
    }

    writeFileSync(join(SALIDA, 'kane.json'), JSON.stringify(salida, null, 2), 'utf8')
    writeFileSync(join(SALIDA, 'kane.html'), await pagina.content(), 'utf8')
    await pagina
      .screenshot({ path: join(SALIDA, 'kane.png'), fullPage: true })
      .catch(() => undefined)

    const conValor = descripcion.campos.filter(
      (c) => c.visible && !['hidden', 'submit', 'button'].includes(c.type),
    )
    console.log('')
    console.log(`  Campos visibles: ${conValor.length} · botones: ${descripcion.botones.length}`)
    console.log(`  Tablas visibles: ${descripcion.tablas.length}`)
    console.log('')
    for (const c of conValor) {
      const opciones = c.opciones ? `  opciones: ${c.opciones.map((o) => o.valor).join('|')}` : ''
      console.log(
        `   · ${(c.etiqueta || '(sin etiqueta)').slice(0, 34).padEnd(34)} ${c.tag}${c.type ? `[${c.type}]` : ''}  #${c.id || '—'}  name=${c.name || '—'}${opciones}`,
      )
    }
    console.log('')
    console.log('  Guardado en local/reconocimiento/kane.{json,html,png}')
    console.log('  Eso NO se sube al repositorio. Con esos identificadores se cierra')
    console.log('  MAPA_KANE en packages/integrations/src/adapters/kane.ts')
    console.log('')
  } finally {
    // Cerrar el contexto persistente es lo que guarda la aceptación en el perfil.
    await contexto.close().catch(() => undefined)
  }
}

main().catch((e) => {
  console.error('La sonda ha fallado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
