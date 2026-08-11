import { defineConfig } from '@playwright/test'

/**
 * Verificación vertical: la aplicación real contra las webs reales.
 *
 * Vive en su propia configuración —y no como un test más— para que sea
 * IMPOSIBLE que entre por descuido en el control automático. Depende de EVO y
 * de la ASCRS: si una de las dos tiene un mal día, esto se pone en rojo por algo
 * que no es nuestro, y un control que falla por motivos ajenos deja de mirarse.
 *
 *     pnpm verificar:vertical
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.manual\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 240_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
