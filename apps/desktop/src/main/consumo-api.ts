/**
 * consumo-api.ts — El consumo real de la API de Anthropic, para el departamento
 * de Administración (26/10/2026, petición del dueño: saber cuánto gasta cada
 * clave/médico sin montar un servidor).
 *
 * Usa la API de administración de Anthropic (Usage & Cost) con una CLAVE DE
 * ADMINISTRADOR que vive solo en el `.env` del dueño (`ANTHROPIC_ADMIN_KEY`) y
 * nunca va en las copias. Anthropic da el gasto en dólares por espacio de
 * trabajo y el consumo en tokens por clave; NO da el gasto en dólares por clave,
 * y esta pantalla no lo inventa.
 *
 * `resumirConsumo` es una función pura (se prueba sin red); `consultarConsumoApi`
 * hace las llamadas y nunca registra ni devuelve la clave.
 */

import type { ConsumoApi, ConsumoDeClave, ConsumoDeEspacio } from '../compartido/ipc.js'

const BASE = 'https://api.anthropic.com'
const VERSION_API = '2023-06-01'
const MAXIMO_PAGINAS = 20

export type Peticion = (url: string, cabeceras: Record<string, string>) => Promise<RespuestaHttp>
export interface RespuestaHttp {
  readonly status: number
  readonly json: () => Promise<unknown>
}

interface ClaveApi {
  readonly id: string
  readonly name?: string
  readonly status?: string
  readonly scope?: { readonly workspace_id?: string }
}
interface Espacio {
  readonly id: string
  readonly name?: string
}
interface FilaUso {
  readonly api_key_id?: string | null
  readonly uncached_input_tokens?: number
  readonly cache_read_input_tokens?: number
  readonly output_tokens?: number
  readonly cache_creation?: {
    readonly ephemeral_1h_input_tokens?: number
    readonly ephemeral_5m_input_tokens?: number
  }
}
interface FilaCoste {
  readonly amount?: string
  readonly workspace_id?: string | null
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Junta lo que devolvió Anthropic en las dos tablas que enseña la pantalla. */
export function resumirConsumo(entrada: {
  readonly claves: readonly ClaveApi[]
  readonly espacios: readonly Espacio[]
  readonly uso: readonly FilaUso[]
  readonly costes: readonly FilaCoste[]
  readonly mes: string
  readonly ahora: string
}): Extract<ConsumoApi, { estado: 'OK' }> {
  const espacioDe = new Map(entrada.espacios.map((e) => [e.id, e.name ?? e.id]))
  const claves = new Map(entrada.claves.map((c) => [c.id, c]))

  const tokensPorClave = new Map<string | null, number>()
  for (const f of entrada.uso) {
    const id = f.api_key_id ?? null
    const tokens =
      num(f.uncached_input_tokens) +
      num(f.cache_read_input_tokens) +
      num(f.output_tokens) +
      num(f.cache_creation?.ephemeral_1h_input_tokens) +
      num(f.cache_creation?.ephemeral_5m_input_tokens)
    tokensPorClave.set(id, (tokensPorClave.get(id) ?? 0) + tokens)
  }
  const porClave: ConsumoDeClave[] = [...tokensPorClave.entries()].map(([id, tokens]) => {
    const clave = id === null ? undefined : claves.get(id)
    const espacio = clave?.scope?.workspace_id
    return {
      id: id ?? '',
      nombre: id === null ? 'Sin clave (Playground de la Consola)' : (clave?.name ?? id),
      ...(espacio ? { espacio: espacioDe.get(espacio) ?? espacio } : {}),
      estado: clave?.status ?? 'desconocido',
      tokens,
    }
  })
  porClave.sort((a, b) => b.tokens - a.tokens)

  const centimosPorEspacio = new Map<string | null, number>()
  for (const f of entrada.costes) {
    const id = f.workspace_id ?? null
    const centimos = Number.parseFloat(f.amount ?? '0')
    if (Number.isFinite(centimos)) {
      centimosPorEspacio.set(id, (centimosPorEspacio.get(id) ?? 0) + centimos)
    }
  }
  const porEspacio: ConsumoDeEspacio[] = [...centimosPorEspacio.entries()].map(([id, c]) => ({
    id,
    nombre: id === null ? 'Espacio por defecto' : (espacioDe.get(id) ?? id),
    costeUsd: Math.round(c) / 100,
  }))
  porEspacio.sort((a, b) => b.costeUsd - a.costeUsd)

  return {
    estado: 'OK',
    mes: entrada.mes,
    actualizadoEn: entrada.ahora,
    porClave,
    porEspacio,
    totalUsd: Math.round(porEspacio.reduce((s, e) => s + e.costeUsd, 0) * 100) / 100,
    totalTokens: porClave.reduce((s, c) => s + c.tokens, 0),
  }
}

class ErrorDeConsumo extends Error {}

function mensajeDeEstado(status: number): string {
  if (status === 401 || status === 403) {
    return 'La clave de administrador no vale: puede haber caducado, estar mal copiada o no tener permiso. Crea otra en la Consola y cámbiala en el .env.'
  }
  return `Anthropic respondió con un error (${status}). Prueba de nuevo en un rato.`
}

async function pedir(peticion: Peticion, clave: string, ruta: string): Promise<unknown> {
  let respuesta: RespuestaHttp
  try {
    respuesta = await peticion(`${BASE}${ruta}`, {
      'x-api-key': clave,
      'anthropic-version': VERSION_API,
      'user-agent': 'CalculatorVilamar-Administracion/1.0',
    })
  } catch {
    throw new ErrorDeConsumo('No se pudo conectar con Anthropic. Mira la conexión a internet.')
  }
  if (respuesta.status < 200 || respuesta.status >= 300) {
    throw new ErrorDeConsumo(mensajeDeEstado(respuesta.status))
  }
  return respuesta.json()
}

/** Recorre todas las páginas de un listado de Anthropic (con tope, por si algo se cicla). */
async function todas<T>(
  peticion: Peticion,
  clave: string,
  ruta: string,
  tipo: 'cursor' | 'pagina',
): Promise<T[]> {
  const salida: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < MAXIMO_PAGINAS; i += 1) {
    const sep = ruta.includes('?') ? '&' : '?'
    const parametro =
      cursor === null
        ? ''
        : `${sep}${tipo === 'cursor' ? 'after_id' : 'page'}=${encodeURIComponent(cursor)}`
    const cuerpo = (await pedir(peticion, clave, ruta + parametro)) as Record<string, unknown>
    const datos = Array.isArray(cuerpo['data']) ? (cuerpo['data'] as unknown[]) : []
    for (const d of datos) {
      if (tipo === 'pagina') {
        const resultados = (d as { results?: unknown }).results
        if (Array.isArray(resultados)) salida.push(...(resultados as T[]))
      } else {
        salida.push(d as T)
      }
    }
    if (cuerpo['has_more'] !== true) break
    const siguiente = tipo === 'cursor' ? cuerpo['last_id'] : cuerpo['next_page']
    if (typeof siguiente !== 'string' || siguiente === '') break
    cursor = siguiente
  }
  return salida
}

/** «2026-10» → desde el día 1 de ese mes hasta el día 1 del siguiente, en UTC. */
export function rangoDelMes(mes: string): { readonly desde: string; readonly hasta: string } {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const desde = new Date(Date.UTC(a, m - 1, 1))
  const hasta = new Date(Date.UTC(a, m, 1))
  const iso = (d: Date): string => `${d.toISOString().slice(0, 10)}T00:00:00Z`
  return { desde: iso(desde), hasta: iso(hasta) }
}

export async function consultarConsumoApi(
  claveAdmin: string | undefined,
  peticion: Peticion,
  ahora: Date,
): Promise<ConsumoApi> {
  if (!claveAdmin) return { estado: 'SIN_CLAVE' }
  const mes = ahora.toISOString().slice(0, 7)
  const { desde, hasta } = rangoDelMes(mes)
  try {
    const [claves, espacios, uso, costes] = await Promise.all([
      todas<ClaveApi>(peticion, claveAdmin, '/v1/organizations/api_keys?limit=1000', 'cursor'),
      todas<Espacio>(
        peticion,
        claveAdmin,
        '/v1/organizations/workspaces?limit=1000&include_default=true',
        'cursor',
      ),
      todas<FilaUso>(
        peticion,
        claveAdmin,
        `/v1/organizations/usage_report/messages?starting_at=${desde}&ending_at=${hasta}&bucket_width=1d&limit=31&group_by[]=api_key_id`,
        'pagina',
      ),
      todas<FilaCoste>(
        peticion,
        claveAdmin,
        `/v1/organizations/cost_report?starting_at=${desde}&ending_at=${hasta}&limit=31&group_by[]=workspace_id`,
        'pagina',
      ),
    ])
    return resumirConsumo({ claves, espacios, uso, costes, mes, ahora: ahora.toISOString() })
  } catch (e) {
    return {
      estado: 'ERROR',
      mensaje: e instanceof ErrorDeConsumo ? e.message : 'No se pudo leer el consumo.',
    }
  }
}
