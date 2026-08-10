/**
 * nucleo.ts — Las piezas comunes a todos los parsers.
 *
 * Un parser de informes no es «una expresión regular grande». Es una tabla de
 * reglas —qué etiqueta busca cada dato y cómo se lee el número que viene
 * detrás— más un motor que las aplica. Así, añadir un aparato nuevo es escribir
 * una tabla, no reescribir la lógica; y arreglar un dato que se lee mal es
 * tocar una fila.
 */

import type { CampoBiometrico } from '@vilamar/domain'

/** Un dato leído del documento, todavía sin convertir en `Medida`. */
export interface Extraido {
  readonly campo: CampoBiometrico
  readonly valor: number
  /** El texto tal cual apareció. Es la evidencia que se enseña al revisar. */
  readonly evidencia: string
  readonly pagina: number
  /** Qué regla lo encontró. Sirve para arreglar un parser que falle. */
  readonly regla: string
  readonly confianza?: number
}

/**
 * Una regla de lectura.
 *
 * `patrones` deben tener un grupo de captura para el valor. Si la regla también
 * lee un eje, el segundo grupo es el eje y `campoEje` dice dónde guardarlo:
 * así se lee «K1 41.22 D @ 175°» de una vez, que es como viene en los informes,
 * y no hay forma de que el eje acabe en la K equivocada.
 */
export interface ReglaLectura {
  readonly campo: CampoBiometrico
  readonly nombre: string
  readonly patrones: readonly RegExp[]
  /** Si el patrón captura además un eje, en qué campo va. */
  readonly campoEje?: CampoBiometrico
  /**
   * Multiplica el valor leído para llevarlo a la unidad del modelo.
   *
   * Es una conversión de UNIDAD, no una corrección clínica: pasar de mm a µm
   * es lo mismo que pasar de metros a centímetros. Cualquier transformación que
   * no sea eso NO va aquí.
   */
  readonly factor?: number
}

const MENOS = /[−–—]/g // menos unicode, guiones largos

/**
 * Convierte a número lo que pone en el informe.
 *
 * Acepta coma decimal (los informes europeos la usan) y los distintos guiones
 * que salen del OCR. Devuelve `null` si no es un número: no adivina.
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(MENOS, '-').replace(/\s+/g, '')
  if (limpio === '') return null
  // Coma decimal → punto. Solo si no hay ya un punto decimal.
  const normalizado = limpio.includes('.') ? limpio : limpio.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/**
 * Un número que se pueda leer, o nada.
 *
 * Se separa de `leerNumero` para dejar claro en el sitio de uso que un dato
 * ilegible NO se convierte en cero: se descarta y el campo queda ausente.
 */
export function leerNumeroODescartar(texto: string | undefined): number | null {
  return texto === undefined ? null : leerNumero(texto)
}

export function normalizarLineas(texto: string): readonly string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/[\t ]+/g, ' ').replace(/ {2,}/g, '  ').trim())
    .filter((l) => l.length > 0)
}

/**
 * Aplica una tabla de reglas a un bloque de texto ya acotado a UN ojo.
 *
 * Se queda con la primera coincidencia de cada campo: los informes repiten
 * datos en resúmenes y gráficos, y la primera aparición es la de la tabla de
 * medidas. Si un campo aparece dos veces con valores distintos, la validación
 * posterior lo verá como valor raro; no se promedia ni se elige «el mejor»,
 * porque eso sería inventar.
 */
export function aplicarReglas(
  texto: string,
  reglas: readonly ReglaLectura[],
  pagina: number,
  confianza?: number,
): readonly Extraido[] {
  const lineas = normalizarLineas(texto)
  const encontrados = new Map<CampoBiometrico, Extraido>()

  for (const linea of lineas) {
    for (const regla of reglas) {
      if (encontrados.has(regla.campo)) continue
      for (const patron of regla.patrones) {
        // Las reglas se reutilizan entre líneas: hay que reiniciar el índice
        // de las que tengan la marca /g, o se saltan coincidencias.
        patron.lastIndex = 0
        const m = patron.exec(linea)
        if (!m) continue

        const valor = leerNumeroODescartar(m[1])
        if (valor === null) continue

        const factor = regla.factor ?? 1
        encontrados.set(regla.campo, {
          campo: regla.campo,
          valor: valor * factor,
          evidencia: linea,
          pagina,
          regla: regla.nombre,
          confianza,
        })

        if (regla.campoEje && !encontrados.has(regla.campoEje)) {
          const eje = leerNumeroODescartar(m[2])
          if (eje !== null) {
            encontrados.set(regla.campoEje, {
              campo: regla.campoEje,
              valor: eje,
              evidencia: linea,
              pagina,
              regla: `${regla.nombre} (eje)`,
              confianza,
            })
          }
        }
        break
      }
    }
  }

  return [...encontrados.values()]
}

/**
 * Reglas que valen para casi cualquier informe.
 *
 * Se usan tal cual para el aparato desconocido y como base de los parsers de
 * cada aparato, que añaden encima sus etiquetas propias.
 *
 * Nota sobre las unidades: se aceptan las que ponen los informes; no se
 * convierte nada salvo lo declarado con `factor`.
 */
export const REGLAS_GENERICAS: readonly ReglaLectura[] = [
  {
    campo: 'AL',
    nombre: 'AL genérico',
    patrones: [
      /\bAL\b[^0-9\-]{0,18}(-?\d+[.,]\d{1,3})\s*mm/i,
      /Axial\s*Length[^0-9\-]{0,18}(-?\d+[.,]\d{1,3})/i,
      /Longitud\s*axial[^0-9\-]{0,18}(-?\d+[.,]\d{1,3})/i,
      /\bAL\b[^0-9\-]{0,18}(-?\d+[.,]\d{1,3})/i,
    ],
  },
  {
    campo: 'K1',
    nombre: 'K1 con eje',
    campoEje: 'K1_EJE',
    patrones: [
      /\bK1\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis|eje)\s*(\d{1,3})/i,
      /Flat\s*K[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\bK1\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
      /Flat\s*K[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'K2',
    nombre: 'K2 con eje',
    campoEje: 'K2_EJE',
    patrones: [
      /\bK2\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis|eje)\s*(\d{1,3})/i,
      /Steep\s*K[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\bK2\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
      /Steep\s*K[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'ACD',
    nombre: 'ACD',
    patrones: [
      /\bACD\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})\s*mm/i,
      /Anterior\s*Chamber\s*Depth[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
      /\bACD\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
    ],
  },
  {
    campo: 'AQD',
    nombre: 'AQD',
    patrones: [
      /\bAQD\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})\s*mm/i,
      /Aqueous\s*Depth[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
      /\bAQD\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
    ],
  },
  {
    campo: 'LT',
    nombre: 'LT',
    patrones: [
      /\bLT\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})\s*mm/i,
      /Lens\s*Thickness[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
      /Grosor\s*(?:del\s*)?cristalino[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
      /\bLT\b[^0-9\-]{0,18}(\d+[.,]\d{1,3})/i,
    ],
  },
  {
    campo: 'CCT',
    nombre: 'CCT',
    patrones: [
      /\bCCT\b[^0-9\-]{0,18}(\d+)\s*(?:µm|um|μm)/i,
      /Central\s*Corneal\s*Thickness[^0-9\-]{0,18}(\d+)/i,
      /\bCCT\b[^0-9\-]{0,18}(\d+)/i,
      /\bPachy\b[^0-9\-]{0,18}(\d+)/i,
    ],
  },
  {
    campo: 'WTW',
    nombre: 'WTW',
    patrones: [
      /\bWTW\b[^0-9\-]{0,18}(\d+[.,]\d{1,2})\s*mm/i,
      /White[\s-]*to[\s-]*White[^0-9\-]{0,18}(\d+[.,]\d{1,2})/i,
      /\bWTW\b[^0-9\-]{0,18}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'TK1',
    nombre: 'TK1 con eje',
    campoEje: 'TK1_EJE',
    patrones: [
      /\bTK1\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\bTK1\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'TK2',
    nombre: 'TK2 con eje',
    campoEje: 'TK2_EJE',
    patrones: [
      /\bTK2\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\bTK2\b[^0-9\-]{0,14}(\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'PK1',
    nombre: 'PK1 (córnea posterior)',
    campoEje: 'PK1_EJE',
    patrones: [
      /\b(?:PK1|Post(?:erior)?\.?\s*K1)\b[^0-9\-]{0,14}(-?\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\b(?:PK1|Post(?:erior)?\.?\s*K1)\b[^0-9\-]{0,14}(-?\d+[.,]\d{1,2})/i,
    ],
  },
  {
    campo: 'PK2',
    nombre: 'PK2 (córnea posterior)',
    campoEje: 'PK2_EJE',
    patrones: [
      /\b(?:PK2|Post(?:erior)?\.?\s*K2)\b[^0-9\-]{0,14}(-?\d+[.,]\d{1,2})\s*D?\s*(?:@|ax\.?|axis)\s*(\d{1,3})/i,
      /\b(?:PK2|Post(?:erior)?\.?\s*K2)\b[^0-9\-]{0,14}(-?\d+[.,]\d{1,2})/i,
    ],
  },
]
