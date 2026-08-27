/**
 * recomendacion.ts — Una estimación propia, con un criterio explícito, no
 * vinculante y siempre marcada como tal (D43).
 *
 * ⚠️ **Esto es distinto de todo lo que hace `comparar.ts`, y a propósito.**
 * `comparar.ts` no elige nunca — su docstring lo deja escrito: «ni la
 * primera, ni la última, ni la del medio; ni la de refracción más cercana a
 * cero». Este fichero existe porque el dueño del proyecto, tras el aviso de
 * que eso es justo lo que el producto evita, pidió expresamente lo
 * contrario para una pieza concreta: una estimación con SU propio criterio
 * clínico, calculada siempre —de acuerdo con la web o no— y enseñada
 * siempre como lo que es, una estimación orientativa y no vinculante, nunca
 * como «la respuesta» ni como lo que la calculadora ha destacado.
 *
 * Nada de aquí sustituye ni oculta lo que cada calculadora respondió de
 * verdad: la captura de pantalla de cada una sigue siendo la fuente, sin
 * interpretar. Esto se enseña ADEMÁS, con su propia etiqueta.
 *
 * ## El criterio, tal cual se pidió
 *
 *  - **Esfera**: de menor a mayor potencia, la primera opción cuya refracción
 *    prevista ya es negativa.
 *  - **Cilindro**: de menor a mayor cilindro, entre las opciones tóricas cuyo
 *    eje residual coincide con el eje curvo de la córnea (K más curva), la
 *    ÚLTIMA antes de que ese eje cambie de orientación — el mayor cilindro
 *    que no llega a invertir el astigmatismo residual.
 *
 * **Las dos partes se ordenan explícitamente antes de recorrerlas — nunca se
 * confía en el orden en que llega `opciones`.** Esto no es cosmético: EVO
 * devuelve su escalera de potencias de menor a mayor, pero Kane y Barrett la
 * devuelven de MAYOR a menor (tal cual la pintan en su página). Sin ordenar,
 * «la primera de la lista» dejaba de significar «la primera de menor a mayor
 * potencia» en Kane y Barrett, y el criterio salía invertido — encontrado con
 * un cálculo real (26/08/2026): Kane daba 24.00 D cuando la primera negativa
 * subiendo desde 22.0 D es 22.50 D.
 *
 * Las dos partes se buscan por separado sobre las mismas opciones. Si la
 * calculadora solo da una fila tórica (EVO y Barrett dan una; Kane da una
 * escalera), esa única fila hace de «última que coincide» sin más: el mismo
 * criterio sirve para las tres sin necesitar un caso especial por calculadora.
 */

import type { OpcionLente } from '../modelo/calculadoras.js'
import type { OjoBiometrico } from '../modelo/medida.js'
import { valorDe } from '../modelo/medida.js'

/** Distancia entre dos ejes entendidos como orientación (0–90), sin signo. */
function separacionDeEjes(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 180
  return bruta > 90 ? 180 - bruta : bruta
}

/**
 * El meridiano más curvo de la córnea (K1 o K2, el de mayor potencia) y su
 * eje — el que marca dónde se orienta una lente tórica.
 *
 * `undefined` si falta cualquiera de los cuatro datos: no se adivina un eje
 * curvo con la mitad de la información.
 */
export function ejeCurvoDe(ojo: OjoBiometrico): number | undefined {
  const k1 = valorDe(ojo, 'K1')
  const k2 = valorDe(ojo, 'K2')
  const ejeK1 = valorDe(ojo, 'K1_EJE')
  const ejeK2 = valorDe(ojo, 'K2_EJE')
  if (k1 === undefined || k2 === undefined || ejeK1 === undefined || ejeK2 === undefined) {
    return undefined
  }
  return k2 >= k1 ? ejeK2 : ejeK1
}

export interface LenteEstimada {
  readonly esfera: number
  readonly cilindro?: number
  /** Solo presente junto con `cilindro`: es el eje curvo, no un eje residual. */
  readonly eje?: number
}

/** Cuánto puede separarse el eje residual del eje curvo y seguir contando como «el mismo». */
const UMBRAL_MISMO_EJE = 45

/**
 * Aplica el criterio. Devuelve `undefined` si no hay ninguna opción con
 * refracción prevista negativa: no se inventa una esfera cuando el criterio,
 * tal cual está definido, no señala ninguna.
 */
export function estimarLenteRecomendada(
  opciones: readonly OpcionLente[],
  ejeCurvo: number | undefined,
): LenteEstimada | undefined {
  const conEsferaYRefraccion = opciones
    .filter(
      (o): o is OpcionLente & { esfera: number; refraccionPrevista: number } =>
        o.esfera !== undefined && o.refraccionPrevista !== undefined,
    )
    .sort((a, b) => a.esfera - b.esfera)
  const elegidaEsfera = conEsferaYRefraccion.find((o) => o.refraccionPrevista < 0)
  if (!elegidaEsfera) return undefined

  if (ejeCurvo === undefined) return { esfera: elegidaEsfera.esfera }

  const toricas = opciones
    .filter(
      (o): o is OpcionLente & { cilindro: number; ejeResidual: number } =>
        o.cilindro !== undefined && o.ejeResidual !== undefined,
    )
    .sort((a, b) => a.cilindro - b.cilindro)
  const conElMismoEje = toricas.filter(
    (o) => separacionDeEjes(o.ejeResidual, ejeCurvo) < UMBRAL_MISMO_EJE,
  )
  const ultima = conElMismoEje[conElMismoEje.length - 1]
  if (!ultima) return { esfera: elegidaEsfera.esfera }

  return { esfera: elegidaEsfera.esfera, cilindro: ultima.cilindro, eje: ejeCurvo }
}
