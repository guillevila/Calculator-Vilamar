#!/usr/bin/env node
/**
 * session-start.mjs — Se ejecuta al abrir una sesión de Claude Code.
 *
 * Da a Claude el estado real del proyecto de entrada: rama, últimos commits,
 * cambios sin guardar, lecciones aprendidas y la etapa declarada en
 * PROJECT_STATUS.md. Lo que imprime aquí entra en su contexto.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const line = '═'.repeat(63)

/** Ejecuta git sin reventar si no hay repositorio o si git no está. */
function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function read(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const out = []
out.push(line, '  CALCULATOR VILAMAR — Estado al iniciar sesión', line, '')

// ── Rama y commits ───────────────────────────────────────────────────────────
out.push(`📍 Rama actual: ${git(['branch', '--show-current']) || 'sin-git'}`, '')

const log = git(['log', '--oneline', '-3'])
out.push('📝 Últimos 3 commits:')
out.push(
  log
    ? log
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n')
    : '   (sin historial)',
)
out.push('')

// ── Cambios sin guardar ──────────────────────────────────────────────────────
const status = git(['status', '--short'])
const changed = status ? status.split('\n').filter(Boolean) : []
if (changed.length > 0) {
  out.push(`⚠️  Archivos modificados sin commitear: ${changed.length}`)
  out.push(
    changed
      .slice(0, 5)
      .map((l) => `    ${l}`)
      .join('\n'),
  )
  if (changed.length > 5) out.push(`   … y ${changed.length - 5} más`)
} else {
  out.push('✅ Todo commiteado — rama limpia')
}
out.push('')

// ── Lecciones aprendidas ─────────────────────────────────────────────────────
const lessons = read('.claude/skills/lessons-learned/log.md')
if (lessons) {
  // Solo cuentan las entradas con fecha; las cabeceras de la plantilla no.
  const entries = lessons.split('\n').filter((l) => /^## \d{4}-\d{2}-\d{2}/.test(l))
  out.push(`🧠 Lecciones aprendidas registradas: ${entries.length}`)
  if (entries.length > 0) {
    out.push('   Última lección:')
    out.push(`   ${entries[entries.length - 1]}`)
  }
} else {
  out.push('🧠 Sin lecciones registradas aún')
}
out.push('')

// ── Etapa real del proyecto ──────────────────────────────────────────────────
const projectStatus = read('PROJECT_STATUS.md')
if (projectStatus) {
  // Solo dentro de la sección «1. Estado actual», para no coger las casillas
  // marcadas de otras secciones (por ejemplo, el nivel de confianza).
  const section = projectStatus.split(/^## /m).find((block) => block.startsWith('1.'))
  const marked = section?.split('\n').find((l) => /^- \[[Xx]\] /.test(l))
  out.push(
    marked
      ? `📊 Estado del proyecto: ${marked.replace(/^- \[[Xx]\] /, '')}`
      : '📊 Revisa la etapa en PROJECT_STATUS.md',
  )
  out.push('')
}

// ── Recordatorios ────────────────────────────────────────────────────────────
out.push(
  '📚 Recordatorios:',
  '   • Lee SYSTEM_VISION.md y PROJECT_STATUS.md si no lo has hecho ya',
  '   • Lee lessons-learned/log.md antes de empezar',
  '   • Pushback antes de ejecutar peticiones subóptimas',
  '   • Registra lecciones inmediatamente tras correcciones',
  '   • Actualiza PROJECT_STATUS.md cuando cambie qué funciona; no des falso avance',
  '   • La rama principal no se toca: rama nueva + PR',
  '',
  line,
)

process.stdout.write(`${out.join('\n')}\n`)
process.exit(0)
