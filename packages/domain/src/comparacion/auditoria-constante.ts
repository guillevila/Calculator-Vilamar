/**
 * auditoria-constante.ts — Lo que se envió frente a lo que la web dice haber usado.
 *
 * Existe por un comportamiento real de las calculadoras externas: **elegir el
 * modelo de lente en su formulario puede rellenar o cambiar su propia constante
 * A.** EVO lo hace, y por eso su adaptador elige el modelo primero y la constante
 * después. Barrett rellena constante y factor al elegir el modelo, y el adaptador
 * sobrescribe la constante con la del caso.
 *
 * Aun así, la web es la que calcula. Si dice haber usado 119.20 y le enviamos
 * 119.10, **el resultado es de 119.20** y el informe tiene que decirlo.
 *
 * Este fichero NO corrige nada. No cambia la constante del caso, no reintenta y no
 * decide quién tiene razón. Solo mira lo que la web enseña de sí misma y lo compara
 * con lo que se le mandó. Que la discrepancia sea visible es lo que hace auditable
 * el informe; taparla lo convertiría en un adorno.
 */

import type { Calculadora, ResultadoCalculadora } from '../modelo/calculadoras.js'
import type { Caso } from '../modelo/caso.js'
import { ojoDe, ojosDelCaso } from '../modelo/caso.js'
import { CALCULADORAS, fichaDe } from '../modelo/calculadoras.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import { obtener } from '../modelo/medida.js'
import { resultadoDe } from '../modelo/caso.js'

/**
 * Cuánto pueden diferir sin que sea una discrepancia.
 *
 * Media centésima: es el redondeo de un campo de dos decimales y nada más. Aquí no
 * hay margen de medida que justificar — las dos cifras hablan del mismo número, así
 * que cualquier diferencia real es una diferencia de verdad.
 */
const TOLERANCIA = 0.005

/**
 * La constante A que una web dice haber usado, leída de su propio eco.
 *
 * `entradasSegunLaWeb` no es un mapa de campos: son los textos que la web enseña
 * («A Constant: 119.2  Toric Model: …»), tal cual. Se buscan en todos ellos porque
 * cada web los agrupa a su manera y el adaptador no los desmenuza a propósito —
 * guardar el texto literal es lo que permite volver a leerlo si mañana cambia.
 *
 * Devuelve `undefined` cuando la web no publica su constante. Eso NO es un
 * problema: Barrett no la enseña, y no poder comprobarla es distinto de que no
 * cuadre.
 */
export function constanteSegunLaWeb(resultado: ResultadoCalculadora): number | undefined {
  const eco = resultado.entradasSegunLaWeb
  if (!eco) return undefined
  for (const texto of Object.values(eco)) {
    const m = /A\s*[- ]?\s*Const(?:ant|ante)?\s*[:=]?\s*(\d{2,3}(?:[.,]\d{1,2})?)/i.exec(texto)
    if (!m?.[1]) continue
    const n = Number(m[1].replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export interface DiscrepanciaConstante {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  /** Lo que Calculator Vilamar le mandó. */
  readonly enviada: number
  /** Lo que la web enseña en su propia pantalla. */
  readonly segunLaWeb: number
  /** El modelo de lente que se le pidió elegir, si se le pidió alguno. */
  readonly modeloLente?: string
}

/**
 * Todas las discrepancias de constante A del caso.
 *
 * Vacío significa una de dos cosas —y las dos son buenas—: que coinciden, o que
 * esa web no publica su constante y no hay nada que comparar. Se distinguen con
 * `constanteSegunLaWeb`.
 */
export function discrepanciasDeConstante(caso: Caso): readonly DiscrepanciaConstante[] {
  const salida: DiscrepanciaConstante[] = []

  for (const ojo of ojosDelCaso(caso)) {
    const enviada = obtener(ojoDe(caso, ojo), 'CONSTANTE_A')?.valor
    if (enviada === undefined) continue

    for (const calculadora of CALCULADORAS) {
      const resultado = resultadoDe(caso, calculadora, ojo)
      if (!resultado) continue
      const segunLaWeb = constanteSegunLaWeb(resultado)
      if (segunLaWeb === undefined) continue
      if (Math.abs(segunLaWeb - enviada) <= TOLERANCIA) continue
      salida.push({
        calculadora,
        ojo,
        enviada,
        segunLaWeb,
        ...(caso.lente?.modelo !== undefined ? { modeloLente: caso.lente.modelo } : {}),
      })
    }
  }

  return salida
}

/** La discrepancia en una frase, para la pantalla y para el PDF. */
export function describirDiscrepancia(d: DiscrepanciaConstante): string {
  const nombre = fichaDe(d.calculadora).nombre
  const porElModelo = d.modeloLente
    ? ` Probablemente sea porque al elegir «${d.modeloLente}» esa web pone su propia constante.`
    : ''
  return (
    `${nombre} dice haber calculado con una constante A de ${d.segunLaWeb.toFixed(2)}, ` +
    `y se le envió ${d.enviada.toFixed(2)}.${porElModelo} ` +
    'El resultado es el de la constante que usó la web, no la que se le mandó.'
  )
}
