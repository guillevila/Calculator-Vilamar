/**
 * dispositivos.ts — Las tablas de reglas de cada aparato.
 *
 * Añadir un aparato nuevo es añadir una entrada aquí: sus etiquetas propias
 * encima de las genéricas. No hace falta tocar el motor, ni la segmentación por
 * ojo, ni el resto del programa.
 *
 * Las reglas propias van PRIMERO porque el motor se queda con la primera
 * coincidencia de cada campo. Así, cuando un aparato llama a algo de una forma
 * particular, gana su forma sobre la genérica.
 */

import type { Dispositivo } from '@vilamar/domain'

import type { ReglaLectura } from './nucleo.js'
import { REGLAS_GENERICAS } from './nucleo.js'

/**
 * ANTERION (Heidelberg).
 *
 * Es de los pocos que publica AQD además de ACD, y ahí está justo la trampa que
 * el modelo se toma en serio: son datos distintos y cada uno va a su campo.
 */
const ANTERION: readonly ReglaLectura[] = [
  {
    campo: 'ACD',
    nombre: 'ANTERION ACD (epitelio→cristalino)',
    patrones: [
      /ACD\s*\(?(?:epi|epithelium)[^)]*\)?[^0-9-]{0,14}(\d+[.,]\d{1,3})/i,
      /\bACD\b[^0-9-]{0,14}(\d+[.,]\d{1,3})\s*mm/i,
    ],
  },
  {
    campo: 'AQD',
    nombre: 'ANTERION AQD (endotelio→cristalino)',
    patrones: [
      /AQD\s*\(?(?:endo|endothelium)[^)]*\)?[^0-9-]{0,14}(\d+[.,]\d{1,3})/i,
      /\bAQD\b[^0-9-]{0,14}(\d+[.,]\d{1,3})\s*mm/i,
    ],
  },
  {
    campo: 'CCT',
    nombre: 'ANTERION CCT',
    patrones: [/\bCCT\b[^0-9-]{0,14}(\d+)/i, /Corneal\s*Thickness[^0-9-]{0,14}(\d+)/i],
  },
  {
    campo: 'INDICE_QUERATOMETRICO',
    nombre: 'ANTERION índice queratométrico (nk)',
    // Ronda 1.3375 y su valor cambia lo que significan las K del informe, así
    // que merece leerse y enseñarse en vez de darlo por supuesto.
    patrones: [
      /\bnk\b\s*[=:]?\s*(\d[.,]\d{2,4})/i,
      /(?:K[\s-]*index|[ií]ndice\s*querat\w*)[^0-9]{0,14}(\d[.,]\d{2,4})/i,
    ],
  },
]

/**
 * IOLMaster 700 (ZEISS).
 *
 * Publica queratometría total (TK) además de la estándar (K). Son medidas
 * distintas y se guardan por separado: elegir cuál usar es una decisión
 * clínica, no del programa.
 */
const IOLMASTER_700: readonly ReglaLectura[] = [
  {
    campo: 'TK1',
    nombre: 'IOLMaster TK1',
    campoEje: 'TK1_EJE',
    patrones: [
      /\bTK1\b[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /\bTK1\b[^0-9-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'TK2',
    nombre: 'IOLMaster TK2',
    campoEje: 'TK2_EJE',
    patrones: [
      /\bTK2\b[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /\bTK2\b[^0-9-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'ACD',
    nombre: 'IOLMaster ACD',
    patrones: [/\bACD\b[^0-9-]{0,14}(\d+[.,]\d{1,3})/i],
  },
  {
    campo: 'WTW',
    nombre: 'IOLMaster WTW',
    patrones: [
      /\bWTW\b[^0-9-]{0,14}(\d+[.,]\d{1,2})/i,
      /\bCCT?\s*W?TW\b[^0-9-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
]

/**
 * Pentacam (OCULUS).
 *
 * No es un biómetro: es un topógrafo. Da córnea y paquimetría, pero NO da
 * longitud axial. Que falte la AL en un Pentacam no es un fallo de lectura: es
 * que ese aparato no la mide. La pantalla lo dirá como «no encontrado» y el
 * usuario sabrá que tiene que traerla de otro sitio.
 */
const PENTACAM: readonly ReglaLectura[] = [
  {
    campo: 'K1',
    nombre: 'Pentacam K1 (frontal)',
    campoEje: 'K1_EJE',
    patrones: [
      /K1\s*\(?front\)?[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /\bK1\b[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
    ],
  },
  {
    campo: 'K2',
    nombre: 'Pentacam K2 (frontal)',
    campoEje: 'K2_EJE',
    patrones: [
      /K2\s*\(?front\)?[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /\bK2\b[^0-9-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
    ],
  },
  {
    campo: 'PK1',
    nombre: 'Pentacam K1 posterior',
    campoEje: 'PK1_EJE',
    patrones: [
      /K1\s*\(?back\)?[^0-9-]{0,14}(-?\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /Posterior[^\n]{0,20}K1[^0-9-]{0,14}(-?\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'PK2',
    nombre: 'Pentacam K2 posterior',
    campoEje: 'PK2_EJE',
    patrones: [
      /K2\s*\(?back\)?[^0-9-]{0,14}(-?\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?)\s*(\d{1,3})/i,
      /Posterior[^\n]{0,20}K2[^0-9-]{0,14}(-?\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'CCT',
    nombre: 'Pentacam paquimetría central',
    patrones: [
      /Pachy\s*(?:Apex|Center|Centro)[^0-9-]{0,14}(\d+)/i,
      /\bCCT\b[^0-9-]{0,14}(\d+)/i,
      /Thinnest[^0-9-]{0,14}(\d+)/i,
    ],
  },
]

export const REGLAS_POR_DISPOSITIVO: Readonly<Record<Dispositivo, readonly ReglaLectura[]>> = {
  ANTERION: [...ANTERION, ...REGLAS_GENERICAS],
  IOLMASTER_700: [...IOLMASTER_700, ...REGLAS_GENERICAS],
  PENTACAM: [...PENTACAM, ...REGLAS_GENERICAS],
  DESCONOCIDO: REGLAS_GENERICAS,
}

export function reglasDe(dispositivo: Dispositivo): readonly ReglaLectura[] {
  return REGLAS_POR_DISPOSITIVO[dispositivo] ?? REGLAS_GENERICAS
}
