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

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
 * ¿Es esta la instalación del administrador? (25/10/2026, departamento de
 * Administración.) Solo si el `.env` de ESTE ordenador —o el sistema— pone
 * `VILAMAR_ADMINISTRADOR=1`. El `.env` no va en la copia que se reparte, así que
 * las copias no lo ven. Es una compuerta de interfaz, NO seguridad: quien tenga
 * el código puede ponerse esa variable. Por eso la pantalla no guarda nada que
 * pueda dañar a nadie: solo condiciones de cobro y cifras de uso locales.
 */
export function esInstalacionAdministradora(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return entorno['VILAMAR_ADMINISTRADOR'] === '1'
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

/**
 * ¿Parece una clave de API de Anthropic escrita en una sola pieza? (Primer
 * arranque, 26/10/2026.) Solo se comprueba la forma —sin espacios, comillas ni
 * saltos de línea, que podrían colar otra línea en el `.env`—, no que funcione:
 * probarla costaría una llamada y la clave no sale de este ordenador.
 */
export function claveConFormaValida(clave: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(clave)
}

/**
 * Guarda la clave en el `.env` de la carpeta de datos: cambia la línea
 * `ANTHROPIC_API_KEY=` si ya estaba y, si no, la añade al final; el resto del
 * fichero no se toca. Devuelve false (sin escribir nada) si la forma no vale.
 * Nunca devuelve ni registra la clave.
 */
export function guardarClaveEnEnv(carpetaDatos: string, clave: string): boolean {
  const limpia = clave.trim()
  if (!claveConFormaValida(limpia)) return false
  const ruta = join(carpetaDatos, '.env')
  const actual = existsSync(ruta) ? readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n') : ''
  const lineas = actual === '' ? [] : actual.replace(/\n$/, '').split('\n')
  const nueva = `ANTHROPIC_API_KEY=${limpia}`
  const posicion = lineas.findIndex((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l))
  if (posicion >= 0) lineas[posicion] = nueva
  else lineas.push(nueva)
  writeFileSync(ruta, `${lineas.join('\n')}\n`, 'utf8')
  process.env['ANTHROPIC_API_KEY'] = limpia
  return true
}

/** Lo que cada persona elige en el primer arranque, guardado en SU ordenador. */
export interface AjustesDeUsuario {
  /** Dónde guardar los informes; ausente = el sitio de siempre. */
  readonly carpetaInformes?: string
  /** Ya pasó por el asistente (o lo omitió): no se le vuelve a enseñar. */
  readonly primerArranqueHecho?: boolean
}

export function leerAjustesDeUsuario(carpetaDatos: string): AjustesDeUsuario {
  try {
    const crudo: unknown = JSON.parse(
      readFileSync(join(carpetaDatos, 'ajustes-usuario.json'), 'utf8'),
    )
    if (typeof crudo !== 'object' || crudo === null) return {}
    const c = crudo as Record<string, unknown>
    return {
      ...(typeof c['carpetaInformes'] === 'string' && c['carpetaInformes'] !== ''
        ? { carpetaInformes: c['carpetaInformes'] }
        : {}),
      ...(c['primerArranqueHecho'] === true ? { primerArranqueHecho: true } : {}),
    }
  } catch {
    return {}
  }
}

export function guardarAjustesDeUsuario(carpetaDatos: string, cambios: AjustesDeUsuario): void {
  const nuevos = { ...leerAjustesDeUsuario(carpetaDatos), ...cambios }
  writeFileSync(join(carpetaDatos, 'ajustes-usuario.json'), JSON.stringify(nuevos, null, 2), 'utf8')
}
