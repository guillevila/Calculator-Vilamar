/**
 * almacen.ts — Dónde se guardan las cosas en el disco del usuario.
 *
 * Se guardan ficheros JSON en la carpeta de datos de la aplicación. No hay base
 * de datos, y es una decisión, no una carencia: un caso es un objeto pequeño,
 * no hay consultas, y meter SQLite traería un módulo nativo que hay que
 * compilar. La lección que costó un sprint entero en este proyecto está en el
 * log: «una dependencia nativa no está elegida hasta que se instala».
 *
 * Nada de lo que escribe este módulo entra nunca en el repositorio: vive en
 * `%APPDATA%\calculator-vilamar`.
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Caso, LenteDeCatalogo } from '@vilamar/domain'

export interface Carpetas {
  readonly raiz: string
  readonly casos: string
  readonly documentos: string
  readonly informes: string
  readonly diagnostico: string
  readonly sesiones: string
  /** Capturas de éxito de cada calculadora, una subcarpeta por caso. */
  readonly capturas: string
}

export function prepararCarpetas(rutaDatos: string): Carpetas {
  const carpetas: Carpetas = {
    raiz: rutaDatos,
    casos: join(rutaDatos, 'casos'),
    documentos: join(rutaDatos, 'documentos'),
    informes: join(rutaDatos, 'informes'),
    diagnostico: join(rutaDatos, 'diagnostico'),
    // El perfil del navegador: cookies y sesiones. Local y solo local.
    sesiones: join(rutaDatos, 'sesion-navegador'),
    capturas: join(rutaDatos, 'capturas'),
  }
  for (const ruta of Object.values(carpetas)) mkdirSync(ruta, { recursive: true })
  return carpetas
}

/**
 * Genera el código legible del caso: CV-2026-0007.
 *
 * El contador se saca de cuántos casos hay ya guardados este año. Es sencillo y
 * suficiente para un usuario único; si algún día hay varios, habrá que cambiarlo.
 */
export function siguienteCodigo(carpetas: Carpetas, ahora: Date): string {
  const anio = ahora.getFullYear()
  let contador = 0
  try {
    contador = readdirSync(carpetas.casos).filter((f) => f.startsWith(`CV-${anio}-`)).length
  } catch {
    contador = 0
  }
  return `CV-${anio}-${String(contador + 1).padStart(4, '0')}`
}

export function nuevoId(): string {
  return randomUUID()
}

export function guardarCaso(carpetas: Carpetas, caso: Caso): void {
  const ruta = join(carpetas.casos, `${caso.codigo}.json`)
  writeFileSync(ruta, JSON.stringify(caso, null, 2), 'utf8')
}

export function leerCaso(carpetas: Carpetas, codigo: string): Caso | null {
  try {
    return JSON.parse(readFileSync(join(carpetas.casos, `${codigo}.json`), 'utf8')) as Caso
  } catch {
    return null
  }
}

export function listarCasos(carpetas: Carpetas): readonly string[] {
  try {
    return readdirSync(carpetas.casos)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

/**
 * Guarda una copia local del documento subido.
 *
 * Se guarda para poder volver a leerlo o revisar la evidencia sin pedirle al
 * usuario el fichero otra vez. Vive en la carpeta de datos de la aplicación,
 * jamás en el repositorio.
 */
export function guardarDocumento(
  carpetas: Carpetas,
  nombre: string,
  datos: Uint8Array,
): { id: string; ruta: string } {
  const id = createHash('sha256').update(datos).digest('hex').slice(0, 16)
  const extension = nombre.toLowerCase().split('.').pop() ?? 'bin'
  const ruta = join(carpetas.documentos, `${id}.${extension}`)
  writeFileSync(ruta, datos)
  return { id, ruta }
}

export function leerDocumento(ruta: string): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(ruta))
  } catch {
    return null
  }
}

/**
 * El catálogo de lentes propio del usuario.
 *
 * Un único fichero, no una carpeta: a diferencia de los casos, es una lista
 * pequeña que gestiona una persona a mano en Ajustes, no un registro que crece
 * solo. No pertenece a ningún caso — vive junto a ellos, en la raíz de los
 * datos de la aplicación.
 */
export function leerCatalogo(carpetas: Carpetas): readonly LenteDeCatalogo[] {
  try {
    return JSON.parse(
      readFileSync(join(carpetas.raiz, 'catalogo-lentes.json'), 'utf8'),
    ) as readonly LenteDeCatalogo[]
  } catch {
    return []
  }
}

export function guardarCatalogo(carpetas: Carpetas, catalogo: readonly LenteDeCatalogo[]): void {
  writeFileSync(
    join(carpetas.raiz, 'catalogo-lentes.json'),
    JSON.stringify(catalogo, null, 2),
    'utf8',
  )
}

/**
 * La captura de la pantalla de resultados de una calculadora, para un caso.
 *
 * Una carpeta por caso — no un fichero por captura suelto en la raíz — para
 * que borrar un caso viejo también se lleve sus capturas, el día que haga
 * falta. El nombre del fichero es su propio identificador
 * (`${calculadora}-${ojo}`): no hace falta guardar un índice aparte.
 */
export function guardarCaptura(
  carpetas: Carpetas,
  codigoCaso: string,
  calculadora: string,
  ojo: string,
  datos: Uint8Array,
): string {
  const id = `${calculadora}-${ojo}`
  const destino = join(carpetas.capturas, codigoCaso)
  mkdirSync(destino, { recursive: true })
  writeFileSync(join(destino, `${id}.png`), datos)
  return id
}

export function leerCaptura(carpetas: Carpetas, codigoCaso: string, id: string): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(join(carpetas.capturas, codigoCaso, `${id}.png`)))
  } catch {
    return null
  }
}
