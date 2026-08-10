/**
 * medida.ts — Un dato biométrico y el ojo al que pertenece.
 *
 * Aquí está la decisión más importante del modelo, y conviene entenderla antes
 * de tocar nada:
 *
 *   **Un dato que falta no se representa con un número. Se representa con su
 *   ausencia.**
 *
 * `Medida.valor` es un `number` a secas: no admite `null`, ni `0` como
 * comodín, ni `-1`, ni `NaN`. Un dato que no se ha encontrado simplemente NO
 * ESTÁ en el mapa de medidas del ojo. Eso hace que la regla «lo que falta no
 * es cero» no dependa de que alguien se acuerde de comprobarla: es imposible
 * escribir el caso contrario.
 */

import type { CampoBiometrico, Unidad } from './campos.js'
import { definicionDe, formatearConUnidad } from './campos.js'
import type { Lateralidad } from './lateralidad.js'
import type { Procedencia } from './procedencia.js'
import { esDerivado, esManual, esMedido } from './procedencia.js'

export interface Medida {
  readonly campo: CampoBiometrico
  readonly ojo: Lateralidad
  /**
   * El valor. Siempre un número real y finito.
   *
   * Si no se conoce el dato, no se construye la medida. No hay ningún valor
   * de este campo que signifique «no lo sé».
   */
  readonly valor: number
  readonly unidad: Unidad
  readonly procedencia: Procedencia
  /**
   * Si una persona ha mirado este dato y ha dicho que está bien.
   *
   * Ningún dato sin confirmar sale hacia una calculadora externa. Es una
   * invariante del producto, no una preferencia de la pantalla.
   */
  readonly confirmadoPorUsuario: boolean
}

/**
 * Las medidas de un ojo.
 *
 * Un campo que no aparece como clave es un campo NO ENCONTRADO. No hay otra
 * forma de decirlo, y por eso no hay forma de confundirlo con un cero.
 */
export type MapaMedidas = Partial<Readonly<Record<CampoBiometrico, Medida>>>

export interface OjoBiometrico {
  readonly lateralidad: Lateralidad
  readonly medidas: MapaMedidas
}

export function ojoVacio(lateralidad: Lateralidad): OjoBiometrico {
  return { lateralidad, medidas: {} }
}

export function crearMedida(
  campo: CampoBiometrico,
  ojo: Lateralidad,
  valor: number,
  procedencia: Procedencia,
  confirmadoPorUsuario = false,
): Medida {
  if (!Number.isFinite(valor)) {
    throw new Error(
      `Se ha intentado crear la medida ${campo} (${ojo}) con un valor que no es un número: ${String(valor)}. ` +
        'Un dato desconocido se representa no creando la medida, nunca con un número inventado.',
    )
  }
  return {
    campo,
    ojo,
    valor,
    unidad: definicionDe(campo).unidad,
    procedencia,
    confirmadoPorUsuario,
  }
}

/** ¿Está el dato? `false` significa NO ENCONTRADO. */
export function tiene(ojo: OjoBiometrico, campo: CampoBiometrico): boolean {
  return ojo.medidas[campo] !== undefined
}

export function obtener(ojo: OjoBiometrico, campo: CampoBiometrico): Medida | undefined {
  return ojo.medidas[campo]
}

/**
 * El valor numérico, o `undefined` si no está.
 *
 * Devuelve `undefined` y no `0` a propósito. Quien llame a esto tiene que
 * decidir explícitamente qué hacer cuando el dato no está.
 */
export function valorDe(ojo: OjoBiometrico, campo: CampoBiometrico): number | undefined {
  return ojo.medidas[campo]?.valor
}

/**
 * Coloca una medida en el ojo.
 *
 * Comprueba que la medida sea de ESE ojo. Mezclar OD y OS es el error que más
 * caro sale en este dominio, y no puede depender de que quien llame se acuerde.
 */
export function conMedida(ojo: OjoBiometrico, medida: Medida): OjoBiometrico {
  if (medida.ojo !== ojo.lateralidad) {
    throw new Error(
      `Se ha intentado guardar una medida de ${medida.ojo} en el ojo ${ojo.lateralidad} ` +
        `(campo ${medida.campo}). Los datos de los dos ojos no se mezclan nunca.`,
    )
  }
  return { ...ojo, medidas: { ...ojo.medidas, [medida.campo]: medida } }
}

/**
 * Quita un dato del ojo. Es la forma correcta de decir «esto no lo sabemos»:
 * se borra, no se pone a cero.
 */
export function sinMedida(ojo: OjoBiometrico, campo: CampoBiometrico): OjoBiometrico {
  if (!tiene(ojo, campo)) return ojo
  const medidas: Record<string, Medida> = { ...(ojo.medidas as Record<string, Medida>) }
  delete medidas[campo]
  return { ...ojo, medidas: medidas as MapaMedidas }
}

/** Marca un dato como revisado por una persona. */
export function confirmarMedida(ojo: OjoBiometrico, campo: CampoBiometrico): OjoBiometrico {
  const m = obtener(ojo, campo)
  if (!m) return ojo
  return conMedida(ojo, { ...m, confirmadoPorUsuario: true })
}

export function confirmarTodas(ojo: OjoBiometrico): OjoBiometrico {
  let resultado = ojo
  for (const campo of camposPresentes(ojo)) resultado = confirmarMedida(resultado, campo)
  return resultado
}

export function camposPresentes(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return Object.keys(ojo.medidas) as CampoBiometrico[]
}

export function camposSinConfirmar(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => !ojo.medidas[c]?.confirmadoPorUsuario)
}

export function todasConfirmadas(ojo: OjoBiometrico): boolean {
  return camposSinConfirmar(ojo).length === 0
}

/** Los campos que puso una persona a mano. */
export function camposManuales(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esManual(m.procedencia)
  })
}

/** Los campos que salieron de un documento. */
export function camposExtraidos(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esMedido(m.procedencia)
  })
}

/** Los campos que se calcularon a partir de otros. */
export function camposDerivados(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esDerivado(m.procedencia)
  })
}

/**
 * Cómo se enseña una medida: «41.22 D». Si no está, «NO ENCONTRADO».
 *
 * Este texto es el que ve el usuario. Que un dato ausente diga exactamente
 * «NO ENCONTRADO» y no «—» ni «0» es parte del producto.
 */
export const TEXTO_AUSENTE = 'NO ENCONTRADO'

export function formatearMedida(ojo: OjoBiometrico, campo: CampoBiometrico): string {
  const m = obtener(ojo, campo)
  if (!m) return TEXTO_AUSENTE
  return formatearConUnidad(campo, m.valor)
}
