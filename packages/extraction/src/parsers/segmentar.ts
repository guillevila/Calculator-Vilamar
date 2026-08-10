/**
 * segmentar.ts — Separar lo del ojo derecho de lo del izquierdo.
 *
 * Es el paso donde más caro sale equivocarse: un informe leído entero pero con
 * los ojos cambiados produce un cálculo perfectamente creíble y perfectamente
 * erróneo. Por eso, cuando no está claro a qué ojo pertenece un dato, este
 * módulo prefiere NO devolverlo.
 *
 * Los informes de biometría vienen en dos formas:
 *
 *   A) DOS COLUMNAS — un rótulo por ojo arriba y las dos medidas en la misma
 *      línea:   `AL      24.07 mm      24.01 mm`
 *      Aquí el ojo lo decide la POSICIÓN, y el orden de los rótulos manda.
 *
 *   B) SECCIONES — primero todo el ojo derecho y después todo el izquierdo.
 *
 * Y una tercera, la más fácil de leer mal: un informe de UN SOLO ojo.
 */

import type { Lateralidad } from '@vilamar/domain'
import { interpretarLateralidad } from '@vilamar/domain'

import type { BloqueTexto } from '../contratos.js'
import { normalizarLineas } from './nucleo.js'

export type Disposicion = 'DOS_COLUMNAS' | 'SECCIONES' | 'UN_OJO' | 'DESCONOCIDA'

export interface Segmentacion {
  readonly disposicion: Disposicion
  /** El texto que corresponde a cada ojo. Un ojo ausente es un ojo que no está. */
  readonly porOjo: Readonly<Partial<Record<Lateralidad, string>>>
  /** En qué se ha basado. Se enseña al usuario si algo no cuadra. */
  readonly explicacion: string
}

/** Rótulos que marcan un ojo. Se buscan como palabra suelta. */
const MARCA_OJO =
  /\b(OD|OS|OI|R\/E|L\/E|RIGHT(?:\s*EYE)?|LEFT(?:\s*EYE)?|OCULUS\s+(?:DEXTER|SINISTER))\b/gi

interface Marca {
  readonly lado: Lateralidad
  readonly indice: number
  readonly texto: string
}

function buscarMarcas(texto: string): readonly Marca[] {
  const marcas: Marca[] = []
  MARCA_OJO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARCA_OJO.exec(texto)) !== null) {
    const bruto = (m[1] ?? '').replace(/\s*EYE$/i, '').replace('/E', '')
    const lado = interpretarLateralidad(bruto)
    if (lado) marcas.push({ lado, indice: m.index, texto: m[0] })
  }
  return marcas
}

/**
 * Segmenta usando las posiciones de los bloques.
 *
 * Es la forma buena cuando se tienen: mira dónde está el rótulo de cada ojo y
 * parte la página por la mitad entre los dos. No depende del orden en que el
 * lector haya devuelto el texto, que es justo lo que suele estar mal.
 */
export function segmentarPorPosicion(bloques: readonly BloqueTexto[]): Segmentacion | null {
  if (bloques.length === 0) return null

  const rotulos: { lado: Lateralidad; x: number; y: number }[] = []
  for (const b of bloques) {
    const marcas = buscarMarcas(b.texto)
    // Un bloque que es EXACTAMENTE el rótulo vale como cabecera de columna.
    if (marcas.length === 1 && b.texto.trim().length <= 12) {
      const marca = marcas[0]
      if (marca) rotulos.push({ lado: marca.lado, x: b.x + b.ancho / 2, y: b.y })
    }
  }

  const od = rotulos.filter((r) => r.lado === 'OD')
  const os = rotulos.filter((r) => r.lado === 'OS')
  if (od.length === 0 || os.length === 0) return null

  // Se toma el rótulo más alto de cada ojo (la cabecera, no una repetición).
  const cabeceraOd = od.reduce((a, b) => (a.y <= b.y ? a : b))
  const cabeceraOs = os.reduce((a, b) => (a.y <= b.y ? a : b))

  // Si están a la misma altura, son dos columnas. Si no, no es este caso.
  if (Math.abs(cabeceraOd.y - cabeceraOs.y) > 0.05) return null
  if (Math.abs(cabeceraOd.x - cabeceraOs.x) < 0.08) return null

  const frontera = (cabeceraOd.x + cabeceraOs.x) / 2
  const odIzquierda = cabeceraOd.x < cabeceraOs.x

  const texto = (lado: Lateralidad): string => {
    const enIzquierda = (lado === 'OD') === odIzquierda
    return bloques
      .filter((b) => {
        const centro = b.x + b.ancho / 2
        return enIzquierda ? centro < frontera : centro >= frontera
      })
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((b) => b.texto)
      .join('\n')
  }

  return {
    disposicion: 'DOS_COLUMNAS',
    porOjo: { OD: texto('OD'), OS: texto('OS') },
    explicacion: `Dos columnas: ${odIzquierda ? 'OD a la izquierda, OS a la derecha' : 'OS a la izquierda, OD a la derecha'}, según dónde están los rótulos.`,
  }
}

/**
 * Segmenta un informe en el que primero va un ojo y después el otro.
 */
function segmentarPorSecciones(texto: string, marcas: readonly Marca[]): Segmentacion | null {
  // Se agrupan las marcas consecutivas del mismo ojo: un encabezado puede
  // repetir «OD» varias veces seguidas.
  const cortes: Marca[] = []
  for (const marca of marcas) {
    const ultimo = cortes[cortes.length - 1]
    if (!ultimo || ultimo.lado !== marca.lado) cortes.push(marca)
  }
  if (cortes.length < 2) return null

  const porOjo: Partial<Record<Lateralidad, string>> = {}
  for (let i = 0; i < cortes.length; i++) {
    const actual = cortes[i]
    if (!actual) continue
    const siguiente = cortes[i + 1]
    const trozo = texto.slice(actual.indice, siguiente ? siguiente.indice : texto.length)
    // Si un ojo aparece dos veces, se queda el trozo más largo: el otro suele
    // ser una mención de paso («comparación OD/OS»), no la tabla de medidas.
    const previo = porOjo[actual.lado]
    if (!previo || trozo.length > previo.length) porOjo[actual.lado] = trozo
  }

  const lados = Object.keys(porOjo) as Lateralidad[]
  if (lados.length === 0) return null

  return {
    disposicion: 'SECCIONES',
    porOjo,
    explicacion: `El informe va por secciones: ${lados.join(' y ')}, cada uno con sus datos.`,
  }
}

/**
 * Detecta un informe de un solo ojo.
 *
 * Sirve cuando aparece un único rótulo en todo el documento. Se exige que
 * aparezca al menos una vez: un informe sin ningún rótulo NO se atribuye a
 * ningún ojo, porque no hay forma de saberlo y elegir uno sería inventar.
 */
function segmentarUnOjo(texto: string, marcas: readonly Marca[]): Segmentacion | null {
  const lados = new Set(marcas.map((m) => m.lado))
  if (lados.size !== 1) return null
  const lado = [...lados][0]
  if (!lado) return null
  return {
    disposicion: 'UN_OJO',
    porOjo: { [lado]: texto },
    explicacion: `El informe solo menciona un ojo (${lado}), así que todo se atribuye a ese.`,
  }
}

/**
 * Punto de entrada: separa el texto de un documento por ojo.
 *
 * `bloques` es opcional. Cuando está, se intenta primero por posición, que es
 * más fiable. Si no se puede decidir, se devuelve DESCONOCIDA y ningún dato
 * queda asignado a un ojo — a propósito.
 */
export function segmentarPorOjo(texto: string, bloques?: readonly BloqueTexto[]): Segmentacion {
  if (bloques && bloques.length > 0) {
    const porPosicion = segmentarPorPosicion(bloques)
    if (porPosicion) return porPosicion
  }

  const marcas = buscarMarcas(texto)
  if (marcas.length === 0) {
    return {
      disposicion: 'DESCONOCIDA',
      porOjo: {},
      explicacion:
        'El documento no dice a qué ojo pertenecen los datos. Hay que indicarlo a mano antes de usarlo.',
    }
  }

  const dosColumnas = segmentarDosColumnasEnTexto(texto, marcas)
  if (dosColumnas) return dosColumnas

  const secciones = segmentarPorSecciones(texto, marcas)
  if (secciones) return secciones

  const unOjo = segmentarUnOjo(texto, marcas)
  if (unOjo) return unOjo

  return {
    disposicion: 'DESCONOCIDA',
    porOjo: {},
    explicacion: 'No se ha podido decidir qué dato es de qué ojo. Revísalo a mano.',
  }
}

/**
 * Dos columnas cuando solo hay texto plano.
 *
 * Se busca una línea que nombre los dos ojos («     OD        OS») y, a partir
 * de ahí, cada línea de datos con dos números se reparte: el primero para la
 * columna de la izquierda, el segundo para la de la derecha.
 *
 * Es más frágil que hacerlo por posición, así que solo se aplica cuando hay una
 * cabecera clara con los dos rótulos y ninguno se repite: si el informe es
 * ambiguo, se deja para las otras estrategias.
 */
function segmentarDosColumnasEnTexto(texto: string, marcas: readonly Marca[]): Segmentacion | null {
  const lineas = normalizarLineas(texto)
  let indiceCabecera = -1
  let odPrimero = true

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    if (!linea) continue
    const enLinea = buscarMarcas(linea)
    const lados = enLinea.map((m) => m.lado)
    if (lados.length === 2 && lados[0] !== lados[1]) {
      indiceCabecera = i
      odPrimero = lados[0] === 'OD'
      break
    }
  }
  if (indiceCabecera === -1) return null

  // Si además hay secciones por debajo, esta estrategia no aplica.
  const marcasTrasCabecera = marcas.filter(
    (m) => m.indice > texto.indexOf(lineas[indiceCabecera] ?? ''),
  )
  if (marcasTrasCabecera.length > 2) return null

  const izquierda: string[] = []
  const derecha: string[] = []

  for (let i = indiceCabecera + 1; i < lineas.length; i++) {
    const linea = lineas[i]
    if (!linea) continue
    // La etiqueta es lo que va antes del primer número.
    const numeros = [...linea.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    if (numeros.length < 2) {
      // Línea sin dos valores: se copia a los dos lados como contexto (por
      // ejemplo la unidad o un subtítulo). No aporta números, así que no puede
      // contaminar.
      izquierda.push(linea)
      derecha.push(linea)
      continue
    }
    const primero = numeros[0]
    const segundo = numeros[1]
    if (!primero || !segundo) continue
    const etiqueta = linea.slice(0, primero.index).trim()
    const restoIzquierda = linea.slice(primero.index, segundo.index).trim()
    const restoDerecha = linea.slice(segundo.index).trim()
    izquierda.push(`${etiqueta} ${restoIzquierda}`.trim())
    derecha.push(`${etiqueta} ${restoDerecha}`.trim())
  }

  return {
    disposicion: 'DOS_COLUMNAS',
    porOjo: odPrimero
      ? { OD: izquierda.join('\n'), OS: derecha.join('\n') }
      : { OS: izquierda.join('\n'), OD: derecha.join('\n') },
    explicacion: `Dos columnas: ${odPrimero ? 'OD' : 'OS'} a la izquierda, según el orden de los rótulos de la cabecera.`,
  }
}
