#!/usr/bin/env node
/**
 * pre-tool-use.mjs — Se ejecuta ANTES de cada herramienta.
 *
 * Es la red de seguridad del proyecto: bloquea operaciones destructivas sin
 * vuelta atrás y el acceso a ficheros con credenciales.
 *
 * IMPORTANTE sobre el código de salida: para BLOQUEAR una herramienta hay que
 * salir con **2**. Con 1 (o cualquier otro) Claude Code lo trata como un error
 * no bloqueante y la herramienta se ejecuta igualmente. La versión anterior de
 * este hook usaba 1, así que aunque hubiera podido ejecutarse no habría
 * bloqueado nada.
 */

import { execFileSync } from 'node:child_process'
import { readHookInput } from './_input.mjs'
import { explicar, revisarComandoGit } from './guard-git.mjs'

/**
 * En qué rama estamos, o `null` si no se puede saber.
 *
 * Hace falta porque hay comandos que son normales en una rama de trabajo y
 * graves en la principal: fusionar en master salta la revisión. Si no se puede
 * averiguar, las reglas que dependen de la rama simplemente no se aplican —
 * bloquear por no saber sería peor que dejar pasar.
 */
function ramaActual() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Operaciones irreversibles que NO son de Git.
 *
 * Las de Git salieron de esta lista a propósito. Aquí se buscaban patrones en
 * el texto crudo, y eso tiene los dos fallos opuestos: se cuela lo que se
 * escribe distinto, y se bloquea a quien solo MENCIONA el comando —un mensaje
 * de commit que dijera «ya no hace git reset --hard» quedaba bloqueado, y este
 * mismo hook llegó a bloquear la lección que lo contaba—.
 *
 * De git se encarga ahora `guard-git.mjs`, que trocea el comando y decide sobre
 * sus argumentos en lugar de sobre la cadena. Ver la lección del 5/8/2026.
 */
const DESTRUCTIVE = [
  /drop\s+database/i,
  /drop\s+table/i,
  /truncate\s+table/i,
  /rm\s+-rf\s+\/(?!\w)/i,
  /rm\s+-rf\s+~/i,
  /format\s+c:/i,
  /Remove-Item\s+.*-Recurse\s+.*-Force\s+[A-Z]:\\?$/im,
]

/**
 * Ficheros que Claude no debe leer ni editar.
 *
 * `.env.example` queda expresamente permitido: es la plantilla sin valores
 * reales, está pensada para leerse y forma parte del repositorio.
 */
const SENSITIVE = [/(^|[\\/])\.env(\.|$)/i, /[\\/]secrets?[\\/]/i, /credential/i, /private[_-]?key/i, /\.pem$/i, /\.key$/i, /\.p12$/i]
const SENSITIVE_ALLOWED = [/\.env\.example$/i]

function block(reason, detail) {
  // stderr con salida 2 es lo que Claude Code devuelve al modelo como motivo.
  process.stderr.write(`${reason}\n${detail}\n`)
  process.exit(2)
}

const payload = await readHookInput()
const toolName = String(payload.tool_name ?? '')
const toolInput = payload.tool_input ?? {}

// ── 1. Comandos destructivos ─────────────────────────────────────────────────
const command = String(toolInput.command ?? '')
if (command) {
  for (const pattern of DESTRUCTIVE) {
    if (pattern.test(command)) {
      block(
        '🛑 BLOQUEADO: operación destructiva irreversible.',
        'Si de verdad hace falta, pídelo explícitamente al dueño del proyecto y explica por qué.',
      )
    }
  }
}

// ── 1-bis. Integración segura ────────────────────────────────────────────────
//
// Protege la rama principal y la forma de fusionar. Va aparte de la lista de
// arriba porque estas reglas necesitan saber EN QUÉ RAMA estamos —fusionar es
// normal en una rama de trabajo y grave en master— y porque cada una explica su
// alternativa: un guardián que solo dice «no» acaba desactivado.
if (command) {
  const guardia = revisarComandoGit(command, ramaActual())
  if (guardia.bloquear) {
    process.stderr.write(`${explicar(guardia)}\n`)
    process.exit(2)
  }
}

// ── 2. Ficheros sensibles ────────────────────────────────────────────────────
// Solo se miran las rutas y el comando, no el contenido: buscar la palabra
// «credential» dentro de un texto cualquiera bloquearía trabajo legítimo.
const paths = [toolInput.file_path, toolInput.path, toolInput.notebook_path, command]
  .filter((value) => typeof value === 'string' && value.length > 0)
  .map(String)

for (const candidate of paths) {
  if (SENSITIVE_ALLOWED.some((pattern) => pattern.test(candidate))) continue
  for (const pattern of SENSITIVE) {
    if (pattern.test(candidate)) {
      block(
        '🔐 BLOQUEADO: intento de acceder a un fichero sensible.',
        `Los ficheros .env, claves y credenciales no se leen ni se editan. Ruta: ${candidate}`,
      )
    }
  }
}

// ── 3. Aviso, sin bloquear, al tocar la rama principal ───────────────────────
if (toolName === 'Bash' || toolName === 'PowerShell') {
  if (/git\s+(checkout|switch)\s+(master|main)\b/i.test(command) && /git\s+(commit|merge)/i.test(command)) {
    process.stderr.write(
      'Recordatorio: la rama principal no se toca directamente. Trabaja en una rama y abre una PR.\n',
    )
  }
}

process.exit(0)
