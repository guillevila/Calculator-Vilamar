/**
 * servidor.test.ts — La superficie HTTP real: login, la cookie de sesión, y
 * que dos usuarios nunca vean el caso el uno del otro.
 *
 * Arranca `crearServidor(...)` sobre un puerto de verdad (efímero, sin
 * fijar), con `fetch` contra `localhost` — no contra Express "por dentro" —
 * para probar lo que un navegador o la futura PWA probarían de verdad: las
 * cabeceras `Set-Cookie`/`Cookie`, los códigos de estado. Ninguna de estas
 * pruebas toca Playwright ni ninguna calculadora real: solo crear un caso en
 * blanco (`POST /casos`) y leerlo, que no abre ningún navegador.
 */

import type { Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { secretoDeSesion } from './secreto.js'
import { crearRegistroPorUsuario } from './servicios-por-usuario.js'
import { crearServidor } from './servidor.js'
import { crearUsuario } from './usuarios.js'

const rutasTemporales: string[] = []
let servidor: Server
let base: string

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-servidor-'))
  rutasTemporales.push(raiz)
  return raiz
}

async function arrancar(raizDatos: string): Promise<void> {
  const raices = { datos: raizDatos }
  const secreto = secretoDeSesion(raizDatos)
  const registro = crearRegistroPorUsuario(raices)
  const app = crearServidor(raices, secreto, registro)

  await new Promise<void>((resolve) => {
    servidor = app.listen(0, resolve)
  })
  const direccion = servidor.address()
  if (!direccion || typeof direccion === 'string') throw new Error('No se pudo arrancar el servidor de prueba.')
  base = `http://127.0.0.1:${direccion.port}`
}

afterEach(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()))
  while (rutasTemporales.length > 0) {
    const raiz = rutasTemporales.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

/** Se queda solo con `nombre=valor` — el resto de atributos (`Path`, `HttpOnly`…) no hacen falta para reenviarla. */
function cookieDe(respuesta: Response): string {
  const cabecera = respuesta.headers.get('set-cookie')
  if (!cabecera) throw new Error('La respuesta no traía Set-Cookie.')
  return cabecera.split(';')[0] as string
}

describe('POST /login', () => {
  let raiz: string

  beforeEach(async () => {
    raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana Vilamar', contrasena: 'contraseña-de-ana' })
    await arrancar(raiz)
  })

  it('con usuario y contraseña correctos, entra y deja una cookie de sesión', async () => {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasena: 'contraseña-de-ana' }),
    })
    expect(r.status).toBe(200)
    const cuerpo = (await r.json()) as { usuario: string; nombre: string }
    expect(cuerpo.usuario).toBe('ana')
    expect(cuerpo.nombre).toBe('Ana Vilamar')
    expect(cookieDe(r)).toMatch(/^vilamar_sesion=/)
  })

  it('con la contraseña equivocada, 401 y ninguna cookie', async () => {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasena: 'otra-cosa' }),
    })
    expect(r.status).toBe(401)
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('con un usuario que no existe, 401', async () => {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'nadie', contrasena: 'lo-que-sea' }),
    })
    expect(r.status).toBe(401)
  })
})

describe('rutas /casos, protegidas por sesión', () => {
  beforeEach(async () => {
    await arrancar(raizTemporal())
  })

  it('sin cookie de sesión, 401 — nunca llega a ServicioCasos', async () => {
    const r = await fetch(`${base}/casos`)
    expect(r.status).toBe(401)
  })

  it('con una cookie inventada (no firmada por este servidor), también 401', async () => {
    const r = await fetch(`${base}/casos`, { headers: { Cookie: 'vilamar_sesion=cualquier-cosa' } })
    expect(r.status).toBe(401)
  })
})

describe('aislamiento entre usuarios', () => {
  let raiz: string

  beforeEach(async () => {
    raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-de-ana' })
    crearUsuario(raiz, { usuario: 'bea', nombre: 'Bea', contrasena: 'contraseña-de-bea' })
    await arrancar(raiz)
  })

  async function entrarComo(usuario: string, contrasena: string): Promise<string> {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    })
    return cookieDe(r)
  }

  it('el caso que crea Ana no lo ve Bea, y al revés', async () => {
    const cookieAna = await entrarComo('ana', 'contraseña-de-ana')
    const cookieBea = await entrarComo('bea', 'contraseña-de-bea')

    const casoAna = await fetch(`${base}/casos`, { method: 'POST', headers: { Cookie: cookieAna } })
    const { id: idAna } = (await casoAna.json()) as { id: string }

    // Bea todavía no ha creado ningún caso: el suyo es distinto (null).
    const casoDeBeaAntes = await fetch(`${base}/casos`, { headers: { Cookie: cookieBea } })
    expect(await casoDeBeaAntes.json()).toBeNull()

    const casoBea = await fetch(`${base}/casos`, { method: 'POST', headers: { Cookie: cookieBea } })
    const { id: idBea } = (await casoBea.json()) as { id: string }

    // El `id` (UUID) nunca coincide — a diferencia del código legible
    // (CV-2026-0001…), que SÍ puede repetirse entre dos personas: cada una
    // cuenta sus propios casos, empezando de cero, igual que si tuviera su
    // propio ordenador (D91). Lo que no puede pasar nunca es que una vea el
    // caso de la otra.
    expect(idAna).not.toBe(idBea)

    // Cada una sigue viendo el suyo, no el de la otra, en peticiones
    // posteriores.
    const actualAna = await fetch(`${base}/casos`, { headers: { Cookie: cookieAna } })
    const { id: idActualAna } = (await actualAna.json()) as { id: string }
    expect(idActualAna).toBe(idAna)
    expect(idActualAna).not.toBe(idBea)
  })
})

describe('GET /quien-soy', () => {
  it('con sesión, devuelve la cuenta que ha entrado', async () => {
    const raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana Vilamar', contrasena: 'contraseña-de-ana' })
    await arrancar(raiz)

    const login = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasena: 'contraseña-de-ana' }),
    })
    const cookie = cookieDe(login)

    const r = await fetch(`${base}/quien-soy`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ usuario: 'ana', nombre: 'Ana Vilamar' })
  })
})

describe('POST /logout', () => {
  it('borra la cookie: después, /casos vuelve a pedir sesión', async () => {
    const raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-de-ana' })
    await arrancar(raiz)

    const login = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasena: 'contraseña-de-ana' }),
    })
    const cookie = cookieDe(login)

    const logout = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } })
    expect(logout.status).toBe(200)
    const cookieBorrada = cookieDe(logout)
    expect(cookieBorrada).toBe('vilamar_sesion=')

    // La cookie recién borrada ya no sirve para entrar.
    const r = await fetch(`${base}/casos`, { headers: { Cookie: cookieBorrada } })
    expect(r.status).toBe(401)
  })
})
