/**
 * vertical-real.manual.ts — El flujo COMPLETO, con las webs de verdad.
 *
 * Arranca la aplicación real, escribe una biometría, la confirma, lanza EVO y
 * Barrett CONTRA SUS WEBS y genera el PDF. Es la única prueba que demuestra que
 * el producto entero funciona, y no solo que sus piezas funcionan por separado.
 *
 * ⚠️ NO está en el CI ni en `pnpm test:e2e`, a propósito: depende de dos webs
 * ajenas y de que Barrett pueda abrir ventana. Se lanza a mano:
 *
 *     pnpm verificar:vertical
 *
 * Tarda alrededor de un minuto. Kane se deja fuera porque exige que una persona
 * acepte sus condiciones.
 *
 * Los datos son el fixture sintético. No son de ninguna persona.
 */

import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'

const raizApp = join(fileURLToPath(import.meta.url), '..', '..')

test('el producto entero: datos → confirmar → EVO y Barrett reales → PDF', async () => {
  test.setTimeout(300_000)

  const carpetaDatos = mkdtempSync(join(tmpdir(), 'vilamar-vertical-'))
  const entorno: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    // Sin esto, Electron arranca como Node y no abre ventana. Fallo mudo.
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') entorno[k] = v
  }
  // Los informes ya no van dentro de `carpetaDatos` (D57, 01/09/2026): por
  // defecto la app real los guarda en el Escritorio de quien la usa.
  entorno['VILAMAR_CARPETA_INFORMES'] = join(carpetaDatos, 'informes')

  const app = await electron.launch({
    args: [join(raizApp, 'out', 'main', 'index.js'), `--user-data-dir=${carpetaDatos}`],
    env: entorno,
  })

  try {
    const v = await app.firstWindow()
    await v.waitForLoadState('domcontentloaded')

    // ── 1. Los datos, a mano ────────────────────────────────────────────────
    // El botón lleva al cuestionario simplificado; se pasa sin rellenarlo
    // para llegar a la pantalla de revisión, donde están estos `campo-*`.
    await v.getByRole('button', { name: 'Escribir los datos a mano' }).click()
    await v.getByTestId('manual-continuar').click()
    const datos: [string, string][] = [
      ['campo-AL', '24.07'],
      ['campo-K1', '41.22'],
      ['campo-K1_EJE', '175'],
      ['campo-K2', '42.52'],
      ['campo-K2_EJE', '85'],
      ['campo-ACD', '3.18'],
      ['campo-LT', '4.53'],
      ['campo-CCT', '530'],
      ['campo-WTW', '11.9'],
      ['campo-REFRACCION_OBJETIVO', '0'],
      ['campo-SIA', '0'],
      ['campo-EJE_INCISION', '0'],
      ['campo-CONSTANTE_A', '119'],
    ]
    for (const [id, valor] of datos) {
      await v.getByTestId(id).fill(valor)
      await v.getByTestId(id).press('Enter')
    }

    // ── 2. Confirmar ────────────────────────────────────────────────────────
    await expect(v.getByTestId('confirmar')).toBeEnabled()
    await v.getByTestId('confirmar').click()
    await expect(v.getByTestId('calc-EVO_TORIC')).toBeVisible()

    // ── 3. Calcular de verdad, en EVO y en Barrett ──────────────────────────
    // El botón lanza las TRES. Kane se quedará esperando a que una persona
    // acepte sus condiciones, y eso es correcto: lo que se comprueba aquí es
    // justamente que esa espera NO impide llegar a lo que ya está hecho.
    await v.getByTestId('lanzar-calculo').click()

    // EVO tarda unos segundos; Barrett, alrededor de 35.
    await expect(v.getByTestId('calc-EVO_TORIC')).toContainText('Resultado obtenido', {
      timeout: 120_000,
    })
    await expect(v.getByTestId('calc-BARRETT_TORIC')).toContainText('Resultado obtenido', {
      timeout: 180_000,
    })
    await v.screenshot({ path: 'test-results/vertical-00-calculando.png', fullPage: true })

    // Con Kane todavía esperando, se tiene que poder ver lo que ya hay.
    await v.getByTestId('ver-resultados').click()
    await expect(v.getByTestId('tabla-comparativa')).toBeVisible({ timeout: 30_000 })
    await v.screenshot({ path: 'test-results/vertical-01-resultados.png', fullPage: true })

    const tabla = await v.getByTestId('tabla-comparativa').innerText()
    console.log('\n--- TABLA COMPARATIVA ---\n' + tabla)

    // Al menos una calculadora tiene que haber traído una esfera de verdad.
    expect(tabla).toMatch(/\d+\.\d{2} D/)

    // ── 4. El PDF ───────────────────────────────────────────────────────────
    await v.getByTestId('generar-pdf').click()
    await expect(v.locator('text=/Informe generado/i')).toBeVisible({ timeout: 90_000 })

    const rutaPdf = await v.locator('.aviso.exito code').innerText()
    console.log('PDF generado en:', rutaPdf)
    expect(existsSync(rutaPdf)).toBe(true)

    await v.screenshot({ path: 'test-results/vertical-02-pdf.png', fullPage: true })
  } finally {
    await app.close().catch(() => undefined)
    try {
      rmSync(carpetaDatos, { recursive: true, force: true })
    } catch {
      // en Windows puede quedar algún fichero abierto un instante
    }
  }
})
