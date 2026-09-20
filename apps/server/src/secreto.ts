/**
 * secreto.ts — La clave con la que se firman los tokens de sesión
 * (`auth.ts`).
 *
 * Con `VILAMAR_SERVER_SECRETO_SESION` puesta, se usa esa (pensado para el
 * VPS: la clave la gestiona quien despliega, fuera del disco de la
 * aplicación). Sin ella, se genera una vez, aleatoria, y se guarda en un
 * fichero dentro de la propia carpeta de datos — así sobrevive a reiniciar
 * el servidor sin desconectar a nadie, sin obligar a poner una variable de
 * entorno para un uso de dos o tres personas.
 *
 * Cambiar el secreto (a mano, o generando uno nuevo) invalida TODAS las
 * sesiones de golpe — es la forma de «cerrar sesión a todo el mundo» sin
 * mantener una lista de sesiones que revocar una a una.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LONGITUD_SECRETO = 32

export function secretoDeSesion(raizDatos: string): Buffer {
  const desdeEntorno = process.env['VILAMAR_SERVER_SECRETO_SESION']
  if (desdeEntorno) return Buffer.from(desdeEntorno, 'hex')

  const ruta = join(raizDatos, 'secreto-sesion')
  if (existsSync(ruta)) return Buffer.from(readFileSync(ruta, 'utf8').trim(), 'hex')

  const secreto = randomBytes(LONGITUD_SECRETO)
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, secreto.toString('hex'), 'utf8')
  return secreto
}
