/**
 * flujo.spec.ts — Arranca la aplicación de verdad y recorre el flujo.
 *
 * No usa dobles: abre Electron, pulsa con el ratón y comprueba lo que se ve en
 * pantalla. Es la única prueba que puede detectar que un botón existe pero no
 * se puede pulsar, o que la ventana no llega a abrirse.
 *
 * Lo que esta prueba NO hace: hablar con Kane, EVO ni Barrett. Depender de tres
 * webs ajenas dejaría el control en rojo cada vez que una de ellas tuviera un
 * mal día. Las sondas contra las webs reales se lanzan a mano.
 *
 * ⚠️ `ELECTRON_RUN_AS_NODE` — si está puesta en el entorno, Electron arranca
 * como si fuera Node y NO abre ninguna ventana, sin decir nada. Es un fallo
 * mudo que ya costó un rato en este proyecto, así que se quita explícitamente
 * al lanzarlo.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const raizApp = join(fileURLToPath(import.meta.url), '..', '..')

let app: ElectronApplication
let ventana: Page
let carpetaDatos: string

// El tipo de `window.vilamar` ya lo declara el renderer en `api.ts`; aquí solo
// se importa para no duplicarlo (dos declaraciones distintas del mismo global
// son un error de compilación).
import type { ApiVilamar } from '../src/compartido/ipc.js'
declare global {
  interface Window {
    readonly vilamar?: ApiVilamar
  }
}

test.beforeAll(async () => {
  // Cada ejecución sobre una carpeta de datos desechable: no se tocan los
  // casos reales del usuario.
  carpetaDatos = mkdtempSync(join(tmpdir(), 'vilamar-e2e-'))

  const entorno: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') entorno[k] = v
  }

  app = await electron.launch({
    args: [join(raizApp, 'out', 'main', 'index.js'), `--user-data-dir=${carpetaDatos}`],
    env: entorno,
  })
  ventana = await app.firstWindow()
  await ventana.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  try {
    rmSync(carpetaDatos, { recursive: true, force: true })
  } catch {
    // en Windows a veces el proceso todavía tiene un fichero abierto
  }
})

test('la ventana se abre y enseña el punto de partida', async () => {
  await expect(ventana.locator('h1')).toHaveText('Calculator Vilamar')
  await expect(ventana.getByTestId('zona-soltar')).toBeVisible()
  await expect(ventana.getByRole('button', { name: 'Elegir archivo' })).toBeVisible()
  await ventana.screenshot({ path: 'test-results/01-inicio.png' })
})

test('se pueden escribir los datos a mano y se validan mientras escribes', async () => {
  // Se pulsa con el RATÓN, no con JavaScript: si el botón estuviera tapado por
  // otro elemento, esto fallaría y un `element.click()` no.
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await expect(ventana.getByTestId('campo-AL')).toBeVisible()

  // Un dato imposible tiene que marcarse y BLOQUEAR, sin corregirse solo.
  await ventana.getByTestId('campo-AL').fill('240.7')
  await ventana.getByTestId('campo-K1').click()
  await expect(ventana.locator('text=/no cambia datos por su cuenta/i').first()).toBeVisible()
  await expect(ventana.getByTestId('confirmar')).toBeDisabled()
  // El valor se queda como se escribió.
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('240.7')
  await ventana.screenshot({ path: 'test-results/02-dato-imposible.png' })

  // Corregido, deja continuar.
  await ventana.getByTestId('campo-AL').fill('24.07')
  await ventana.getByTestId('campo-K1').click()
  await expect(ventana.getByTestId('confirmar')).toBeEnabled()
})

test('un campo vacío se enseña como NO ENCONTRADO, nunca como cero', async () => {
  const wtw = ventana.getByTestId('campo-WTW')
  await expect(wtw).toHaveValue('')
  await expect(wtw).toHaveAttribute('placeholder', 'NO ENCONTRADO')

  // Y al escribirlo y borrarlo, vuelve a estar ausente en lugar de quedarse a 0.
  await wtw.fill('11.9')
  await ventana.getByTestId('campo-CCT').click()
  await expect(wtw).toHaveValue('11.9')
  await ventana.getByTestId('borrar-WTW').click()
  await expect(wtw).toHaveValue('')
})

test('el flujo completo llega hasta la pantalla de cálculo', async () => {
  // Los datos mínimos que pide EVO, escritos a mano.
  const datos: [string, string][] = [
    ['campo-AL', '24.07'],
    ['campo-K1', '41.22'],
    ['campo-K1_EJE', '175'],
    ['campo-K2', '42.52'],
    ['campo-K2_EJE', '85'],
    ['campo-ACD', '3.18'],
    ['campo-LT', '4.53'],
    ['campo-CCT', '530'],
    ['campo-REFRACCION_OBJETIVO', '0'],
    ['campo-SIA', '0.3'],
    ['campo-EJE_INCISION', '90'],
    ['campo-CONSTANTE_A', '119'],
  ]
  for (const [id, valor] of datos) {
    await ventana.getByTestId(id).fill(valor)
    await ventana.getByTestId(id).press('Enter')
  }

  await ventana.screenshot({ path: 'test-results/03-revision.png', fullPage: true })

  await ventana.getByTestId('confirmar').click()

  // Se llega a la pantalla de cálculo con las tres calculadoras listadas.
  await expect(ventana.getByTestId('calc-EVO_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-BARRETT_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-KANE')).toBeVisible()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()
  await ventana.screenshot({ path: 'test-results/04-calculo.png', fullPage: true })
})

test('la interfaz no enseña jerga técnica al usuario', async () => {
  const texto = (await ventana.locator('body').innerText()).toLowerCase()
  for (const jerga of ['locator(', 'timeouterror', 'undefined', 'null pointer', 'stack trace']) {
    expect(texto, `la pantalla enseña «${jerga}»`).not.toContain(jerga)
  }
})

/**
 * Esta prueba existe por un fallo concreto: al subir un informe, **el fichero
 * llegaba vacío**. Los bytes viajaban por IPC —y en el caso de «Elegir archivo»,
 * ida y vuelta— y se perdían por el camino. Todo lo que se veía después («la
 * imagen no se puede decodificar», «no se encuentran datos») eran síntomas.
 *
 * Ahora solo viaja la RUTA y el proceso principal lee el fichero. Esta prueba
 * comprueba justamente eso: que un fichero de verdad, con contenido de verdad,
 * llega entero y se lee.
 */
test('un informe subido llega con su contenido y se lee', async () => {
  test.setTimeout(180_000)

  // Un informe sintético con capa de texto: se lee sin OCR, así que la prueba no
  // depende de tener descargados los datos del idioma.
  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1100, height: 700 } })
  await p.setContent(`<body style="font-family:Arial;padding:40px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <div style="display:flex;gap:90px">
      <pre>OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
LT             4.53 mm
CCT             530 um</pre>
      <pre>OS
AL            24.01 mm
K1            40.27 D @ 8
K2            42.68 D @ 98
ACD (epi)      3.23 mm
LT             4.48 mm
CCT             533 um</pre>
    </div></body>`)
  const rutaPdf = join(carpetaDatos, 'informe-sintetico.pdf')
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()

  // El fichero existe y NO está vacío. Si esto falla, el resto no significa nada.
  expect(statSync(rutaPdf).size).toBeGreaterThan(1000)

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()

  // Se llama al mismo canal que usa la aplicación al arrastrar un fichero.
  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([ruta]),
    rutaPdf,
  )

  expect(resultado, 'el proceso principal no ha devuelto nada').toBeTruthy()
  const resumen = resultado?.resumenes?.[0]
  expect(resumen?.nombreDispositivo, 'no ha reconocido el ANTERION').toContain('ANTERION')
  expect(resumen?.ojosEncontrados, 'no ha encontrado los dos ojos').toEqual(['OD', 'OS'])
  expect(
    resumen?.avisos.join(' '),
    'ha avisado de que no encuentra datos, y sí los hay',
  ).not.toMatch(/no se ha podido leer ningún dato|está vacío/i)

  // Y los valores son los que pone el informe.
  const od = resultado?.caso?.ojos?.OD?.medidas
  expect(od?.AL?.valor).toBe(24.07)
  expect(od?.K1?.valor).toBe(41.22)
  expect(od?.K1_EJE?.valor).toBe(175)
  const os = resultado?.caso?.ojos?.OS?.medidas
  expect(os?.AL?.valor).toBe(24.01)
  expect(os?.K1?.valor).toBe(40.27)

  await ventana.screenshot({ path: 'test-results/05-informe-cargado.png', fullPage: true })
})
