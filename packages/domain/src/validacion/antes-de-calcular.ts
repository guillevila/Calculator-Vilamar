/**
 * antes-de-calcular.ts — La comprobación de «¿está TODO lo necesario?» antes de
 * lanzar ninguna calculadora (27/10/2026, petición del dueño).
 *
 * Problema real: con dos aparatos en un ojo, uno completo y otro al que le falta
 * un dato (la ACD, por ejemplo), el cálculo arrancaba, y solo al final salía que
 * de un aparato no había resultado por falta de datos. Ahora, si falta algo de lo
 * necesario en CUALQUIERA de los ojos y aparatos que se van a calcular, no se
 * calcula NADA y se dice qué falta y dónde. Es la misma regla de siempre del
 * producto —un dato que falta no se rellena: se avisa y se bloquea— aplicada a
 * todo el cálculo a la vez y no calculadora a calculadora.
 *
 * Lo que se exige siempre (lista del dueño):
 *   · del caso: nombre del paciente, doctor, tipo de lente y —si entra Kane— el
 *     sexo, comprobado por una persona;
 *   · de cada aparato de cada ojo: longitud axial, K1 y su eje, K2 y su eje, ACD,
 *     SIA y su eje de incisión, y la constante de la lente;
 *   · además, lo que exija cada calculadora que vaya a correr (su ficha).
 */

import type { Calculadora } from '../modelo/calculadoras.js'
import { fichaDe } from '../modelo/calculadoras.js'
import type { CampoBiometrico } from '../modelo/campos.js'
import type { Caso } from '../modelo/caso.js'
import { ojoDe } from '../modelo/caso.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import { nombreLateralidad } from '../modelo/lateralidad.js'
import { obtener } from '../modelo/medida.js'
import { nombreLegible } from '../modelo/preparar-entradas.js'

/** Los datos de biometría que se exigen siempre, sea cual sea la calculadora. */
export const DATOS_SIEMPRE_NECESARIOS: readonly CampoBiometrico[] = [
  'AL',
  'K1',
  'K1_EJE',
  'K2',
  'K2_EJE',
  'ACD',
  'SIA',
  'EJE_INCISION',
  'CONSTANTE_A',
]

export interface TareaAComprobar {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly aparato: string
}

export interface FaltanParaCalcular {
  /** Lo que falta del caso en general (paciente, doctor, lente, sexo). */
  readonly generales: readonly string[]
  /** Lo que falta de cada aparato de cada ojo. */
  readonly porAparato: readonly {
    readonly ojo: Lateralidad
    readonly aparato: string
    readonly faltan: readonly string[]
  }[]
}

const vacio = (texto: string | undefined): boolean => texto === undefined || texto.trim() === ''

export function datosQueFaltanParaCalcular(
  caso: Caso,
  tareas: readonly TareaAComprobar[],
): FaltanParaCalcular {
  if (tareas.length === 0) return { generales: [], porAparato: [] }

  const generales: string[] = []
  if (vacio(caso.nombrePaciente)) generales.push('el nombre del paciente')
  if (vacio(caso.nombreCirujano)) generales.push('el doctor')
  if (vacio(caso.lente?.modelo)) generales.push('el tipo de lente')
  if (tareas.some((t) => fichaDe(t.calculadora).exigeSexo === true)) {
    if (caso.sexo === undefined) {
      generales.push('el sexo del paciente (lo pide Kane)')
    } else if (!caso.sexo.confirmadoPorUsuario) {
      generales.push('el sexo del paciente, comprobado (lo pide Kane)')
    }
  }

  // Un aparato por ojo, una sola vez, con todo lo que le exigen sus calculadoras.
  const aparatos = new Map<
    string,
    { ojo: Lateralidad; aparato: string; campos: Set<CampoBiometrico> }
  >()
  for (const t of tareas) {
    const clave = `${t.ojo}|${t.aparato}`
    const entrada = aparatos.get(clave) ?? {
      ojo: t.ojo,
      aparato: t.aparato,
      campos: new Set<CampoBiometrico>(DATOS_SIEMPRE_NECESARIOS),
    }
    for (const c of fichaDe(t.calculadora).requeridos) entrada.campos.add(c)
    aparatos.set(clave, entrada)
  }

  const porAparato = [...aparatos.values()]
    .map(({ ojo, aparato, campos }) => {
      const datos = ojoDe(caso, ojo, aparato)
      return {
        ojo,
        aparato,
        faltan: [...campos].filter((c) => obtener(datos, c) === undefined).map(nombreLegible),
      }
    })
    .filter((a) => a.faltan.length > 0)

  return { generales, porAparato }
}

export function hayFaltantes(f: FaltanParaCalcular): boolean {
  return f.generales.length > 0 || f.porAparato.length > 0
}

/** El mensaje, en lenguaje normal, de lo que impide calcular. Vacío si no falta nada. */
export function textoDeFaltantes(f: FaltanParaCalcular): string {
  if (!hayFaltantes(f)) return ''
  const partes: string[] = []
  if (f.generales.length > 0) partes.push(`Del caso: ${f.generales.join(', ')}.`)
  for (const a of f.porAparato) {
    const donde =
      a.aparato === 'Principal'
        ? nombreLateralidad(a.ojo)
        : `${nombreLateralidad(a.ojo)}, aparato «${a.aparato}»`
    partes.push(`${donde}: ${a.faltan.join(', ')}.`)
  }
  return `No se puede calcular porque faltan datos necesarios. ${partes.join(' ')}`
}
