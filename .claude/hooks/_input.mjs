/**
 * Lectura de la entrada que Claude Code envía a los hooks.
 *
 * Llega como JSON por la entrada estándar, con campos como `hook_event_name`,
 * `tool_name`, `tool_input` y `cwd`. Un hook nunca debe reventar por una
 * entrada rara: si algo no se puede leer, se devuelve un objeto vacío y el
 * hook sigue su camino sin estorbar.
 */
export async function readHookInput() {
  try {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/** Marca de tiempo ISO sin milisegundos, para los registros de auditoría. */
export function timestamp() {
  return `${new Date().toISOString().slice(0, 19)}Z`
}
