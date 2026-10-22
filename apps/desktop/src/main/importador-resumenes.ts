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
 *  - **El original solo se quita DESPUÉS de comprobar la copia** (misma huella) y
 *    mandándolo a la papelera, no borrándolo (22/10/2026, petición del dueño: que la
 *    carpeta de entrada no se llene de PDF ya importados). Sin papelera disponible,
 *    no se quita nada. Para no importarlo dos veces se guarda su huella (SHA-256) y,
 *    si el nombre trae el identificador del caso en la otra app, ese identificador + el ojo.
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
  /** Manda un fichero a la papelera (Electron). Sin esto, los originales no se quitan. */
  readonly mandarAPapelera?: (ruta: string) => Promise<void>
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
    // Los PDF que hace este mismo programa («CV-2026-0419_OD_….pdf») se saltan: no son de otra app.
    nombres = readdirSync(e.origen).filter(
      (n) => n.toLowerCase().endsWith('.pdf') && !/^(CV|IM)-\d{4}-\d{4}_/.test(n),
    )
  } catch {
    throw new Error(`No puedo abrir la carpeta «${e.origen}». ¿Sigue existiendo?`)
  }

  // Huella → dónde quedó su copia, de lo ya importado.
  const huellas = new Map(
    e.casos.flatMap((c) =>
      c.importado ? [[c.importado.huella, c.importado.rutaPdf] as const] : [],
    ),
  )
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
  let quitados = 0
  let noQuitados = 0
  let motivoNoQuitado: string | undefined

  /** Quita el original si la copia está y es idéntica; si no, lo deja donde está. */
  const quitarOriginal = async (ruta: string, copia: string, huella: string): Promise<void> => {
    if (!e.mandarAPapelera) return
    try {
      if (!existsSync(copia) || huellaDe(new Uint8Array(readFileSync(copia))) !== huella) {
        noQuitados += 1
        motivoNoQuitado ??= 'la copia en la carpeta del doctor no coincide con el original'
        return
      }
      await e.mandarAPapelera(ruta)
      quitados += 1
    } catch (error) {
      noQuitados += 1
      motivoNoQuitado ??= error instanceof Error ? error.message : String(error)
    }
  }
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
    if (datos.length === 0) {
      noReconocidos.push({
        fichero: nombre,
        motivo:
          'El PDF está vacío (0 bytes): no tiene nada que leer. Vuelve a guardarlo desde la otra app.',
      })
      continue
    }
    const huella = huellaDe(datos)
    const copiaYaGuardada = huellas.get(huella)
    if (copiaYaGuardada !== undefined) {
      repetidos += 1
      // Ya importado: si su copia sigue ahí e idéntica, el original sobra.
      await quitarOriginal(ruta, copiaYaGuardada, huella)
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
    huellas.set(huella, join(carpetaCopia, nombreCopia))
    if (clave) idsYaVistos.add(clave)
    nuevos += 1
    await quitarOriginal(ruta, join(carpetaCopia, nombreCopia), huella)
  }

  return {
    nuevos,
    repetidos,
    noReconocidos,
    total: nombres.length,
    quitados,
    noQuitados,
    ...(motivoNoQuitado ? { motivoNoQuitado } : {}),
  }
}
