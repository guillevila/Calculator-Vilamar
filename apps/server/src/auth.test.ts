import { describe, expect, it } from 'vitest'

import { crearToken, hashContrasena, verificarContrasena, verificarToken } from './auth.js'

describe('hashContrasena / verificarContrasena', () => {
  it('una contraseña correcta se verifica', () => {
    const hash = hashContrasena('correcto-caballo-batería-grapa')
    expect(verificarContrasena('correcto-caballo-batería-grapa', hash)).toBe(true)
  })

  it('una contraseña incorrecta no se verifica', () => {
    const hash = hashContrasena('correcto-caballo-batería-grapa')
    expect(verificarContrasena('otra-cosa', hash)).toBe(false)
  })

  it('dos contraseñas iguales nunca dan el mismo hash — la sal es aleatoria', () => {
    const a = hashContrasena('la-misma')
    const b = hashContrasena('la-misma')
    expect(a).not.toBe(b)
    expect(verificarContrasena('la-misma', a)).toBe(true)
    expect(verificarContrasena('la-misma', b)).toBe(true)
  })

  it('un hash con formato roto no revienta, simplemente no verifica', () => {
    expect(verificarContrasena('cualquiera', 'esto-no-es-un-hash-valido')).toBe(false)
  })
})

describe('crearToken / verificarToken', () => {
  const secreto = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')

  it('un token recién creado verifica al mismo usuario', () => {
    const token = crearToken('usuario-123', secreto)
    expect(verificarToken(token, secreto)).toBe('usuario-123')
  })

  it('un token firmado con OTRO secreto no verifica', () => {
    const otroSecreto = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex')
    const token = crearToken('usuario-123', secreto)
    expect(verificarToken(token, otroSecreto)).toBeNull()
  })

  it('un token manipulado (payload cambiado a mano) no verifica', () => {
    const token = crearToken('usuario-123', secreto)
    const firma = token.split('.')[1]
    const payloadFalso = Buffer.from(
      JSON.stringify({ usuarioId: 'otro-usuario', caduca: Date.now() + 1e9 }),
    ).toString('base64url')
    expect(verificarToken(`${payloadFalso}.${firma}`, secreto)).toBeNull()
  })

  it('un token caducado no verifica', () => {
    const token = crearToken('usuario-123', secreto)
    // La duración es de 30 días — para probar la caducidad sin esperarla de
    // verdad, se verifica con un reloj puesto muy por delante.
    const dentroDeUnSiglo = () => new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
    expect(verificarToken(token, secreto, dentroDeUnSiglo)).toBeNull()
  })

  it('un texto que no tiene forma de token no verifica', () => {
    expect(verificarToken('esto-no-es-un-token', secreto)).toBeNull()
    expect(verificarToken('demasiadas.partes.aqui', secreto)).toBeNull()
  })
})
