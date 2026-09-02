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
import { APARATO_PRINCIPAL, obtener } from './medida.js'

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
  aparato: string = APARATO_PRINCIPAL,
): boolean {
  return prepararEntradas(caso, calculadora, ojo, aparato).ok
}

/**
 * Cómo se llama la lente elegida en el desplegable de ESTA calculadora
 * (petición expresa del dueño, 27/08/2026): un mismo modelo físico puede
 * tener nombres distintos en cada web —«B&L LuxSmart» en EVO, «B+L
 * LuxSmart Toric» en Kane— y elegir el equivocado no da un error: elige en
 * silencio OTRA lente con su propia constante. Sin nombre específico para
 * esta calculadora, se usa el general, igual que siempre.
 */
function nombreDeLentePara(caso: Caso, calculadora: Calculadora): string | undefined {
  if (calculadora === 'EVO_TORIC' || calculadora === 'EVO_TORIC_SIN_CARA_POSTERIOR') {
    return caso.lente?.nombreEnEvo ?? caso.lente?.modelo
  }
  if (calculadora === 'KANE') return caso.lente?.nombreEnKane ?? caso.lente?.modelo
  return caso.lente?.modelo
}

/**
 * Cómo se llama el mismo aparato en el desplegable «Biometer»/«Device» de
 * EVO y de Barrett cuando ese aparato midió también la córnea posterior
 * (petición expresa del dueño, 01/09/2026, con capturas de pantalla de
 * los dos desplegables): las dos webs piden explícitamente qué
 * instrumento dio esa medida —cada una aplica una corrección propia según
 * el aparato— y por defecto se quedan en el primero de su lista
 * («IOLMaster 700»/«IOLMaster 700 TK»), aunque el aparato real fuera
 * otro. Mismo patrón que `nombreDeLentePara` para las lentes (D50): cada
 * web tiene su propio texto exacto, comprobado en vivo el 01/09/2026
 * contra las dos.
 *
 * Solo se listan los aparatos que este programa ya reconoce
 * (`NOMBRE_DISPOSITIVO`, en `documento.ts`), más «Sirius» —visto en uso
 * real, y que sí está en la lista de EVO—. Un aparato sin mapeo (incluido
 * «Otro», texto libre) no se manda: la web se queda en su propio valor
 * por defecto, igual que hasta ahora — no se adivina a cuál se refería.
 */
const DISPOSITIVO_EN_EVO: Partial<Record<string, string>> = {
  'Heidelberg ANTERION': 'Anterion',
  'ZEISS IOLMaster 700': 'IOLMaster 700',
  'OCULUS Pentacam': 'Pentacam',
  Sirius: 'Sirius',
}

/**
 * Barrett, a diferencia de EVO, no tiene «Anterion» en su lista —
 * comprobado en vivo el 01/09/2026: no hay equivalente, así que un caso
 * con ANTERION no manda nada aquí y Barrett se queda en su propio
 * defecto.
 */
const DISPOSITIVO_EN_BARRETT: Partial<Record<string, string>> = {
  'ZEISS IOLMaster 700': 'IOLMaster 700 TK',
  'OCULUS Pentacam': 'Pentacam',
}

function dispositivoCaraPosteriorPara(calculadora: Calculadora, aparato: string): string | undefined {
  if (calculadora === 'EVO_TORIC') return DISPOSITIVO_EN_EVO[aparato]
  if (calculadora === 'BARRETT_TORIC_CON_CARA_POSTERIOR') return DISPOSITIVO_EN_BARRETT[aparato]
  return undefined
}

export function camposQueFaltan(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  aparato: string = APARATO_PRINCIPAL,
): readonly CampoBiometrico[] {
  const ficha = fichaDe(calculadora)
  const datos = ojoDe(caso, ojo, aparato)
  return ficha.requeridos.filter((c) => obtener(datos, c) === undefined)
}

/**
 * @param aparato De qué biómetro coger los datos (D47, 27/08/2026). Sin
 *   especificarlo, `APARATO_PRINCIPAL` — el único que existe en un caso que no
 *   usa varios. La comprobación de «cada campo revisado» (paso 3, más abajo)
 *   mira solo ESTE dataset, así que un aparato ya confirmado puede calcular
 *   aunque otro del mismo ojo siga a medias — es la independencia de D47.
 */
export function prepararEntradas(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  aparato: string = APARATO_PRINCIPAL,
): ResultadoPreparacion {
  // 1 — Nada sale de un caso que no haya confirmado una persona.
  if (!autorizadoACalcular(caso)) {
    return { ok: false, motivo: 'SIN_CONFIRMAR_EL_CASO' }
  }

  const ficha = fichaDe(calculadora)
  const datos = ojoDe(caso, ojo, aparato)

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
      modeloLente: nombreDeLentePara(caso, calculadora),
      fabricanteLente: caso.lente?.fabricante,
      // Solo viaja si esa calculadora lo pide. No se manda un dato de la persona
      // a una web que no lo necesita.
      sexo: ficha.exigeSexo === true ? caso.sexo?.valor : undefined,
      // El cirujano viaja si el caso lo tiene (D41), y desde D44 el paciente
      // también — decisión expresa del dueño, hecha dos veces tras dos
      // avisos explícitos sobre lo que implica.
      nombreCirujano: caso.nombreCirujano,
      nombrePaciente: caso.nombrePaciente,
      // El aparato de córnea posterior, si se ha elegido uno distinto del
      // general (02/09/2026, corrige D58) — si no, el general de siempre.
      dispositivoCaraPosterior: dispositivoCaraPosteriorPara(
        calculadora,
        datos.aparatoCaraPosterior ?? datos.aparato,
      ),
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
