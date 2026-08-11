/**
 * ajustes.ts — Lee el fichero `.env`, si lo hay.
 *
 * Sin esto, poner `ANTHROPIC_API_KEY=...` en un `.env` no haría absolutamente
 * nada: Electron no lee ficheros `.env` por su cuenta. Y sería el peor tipo de
 * fallo — el usuario configura la clave, guarda, arranca, y la aplicación sigue
 * usando el OCR sin decir nada, porque «no hay clave».
 *
 * Se escribe a mano en lugar de traer una dependencia porque son quince líneas
 * y aquí conviene poder leer exactamente qué hace un fichero que va a contener
 * una clave: no la imprime, no la manda a ningún sitio y no pisa una variable
 * que ya venga del sistema.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dónde se busca el `.env`, en este orden:
 *
 *  1. La carpeta de datos de la aplicación. Es el sitio bueno cuando está
 *     instalada: sobrevive a las actualizaciones y no está dentro de Archivos
 *     de programa.
 *  2. La carpeta desde la que se arranca. Es lo cómodo mientras se desarrolla.
 */
export function rutasDeEnv(carpetaDatos: string): readonly string[] {
  return [join(carpetaDatos, '.env'), join(process.cwd(), '.env')]
}

/**
 * Convierte el texto de un `.env` en pares clave-valor.
 *
 * Deliberadamente simple: `CLAVE=valor`, una por línea, `#` para comentarios y
 * comillas opcionales. No admite variables dentro de variables ni continuación
 * de línea, porque no hacen falta y cada añadido es una forma más de que el
 * fichero diga algo distinto de lo que parece.
 */
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
 * **No pisa lo que ya venga del sistema.** Si alguien arranca la aplicación con
 * la variable puesta a mano, esa gana: es lo que espera quien la ha puesto.
 *
 * Devuelve la ruta del fichero usado, o null. Nunca devuelve ni registra el
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
      // Un .env ilegible no impide arrancar. La aplicación funciona sin él.
      return null
    }
  }
  return null
}
