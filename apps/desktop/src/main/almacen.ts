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
 * `%APPDATA%\calculator-vilamar`, salvo `informes` — ver su comentario.
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import type { Caso, Doctor, EntradaBandeja } from '@vilamar/domain'

export interface Carpetas {
  readonly raiz: string
  readonly casos: string
  readonly documentos: string
  readonly informes: string
  readonly diagnostico: string
  readonly capturas: string
  readonly sesiones: string
}

/**
 * @param rutaInformes Dónde guardar los PDF/HTML ya generados (D57,
 *   01/09/2026) — petición expresa del dueño del proyecto, para poder
 *   encontrarlos sin navegar hasta `%APPDATA%`. Sin especificarla, se
 *   quedan junto al resto de datos internos, como antes.
 *
 *   ⚠️ **Aviso que se le hizo al dueño, y que aceptó informado**: en este
 *   ordenador el Escritorio está sincronizado con el OneDrive de la
 *   empresa. Los informes llevan el nombre real del paciente (D44), así
 *   que guardarlos en una carpeta del Escritorio los sube automáticamente
 *   a esa nube corporativa — algo que no pasaba mientras vivían en
 *   `AppData`. Decisión suya, tomada sabiendo esto.
 */
export function prepararCarpetas(rutaDatos: string, rutaInformes?: string): Carpetas {
  const carpetas: Carpetas = {
    raiz: rutaDatos,
    casos: join(rutaDatos, 'casos'),
    documentos: join(rutaDatos, 'documentos'),
    informes: rutaInformes ?? join(rutaDatos, 'informes'),
    diagnostico: join(rutaDatos, 'diagnostico'),
    capturas: join(rutaDatos, 'capturas'),
    // El perfil del navegador: cookies y sesiones. Local y solo local.
    sesiones: join(rutaDatos, 'sesion-navegador'),
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
 * Saca un caso de `casos/` (D85, 16/09/2026, «Eliminar» del dashboard por
 * doctor) — pero no lo borra para siempre: lo mueve a
 * `casos-borrados/<día>/`, igual que se hizo a mano la primera vez que el
 * dueño pidió limpiar unos casos de prueba. Un acierto o un error de
 * verdad no es lo mismo que un despiste, y esto deja sitio para
 * recuperarlo si hiciera falta. Si el caso ya no está (borrado dos veces,
 * o movido a mano), no hace nada — no es un error, ya está fuera.
 */
export function moverCasoABorrados(carpetas: Carpetas, codigo: string, dia: string): void {
  const origen = join(carpetas.casos, `${codigo}.json`)
  if (!existsSync(origen)) return
  const destino = join(carpetas.raiz, 'casos-borrados', dia)
  mkdirSync(destino, { recursive: true })
  renameSync(origen, join(destino, `${codigo}.json`))
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
 * La agenda de doctores (D80, 15/09/2026): un único fichero, no una carpeta
 * por doctor — es una lista corta, sin las consultas por código que
 * justifican que cada caso tenga su propio fichero.
 */
export function leerDoctores(carpetas: Carpetas): readonly Doctor[] {
  try {
    return JSON.parse(readFileSync(join(carpetas.raiz, 'doctores.json'), 'utf8')) as Doctor[]
  } catch {
    return []
  }
}

export function guardarDoctores(carpetas: Carpetas, doctores: readonly Doctor[]): void {
  writeFileSync(join(carpetas.raiz, 'doctores.json'), JSON.stringify(doctores, null, 2), 'utf8')
}

/**
 * La bandeja de casos (D81, 15/09/2026): igual que los doctores, un único
 * fichero — la lista de avisos pendientes de trabajar, no depende de
 * ningún caso concreto.
 */
export function leerBandeja(carpetas: Carpetas): readonly EntradaBandeja[] {
  try {
    return JSON.parse(readFileSync(join(carpetas.raiz, 'bandeja.json'), 'utf8')) as EntradaBandeja[]
  } catch {
    return []
  }
}

export function guardarBandeja(carpetas: Carpetas, entradas: readonly EntradaBandeja[]): void {
  writeFileSync(join(carpetas.raiz, 'bandeja.json'), JSON.stringify(entradas, null, 2), 'utf8')
}

/**
 * Doctores excluidos del dashboard (D83, 16/09/2026): pruebas o casos
 * metidos por error, para que no cuenten en las estadísticas sin tener
 * que borrar el caso real. Una lista de nombres, no de ids — un caso de
 * prueba puede llevar un nombre que ni siquiera está en la agenda de
 * doctores (D80).
 */
export function leerDoctoresExcluidos(carpetas: Carpetas): readonly string[] {
  try {
    return JSON.parse(
      readFileSync(join(carpetas.raiz, 'doctores-excluidos.json'), 'utf8'),
    ) as string[]
  } catch {
    return []
  }
}

export function guardarDoctoresExcluidos(carpetas: Carpetas, nombres: readonly string[]): void {
  writeFileSync(
    join(carpetas.raiz, 'doctores-excluidos.json'),
    JSON.stringify(nombres, null, 2),
    'utf8',
  )
}

/**
 * La carpeta de entrada por prioridad (D84, 16/09/2026): una ruta absoluta
 * fuera de la carpeta de datos de la aplicación —vive en el OneDrive del
 * dueño—, así que solo se guarda un puntero a ella, no su contenido.
 */
export function leerCarpetaEntrada(carpetas: Carpetas): string | null {
  try {
    const datos = JSON.parse(readFileSync(join(carpetas.raiz, 'carpeta-entrada.json'), 'utf8')) as {
      ruta?: string
    }
    return datos.ruta ?? null
  } catch {
    return null
  }
}

export function guardarCarpetaEntrada(carpetas: Carpetas, ruta: string): void {
  writeFileSync(
    join(carpetas.raiz, 'carpeta-entrada.json'),
    JSON.stringify({ ruta }, null, 2),
    'utf8',
  )
}
