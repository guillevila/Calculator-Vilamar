/**
 * sugerencia-cirujano.ts — Aplicar el criterio del cirujano a una escalera de
 * opciones, sin que la aplicación decida nada por su cuenta.
 *
 * ⚠️ Esto NO es «el programa recomienda una lente». La constitución del
 * proyecto (D14) y `comparar.ts` son explícitos: este producto compara lo que
 * dicen las calculadoras externas, no elige por el cirujano. `comparar.ts`
 * tiene, de hecho, la cicatriz de un fallo real donde una línea que «elegía la
 * primera opción» acabó pintándose como si la web la hubiera destacado — nadie
 * podía distinguir «esto lo dice Kane» de «esto lo ha decidido el programa».
 *
 * Lo de aquí es distinto por origen: no es un criterio del programa, es un
 * criterio EXPLÍCITO del dueño del proyecto (25/08/2026), mecánico y sin
 * ambigüedad, que él mismo aplicaría leyendo la tabla a mano:
 *
 *   - En una lente de la familia Envista, la buena potencia esférica es la
 *     que deja el residual NEGATIVO más cercano a cero.
 *   - En una lente de la familia Lux, la buena potencia esférica es la que
 *     deja el residual POSITIVO más cercano a cero.
 *   - En una tabla tórica, el buen cilindro es el mayor que no cambia el eje
 *     residual respecto al de la potencia anterior. Si el eje salta —el salto
 *     real es de unos 90°—, esa potencia y las siguientes están sobrecorregidas:
 *     la buena es la de justo antes del salto.
 *
 * Por eso el resultado se llama `Sugerencia` y no `Recomendacion`, va SEPARADO
 * de `OpcionLente.recomendada` (que es lo que la propia web destaca) y de
 * `ResultadoCalculadora.recomendada`, y lleva siempre escrito el motivo: quien
 * lo vea en pantalla tiene que poder decir «esto lo ha calculado el programa
 * siguiendo MI regla», nunca confundirlo con la calculadora ni con un consejo
 * propio de la aplicación. Sigue sin enviarse nada a ningún sitio sin que una
 * persona lo confirme — es la misma invariante de siempre.
 */

import type { OpcionLente } from '../modelo/calculadoras.js'

/** Las dos familias de lente con regla propia. Fuera de estas dos, no se sugiere nada. */
export type FamiliaDeLente = 'ENVISTA' | 'LUX'

/**
 * Una opción que el criterio del cirujano señala, con el motivo en lenguaje
 * normal — nunca un número suelto sin explicar de dónde sale.
 */
export interface SugerenciaOpcion {
  readonly opcion: OpcionLente
  readonly motivo: string
}

/**
 * De qué familia es un modelo de lente, por su nombre.
 *
 * Se mira el nombre completo del modelo, no una lista cerrada: los informes y
 * el catálogo propio abrevian de formas distintas —«B&L Env Aspire», «Bausch &
 * Lomb enVista MX60», «LUX SMART», «B&L Lux Life»—, y las dos palabras que
 * importan («env» y «lux») aparecen siempre enteras en algún sitio del nombre.
 * Un modelo que no sea de ninguna de las dos familias no tiene regla: se
 * devuelve `undefined` y no se sugiere nada, en vez de adivinar.
 */
export function familiaDeLente(modelo: string | undefined): FamiliaDeLente | undefined {
  if (!modelo) return undefined
  if (/\benv/i.test(modelo)) return 'ENVISTA'
  if (/\blux\b/i.test(modelo)) return 'LUX'
  return undefined
}

/**
 * La potencia esférica según el criterio de familia: el residual del signo
 * pedido que quede más cerca de cero.
 *
 * Un residual EXACTAMENTE 0.00 no cumple «negativo» ni «positivo» al pie de la
 * letra, y aquí se deja así a propósito: es un caso tan raro en una tabla real
 * que inventar qué hacer con él sin que el dueño del proyecto lo haya dicho
 * sería exactamente el tipo de suposición que este programa evita. Si alguna
 * vez aparece, no se sugiere nada para esa tabla — mejor callarse que adivinar.
 */
export function sugerirEsferaPorFamilia(
  opciones: readonly OpcionLente[],
  familia: FamiliaDeLente,
): SugerenciaOpcion | undefined {
  const signo = familia === 'ENVISTA' ? -1 : 1
  const candidatas = opciones.filter(
    (o) => o.refraccionPrevista !== undefined && Math.sign(o.refraccionPrevista) === signo,
  )
  if (candidatas.length === 0) return undefined

  // La más cercana a cero: para Envista (negativas), la mayor de todas; para
  // Lux (positivas), la menor. Es la misma cuenta en los dos casos si se mira
  // el valor absoluto.
  const opcion = candidatas.reduce((mejor, o) =>
    Math.abs(o.refraccionPrevista!) < Math.abs(mejor.refraccionPrevista!) ? o : mejor,
  )

  const nombreFamilia = familia === 'ENVISTA' ? 'Envista' : 'Lux'
  const signoTexto = familia === 'ENVISTA' ? 'negativo' : 'positivo'
  return {
    opcion,
    motivo:
      `Según tu criterio para ${nombreFamilia}: el residual ${signoTexto} más cercano a cero ` +
      `(${opcion.refraccionPrevista!.toFixed(2)} D).`,
  }
}

/** La distancia angular entre dos ejes, en grados, de 0 a 90. Un eje es una orientación (0–180). */
function distanciaAngular(a: number, b: number): number {
  const d = Math.abs(a - b) % 180
  return Math.min(d, 180 - d)
}

/**
 * El cilindro tórico según el criterio del cirujano: el mayor que no cambia
 * el eje residual respecto al de la potencia anterior.
 *
 * Se recorren las opciones de cilindro ASCENDENTE, comparando cada eje
 * residual con el de la de justo antes. Mientras el eje se mantiene —una
 * corneal infracorregida deja el residual en el mismo eje que traía—, esa
 * potencia es candidata. En cuanto el eje salta (más cerca de 90° que de 0°:
 * el salto real siempre ronda los 90°, la sobrecorrección invierte el sentido
 * del astigmatismo), se para ahí: la buena es la de justo antes del salto, y
 * las de cilindro mayor no se miran.
 *
 * No hace falta ningún eje de referencia externo —ni el astigmatismo neto que
 * publica la propia calculadora, ni el K1/K2 del informe—: la tabla se explica
 * sola comparando cada fila con la anterior, y así funciona igual aunque una
 * calculadora transponga sus ejes (EVO lo hace) — la transposición es la misma
 * en toda la tabla, así que la diferencia entre filas consecutivas no cambia.
 */
export function sugerirCilindroSinCambioDeEje(
  opciones: readonly OpcionLente[],
): SugerenciaOpcion | undefined {
  const UMBRAL_SALTO = 45 // Punto medio entre «sigue igual» (0°) y «se ha volteado» (90°).

  const conEje = opciones
    .filter((o) => o.cilindro !== undefined && o.ejeResidual !== undefined)
    .slice()
    .sort((a, b) => a.cilindro! - b.cilindro!)

  const primera = conEje[0]
  if (!primera) return undefined

  let candidata = primera
  for (let i = 1; i < conEje.length; i++) {
    const anterior = conEje[i - 1]!
    const actual = conEje[i]!
    if (distanciaAngular(anterior.ejeResidual!, actual.ejeResidual!) > UMBRAL_SALTO) break
    candidata = actual
  }

  return {
    opcion: candidata,
    motivo:
      `Según tu criterio: el mayor cilindro (${candidata.cilindro!.toFixed(2)} D) que no cambia ` +
      `el eje del astigmatismo residual respecto al de la potencia anterior.`,
  }
}

/**
 * Punto de entrada: aplica la regla que toque según la forma de las opciones.
 *
 * Una tabla tórica —tiene cilindro y eje residual— se decide por el cilindro,
 * sea cual sea la familia de la lente: el criterio del cirujano para el
 * cilindro no depende de si es Envista o Lux. Una tabla sin cilindro se decide
 * por la familia. Si no se sabe la familia, o las opciones no tienen ninguno
 * de los dos datos, no se sugiere nada.
 */
export function sugerirOpcion(
  opciones: readonly OpcionLente[],
  familia: FamiliaDeLente | undefined,
): SugerenciaOpcion | undefined {
  const esTorica = opciones.some((o) => o.cilindro !== undefined && o.ejeResidual !== undefined)
  if (esTorica) return sugerirCilindroSinCambioDeEje(opciones)
  if (!familia) return undefined
  return sugerirEsferaPorFamilia(opciones, familia)
}
