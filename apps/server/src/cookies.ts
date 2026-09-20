/**
 * cookies.ts — Leer y escribir la cookie de sesión, a mano.
 *
 * Sin `cookie-parser`: es una sola cookie, de solo lectura de su valor y
 * escritura de tres atributos fijos — no hace falta una librería para eso
 * (mismo criterio que ya sigue este proyecto con el dashboard: «dibujado a
 * mano, sin ninguna librería nueva» antes que una dependencia de más).
 */

import type { Request, Response } from 'express'

export const NOMBRE_COOKIE_SESION = 'vilamar_sesion'
const DURACION_COOKIE_S = 30 * 24 * 60 * 60 // 30 días — igual que el token (auth.ts)

export function leerCookie(req: Request, nombre: string): string | undefined {
  const cabecera = req.headers.cookie
  if (!cabecera) return undefined
  for (const parte of cabecera.split(';')) {
    const igual = parte.indexOf('=')
    if (igual === -1) continue
    const clave = parte.slice(0, igual).trim()
    if (clave === nombre) return decodeURIComponent(parte.slice(igual + 1).trim())
  }
  return undefined
}

/**
 * @param seguro Añade `Secure` (la cookie solo viaja por HTTPS) — hay que
 *   desactivarlo en desarrollo local por HTTP, donde el navegador la
 *   descartaría. En el VPS de verdad, con HTTPS, tiene que ir activado.
 */
export function ponerCookieSesion(res: Response, token: string, seguro: boolean): void {
  const atributos = [
    `${NOMBRE_COOKIE_SESION}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${DURACION_COOKIE_S}`,
    ...(seguro ? ['Secure'] : []),
  ]
  res.setHeader('Set-Cookie', atributos.join('; '))
}

export function borrarCookieSesion(res: Response, seguro: boolean): void {
  const atributos = [
    `${NOMBRE_COOKIE_SESION}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(seguro ? ['Secure'] : []),
  ]
  res.setHeader('Set-Cookie', atributos.join('; '))
}
