/**
 * importador-resumenes.ts — Importar los PDF de «Resumen Calculadores»
 * (22/10/2026, petición del dueño).
 *
 * Mira una carpeta, y por cada PDF nuevo: lee su cabecera (doctor, paciente, lente,
 * ojo, fecha, calculadoras), guarda una COPIA en la carpeta del doctor
 * (`<doctor>/Calculados/<paciente>/<ojo>/`, o `Ambos ojos` si el PDF trae los dos) y crea un caso «importado» ya
 * terminado, para que cuente en el análisis y en las estadísticas.
 *
 * Reglas:
 *  - **No toca el original**: ni lo mueve ni lo borra. Para no importarlo dos veces
 *    se guarda su huella (SHA-256) y, si el nombre trae el identificador del caso en
 *    la otra app, ese identificador + el ojo.
 *  - **Lo que el PDF no dice no se inventa.** Un PDF que no es de esa app no se
 *    importa, y se dice por qué.
 *  - El doctor se escribe como ya existe en el programa si es el mismo sin contar
 *    mayúsculas ni tildes (así no sale un «doctor repetido» en el dashboard).
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import type { Caso } from '@vilamar/domain'
import {
  casoNuevo,
  doctorComoYaExiste,
  leerResumenCalculadores,
  lenteDelCatalogo,
  ojosDeImportado,
} from '@vilamar/domain'

import type { ResultadoImportacion } from '../compartido/ipc.js'
import type { Carpetas } from './almacen.js'
import { guardarCaso, nuevoId, siguienteCodigoImportado } from './almacen.js'

export interface EntornoImportacion {
  readonly carpetas: Carpetas
  /** La carpeta donde están los PDF. */
  readonly origen: string
  readonly ahora: Date
  /** Los casos que ya hay: para no repetir y para reconocer los doctores. */
  readonly casos: readonly Caso[]
  /** Nombres de doctor que ya existen en el programa (agenda y casos). */
  readonly doctoresConocidos: readonly string[]
  /** La carpeta donde se guarda la copia del PDF de ese caso. */
  readonly carpetaDeCopia: (datos: {
    doctor: string | undefined
    paciente: string | undefined
    /** Los ojos del PDF: uno, o los dos. */
    ojos: readonly ('OD' | 'OS')[]
    codigo: string
  }) => string
  /** El texto de cada página del PDF. */
  readonly leerTexto: (datos: Uint8Array) => Promise<readonly string[]>
}

function huellaDe(datos: Uint8Array): string {
  return createHash('sha256').update(datos).digest('hex')
}

/** Un nombre de fichero libre en la carpeta: si ya existe uno distinto, se le añade un número. */
function nombreLibre(carpeta: string, nombre: string): string {
  if (!existsSync(join(carpeta, nombre))) return nombre
  const ext = extname(nombre)
  const base = basename(nombre, ext)
  for (let i = 2; i < 1000; i += 1) {
    const candidato = `${base} (${i})${ext}`
    if (!existsSync(join(carpeta, candidato))) return candidato
  }
  return `${base}-${Date.now()}${ext}`
}

export async function importarResumenes(e: EntornoImportacion): Promise<ResultadoImportacion> {
  let nombres: string[]
  try {
    nombres = readdirSync(e.origen).filter((n) => n.toLowerCase().endsWith('.pdf'))
  } catch {
    throw new Error(`No puedo abrir la carpeta «${e.origen}». ¿Sigue existiendo?`)
  }

  const huellas = new Set(e.casos.flatMap((c) => (c.importado ? [c.importado.huella] : [])))
  const idsYaVistos = new Set(
    e.casos.flatMap((c) =>
      c.importado?.idExterno
        ? [`${c.importado.idExterno}|${ojosDeImportado(c.importado).join('+')}`]
        : [],
    ),
  )
  const conocidos = [
    ...new Set([...e.doctoresConocidos, ...e.casos.flatMap((c) => c.nombreCirujano ?? [])]),
  ]

  let nuevos = 0
  let repetidos = 0
  const noReconocidos: { fichero: string; motivo: string }[] = []

  for (const nombre of nombres.sort()) {
    const ruta = join(e.origen, nombre)
    let datos: Uint8Array
    try {
      datos = new Uint8Array(readFileSync(ruta))
    } catch (error) {
      noReconocidos.push({
        fichero: nombre,
        motivo: `No se ha podido abrir. ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    const huella = huellaDe(datos)
    if (huellas.has(huella)) {
      repetidos += 1
      continue
    }

    let lectura
    try {
      lectura = leerResumenCalculadores(await e.leerTexto(datos), nombre)
    } catch (error) {
      noReconocidos.push({
        fichero: nombre,
        motivo: `No se ha podido leer el PDF. ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    if (!lectura.ok) {
      noReconocidos.push({ fichero: nombre, motivo: lectura.motivo })
      continue
    }
    const d = lectura.datos

    // El mismo caso de la otra app con otro contenido (p. ej. recalculado): ya contado.
    const clave = d.idExterno ? `${d.idExterno}|${d.ojos.join('+')}` : undefined
    if (clave && idsYaVistos.has(clave)) {
      repetidos += 1
      continue
    }

    const doctor = d.doctor ? doctorComoYaExiste(d.doctor, conocidos) : undefined
    const codigo = siguienteCodigoImportado(e.carpetas, e.ahora)
    const carpetaCopia = e.carpetaDeCopia({ doctor, paciente: d.paciente, ojos: d.ojos, codigo })
    mkdirSync(carpetaCopia, { recursive: true })
    const nombreCopia = nombreLibre(carpetaCopia, nombre)
    copyFileSync(ruta, join(carpetaCopia, nombreCopia))

    const cuando = `${d.fecha}T12:00:00.000Z`
    const caso: Caso = {
      ...casoNuevo(nuevoId(), codigo, cuando),
      estado: 'COMPLETADO',
      ...(d.paciente ? { nombrePaciente: d.paciente } : {}),
      ...(doctor ? { nombreCirujano: doctor } : {}),
      // La lente del catálogo si se reconoce (para sumar con las hechas aquí); si no, tal como viene.
      ...(d.lente ? { lente: lenteDelCatalogo(d.lente) ?? { modelo: d.lente } } : {}),
      importado: {
        origen: 'RESUMEN_CALCULADORES',
        ficheroOriginal: nombre,
        rutaPdf: join(carpetaCopia, nombreCopia),
        huella,
        ...(d.idExterno ? { idExterno: d.idExterno } : {}),
        ojo: d.ojos[0] ?? 'OD',
        ...(d.ojos.length > 1 ? { ojos: d.ojos } : {}),
        aparatos: d.aparatos,
        calculadoras: d.calculadoras,
      },
    }
    guardarCaso(e.carpetas, caso)
    huellas.add(huella)
    if (clave) idsYaVistos.add(clave)
    nuevos += 1
  }

  return { nuevos, repetidos, noReconocidos, total: nombres.length }
}
