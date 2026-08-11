/**
 * calculadoras.ts — Qué necesita cada calculadora y qué devuelve.
 *
 * Este fichero describe las calculadoras externas **sin una sola línea de
 * HTML**. Aquí vive lo que el dominio tiene que saber: qué campos exige cada
 * una, cómo puede terminar un intento y qué forma tiene un resultado ya
 * normalizado. Cómo se rellena el formulario de EVO es asunto exclusivo de
 * `@vilamar/integrations`.
 *
 * Si algún día EVO cambia el nombre de un botón, este fichero no se entera.
 */

import type { CampoBiometrico } from './campos.js'
import type { Lateralidad } from './lateralidad.js'

export type Calculadora = 'KANE' | 'EVO_TORIC' | 'BARRETT_TORIC'

export const CALCULADORAS: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE'] as const

export interface FichaCalculadora {
  readonly clave: Calculadora
  readonly nombre: string
  readonly url: string
  /** Sin estos campos NO se puede calcular. Su ausencia bloquea solo a esta calculadora. */
  readonly requeridos: readonly CampoBiometrico[]
  /** Mejoran el resultado, pero se puede calcular sin ellos. */
  readonly opcionales: readonly CampoBiometrico[]
  /** Qué hace falta de una persona antes de poder automatizar. Vacío si nada. */
  readonly intervencionHumana: readonly string[]
  /** Notas que la interfaz enseña al usuario. */
  readonly notas: readonly string[]
}

/**
 * Lo que exige cada calculadora, comprobado abriendo su formulario real.
 *
 * Los campos de identificación del paciente que estas webs piden (nombre,
 * identificador, cirujano) NO están aquí a propósito: el producto nunca manda
 * datos de paciente. Cuando una web marca «Patient Name» como obligatorio, se
 * le envía el código local del caso, que es un identificador de este programa.
 */
export const FICHAS: Readonly<Record<Calculadora, FichaCalculadora>> = {
  EVO_TORIC: {
    clave: 'EVO_TORIC',
    nombre: 'EVO Toric',
    url: 'https://www.evoiolcalculator.com/toric.aspx',
    requeridos: ['AL', 'K1', 'K1_EJE', 'K2', 'K2_EJE', 'ACD', 'REFRACCION_OBJETIVO', 'CONSTANTE_A'],
    opcionales: ['LT', 'CCT', 'SIA', 'EJE_INCISION', 'PK1', 'PK1_EJE', 'PK2', 'PK2_EJE'],
    intervencionHumana: [],
    notas: [
      'EVO exige un nombre de paciente. Se le manda el código local del caso, nunca un nombre.',
      'Elegir el modelo de lente en EVO puede sobrescribir la constante A. El informe recoge la que la web dice haber usado, no la que se le envió.',
    ],
  },
  BARRETT_TORIC: {
    clave: 'BARRETT_TORIC',
    nombre: 'Barrett Toric',
    url: 'https://www.ascrs.org/en/tools/barrett-toric-calculator',
    requeridos: [
      'AL',
      'K1',
      'K1_EJE',
      'K2',
      'K2_EJE',
      'ACD',
      'REFRACCION_OBJETIVO',
      'SIA',
      'EJE_INCISION',
    ],
    opcionales: ['LT', 'WTW', 'CONSTANTE_A', 'FACTOR_LENTE'],
    intervencionHumana: [],
    notas: [
      'La calculadora vive dentro de la web de la ASCRS y no admite navegador sin ventana: se abre siempre un navegador visible.',
      'La ASCRS enseña un aviso de cookies que tapa la página. Calculator Vilamar elige «Rechazar», que es la opción que menos datos comparte.',
    ],
  },
  KANE: {
    clave: 'KANE',
    nombre: 'Kane',
    url: 'https://www.iolformula.com',
    requeridos: ['AL', 'K1', 'K2', 'ACD', 'REFRACCION_OBJETIVO', 'CONSTANTE_A'],
    opcionales: ['K1_EJE', 'K2_EJE', 'LT', 'CCT', 'WTW'],
    intervencionHumana: [
      'Aceptar las condiciones de uso de la fórmula de Kane. Es un acuerdo legal: lo tiene que aceptar una persona, no el programa.',
      'La web está protegida por reCAPTCHA. Si aparece una comprobación, la resuelve la persona en el navegador.',
    ],
    notas: [
      'Calculator Vilamar no acepta condiciones de uso en nombre de nadie ni rodea protecciones anti-robot.',
    ],
  },
}

export function fichaDe(calculadora: Calculadora): FichaCalculadora {
  const f = FICHAS[calculadora]
  if (!f) throw new Error(`Calculadora desconocida: ${String(calculadora)}`)
  return f
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cómo puede terminar un intento
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoAdaptador =
  /** Salió todo y hay resultado. */
  | 'SUCCESS'
  /** Se calculó, pero no se pudo leer todo lo que se esperaba. */
  | 'PARTIAL'
  /** La web pide algo a una persona: aceptar términos, resolver una comprobación… */
  | 'NEEDS_USER_ACTION'
  /** Faltan datos de entrada. No es culpa de la web. */
  | 'MISSING_INPUTS'
  /** La web falló, no respondió o cambió de forma inesperada. */
  | 'EXTERNAL_ERROR'
  /** El adaptador ya no encaja con la web: hay que repararlo. */
  | 'ADAPTER_BROKEN'

/** Si de este estado tiene sentido reintentar sin tocar nada. */
export function sePuedeReintentar(estado: EstadoAdaptador): boolean {
  return estado === 'EXTERNAL_ERROR' || estado === 'NEEDS_USER_ACTION' || estado === 'PARTIAL'
}

// ─────────────────────────────────────────────────────────────────────────────
//  Entradas preparadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El juego de datos listo para enviar a una calculadora.
 *
 * Se construye desde el dominio y ya viene con todo confirmado. Un adaptador
 * NO puede fabricarse uno por su cuenta: lo recibe hecho.
 */
export interface EntradasCalculadora {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  /** Código local del caso. Es lo único parecido a un identificador que sale de aquí. */
  readonly codigoCaso: string
  readonly valores: Readonly<Partial<Record<CampoBiometrico, number>>>
  /** Modelo de lente elegido, tal y como lo llama esa web. */
  readonly modeloLente?: string
  readonly fabricanteLente?: string
}

export interface FaltanEntradas {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly faltan: readonly CampoBiometrico[]
  /** Campos presentes pero que nadie ha confirmado todavía. */
  readonly sinConfirmar: readonly CampoBiometrico[]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Resultados normalizados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una opción de lente devuelta por una calculadora.
 *
 * Todos los campos son opcionales porque **no todas las calculadoras dan todos
 * los datos**. Un campo que la web no da se queda sin poner, y la interfaz
 * enseña «N/A». Nunca se rellena por inferencia.
 */
export interface OpcionLente {
  /** Potencia esférica de la lente, en dioptrías. */
  readonly esfera?: number
  /** Cilindro de la lente en el plano de la lente, en dioptrías. */
  readonly cilindro?: number
  /** Eje al que hay que colocar la lente. */
  readonly eje?: number
  /** Cómo llama el fabricante a esa potencia tórica: «SN6AT2», «T3»… */
  readonly designacion?: string
  /** Refracción esférica prevista tras la cirugía. */
  readonly refraccionPrevista?: number
  /** Astigmatismo que se prevé que quede. */
  readonly cilindroResidual?: number
  /** Eje del astigmatismo residual. */
  readonly ejeResidual?: number
  /** Equivalente de desenfoque, cuando la calculadora lo da. */
  readonly equivalenteDesenfoque?: number
  /** Si es la opción que la calculadora destaca. */
  readonly recomendada: boolean
}

export interface ResultadoCalculadora {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly estado: EstadoAdaptador
  /** Cuándo se obtuvo. ISO 8601. */
  readonly obtenidoEn: string
  /** Cuánto tardó, en milisegundos. */
  readonly duracionMs?: number
  /** Las opciones que devolvió la web, en el orden en que las devolvió. */
  readonly opciones: readonly OpcionLente[]
  /** La opción que la web destaca como recomendada, si destaca alguna. */
  readonly recomendada?: OpcionLente
  /** Astigmatismo corneal neto que la calculadora ha calculado, si lo publica. */
  readonly astigmatismoNeto?: { readonly magnitud: number; readonly eje: number }
  /**
   * Lo que la web dice haber usado como entrada, leído de su propia pantalla.
   *
   * Esto es lo que convierte el informe en auditable: no se apunta lo que
   * creemos haberle mandado, se apunta lo que ella dice haber recibido.
   */
  readonly entradasSegunLaWeb?: Readonly<Record<string, string>>
  /** Para el usuario, en lenguaje normal. Nunca un selector ni una traza. */
  readonly mensaje?: string
  /** Qué faltaba, si el estado es MISSING_INPUTS. */
  readonly faltan?: readonly CampoBiometrico[]
  /** Referencia al diagnóstico técnico guardado en local, si lo hubo. */
  readonly diagnosticoId?: string
}

export function resultadoVacio(
  calculadora: Calculadora,
  ojo: Lateralidad,
  estado: EstadoAdaptador,
  obtenidoEn: string,
  mensaje?: string,
): ResultadoCalculadora {
  return { calculadora, ojo, estado, obtenidoEn, opciones: [], mensaje }
}
