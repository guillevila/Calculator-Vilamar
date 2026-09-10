#!/usr/bin/env node
/**
 * preparar-navegador-empaquetado.mjs — Descarga el Chromium de Playwright
 * DENTRO del proyecto, para meterlo en el paquete instalable.
 *
 * El motivo: la aplicación real no usa el Chromium de Electron para hablar
 * con EVO, Barrett y Kane — usa el navegador propio de Playwright
 * (`abrirNavegador()`, en `apps/desktop/src/main/index.ts`), y Playwright lo
 * busca, por defecto, en una caché del ordenador donde se ha instalado con
 * `pnpm playwright:install` (`%LOCALAPPDATA%\ms-playwright` en Windows).
 * Esa caché no existe en el ordenador de un compañero que reciba el paquete
 * — sin este paso, la aplicación se abriría bien pero fallaría justo al
 * calcular.
 *
 * Este script descarga ese mismo Chromium en una carpeta REAL dentro del
 * proyecto (`apps/desktop/resources/playwright-browsers`, nunca en el
 * repositorio — ver `.gitignore`), para que `electron-builder` pueda
 * incluirla en el paquete (`build.extraResources`, en
 * `apps/desktop/package.json`). El propio `index.ts` le dice a Playwright,
 * solo cuando la aplicación está empaquetada, que busque el navegador ahí
 * en vez de en la caché global — la técnica que recomienda la propia
 * documentación de Playwright para aplicaciones de Electron que se
 * distribuyen a otro ordenador.
 *
 *     pnpm preparar:navegador-empaquetado
 *
 * `pnpm dist` ya lo ejecuta solo, antes de empaquetar. Ejecutarlo a mano
 * solo hace falta si se quiere forzar una descarga limpia. Son unos 700 MB
 * (Chromium con ventana, su variante sin ventana, y un par de utilidades
 * pequeñas que trae Playwright); `playwright install` no repite la
 * descarga si ya están.
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpetaDestino = join(raiz, 'apps', 'desktop', 'resources', 'playwright-browsers')

console.log(`Descargando el Chromium de Playwright en:\n  ${carpetaDestino}\n`)

execFileSync('npx', ['playwright', 'install', 'chromium'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: carpetaDestino },
})

console.log('\n✓ Listo. `pnpm dist` ya puede incluirlo en el paquete instalable.')
