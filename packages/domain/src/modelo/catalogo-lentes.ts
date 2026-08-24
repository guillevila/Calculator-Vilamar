/**
 * catalogo-lentes.ts — Las lentes que tienes tú, con su constante y su rango.
 *
 * `lente.ts` modela las lentes que NOMBRA un informe. Este fichero es otra
 * cosa: un inventario propio, que el usuario rellena en Ajustes y que no
 * depende de ningún caso ni de ningún informe.
 *
 * Sirve para una sola pregunta, y solo para esa:
 *
 *   **De las lentes que tengo, ¿cuáles cubren esta potencia?**
 *
 * No contesta «¿cuál implanto?». Esa es la línea que `comparar.ts` ya traza
 * para las propias calculadoras (D14: compara, no recomienda) y este fichero
 * no la cruza: `lentesQueCubren` es un filtro por rango, no una elección. Si
 * tres lentes cubren la misma potencia, las tres salen, en el mismo orden en
 * que están en el catálogo — no se destaca ninguna.
 *
 * ── Por qué la constante A es POR CALCULADORA ──────────────────────────────
 *
 * La ficha técnica de una lente no da «la constante A»: da una por fórmula —
 * SRK/T, Hoffer Q, Barrett Universal II, EVO 2.0…—, y son números distintos.
 * Como las tres calculadoras de este programa usan fórmulas distintas, guardar
 * un solo número habría obligado a elegir cuál, y cualquiera de las tres
 * elecciones sería la constante equivocada para las otras dos. Por eso
 * `constantesA` es un mapa por `Calculadora`: cada una lee la suya, y una
 * calculadora sin constante declarada simplemente no entra en ningún cruce que
 * dependa de ella.
 */

import type { Calculadora } from './calculadoras.js'
import { fichaDe } from './calculadoras.js'
import { claveLente } from './lente.js'

/** Un intervalo cerrado: `min` y `max` incluidos. */
export interface RangoPotencia {
  readonly min: number
  readonly max: number
}

/** Si el intervalo tiene sentido como rango: el mínimo no puede superar al máximo. */
export function rangoValido(r: RangoPotencia): boolean {
  return Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max
}

/** Una constante A por cada calculadora que la publique. Ninguna es obligatoria por sí sola. */
export type ConstantesPorCalculadora = Partial<Record<Calculadora, number>>

/**
 * Cómo se llama esta lente en el desplegable de CADA web, cuando no se llama
 * igual que en el catálogo. Opcional por calculadora.
 *
 * Existe porque el nombre que da gusto ver en pantalla —«Lux Life»— casi
 * nunca es el que usa la web para nombrar la opción de su desplegable — Kane
 * la llama «B+L LuxLife», EVO «B&L LuxLife»: sin espacio y con el prefijo del
 * fabricante. Comparar el nombre bonito contra el de la web nunca los
 * empareja, así que el modelo se queda sin elegir en el formulario aunque la
 * lente SÍ esté en la lista — y con ella, sin la constante que rellenaría
 * sola. Aquí se guarda el nombre exacto, tal cual lo escribe cada web,
 * comprobado en vivo o visto en su propio desplegable.
 */
export type NombresEnWeb = Partial<Record<Calculadora, string>>

/**
 * Una lente del inventario propio.
 *
 * `rangoEsfera` es OPCIONAL a propósito: hay lentes que se añaden solo para que
 * aparezcan en el desplegable de elección y presten su constante A a Barrett y
 * Kane, sin que se sepa (o se necesite todavía) qué rango de potencias cubren.
 * Una lente sin rango sencillamente no participa en `lentesQueCubren` — no se
 * inventa un rango para que participe.
 *
 * `rangoCilindro` solo existe en las tóricas: una lente esférica no tiene rango
 * de cilindro que declarar, y dejarlo vacío en vez de en `{0,0}` evita que un
 * cero se confunda con «cubre cilindro cero».
 */
export interface LenteDeCatalogo {
  readonly id: string
  readonly modelo: string
  readonly fabricante?: string
  readonly constantesA: ConstantesPorCalculadora
  readonly torica: boolean
  readonly rangoEsfera?: RangoPotencia
  readonly rangoCilindro?: RangoPotencia
  readonly nombresEnWeb?: NombresEnWeb
  readonly notas?: string
}

/** Los datos de una lente antes de tener `id` — lo que llega desde el formulario. */
export type LenteDeCatalogoEntrada = Omit<LenteDeCatalogo, 'id'>

export type Catalogo = readonly LenteDeCatalogo[]

/**
 * Qué está mal en una lente antes de guardarla, en frases que se pueden
 * enseñar tal cual en el formulario.
 *
 * Devuelve una lista y no un booleano porque pueden fallar varias cosas a la
 * vez, y decir solo la primera obligaría a corregir y volver a enviar varias
 * veces para enterarse de todas.
 */
export function erroresDeLenteCatalogo(l: LenteDeCatalogoEntrada): readonly string[] {
  const errores: string[] = []

  if (l.modelo.trim() === '') {
    errores.push('El modelo no puede estar vacío.')
  }

  const constantes = Object.entries(l.constantesA) as readonly [Calculadora, number | undefined][]
  const declaradas = constantes.filter((c): c is [Calculadora, number] => c[1] !== undefined)
  if (declaradas.length === 0) {
    errores.push('Hace falta la constante A de al menos una calculadora (Kane, EVO o Barrett).')
  }
  for (const [calculadora, valor] of declaradas) {
    if (!Number.isFinite(valor) || valor <= 0) {
      errores.push(`La constante A de ${fichaDe(calculadora).nombre} tiene que ser mayor que 0.`)
    }
  }

  if (l.rangoEsfera && !rangoValido(l.rangoEsfera)) {
    errores.push('El rango de esfera no es válido: el mínimo no puede ser mayor que el máximo.')
  }
  if (l.torica) {
    if (!l.rangoCilindro) {
      errores.push('Una lente tórica necesita su rango de cilindro.')
    } else if (!rangoValido(l.rangoCilindro)) {
      errores.push('El rango de cilindro no es válido: el mínimo no puede ser mayor que el máximo.')
    }
  }

  return errores
}

function dentroDe(valor: number, r: RangoPotencia): boolean {
  return valor >= r.min && valor <= r.max
}

/**
 * Las lentes del catálogo cuyo rango cubre esta potencia.
 *
 * ⚠️ Esto es un filtro por número, no un consejo clínico. No decide si el caso
 * necesita una lente tórica: si le pasas un cilindro, exige que la lente sea
 * tórica y que su rango lo cubra; si no le pasas cilindro (o pasas `undefined`),
 * solo mira la esfera y una lente tórica puede salir igual que una esférica —
 * la decisión de si hace falta tórica es del cirujano, no de esta función.
 *
 * El orden de salida es el del catálogo. No hay «primera opción»: si aparecen
 * varias, se enseñan todas y en ese orden, igual que hace `comparar.ts` con las
 * alternativas de una calculadora.
 */
export function lentesQueCubren(
  catalogo: Catalogo,
  esfera: number,
  cilindro?: number,
): readonly LenteDeCatalogo[] {
  return catalogo.filter((l) => {
    // Sin rango de esfera declarado, no se sabe si cubre o no — y no cubrir
    // por defecto es lo seguro. No es lo mismo que «no cubre»: simplemente no
    // se puede saber todavía.
    if (!l.rangoEsfera) return false
    if (!dentroDe(esfera, l.rangoEsfera)) return false
    if (cilindro === undefined) return true
    if (!l.torica || !l.rangoCilindro) return false
    return dentroDe(cilindro, l.rangoCilindro)
  })
}

/**
 * La constante A que declara, en el catálogo, la lente elegida en el caso —
 * para UNA calculadora en concreto.
 *
 * Es lo que permite que Barrett y Kane usen cada uno su propia constante para
 * la misma lente, en vez de compartir un único número: se busca la lente por
 * su nombre (la misma comparación que `emparejarLente`, sin aproximaciones) y
 * se lee su entrada para esa calculadora. Si la lente no está en el catálogo,
 * o no tiene declarada la constante de esa calculadora en concreto, no hay
 * nada que sustituir — quien llama sigue con lo que ya tuviera.
 */
export function constanteDelCatalogoPara(
  catalogo: Catalogo,
  eleccion: { readonly fabricante?: string; readonly modelo: string } | undefined,
  calculadora: Calculadora,
): number | undefined {
  if (!eleccion || eleccion.modelo.trim() === '') return undefined
  const buscada = claveLente(eleccion)
  if (buscada === '') return undefined
  const encontrada = catalogo.find((l) => claveLente(l) === buscada)
  return encontrada?.constantesA[calculadora]
}

/**
 * Si la lente elegida en el caso es tórica, según el catálogo. `undefined` si
 * no hay ninguna elegida o no está en el catálogo — no se sabe, y no es lo
 * mismo que «no es tórica».
 *
 * Existe para Kane: sus opciones tóricas del desplegable de modelo solo
 * aparecen cuando el ojo ya está en modo Toric, así que hace falta saber si
 * hay que ponerlo ANTES de buscar el modelo, no después.
 */
export function esToricaSegunCatalogo(
  catalogo: Catalogo,
  eleccion: { readonly fabricante?: string; readonly modelo: string } | undefined,
): boolean | undefined {
  if (!eleccion || eleccion.modelo.trim() === '') return undefined
  const buscada = claveLente(eleccion)
  if (buscada === '') return undefined
  return catalogo.find((l) => claveLente(l) === buscada)?.torica
}

/**
 * Qué nombre hay que buscar en el desplegable de ESTA calculadora para la
 * lente elegida en el caso.
 *
 * Si el catálogo tiene un nombre específico para esa web (`nombresEnWeb`), es
 * ese — no el nombre bonito del catálogo, que casi nunca coincide con lo que
 * escribe la web. Si no hay ninguno declarado, o la lente no está en el
 * catálogo, se sigue con el nombre que ya traía el caso: puede que SÍ
 * coincida por casualidad, y cambiarlo a ciegas podría estropear un
 * emparejamiento que ya funcionaba.
 */
export function modeloDelCatalogoPara(
  catalogo: Catalogo,
  eleccion: { readonly fabricante?: string; readonly modelo: string } | undefined,
  calculadora: Calculadora,
): string | undefined {
  if (!eleccion || eleccion.modelo.trim() === '') return eleccion?.modelo
  const buscada = claveLente(eleccion)
  if (buscada === '') return eleccion.modelo
  const encontrada = catalogo.find((l) => claveLente(l) === buscada)
  return encontrada?.nombresEnWeb?.[calculadora] ?? eleccion.modelo
}

/** Las constantes declaradas, en el orden fijo de `CALCULADORAS`, para no reordenarlas al azar. */
export function constantesOrdenadas(
  constantesA: ConstantesPorCalculadora,
): readonly { readonly calculadora: Calculadora; readonly valor: number }[] {
  return (['EVO_TORIC', 'BARRETT_TORIC', 'KANE'] as const)
    .map((c) => ({ calculadora: c, valor: constantesA[c] }))
    .filter((c): c is { calculadora: Calculadora; valor: number } => c.valor !== undefined)
}

/** Cómo se enseña una lente del catálogo, en una línea: modelo y su constante por calculadora. */
export function describirLenteDeCatalogo(l: LenteDeCatalogo): string {
  const nombre =
    l.fabricante && !l.modelo.startsWith(l.fabricante) ? `${l.fabricante} ${l.modelo}` : l.modelo
  const constantes = constantesOrdenadas(l.constantesA)
    .map(({ calculadora, valor }) => `${fichaDe(calculadora).nombre} A ${valor.toFixed(2)}`)
    .join(' · ')
  return constantes === '' ? nombre : `${nombre} — ${constantes}`
}
