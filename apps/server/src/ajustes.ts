/**
 * ajustes.ts — Lee el fichero `.env`, si lo hay.
 *
 * Copia de `apps/desktop/src/main/ajustes.ts` (mismo propósito, misma
 * lógica): Node no lee ficheros `.env` por su cuenta, así que sin esto poner
 * `ANTHROPIC_API_KEY=...` en un `.env` no haría nada — el servidor seguiría
 * leyendo solo el texto nativo del PDF, sin decir por qué.
 *
 * No se comparte como paquete porque son quince líneas sin ninguna lógica de
 * negocio: duplicarlas pesa menos que una dependencia nueva entre dos
 * aplicaciones por algo que no va a cambiar.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dónde se busca el `.env`, en este orden:
 *
 *  1. La carpeta de datos del servidor (`VILAMAR_SERVER_DATOS`). Sobrevive a
 *     reinicios y actualizaciones del código.
 *  2. La carpeta desde la que se arranca. Cómodo en desarrollo.
 */
export function rutasDeEnv(carpetaDatos: string): readonly string[] {
  return [join(carpetaDatos, '.env'), join(process.cwd(), '.env')]
}

/** Convierte el texto de un `.env` en pares clave-valor. Deliberadamente simple. */
export function analizarEnv(texto: string): Readonly<Record<string, string>> {
  const salida: Record<string, string> = {}
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim()
    if (limpia === '' || limpia.startsWith('#')) continue
    const igual = limpia.indexOf('=')
    if (igual <= 0) continue
    const clave = limpia.slice(0, igual).trim()
    let valor = limpia.slice(igual + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2)
    ) {
      valor = valor.slice(1, -1)
    }
    if (clave !== '') salida[clave] = valor
  }
  return salida
}

/**
 * Carga el primer `.env` que encuentre en `process.env`.
 *
 * No pisa lo que ya venga del sistema. Nunca devuelve ni registra el
 * contenido: es lo que evita que una clave acabe en un log.
 */
export function cargarEnv(carpetaDatos: string): string | null {
  for (const ruta of rutasDeEnv(carpetaDatos)) {
    if (!existsSync(ruta)) continue
    try {
      for (const [clave, valor] of Object.entries(analizarEnv(readFileSync(ruta, 'utf8')))) {
        if (process.env[clave] === undefined) process.env[clave] = valor
      }
      return ruta
    } catch {
      return null
    }
  }
  return null
}
