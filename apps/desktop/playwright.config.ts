import { defineConfig } from '@playwright/test'

/**
 * Prueba de interfaz sobre la aplicación real.
 *
 * Un solo proceso a la vez: se abre Electron de verdad y varias instancias
 * peleándose por la misma carpeta de datos darían fallos que no son del
 * producto.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
