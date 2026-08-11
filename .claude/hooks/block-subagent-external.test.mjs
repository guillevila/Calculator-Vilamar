/**
 * Pruebas de la protección de subagentes.
 *
 * Existen porque una protección que no bloquea es peor que no tener ninguna: se
 * cuenta como puesta. El hook original salía con código 1, que Claude Code no
 * trata como bloqueo, así que llevaba desde el primer día sin bloquear nada.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BLOQUEADO_EN_SUBAGENTE,
  esSubagente,
  revisar,
  SIEMPRE_BLOQUEADO,
} from './block-subagent-external.mjs'

const bash = (comando) => ({ tool_name: 'Bash', tool_input: { command: comando } })

describe('lo irreversible no lo hace nadie', () => {
  for (const prohibido of SIEMPRE_BLOQUEADO) {
    it(`bloquea «${prohibido}» incluso en el agente principal`, () => {
      expect(revisar(bash(`algo ${prohibido} algo`), false)).not.toBeNull()
    })
  }
})

describe('lo que sale hacia fuera lo hace el agente principal, no un subagente', () => {
  for (const prohibido of BLOQUEADO_EN_SUBAGENTE) {
    it(`«${prohibido}»: bloqueado en subagente, permitido en el principal`, () => {
      expect(revisar(bash(prohibido), true)).not.toBeNull()
      expect(revisar(bash(prohibido), false)).toBeNull()
    })
  }

  it('el motivo explica qué hacer, no solo que no se puede', () => {
    const p = revisar(bash('git push origin master'), true)
    expect(p.detalle).toMatch(/agente principal/i)
    expect(p.detalle).toMatch(/persona/i)
  })
})

describe('el trabajo normal no se bloquea', () => {
  for (const comando of [
    'pnpm test',
    'git status',
    'git commit -m "algo"',
    'git fetch origin',
    'pnpm lint',
    'gh pr view 3',
  ]) {
    it(`deja pasar «${comando}» en un subagente`, () => {
      expect(revisar(bash(comando), true)).toBeNull()
    })
  }
})

describe('detectar que somos un subagente', () => {
  it('reconoce varios nombres de variable', () => {
    // El nombre exacto depende de la versión de Claude Code. Una protección que
    // deja de aplicarse porque cambió un nombre no se nota hasta que pasa algo.
    expect(esSubagente({ CLAUDE_SUBAGENT: 'true' })).toBe(true)
    expect(esSubagente({ CLAUDE_AGENT_IS_SUBAGENT: 'TRUE' })).toBe(true)
    expect(esSubagente({ CLAUDE_IS_SUBAGENT: 'True' })).toBe(true)
  })

  it('sin ninguna, se asume agente principal', () => {
    expect(esSubagente({})).toBe(false)
    expect(esSubagente({ CLAUDE_SUBAGENT: 'false' })).toBe(false)
  })
})

describe('entrada rara', () => {
  it('sin tool_input no revienta ni bloquea', () => {
    expect(revisar({}, true)).toBeNull()
    expect(revisar({ tool_name: 'Read' }, true)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  El hook DE VERDAD, lanzando el proceso
// ═══════════════════════════════════════════════════════════════════════════
//
// Todo lo de arriba prueba `revisar()`, que es una función pura. Y con `revisar()`
// perfecto el hook estuvo un rato **sin bloquear nada**: la comparación que
// decide «me están ejecutando o me están importando» fallaba porque la ruta de
// este proyecto tiene un espacio, y en `import.meta.url` un espacio viaja como
// `%20`. Los 26 tests pasaban con el hook muerto.
//
// De ahí estas pruebas: lanzan el proceso y miran el código de salida, que es lo
// único que Claude Code mira. **2 bloquea; cualquier otro deja pasar.**

function lanzar(comando, entorno = {}) {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./block-subagent-external.mjs', import.meta.url))],
    {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: comando } }),
      env: { ...process.env, CLAUDE_SUBAGENT: 'false', ...entorno },
      encoding: 'utf8',
    },
  )
  return r.status
}

describe('el proceso, no la función', () => {
  it('un subagente intentando «git push» sale con 2', () => {
    expect(lanzar('git push origin master', { CLAUDE_SUBAGENT: 'true' })).toBe(2)
  })

  it('el agente principal con el mismo comando sale con 0', () => {
    expect(lanzar('git push origin master')).toBe(0)
  })

  it('«rm -rf /» sale con 2 aunque sea el agente principal', () => {
    expect(lanzar('rm -rf /')).toBe(2)
  })

  it('trabajo normal en un subagente sale con 0', () => {
    expect(lanzar('pnpm test', { CLAUDE_SUBAGENT: 'true' })).toBe(0)
  })
})
