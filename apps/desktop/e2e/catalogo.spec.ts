/**
 * catalogo.spec.ts — El catálogo de lentes propio, de punta a punta.
 *
 * Arranca la aplicación de verdad y comprueba que se puede abrir Ajustes,
 * añadir una lente, verla en la lista y borrarla — sin doblar nada.
 */

import { mkdtempSync, rmSync } from 'node:fs'
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

test.beforeAll(async () => {
  carpetaDatos = mkdtempSync(join(tmpdir(), 'vilamar-e2e-catalogo-'))

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

test('se abre Ajustes, se añade una lente y aparece en la lista', async () => {
  await ventana.getByRole('button', { name: 'Ajustes' }).click()
  await expect(ventana.getByTestId('ajustes-catalogo')).toBeVisible()
  await expect(ventana.locator('text=Todavía no has añadido ninguna lente')).toBeVisible()

  await ventana.getByRole('button', { name: 'Añadir lente' }).click()
  await ventana.locator('#al-modelo').fill('enVista ENVY')
  await ventana.locator('#al-fabricante').fill('Bausch & Lomb')
  await ventana.locator('#al-constante-EVO_TORIC').fill('119.24')
  await ventana.locator('#al-constante-BARRETT_TORIC').fill('119.28')
  await ventana.locator('#al-constante-KANE').fill('119.33')
  await ventana.locator('#al-esfera-min').fill('6')
  await ventana.locator('#al-esfera-max').fill('34')

  await ventana.getByRole('button', { name: 'Guardar' }).click()

  await expect(
    ventana.locator(
      'text=/Bausch & Lomb enVista ENVY — EVO Toric A 119.24 · Barrett Toric A 119.28 · Kane A 119.33/',
    ),
  ).toBeVisible()
  await ventana.screenshot({ path: 'test-results/catalogo-01-lente-anadida.png' })
})

test('una lente tórica exige su rango de cilindro antes de guardar', async () => {
  await ventana.getByRole('button', { name: 'Añadir lente' }).click()
  await ventana.locator('#al-modelo').fill('enVista ENVY TORIC')
  await ventana.locator('#al-constante-EVO_TORIC').fill('119.24')
  await ventana.locator('#al-esfera-min').fill('6')
  await ventana.locator('#al-esfera-max').fill('34')
  await ventana.getByLabel('Es tórica').check()

  await ventana.getByRole('button', { name: 'Guardar' }).click()
  await expect(
    ventana.locator('text=Una lente tórica necesita su rango de cilindro.'),
  ).toBeVisible()

  await ventana.locator('#al-cilindro-min').fill('0.9')
  await ventana.locator('#al-cilindro-max').fill('5.75')
  await ventana.getByRole('button', { name: 'Guardar' }).click()
  await expect(ventana.locator('text=/enVista ENVY TORIC — EVO Toric A 119.24/')).toBeVisible()
})

test('se puede borrar una lente del catálogo', async () => {
  await ventana
    .locator('tr', { hasText: 'enVista ENVY —' })
    .getByRole('button', { name: 'Borrar' })
    .click()
  await expect(ventana.locator('text=/enVista ENVY —/')).toHaveCount(0)
  await expect(ventana.locator('text=/enVista ENVY TORIC —/')).toBeVisible()
})

test('se cierra Ajustes y se vuelve al punto de partida', async () => {
  await ventana.getByRole('button', { name: 'Cerrar' }).click()
  await expect(ventana.getByTestId('ajustes-catalogo')).not.toBeVisible()
  await expect(ventana.getByTestId('zona-soltar')).toBeVisible()
})
