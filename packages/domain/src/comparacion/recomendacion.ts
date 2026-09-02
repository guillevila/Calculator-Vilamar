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
 *  - **Esfera**: entre las opciones cuya refracción prevista es negativa, la
 *    más cercana a cero — **salvo en la familia Lux de Bausch & Lomb**
 *    (LuxSmart, LuxLife, LuxGood), donde el criterio se invierte: entre las
 *    de refracción POSITIVA, la más cercana a cero. Petición expresa del
 *    dueño del proyecto (29/08/2026): la familia enVista (enVista
 *    normal/MX60T, MX60ET/PT, Aspire, Envy) y cualquier otra lente —incluida
 *    ninguna elegida— siguen con el criterio de siempre. Ver
 *    `criterioEsferaPara()`.
 *
 *    ⚠️ **«La más cercana a cero» y «la primera subiendo potencia» NO son lo
 *    mismo del lado positivo.** Al subir la potencia de la lente, la
 *    refracción prevista baja de forma continua (de hiperópico a miópico).
 *    Del lado negativo las dos frases coinciden: la primera negativa
 *    subiendo YA es la más cercana a cero, porque justo se acaba de cruzar
 *    el cero. Del lado positivo NO: la primera positiva subiendo es la MÁS
 *    ALEJADA de cero (el extremo de baja potencia); la más cercana a cero es
 *    la ÚLTIMA positiva antes de cruzar a negativo. Fallo real encontrado el
 *    29/08/2026 con una LuxSmart: la primera implementación tomaba «la
 *    primera positiva de la lista» y EVO daba 18 D (refracción 0.77) en vez
 *    de 19 D (refracción 0.14), que es la que de verdad no llega a cruzar a
 *    miopía. Por eso el código no busca «la primera que cumple el signo»:
 *    busca la de menor `Math.abs(refraccionPrevista)` entre las que cumplen
 *    el signo, válido para los dos criterios sin caso especial.
 *  - **Cilindro**: de menor a mayor cilindro, entre las opciones tóricas cuyo
 *    eje residual coincide con el eje curvo de la córnea (K más curva), la
 *    ÚLTIMA antes de que ese eje cambie de orientación — el mayor cilindro
 *    que no llega a invertir el astigmatismo residual. Este criterio NO
 *    cambia con la familia de lente.
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
  /**
   * El meridiano corneal curvo (K1 o K2, el más curvo) — NO el eje que
   * quedaría implantando esta opción. Solo presente junto con `cilindro`.
   *
   * ⚠️ **No es el dato que se enseña al cirujano.** Es el criterio con el
   * que se ELIGE la fila (`ejeResidual` de una opción tiene que compartir
   * este eje, o esa opción no se considera — ver el docstring del
   * fichero), no el que describe el resultado: eso es `ejeResidual`, el
   * que la propia calculadora dice que quedaría con esta opción. Fallo
   * real encontrado el 01/09/2026 con un PDF real: el informe enseñaba
   * este campo (`eje`, el mismo para las cinco casillas de un ojo — salía
   * «Eje 0°» repetido cinco veces) en vez de `ejeResidual` (el que sí
   * varía: 4°, 3°, 2°… según la calculadora y si usó córnea posterior
   * medida). Corregido en `packages/report/src/plantilla.ts`: las tres
   * pantallas de la estimación propia muestran `ejeResidual`, nunca `eje`.
   */
  readonly eje?: number
  /**
   * Refracción esférica prevista de la opción elegida para `esfera` — el
   * mismo dato que trae `OpcionLente.refraccionPrevista` de esa fila
   * concreta, no un cálculo nuevo (petición expresa del dueño, 27/08/2026,
   * para la tabla comparativa detallada del informe).
   */
  readonly refraccionPrevista?: number
  /**
   * Astigmatismo y eje residuales de la opción elegida para `cilindro` —
   * pueden venir de una fila DISTINTA de la de `refraccionPrevista`, porque
   * el criterio de esfera y el de cilindro se buscan por separado (ver el
   * docstring del fichero). Solo presentes junto con `cilindro`.
   */
  readonly cilindroResidual?: number
  readonly ejeResidual?: number
}

/** Cuánto puede separarse el eje residual del eje curvo y seguir contando como «el mismo». */
const UMBRAL_MISMO_EJE = 45

/** Qué signo de refracción prevista marca «la elegida», según la familia de lente. */
export type CriterioEsfera = 'PRIMERA_NEGATIVA' | 'PRIMERA_POSITIVA'

/**
 * La familia Lux de Bausch & Lomb (LuxSmart, LuxLife, LuxGood) usa el
 * criterio de esfera INVERTIDO — primera refracción prevista POSITIVA, no
 * negativa. Petición expresa del dueño del proyecto (29/08/2026).
 *
 * Se compara por el nombre CANÓNICO del catálogo (`LenteElegida.modelo`),
 * nunca por `nombreEnEvo`/`nombreEnKane` (D50): el mismo modelo físico se
 * llama distinto en cada web, y el criterio es del modelo, no del texto que
 * se le manda a una calculadora en concreto.
 */
const MODELOS_CON_CRITERIO_POSITIVO: ReadonlySet<string> = new Set([
  'B&L LuxSmart',
  'B&L LuxLife',
  'B&L LuxGood',
])

export function criterioEsferaPara(modeloLente: string | undefined): CriterioEsfera {
  return modeloLente !== undefined && MODELOS_CON_CRITERIO_POSITIVO.has(modeloLente)
    ? 'PRIMERA_POSITIVA'
    : 'PRIMERA_NEGATIVA'
}

/**
 * Aplica el criterio. Devuelve `undefined` si no hay ninguna opción que lo
 * cumpla: no se inventa una esfera cuando el criterio, tal cual está
 * definido, no señala ninguna.
 */
export function estimarLenteRecomendada(
  opciones: readonly OpcionLente[],
  ejeCurvo: number | undefined,
  criterioEsfera: CriterioEsfera = 'PRIMERA_NEGATIVA',
): LenteEstimada | undefined {
  const conEsferaYRefraccion = opciones
    .filter(
      (o): o is OpcionLente & { esfera: number; refraccionPrevista: number } =>
        o.esfera !== undefined && o.refraccionPrevista !== undefined,
    )
    .sort((a, b) => a.esfera - b.esfera)
  // «La primera» no es «la primera de la lista al ordenar de menor a mayor
  // potencia» — es la más cercana a cero DEL LADO que toca (negativo para la
  // mayoría de lentes, positivo para la familia Lux). Al subir la potencia la
  // refracción prevista baja de forma continua, así que el lado negativo más
  // cercano a cero es efectivamente el primero que se cruza subiendo — pero
  // el lado POSITIVO más cercano a cero es el ÚLTIMO antes de cruzar a
  // negativo, no el primero de la lista (encontrado con un caso real,
  // 29/08/2026: con 18→0.77, 18.5→0.46, 19→0.14, 19.5→-0.19, «la primera
  // positiva» tomada como «el primer elemento positivo de la lista» daba
  // 18/0.77 en vez de 19/0.14, que es la que de verdad está más cerca de la
  // emetropía sin cruzar a miopía).
  const delLadoQueToca = conEsferaYRefraccion.filter((o) =>
    criterioEsfera === 'PRIMERA_POSITIVA' ? o.refraccionPrevista > 0 : o.refraccionPrevista < 0,
  )
  if (delLadoQueToca.length === 0) return undefined
  const elegidaEsfera = delLadoQueToca.reduce((mejor, o) =>
    Math.abs(o.refraccionPrevista) < Math.abs(mejor.refraccionPrevista) ? o : mejor,
  )

  const conRefraccion = { refraccionPrevista: elegidaEsfera.refraccionPrevista }

  if (ejeCurvo === undefined) return { esfera: elegidaEsfera.esfera, ...conRefraccion }

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
  if (!ultima) return { esfera: elegidaEsfera.esfera, ...conRefraccion }

  return {
    esfera: elegidaEsfera.esfera,
    cilindro: ultima.cilindro,
    eje: ejeCurvo,
    ...conRefraccion,
    ...(ultima.cilindroResidual !== undefined
      ? { cilindroResidual: ultima.cilindroResidual }
      : {}),
    ejeResidual: ultima.ejeResidual,
  }
}
