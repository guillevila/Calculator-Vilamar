/**
 * auth.ts — Contraseñas y tokens de sesión, para la Fase 2 del plan móvil
 * (login sencillo, un caso por persona — `docs/PLAN-APP-MOVIL.md`).
 *
 * Sin librerías nuevas a propósito: `node:crypto` ya trae todo lo que hace
 * falta (`scrypt` para contraseñas, HMAC para firmar el token de sesión) sin
 * añadir una dependencia más a un proyecto que evita módulos nativos que
 * compilar (ver `.claude/skills/lessons-learned/log.md`, 11/08/2026).
 *
 * Dos piezas independientes:
 *
 *  1. **Contraseña → hash.** `scrypt` con una sal aleatoria por contraseña —
 *     dos personas con la misma contraseña nunca tienen el mismo hash.
 *  2. **Sesión → token.** Un token FIRMADO (HMAC-SHA256), no cifrado: quien
 *     lo lea puede ver el id de usuario y la caducidad, pero no puede
 *     fabricar uno nuevo sin el secreto del servidor (`secreto.ts`). No hay
 *     lista de sesiones que revocar en el servidor — con dos o tres personas
 *     de confianza, cerrar sesión borrando la cookie del navegador basta; si
 *     hiciera falta invalidar TODAS las sesiones de golpe, se rota el
 *     secreto (`secreto.ts`).
 */

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'

const LONGITUD_SAL = 16
const LONGITUD_CLAVE = 64
const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000 // 30 días — ver docstring

/** `sal:hash`, ambos en hexadecimal. Nunca se guarda la contraseña en claro. */
export function hashContrasena(contrasena: string): string {
  const sal = randomBytes(LONGITUD_SAL)
  const hash = scryptSync(contrasena, sal, LONGITUD_CLAVE)
  return `${sal.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Compara con `timingSafeEqual`, no con `===`: comparar hashes byte a byte
 * con un `===` normal deja un canal por temporización (cuanto antes difiere
 * el primer byte, antes vuelve la función) — de poca utilidad práctica aquí,
 * con dos o tres usuarios, pero es la forma correcta y no cuesta nada más.
 */
export function verificarContrasena(contrasena: string, hashGuardado: string): boolean {
  const [salHex, hashHex] = hashGuardado.split(':')
  if (!salHex || !hashHex) return false
  const sal = Buffer.from(salHex, 'hex')
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = scryptSync(contrasena, sal, esperado.length)
  if (calculado.length !== esperado.length) return false
  return timingSafeEqual(calculado, esperado)
}

interface CargaToken {
  readonly usuarioId: string
  readonly caduca: number
}

function firmar(payload: string, secreto: Buffer): string {
  return createHmac('sha256', secreto).update(payload).digest('base64url')
}

/** Token de sesión: `payload-base64url.firma-base64url`. */
export function crearToken(usuarioId: string, secreto: Buffer, ahora: () => Date = () => new Date()): string {
  const carga: CargaToken = { usuarioId, caduca: ahora().getTime() + DURACION_SESION_MS }
  const payload = Buffer.from(JSON.stringify(carga)).toString('base64url')
  return `${payload}.${firmar(payload, secreto)}`
}

/** El id de usuario si el token es válido y no ha caducado; si no, `null`. */
export function verificarToken(
  token: string,
  secreto: Buffer,
  ahora: () => Date = () => new Date(),
): string | null {
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [payload, firma] = partes as [string, string]

  const firmaEsperada = firmar(payload, secreto)
  const a = Buffer.from(firma)
  const b = Buffer.from(firmaEsperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let carga: CargaToken
  try {
    carga = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CargaToken
  } catch {
    return null
  }
  if (typeof carga.usuarioId !== 'string' || typeof carga.caduca !== 'number') return null
  if (ahora().getTime() > carga.caduca) return null
  return carga.usuarioId
}
