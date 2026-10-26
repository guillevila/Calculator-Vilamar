import { describe, expect, it } from 'vitest'

import { consultarConsumoApi, rangoDelMes, resumirConsumo } from './consumo-api.js'
import type { Peticion } from './consumo-api.js'

describe('resumirConsumo', () => {
  it('junta los tokens por clave (con su nombre y espacio) y el gasto por espacio', () => {
    const r = resumirConsumo({
      mes: '2026-10',
      ahora: '2026-10-26T10:00:00.000Z',
      espacios: [{ id: 'w1', name: 'beta medicos' }],
      claves: [
        { id: 'k1', name: 'beta-mujer', status: 'active', scope: { workspace_id: 'w1' } },
        { id: 'k2', name: 'beta-doctor1', status: 'active', scope: { workspace_id: 'w1' } },
      ],
      uso: [
        { api_key_id: 'k1', uncached_input_tokens: 1000, output_tokens: 200 },
        {
          api_key_id: 'k1',
          cache_read_input_tokens: 50,
          cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 5 },
        },
        { api_key_id: 'k2', uncached_input_tokens: 300 },
        { api_key_id: null, output_tokens: 7 },
      ],
      costes: [
        { workspace_id: 'w1', amount: '123.4' },
        { workspace_id: 'w1', amount: '10' },
        { workspace_id: null, amount: '50' },
      ],
    })
    expect(r.porClave.map((c) => [c.nombre, c.tokens])).toEqual([
      ['beta-mujer', 1265],
      ['beta-doctor1', 300],
      ['Sin clave (Playground de la Consola)', 7],
    ])
    expect(r.porClave[0]).toMatchObject({ espacio: 'beta medicos', estado: 'active' })
    expect(r.porEspacio).toEqual([
      { id: 'w1', nombre: 'beta medicos', costeUsd: 1.33 },
      { id: null, nombre: 'Espacio por defecto', costeUsd: 0.5 },
    ])
    expect(r.totalUsd).toBe(1.83)
    expect(r.totalTokens).toBe(1572)
  })

  it('una clave que ya no aparece en la lista sale con su identificador, sin inventar nombre', () => {
    const r = resumirConsumo({
      mes: '2026-10',
      ahora: 'x',
      espacios: [],
      claves: [],
      uso: [{ api_key_id: 'apikey_borrada', output_tokens: 5 }],
      costes: [],
    })
    expect(r.porClave[0]).toMatchObject({ nombre: 'apikey_borrada', estado: 'desconocido' })
    expect(r.totalUsd).toBe(0)
  })
})

describe('rangoDelMes', () => {
  it('va del día 1 al día 1 del mes siguiente, también en diciembre', () => {
    expect(rangoDelMes('2026-10')).toEqual({
      desde: '2026-10-01T00:00:00Z',
      hasta: '2026-11-01T00:00:00Z',
    })
    expect(rangoDelMes('2026-12').hasta).toBe('2027-01-01T00:00:00Z')
  })
})

describe('consultarConsumoApi', () => {
  const ahora = new Date('2026-10-26T10:00:00Z')
  const respuesta = (status: number, cuerpo: unknown) => ({
    status,
    json: () => Promise.resolve(cuerpo),
  })

  it('sin clave de administrador lo dice y no llama a nadie', async () => {
    let llamadas = 0
    const p: Peticion = () => {
      llamadas += 1
      return Promise.resolve(respuesta(200, {}))
    }
    expect(await consultarConsumoApi(undefined, p, ahora)).toEqual({ estado: 'SIN_CLAVE' })
    expect(llamadas).toBe(0)
  })

  it('manda la clave solo en la cabecera, recorre las páginas y resume', async () => {
    const urls: string[] = []
    const cabeceras: Record<string, string>[] = []
    const p: Peticion = (url, c) => {
      urls.push(url)
      cabeceras.push(c)
      if (url.includes('/api_keys')) {
        return Promise.resolve(
          respuesta(200, {
            data: [{ id: 'k1', name: 'beta-mujer', status: 'active' }],
            has_more: false,
          }),
        )
      }
      if (url.includes('/workspaces')) {
        return Promise.resolve(
          respuesta(200, { data: [{ id: 'w1', name: 'beta' }], has_more: false }),
        )
      }
      if (url.includes('/usage_report/') && !url.includes('page=')) {
        return Promise.resolve(
          respuesta(200, {
            data: [{ results: [{ api_key_id: 'k1', output_tokens: 10 }] }],
            has_more: true,
            next_page: 'pg2',
          }),
        )
      }
      if (url.includes('/usage_report/')) {
        return Promise.resolve(
          respuesta(200, {
            data: [{ results: [{ api_key_id: 'k1', output_tokens: 5 }] }],
            has_more: false,
          }),
        )
      }
      return Promise.resolve(
        respuesta(200, {
          data: [{ results: [{ workspace_id: 'w1', amount: '250' }] }],
          has_more: false,
        }),
      )
    }
    const r = await consultarConsumoApi('sk-ant-admin01-SECRETA', p, ahora)
    expect(r).toMatchObject({ estado: 'OK', mes: '2026-10', totalUsd: 2.5, totalTokens: 15 })
    expect(urls.some((u) => u.includes('SECRETA'))).toBe(false)
    expect(cabeceras.every((c) => c['x-api-key'] === 'sk-ant-admin01-SECRETA')).toBe(true)
    expect(urls.some((u) => u.includes('page=pg2'))).toBe(true)
  })

  it('una clave rechazada se explica sin enseñar la clave', async () => {
    const p: Peticion = () => Promise.resolve(respuesta(401, {}))
    const r = await consultarConsumoApi('sk-ant-admin01-SECRETA', p, ahora)
    expect(r.estado).toBe('ERROR')
    expect(JSON.stringify(r)).not.toContain('SECRETA')
    expect(JSON.stringify(r)).toContain('caducado')
  })

  it('un fallo de red se explica', async () => {
    const p: Peticion = () => Promise.reject(new Error('ECONNRESET'))
    const r = await consultarConsumoApi('sk-ant-admin01-X', p, ahora)
    expect(r).toMatchObject({ estado: 'ERROR' })
  })
})
