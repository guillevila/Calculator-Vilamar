/**
 * resumen-calculadores.ts — Leer un PDF hecho con la app «Resumen Calculadores»
 * (22/10/2026, petición del dueño: que los cálculos hechos en otra app también
 * cuenten en el análisis y en las estadísticas, y se guarden en la carpeta del doctor).
 *
 * Esa app escribe en cada página del PDF una cabecera con el caso:
 *
 *     2026-10-22 · hospital perpetuo socorro · maria pilar · EnVista · OD · Tórica
 *
 * y una franja por cada aparato y calculadora:
 *
 *     IOLMaster Advanced Technology · SimK · Tórica · EnVista · EVO estimado
 *
 * Aquí solo se interpreta ese TEXTO ya extraído del PDF (función pura, sin leer
 * ficheros). Lo que el PDF no dice no se inventa: un campo ausente queda ausente,
 * y si ni siquiera se reconoce la cabecera, se devuelve el motivo en vez de un caso.
 */

import type { Calculadora } from '../modelo/calculadoras.js'
import type { Lateralidad } from '../modelo/lateralidad.js'

export interface DatosDeResumen {
  /** Día del caso, «AAAA-MM-DD», tal como lo escribe el PDF. */
  readonly fecha: string
  /** Lo que el PDF pone como doctor/centro (en esa app se escribe en «Surgeon»). */
  readonly doctor?: string
  readonly paciente?: string
  /** La lente tal como la escribe el PDF («EnVista»). */
  readonly lente?: string
  readonly ojo: Lateralidad
  /** «Tórica», «Esférica»… tal como lo escribe el PDF. */
  readonly tipoDeLente?: string
  /** Los biómetros/aparatos que aparecen en las franjas, sin repetir. */
  readonly aparatos: readonly string[]
  /** Las calculadoras que aparecen, ya con el nombre interno, sin repetir. */
  readonly calculadoras: readonly Calculadora[]
  /** Identificador del caso en la otra app, si el nombre del fichero lo trae. */
  readonly idExterno?: string
}

export type LecturaDeResumen =
  | { readonly ok: true; readonly datos: DatosDeResumen }
  | { readonly ok: false; readonly motivo: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function ojoDe(texto: string): Lateralidad | undefined {
  const t = texto.trim().toUpperCase()
  if (t === 'OD') return 'OD'
  // «OI» (ojo izquierdo) es como lo escribe la app en español; el programa usa «OS».
  if (t === 'OI' || t === 'OS') return 'OS'
  return undefined
}

function calculadoraDe(nombre: string, variante: string): Calculadora | undefined {
  const n = nombre.trim().toUpperCase()
  const medido = variante.trim().toLowerCase().startsWith('medid')
  if (n === 'EVO') return medido ? 'EVO_TORIC' : 'EVO_TORIC_SIN_CARA_POSTERIOR'
  if (n === 'BARRETT') return medido ? 'BARRETT_TORIC_CON_CARA_POSTERIOR' : 'BARRETT_TORIC'
  if (n === 'KANE') return 'KANE'
  return undefined
}

/** El identificador del caso en la otra app: lo que va justo antes del último trozo del nombre. */
function idDelNombre(nombreFichero: string): string | undefined {
  const m = /_(?:OD|OI|OS)_([^_]+)_[^_]+\.pdf$/i.exec(nombreFichero)
  return m?.[1]
}

/**
 * Interpreta el texto de un PDF de «Resumen Calculadores».
 *
 * @param paginas El texto de cada página, línea a línea (separadas por saltos de línea).
 * @param nombreFichero El nombre del PDF (para el identificador del caso).
 */
export function leerResumenCalculadores(
  paginas: readonly string[],
  nombreFichero: string,
): LecturaDeResumen {
  const sueltas = paginas
    .flatMap((p) => p.split(/\r?\n/))
    .map((l) => l.trim())
    .filter((l) => l !== '')
  // Una franja larga puede partirse en dos líneas («… · EVO» / «estimado»): se une,
  // o «EVO medido» se leería como «EVO» a secas.
  const lineas: string[] = []
  for (const linea of sueltas) {
    const anterior = lineas[lineas.length - 1]
    if (anterior !== undefined && /^(estimad[oa]|medid[oa])\b/i.test(linea)) {
      lineas[lineas.length - 1] = `${anterior} ${linea}`
    } else {
      lineas.push(linea)
    }
  }

  // La cabecera: «fecha · doctor · paciente · lente… · ojo · tipo».
  let cabecera: string[] | undefined
  for (const linea of lineas) {
    const partes = linea.split(' · ').map((p) => p.trim())
    if (
      partes.length >= 5 &&
      FECHA.test(partes[0] ?? '') &&
      ojoDe(partes[partes.length - 2] ?? '')
    ) {
      cabecera = partes
      break
    }
  }
  if (!cabecera) {
    return {
      ok: false,
      motivo:
        'No encuentro la cabecera del caso («fecha · doctor · paciente · lente · ojo · tipo»): no parece un PDF de Resumen Calculadores.',
    }
  }

  const fecha = cabecera[0] as string
  const ojo = ojoDe(cabecera[cabecera.length - 2] as string) as Lateralidad
  const tipoDeLente = cabecera[cabecera.length - 1]
  // Entre la fecha y el ojo: doctor, paciente y lente (esta puede llevar « · » dentro).
  const medio = cabecera.slice(1, -2)
  const doctor = medio[0]
  const paciente = medio[1]
  const lente = medio.length >= 3 ? medio.slice(2).join(' · ') : undefined

  // Las franjas de aparato y calculadora: «aparato · SimK · Tórica · lente · EVO estimado».
  const aparatos: string[] = []
  const calculadoras: Calculadora[] = []
  for (const linea of lineas) {
    const partes = linea.split(' · ').map((p) => p.trim())
    if (partes.length < 4) continue
    const m = /^(EVO|BARRETT|KANE)\s*(estimad[oa]|medid[oa])?$/i.exec(
      partes[partes.length - 1] ?? '',
    )
    if (!m) continue
    const calculadora = calculadoraDe(m[1] as string, m[2] ?? '')
    if (!calculadora) continue
    const aparato = partes[0] as string
    if (!aparatos.includes(aparato)) aparatos.push(aparato)
    if (!calculadoras.includes(calculadora)) calculadoras.push(calculadora)
  }

  const idExterno = idDelNombre(nombreFichero)
  return {
    ok: true,
    datos: {
      fecha,
      ...(doctor ? { doctor } : {}),
      ...(paciente ? { paciente } : {}),
      ...(lente ? { lente } : {}),
      ojo,
      ...(tipoDeLente ? { tipoDeLente } : {}),
      aparatos,
      calculadoras,
      ...(idExterno ? { idExterno } : {}),
    },
  }
}

/** Para comparar nombres sin mayúsculas, tildes ni espacios de más. */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * El nombre de doctor tal como ya está escrito en el programa, si es el mismo
 * sin contar mayúsculas, tildes ni espacios de más («hospital perpetuo socorro»
 * → «Hospital Perpetuo Socorro»). Si no se parece a ninguno, se deja como viene.
 */
export function doctorComoYaExiste(nombre: string, conocidos: readonly string[]): string {
  const buscado = normalizarNombre(nombre)
  return conocidos.find((c) => normalizarNombre(c) === buscado) ?? nombre.trim()
}
