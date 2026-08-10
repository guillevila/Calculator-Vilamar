#!/usr/bin/env node
/**
 * post-tool-use.mjs — Se ejecuta DESPUÉS de cada herramienta.
 *
 * Deja rastro de las escrituras en un registro local. Sirve para poder
 * responder «¿qué tocó Claude en esta sesión?» sin depender de la memoria.
 *
 * El registro vive en `.claude/audit/`, que está excluido del repositorio.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { readHookInput, timestamp } from './_input.mjs'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

const payload = await readHookInput()
const tool = String(payload.tool_name ?? '')

if (WRITE_TOOLS.has(tool)) {
  try {
    mkdirSync('.claude/audit', { recursive: true })
    const target = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path ?? '(sin ruta)'
    appendFileSync('.claude/audit/edits.log', `${timestamp()} | ${tool} | ${target}\n`, 'utf8')
  } catch {
    // Un fallo al registrar nunca debe interrumpir el trabajo.
  }
}

process.exit(0)
