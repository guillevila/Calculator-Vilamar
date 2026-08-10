#!/usr/bin/env node
/**
 * log-subagent-spawn.mjs — Registra cuándo Claude lanza un subagente.
 *
 * Da trazabilidad de qué agente especialista hizo qué. El registro vive en
 * `.claude/audit/`, excluido del repositorio.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { readHookInput, timestamp } from './_input.mjs'

const payload = await readHookInput()

try {
  mkdirSync('.claude/audit', { recursive: true })
  const agent = payload.subagent_type ?? payload.tool_input?.subagent_type ?? 'desconocido'
  const preview = String(payload.prompt ?? payload.tool_input?.prompt ?? '')
    .slice(0, 120)
    .replace(/\s+/g, ' ')
  appendFileSync(
    '.claude/audit/subagent-spawns.log',
    `${timestamp()} | SPAWN | ${agent} | ${preview}\n`,
    'utf8',
  )
} catch {
  // Un fallo al registrar nunca debe interrumpir el trabajo.
}

process.exit(0)
