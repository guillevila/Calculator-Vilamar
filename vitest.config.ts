import { defineConfig } from 'vitest/config'

/**
 * Tests unitarios de todo el monorepo.
 *
 * Se ejecutan con Node normal, NO con Electron ni con navegador. Son los tests
 * deterministas: dominio, invariantes clínicas, parsers sobre fixtures
 * sintéticos, transformación de entradas de cada calculadora, lectura de
 * resultados sobre HTML capturado y comparación.
 *
 * Lo que NO está aquí a propósito:
 *  - las pruebas contra las webs reales de Kane, EVO y Barrett, que viven en
 *    `scripts/sondas/` y se lanzan a mano (una web ajena caída no puede poner
 *    el CI en rojo);
 *  - la prueba de interfaz, que arranca Electron de verdad y vive en
 *    `apps/desktop/e2e/` (Playwright).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/desktop/src/main/**/*.test.ts',
      // La guardia de Git protege la rama principal. Sin pruebas que la
      // disparen no sería una protección, sería un comentario.
      '.claude/hooks/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/e2e/**'],
    reporters: 'default',
  },
})
