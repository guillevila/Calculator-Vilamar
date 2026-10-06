/**
 * eslint.config.js — Reglas de código.
 *
 * Este proyecto SÍ tiene lint, y `pnpm lint` tiene que estar en verde antes de
 * cerrar nada. Lo que no se hace nunca es desactivar una regla para que pase:
 * o se arregla, o se justifica por escrito en el propio fichero.
 *
 * Las reglas se han elegido para que atrapen errores, no para discutir estilo
 * —de eso se ocupa Prettier—. Hay dos que son específicas de este producto y
 * conviene entender por qué están:
 *
 *  - `no-restricted-imports` en el dominio: si alguien importa Playwright,
 *    Electron o el sistema de ficheros dentro de `packages/domain`, el diseño
 *    se ha roto. Mejor que salte aquí que descubrirlo cuando ya no se pueda
 *    probar el dominio sin abrir un navegador.
 *
 *  - `no-floating-promises`: en una aplicación llena de operaciones asíncronas
 *    contra webs ajenas, una promesa sin esperar es un fallo que no da error.
 *    Este proyecto ya se ha llevado varios disgustos con fallos mudos.
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'local/**',
      'pnpm-lock.yaml',
      // El Chromium que se mete en el paquete instalable (D51,
      // 28/08/2026) — descargado, nunca código propio.
      'apps/desktop/resources/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  // ── TypeScript de todo el monorepo ──────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Un `any` suelto en un modelo clínico es una puerta abierta a que entre
      // cualquier cosa donde debería ir un número.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // ── El dominio es puro y se queda puro ──────────────────────────────────
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'playwright', message: 'El dominio no sabe nada de navegadores.' },
            { name: 'electron', message: 'El dominio no sabe nada de Electron.' },
            { name: 'node:fs', message: 'El dominio no toca el disco.' },
            { name: 'fs', message: 'El dominio no toca el disco.' },
            { name: 'react', message: 'El dominio no sabe nada de la interfaz.' },
          ],
        },
      ],
    },
  },

  // ── Scripts sueltos y hooks: JavaScript de Node ─────────────────────────
  {
    files: ['scripts/**/*.mjs', '.claude/hooks/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        location: 'readonly',
        getComputedStyle: 'readonly',
        CSS: 'readonly',
        atob: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },

  // ── Tests ───────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.mjs', '**/e2e/**/*.ts'],
    rules: {
      // En los tests se construyen a propósito objetos incompletos para
      // comprobar que el código aguanta.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
