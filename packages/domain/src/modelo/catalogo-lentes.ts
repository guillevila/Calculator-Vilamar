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

/** Un intervalo cerrado: `min` y `max` incluidos. */
export interface RangoPotencia {
  readonly min: number
  readonly max: number
}

/** Si el intervalo tiene sentido como rango: el mínimo no puede superar al máximo. */
export function rangoValido(r: RangoPotencia): boolean {
  return Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max
}

/**
 * Una lente del inventario propio.
 *
 * `rangoCilindro` solo existe en las tóricas: una lente esférica no tiene rango
 * de cilindro que declarar, y dejarlo vacío en vez de en `{0,0}` evita que un
 * cero se confunda con «cubre cilindro cero».
 */
/** Una constante A por cada calculadora que la publique. Ninguna es obligatoria por sí sola. */
export type ConstantesPorCalculadora = Partial<Record<Calculadora, number>>

export interface LenteDeCatalogo {
  readonly id: string
  readonly modelo: string
  readonly fabricante?: string
  readonly constantesA: ConstantesPorCalculadora
  readonly torica: boolean
  readonly rangoEsfera: RangoPotencia
  readonly rangoCilindro?: RangoPotencia
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

  if (!rangoValido(l.rangoEsfera)) {
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
    if (!dentroDe(esfera, l.rangoEsfera)) return false
    if (cilindro === undefined) return true
    if (!l.torica || !l.rangoCilindro) return false
    return dentroDe(cilindro, l.rangoCilindro)
  })
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
