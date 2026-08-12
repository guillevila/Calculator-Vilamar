/**
 * lente.ts — Las lentes que el informe nombra, y su constante.
 *
 * Existe por una regla de negocio que el modelo anterior no podía representar:
 *
 *   **La constante A pertenece al MODELO DE LENTE, no al informe.**
 *
 * Algunos informes —ANTERION entre ellos— no traen una constante suelta: traen
 * una tabla de modelos y, al lado de cada uno, la constante que usa una fórmula:
 *
 *   LUX SMART                    SRK/T: 118.5
 *   ZEISS AT ELANA 841P          SRK/T: 119.6
 *   Bausch&Lomb Akreos AO MI60   SRK/T: 119.1
 *   Bausch&Lomb enVista MX60     SRK/T: 119.2
 *
 * Cuatro números y ninguno es «la constante A del caso». Cada uno vale solo si se
 * implanta esa lente. Quedarse con el primero, o con el más parecido, sería
 * calcular con la constante de una lente que no se va a poner — un error que
 * produce un resultado perfectamente creíble.
 *
 * De ahí la forma de este fichero: **la constante no se puede representar sin su
 * modelo.** No es una regla que alguien tenga que recordar; es que no hay ningún
 * sitio donde guardar una constante suelta salida de una tabla de lentes.
 */

import type { Procedencia } from './procedencia.js'

/**
 * Una lente nombrada en el informe, con la constante que el informe le asocia.
 *
 * `modelo` es el único campo obligatorio: es lo que identifica la lente. La
 * constante es opcional porque un informe puede nombrar una lente sin darla, y
 * eso no es un error — es un modelo del que habrá que aportar la constante.
 */
export interface LenteDetectada {
  /** El nombre tal y como lo escribe el informe. No se «arregla». */
  readonly modelo: string
  /** El fabricante, solo si se ha podido separar con seguridad. */
  readonly fabricante?: string
  readonly constanteA?: number
  /**
   * De qué fórmula es esa constante: «SRK/T».
   *
   * Se guarda porque una constante A no es un número universal: la publica el
   * fabricante para una fórmula concreta. Callarlo haría parecer que la constante
   * vale para cualquier cálculo.
   */
  readonly etiquetaConstante?: string
  /** De dónde salió, con su evidencia literal y su página. */
  readonly procedencia: Procedencia
}

/** Cómo se enseña una lente detectada, en una línea. */
export function describirLente(l: LenteDetectada): string {
  const nombre =
    l.fabricante && !l.modelo.startsWith(l.fabricante) ? `${l.fabricante} ${l.modelo}` : l.modelo
  if (l.constanteA === undefined) return nombre
  const etiqueta = l.etiquetaConstante ? ` (${l.etiquetaConstante})` : ''
  return `${nombre} — A ${l.constanteA.toFixed(2)}${etiqueta}`
}

// ═══════════════════════════════════════════════════════════════════════════
//  Emparejar un nombre con otro, sin pasarse de listo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deja un nombre de lente en su forma comparable.
 *
 * Los mismos modelos se escriben distinto en el informe, en esta aplicación y en
 * los desplegables de EVO, Barrett y Kane: «Bausch&Lomb enVista MX60», «B&L
 * MX60T», «bausch and lomb envista mx60». Lo que se normaliza es SOLO lo que no
 * puede cambiar el significado:
 *
 *  - mayúsculas y minúsculas;
 *  - espacios de más;
 *  - puntuación de adorno: puntos, comas, guiones, barras, paréntesis;
 *  - el nexo del fabricante, que se escribe de tres formas —«Bausch & Lomb»,
 *    «Bausch and Lomb», «Bausch-Lomb»— y no distingue nada. Se QUITA en vez de
 *    unificarlo en «and»: así las tres convergen, y con el guion no habría forma
 *    de saber si se quería decir «and» o solo separar dos palabras.
 *
 * **Lo que NO se hace, a propósito: nada aproximado.** Ni distancia de edición,
 * ni prefijos, ni «se parece bastante». `MX60` y `MX60T` son lentes distintas con
 * constantes distintas, y un emparejamiento generoso las confundiría produciendo
 * un cálculo creíble y equivocado. Ante la duda se pregunta; no se adivina.
 *
 * Quitar «and» solo podría juntar dos modelos que se diferenciaran EXACTAMENTE en
 * llevar esa palabra y nada más. En nombres de lente intraocular eso no existe, y
 * si algún día existiera, saldrían como ambiguos en vez de emparejarse a ciegas.
 */
export function normalizarNombreLente(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[.,\-/()[\]]/g, ' ')
    .replace(/\b(?:and|y)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * La clave con la que se compara una lente.
 *
 * Junta fabricante y modelo cuando el modelo no lo lleva ya dentro, porque una
 * parte lo escribe junto —«Bausch&Lomb Akreos AO MI60»— y otra separado. Sin esto
 * no se emparejarían dos formas de escribir exactamente lo mismo.
 */
export function claveLente(l: { readonly fabricante?: string; readonly modelo: string }): string {
  const modelo = normalizarNombreLente(l.modelo)
  if (!l.fabricante) return modelo
  const fabricante = normalizarNombreLente(l.fabricante)
  if (fabricante === '' || modelo.startsWith(fabricante)) return modelo
  return `${fabricante} ${modelo}`
}

export type Emparejamiento =
  /** Una sola lente del informe corresponde a la elegida. */
  | { readonly estado: 'ENCONTRADA'; readonly lente: LenteDetectada }
  /**
   * Más de una encaja, o la misma aparece con constantes distintas. **No se elige
   * ninguna**: si el informe es ambiguo, la ambigüedad es del informe y la resuelve
   * una persona mirándolo.
   */
  | { readonly estado: 'AMBIGUA'; readonly candidatas: readonly LenteDetectada[] }
  /** La lente elegida no está en el informe. No hereda nada de ninguna otra. */
  | { readonly estado: 'NO_ESTA' }

/**
 * Busca la lente elegida entre las que trae el informe.
 *
 * Dos aclaraciones sobre por qué es tan estricto:
 *
 *  - **Coincidencia exacta tras normalizar.** Ver `normalizarNombreLente`.
 *  - **La misma lente repetida con la MISMA constante no es ambigua**, es que el
 *    informe la nombra dos veces (en la tabla y en un resumen). Repetida con
 *    constantes DISTINTAS sí lo es, y de las gordas: significa que no se sabe
 *    cuál usar.
 */
export function emparejarLente(
  lentes: readonly LenteDetectada[],
  eleccion: { readonly fabricante?: string; readonly modelo: string },
): Emparejamiento {
  if (eleccion.modelo.trim() === '') return { estado: 'NO_ESTA' }
  const buscada = claveLente(eleccion)
  if (buscada === '') return { estado: 'NO_ESTA' }

  const candidatas = lentes.filter((l) => claveLente(l) === buscada)
  if (candidatas.length === 0) return { estado: 'NO_ESTA' }
  if (candidatas.length === 1) return { estado: 'ENCONTRADA', lente: candidatas[0]! }

  // Varias con la misma clave. Solo es ambiguo si no dicen lo mismo.
  const constantes = new Set(candidatas.map((l) => l.constanteA))
  if (constantes.size === 1) return { estado: 'ENCONTRADA', lente: candidatas[0]! }
  return { estado: 'AMBIGUA', candidatas }
}

/**
 * Quita las repeticiones exactas de una lista de lentes leídas.
 *
 * «Exactas» quiere decir mismo modelo y misma constante: eso es el informe
 * nombrando dos veces lo mismo. Dos entradas con el mismo modelo y constantes
 * distintas **se conservan las dos**, porque esa contradicción es información y
 * hay que poder verla.
 */
export function sinRepetidas(lentes: readonly LenteDetectada[]): readonly LenteDetectada[] {
  const vistas = new Set<string>()
  const salida: LenteDetectada[] = []
  for (const l of lentes) {
    const clave = `${claveLente(l)}|${l.constanteA ?? ''}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(l)
  }
  return salida
}

/** Las lentes del informe que aparecen más de una vez con constantes distintas. */
export function lentesContradictorias(
  lentes: readonly LenteDetectada[],
): readonly LenteDetectada[] {
  const porClave = new Map<string, LenteDetectada[]>()
  for (const l of lentes) {
    const clave = claveLente(l)
    porClave.set(clave, [...(porClave.get(clave) ?? []), l])
  }
  return [...porClave.values()]
    .filter((grupo) => new Set(grupo.map((l) => l.constanteA)).size > 1)
    .flat()
}
