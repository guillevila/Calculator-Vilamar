/**
 * preparar-entradas.ts — La puerta por la que los datos salen hacia una web.
 *
 * Todo lo que se envía a Kane, EVO o Barrett pasa por aquí. Es el único sitio
 * del programa que convierte un caso en un juego de entradas, y hace tres
 * comprobaciones que no se pueden saltar:
 *
 *   1. El caso está confirmado por una persona.
 *   2. Están todos los campos que esa calculadora exige.
 *   3. Cada campo que se envía lo ha revisado una persona.
 *
 * Si falla cualquiera de las tres, no se devuelven entradas: se devuelve el
 * motivo. Y ese motivo bloquea SOLO a esa calculadora — que a Barrett le falte
 * el WTW no puede impedir que EVO calcule.
 */

import type { CampoBiometrico } from './campos.js'
import type { Calculadora, EntradasCalculadora, FaltanEntradas } from './calculadoras.js'
import { fichaDe } from './calculadoras.js'
import type { Caso } from './caso.js'
import { autorizadoACalcular, ojoDe } from './caso.js'
import type { Lateralidad } from './lateralidad.js'
import { obtener } from './medida.js'

export type ResultadoPreparacion =
  | { readonly ok: true; readonly entradas: EntradasCalculadora }
  | { readonly ok: false; readonly motivo: 'SIN_CONFIRMAR_EL_CASO' }
  | { readonly ok: false; readonly motivo: 'FALTAN_DATOS'; readonly detalle: FaltanEntradas }
  /**
   * Falta el sexo, y esa calculadora lo pide.
   *
   * Es un motivo aparte y no un campo más de `faltan` porque el sexo no es un
   * `CampoBiometrico`: no está en el mapa del ojo y la pantalla lo enseña en
   * otro sitio. Meterlo en la misma lista habría obligado a inventarle un código
   * de campo que no existe.
   */
  | { readonly ok: false; readonly motivo: 'FALTA_EL_SEXO'; readonly confirmado: boolean }

/**
 * ¿Se puede lanzar esta calculadora para este ojo?
 *
 * Equivale al `canRun(case)` del contrato de adaptadores, pero vive en el
 * dominio para que ningún adaptador pueda saltárselo.
 */
export function sePuedeCalcular(caso: Caso, calculadora: Calculadora, ojo: Lateralidad): boolean {
  return prepararEntradas(caso, calculadora, ojo).ok
}

export function camposQueFaltan(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
): readonly CampoBiometrico[] {
  const ficha = fichaDe(calculadora)
  const datos = ojoDe(caso, ojo)
  return ficha.requeridos.filter((c) => obtener(datos, c) === undefined)
}

export function prepararEntradas(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
): ResultadoPreparacion {
  // 1 — Nada sale de un caso que no haya confirmado una persona.
  if (!autorizadoACalcular(caso)) {
    return { ok: false, motivo: 'SIN_CONFIRMAR_EL_CASO' }
  }

  const ficha = fichaDe(calculadora)
  const datos = ojoDe(caso, ojo)

  // 2 — El sexo, si esta calculadora lo pide. Y tiene que estar REVISADO: un
  // sexo deducido del nombre que nadie ha mirado no sale hacia ninguna web.
  if (ficha.exigeSexo === true) {
    if (caso.sexo === undefined) {
      return { ok: false, motivo: 'FALTA_EL_SEXO', confirmado: false }
    }
    if (!caso.sexo.confirmadoPorUsuario) {
      return { ok: false, motivo: 'FALTA_EL_SEXO', confirmado: false }
    }
  }

  // 3 — Los campos obligatorios de ESTA calculadora.
  const faltan = ficha.requeridos.filter((c) => obtener(datos, c) === undefined)

  // 3 — Ningún dato sin revisar viaja, ni siquiera los opcionales.
  const candidatos = [...ficha.requeridos, ...ficha.opcionales]
  const sinConfirmar = candidatos.filter((c) => {
    const m = obtener(datos, c)
    return m !== undefined && !m.confirmadoPorUsuario
  })

  if (faltan.length > 0 || sinConfirmar.length > 0) {
    return {
      ok: false,
      motivo: 'FALTAN_DATOS',
      detalle: { calculadora, ojo, faltan, sinConfirmar },
    }
  }

  const valores: Partial<Record<CampoBiometrico, number>> = {}
  for (const campo of candidatos) {
    const m = obtener(datos, campo)
    // Un campo opcional ausente NO se rellena con nada. Simplemente no viaja.
    if (m !== undefined) valores[campo] = m.valor
  }

  return {
    ok: true,
    entradas: {
      calculadora,
      ojo,
      codigoCaso: caso.codigo,
      valores,
      modeloLente: caso.lente?.modelo,
      fabricanteLente: caso.lente?.fabricante,
      // Solo viaja si esa calculadora lo pide. No se manda un dato de la persona
      // a una web que no lo necesita.
      sexo: ficha.exigeSexo === true ? caso.sexo?.valor : undefined,
      // El cirujano viaja si el caso lo tiene (D41), y desde D44 el paciente
      // también — decisión expresa del dueño, hecha dos veces tras dos
      // avisos explícitos sobre lo que implica.
      nombreCirujano: caso.nombreCirujano,
      nombrePaciente: caso.nombrePaciente,
    },
  }
}

/**
 * Explica en lenguaje normal por qué una calculadora no puede ejecutarse.
 *
 * Lo que ve el usuario cuando Barrett no puede correr no es un código: es
 * «Barrett necesita el WTW y no se ha encontrado en el informe».
 */
export function explicarBloqueo(resultado: ResultadoPreparacion): string | null {
  if (resultado.ok) return null
  if (resultado.motivo === 'FALTA_EL_SEXO') {
    return 'Falta el sexo del paciente, y esta calculadora lo pide en su formulario. Elígelo arriba y márcalo como comprobado.'
  }
  if (resultado.motivo === 'SIN_CONFIRMAR_EL_CASO') {
    return 'Todavía no has confirmado los datos. Revísalos y confírmalos antes de calcular.'
  }
  const { calculadora, faltan, sinConfirmar } = resultado.detalle
  const nombre = fichaDe(calculadora).nombre
  const partes: string[] = []
  if (faltan.length > 0) {
    const lista = faltan.map((c) => nombreLegible(c)).join(', ')
    partes.push(
      faltan.length === 1
        ? `${nombre} necesita ${lista} y no se ha encontrado.`
        : `${nombre} necesita estos datos y no se han encontrado: ${lista}.`,
    )
  }
  if (sinConfirmar.length > 0) {
    partes.push(`Hay datos sin revisar: ${sinConfirmar.map((c) => nombreLegible(c)).join(', ')}.`)
  }
  return partes.join(' ')
}

function nombreLegible(campo: CampoBiometrico): string {
  // Import diferido para no crear un ciclo con campos.ts en el arranque.
  // (campos.ts no importa este fichero, así que basta con la importación normal.)
  return REGISTRO[campo] ?? campo
}

// Se guarda una tabla plana en lugar de importar `definicionDe` para que este
// módulo no dependa del registro completo en tiempo de carga.
const REGISTRO: Partial<Record<CampoBiometrico, string>> = {
  AL: 'la longitud axial (AL)',
  K1: 'K1',
  K1_EJE: 'el eje de K1',
  K2: 'K2',
  K2_EJE: 'el eje de K2',
  ACD: 'la ACD',
  AQD: 'la AQD',
  LT: 'el grosor del cristalino (LT)',
  CCT: 'el grosor corneal (CCT)',
  WTW: 'el diámetro corneal (WTW)',
  REFRACCION_OBJETIVO: 'la refracción objetivo',
  SIA: 'el SIA',
  EJE_INCISION: 'el eje de la incisión',
  CONSTANTE_A: 'la constante A',
  FACTOR_LENTE: 'el factor de lente',
}
