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
import type { Catalogo } from './catalogo-lentes.js'
import { constanteDelCatalogoPara } from './catalogo-lentes.js'
import type { Lateralidad } from './lateralidad.js'
import { obtener } from './medida.js'

/**
 * ¿Tiene esta calculadora, para la lente elegida, una constante A que no
 * hace falta escribir a mano en el ojo?
 *
 * Dos caminos, y no son el mismo (D38):
 *
 *  - **EVO y Kane reconocen el modelo en su propia web y rellenan SU
 *    constante solos.** Basta con haber elegido una lente — no hace falta que
 *    el catálogo propio la tenga, porque la fuente de verdad es la web, no
 *    nuestro catálogo. Si al final no la reconocen, esa casilla en concreto
 *    fallará con «falta la constante A» al calcular, y se puede reintentar
 *    con una escrita a mano: no es motivo para bloquear la confirmación de
 *    todo el caso por adelantado.
 *  - **Barrett no elige modelo de fiar**: su lista es mucho más corta y casi
 *    nunca tiene la lente pedida (comprobado en vivo). Para Barrett hace
 *    falta que el catálogo propio traiga su constante.
 */
export function tieneConstanteFueraDelOjo(
  caso: Caso,
  calculadora: Calculadora,
  catalogo: Catalogo | undefined,
): boolean {
  const modelo = caso.lente?.modelo
  if (modelo === undefined || modelo.trim() === '') return false
  if (calculadora === 'EVO_TORIC' || calculadora === 'KANE') return true
  return (
    constanteDelCatalogoPara(
      catalogo ?? [],
      { fabricante: caso.lente?.fabricante, modelo },
      calculadora,
    ) !== undefined
  )
}

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
export function sePuedeCalcular(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  catalogo?: Catalogo,
): boolean {
  return prepararEntradas(caso, calculadora, ojo, catalogo).ok
}

export function camposQueFaltan(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  catalogo?: Catalogo,
): readonly CampoBiometrico[] {
  const ficha = fichaDe(calculadora)
  const datos = ojoDe(caso, ojo)
  return ficha.requeridos.filter((c) => {
    if (obtener(datos, c) !== undefined) return false
    if (c === 'CONSTANTE_A' && tieneConstanteFueraDelOjo(caso, calculadora, catalogo)) return false
    return true
  })
}

export function prepararEntradas(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  catalogo?: Catalogo,
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

  // 3 — Los campos obligatorios de ESTA calculadora. La constante A puede
  // venir de fuera del ojo — ver `tieneConstanteFueraDelOjo`.
  const faltan = ficha.requeridos.filter((c) => {
    if (obtener(datos, c) !== undefined) return false
    if (c === 'CONSTANTE_A' && tieneConstanteFueraDelOjo(caso, calculadora, catalogo)) return false
    return true
  })

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
      // Si no se ha dicho nada, no bloquea ni se envía nada: el adaptador que
      // la usa (EVO) trata «no se sabe» igual que «ninguna», que es lo que
      // pasa en la inmensa mayoría de los ojos. `aportarCirugiaRefractiva`
      // siempre deja el dato confirmado en cuanto una persona lo escribe, así
      // que no hace falta una comprobación de «sin revisar» aparte.
      cirugiaRefractivaPrevia: datos.cirugiaRefractivaPrevia?.valor,
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
