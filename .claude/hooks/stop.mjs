#!/usr/bin/env node
/**
 * stop.mjs — Se ejecuta al terminar una sesión de Claude Code.
 *
 * Recuerda las tres cosas que más se olvidan al cerrar: registrar la lección
 * si hubo correcciones, no dejar trabajo sin commitear, y anotar las decisiones
 * nuevas en SYSTEM_VISION.md.
 */

import { execFileSync } from 'node:child_process'

const line = '═'.repeat(63)

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const status = git(['status', '--short'])
const changed = status ? status.split('\n').filter(Boolean) : []

const out = ['', line, '  Fin de sesión', line, '', '  Antes de cerrar, comprueba:', '']
out.push('  ✓ ¿Hubo correcciones en esta sesión? → regístralas con /nueva-leccion', '')

if (changed.length > 0) {
  out.push(`  ⚠️  Hay ${changed.length} ${changed.length === 1 ? 'archivo' : 'archivos'} sin commitear:`)
  out.push(changed.slice(0, 5).map((l) => `      ${l}`).join('\n'))
  if (changed.length > 5) out.push(`      … y ${changed.length - 5} más`)
} else {
  out.push('  ✅ No queda nada sin commitear')
}

out.push('', '  ✓ ¿Hay decisiones nuevas que añadir a SYSTEM_VISION.md?', '')
out.push('  ✓ ¿Cambió lo que funciona? → actualiza PROJECT_STATUS.md', '', line)

process.stdout.write(`${out.join('\n')}\n`)
process.exit(0)
