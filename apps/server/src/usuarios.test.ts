import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { verificarContrasena } from './auth.js'
import { buscarUsuarioPorId, buscarUsuarioPorNombre, crearUsuario, listarUsuarios } from './usuarios.js'

const rutasTemporales: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-usuarios-'))
  rutasTemporales.push(raiz)
  return raiz
}

afterEach(() => {
  while (rutasTemporales.length > 0) {
    const raiz = rutasTemporales.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

describe('crearUsuario', () => {
  it('crea la cuenta y la contraseña queda hasheada, nunca en claro', () => {
    const raiz = raizTemporal()
    const creado = crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana Vilamar', contrasena: 'una-contraseña-larga' })
    expect(creado.usuario).toBe('ana')
    expect(creado.hashContrasena).not.toBe('una-contraseña-larga')
    expect(verificarContrasena('una-contraseña-larga', creado.hashContrasena)).toBe(true)
  })

  it('rechaza un nombre de usuario que ya existe, sin distinguir mayúsculas', () => {
    const raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-1' })
    expect(() => crearUsuario(raiz, { usuario: 'ANA', nombre: 'Otra Ana', contrasena: 'contraseña-2' })).toThrow(
      /ya existe/i,
    )
  })

  it('dos cuentas distintas quedan las dos guardadas', () => {
    const raiz = raizTemporal()
    crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-1' })
    crearUsuario(raiz, { usuario: 'bea', nombre: 'Bea', contrasena: 'contraseña-2' })
    expect(listarUsuarios(raiz)).toHaveLength(2)
  })
})

describe('buscarUsuarioPorNombre', () => {
  it('encuentra la cuenta sin distinguir mayúsculas', () => {
    const raiz = raizTemporal()
    const creado = crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-1' })
    expect(buscarUsuarioPorNombre(raiz, 'ANA')?.id).toBe(creado.id)
    expect(buscarUsuarioPorNombre(raiz, 'ana')?.id).toBe(creado.id)
  })

  it('sin esa cuenta, no encuentra nada', () => {
    const raiz = raizTemporal()
    expect(buscarUsuarioPorNombre(raiz, 'nadie')).toBeUndefined()
  })
})

describe('buscarUsuarioPorId', () => {
  it('encuentra la cuenta por id', () => {
    const raiz = raizTemporal()
    const creado = crearUsuario(raiz, { usuario: 'ana', nombre: 'Ana', contrasena: 'contraseña-1' })
    expect(buscarUsuarioPorId(raiz, creado.id)?.usuario).toBe('ana')
  })
})
