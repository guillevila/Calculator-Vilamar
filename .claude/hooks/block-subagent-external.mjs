#!/usr/bin/env node
/**
 * block-subagent-external.mjs — Un subagente no hace cosas hacia fuera.
 *
 * Portado de `block-subagent-external.py`, que venía en el andamiaje original del
 * proyecto. Se reescribe en Node por lo mismo que el resto de los hooks: los de
 * Python y Bash no funcionaban en Windows, y además salían con código 1, que
 * Claude Code NO trata como bloqueo. Una protección que no bloquea es peor que no
 * tener protección, porque se cuenta como puesta.
 *
 * ── Qué separa, y por qué ───────────────────────────────────────────────────
 *
 * Hay dos listas, y la diferencia importa:
 *
 *  - **Siempre bloqueado**: destrucción irreversible. Da igual quién lo pida.
 *  - **Bloqueado solo en subagente**: operaciones hacia fuera —`git push`,
 *    fusionar una PR, publicar una release, desplegar—. El agente principal SÍ
 *    puede hacerlas, porque está en conversación con una persona que ve lo que
 *    pasa y puede pararlo. Un subagente trabaja solo, dentro de una tarea, y
 *    nadie está mirando ese momento.
 *
 * Esto importa más desde que existe una regla de permisos que autoriza `git push`
 * al agente principal: sin esta separación, esa autorización se heredaría a
 * cualquier subagente lanzado dentro de una tarea.
 *
 * Para BLOQUEAR hay que salir con **2**. Con 1 la herramienta se ejecuta igual.
 */

import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

import { readHookInput } from './_input.mjs'

/** Destrucción irreversible. No la hace nadie, ni el agente principal. */
export const SIEMPRE_BLOQUEADO = ['DROP DATABASE', 'TRUNCATE TABLE', 'rm -rf /', 'format c:']

/** Operaciones hacia fuera. Las hace el agente principal, no un subagente. */
export const BLOQUEADO_EN_SUBAGENTE = [
  'git push',
  'gh pr create',
  'gh pr merge',
  'gh release',
  'gh repo delete',
  'deploy.sh',
  'deploy.ps1',
  'npm run deploy',
  'pnpm deploy',
  'vercel --prod',
  'ALTER DATABASE',
  'DROP TABLE',
]

/**
 * ¿Estamos dentro de un subagente?
 *
 * Se mira más de una variable a propósito: el nombre exacto depende de la versión
 * de Claude Code, y una protección que deja de aplicarse porque cambió el nombre
 * de una variable es la clase de fallo que no se nota hasta que ya ha pasado algo.
 */
export function esSubagente(entorno = env) {
  for (const clave of ['CLAUDE_SUBAGENT', 'CLAUDE_AGENT_IS_SUBAGENT', 'CLAUDE_IS_SUBAGENT']) {
    if (String(entorno[clave] ?? '').toLowerCase() === 'true') return true
  }
  return false
}

/**
 * Decide si algo se bloquea.
 *
 * Devuelve el motivo, o `null` si puede pasar. Separado del resto para poder
 * probarlo sin lanzar un proceso.
 */
export function revisar(cargaUtil, subagente) {
  const texto = JSON.stringify(cargaUtil?.tool_input ?? {}).toLowerCase()

  for (const prohibido of SIEMPRE_BLOQUEADO) {
    if (texto.includes(prohibido.toLowerCase())) {
      return {
        motivo: `«${prohibido}» destruye datos sin vuelta atrás.`,
        detalle: 'Esto no lo ejecuta nadie de forma automática, ni el agente principal.',
      }
    }
  }

  if (!subagente) return null

  for (const prohibido of BLOQUEADO_EN_SUBAGENTE) {
    if (texto.includes(prohibido.toLowerCase())) {
      return {
        motivo: `«${prohibido}» es una operación hacia fuera, y esto es un subagente.`,
        detalle:
          'Las operaciones que salen del ordenador las hace el agente principal, con una persona delante que ve lo que pasa. Devuelve el resultado de tu tarea y que lo haga él.',
      }
    }
  }

  return null
}

/**
 * ¿Se está ejecutando como hook, o alguien lo ha importado desde un test?
 *
 * Se compara con `pathToFileURL` y NO montando la URL a mano. La primera versión
 * hacía `` `file:///${argv[1].replace(/\\/g,'/')}` ``, y con eso la comparación
 * **nunca** era cierta en este proyecto: la ruta contiene un espacio
 * («Calculadora Vilamar»), que en `import.meta.url` viaja como `%20`. Resultado:
 * el bloque de abajo no se ejecutaba jamás y el hook salía siempre con 0.
 *
 * Es el mismo fallo que tenía el hook original en Python, cometido otra vez y por
 * otro motivo: **una protección que no bloquea es peor que no tener protección**,
 * porque cuenta como puesta. Los tests de `revisar()` pasaban con el hook muerto,
 * que es justo por lo que ahora hay también una prueba que lanza el proceso.
 */
function esLaEjecucionPrincipal() {
  if (!argv[1]) return false
  return import.meta.url === pathToFileURL(argv[1]).href
}

if (esLaEjecucionPrincipal()) {
  let carga = {}
  try {
    carga = await readHookInput()
  } catch {
    // Sin entrada legible no se puede juzgar nada. Dejar pasar es lo correcto:
    // bloquear por no haber podido leer convertiría un fallo del hook en un
    // bloqueo del trabajo.
    exit(0)
  }

  const problema = revisar(carga, esSubagente())
  if (problema) {
    console.error(`🛑 BLOQUEADO: ${problema.motivo}`)
    console.error(`   ${problema.detalle}`)
    exit(2)
  }
  exit(0)
}
