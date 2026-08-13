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
import type { Sexo } from './sexo.js'

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
  /**
   * Si su formulario pide el sexo del paciente.
   *
   * Va aparte de `requeridos` porque el sexo NO es un `CampoBiometrico`: no es
   * una medida del ojo, no tiene unidad ni rango, y es de la persona. Forzarlo
   * dentro de la lista de campos solo para reutilizar el mecanismo habría metido
   * un dato que no es del ojo dentro del mapa del ojo.
   */
  readonly exigeSexo?: boolean
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
    // Comprobado el 12/08/2026 abriendo su formulario: 36 campos, ninguno de sexo.
    exigeSexo: false,
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
    exigeSexo: false,
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
    // Comprobado contra su formulario real el 12/08/2026:
    //  · WTW NO existe en Kane. Estaba aquí por suposición.
    //  · Los ejes de K solo aparecen en su modo «Toric», que este producto no
    //    usa: se marca «Non-toric».
    //  · El índice queratométrico SÍ: es una lista que Kane marca obligatoria,
    //    con 1.3375 por defecto. Es opcional PARA NOSOTROS porque si el informe
    //    no lo trae se deja el de Kane, que es el habitual.
    opcionales: ['LT', 'CCT', 'INDICE_QUERATOMETRICO'],
    // Su formulario lo pide. Observado por el dueño del proyecto en una prueba
    // manual; no se ha podido confirmar contra el HTML porque la calculadora
    // vive detrás de un acuerdo de licencia que solo puede aceptar una persona.
    exigeSexo: true,
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
  /** El sexo, solo para la calculadora que lo pide. */
  readonly sexo?: Sexo
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

// ═══════════════════════════════════════════════════════════════════════════
//  Qué campos hay que rellenar de verdad
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cuánta falta hace un campo.
 *
 * Existe porque «obligatorio» a secas **sería mentira**: ser obligatorio no es
 * una propiedad del campo, depende de qué calculadora quieras usar. Sin SIA,
 * Barrett no calcula y EVO sí. Marcar los dos casos igual haría que alguien
 * rellenara datos que no le hacen falta, o que se dejara sin rellenar uno que sí.
 *
 * Y hay un cuarto nivel que conviene decir en voz alta: campos que **no se
 * envían a ninguna parte**. Se leen del informe y se guardan por trazabilidad,
 * pero no alimentan ningún cálculo. Callarlo haría pensar que hacen falta.
 */
export type NivelExigencia =
  /** Sin él no calcula NINGUNA de las tres. */
  | 'OBLIGATORIO'
  /** Sin él, unas calculan y otras no. */
  | 'SEGUN_CALCULADORA'
  /** Todas calculan sin él; mejora el resultado. */
  | 'OPCIONAL'
  /** No se envía a ninguna calculadora. Queda en el informe. */
  | 'INFORMATIVO'

export interface Exigencia {
  readonly nivel: NivelExigencia
  /** Calculadoras que NO pueden calcular sin este campo. */
  readonly requeridoPor: readonly Calculadora[]
  /** Calculadoras que lo aprovechan si está, pero calculan sin él. */
  readonly opcionalPara: readonly Calculadora[]
}

/**
 * Cuánta falta hace este campo, mirando las tres fichas.
 *
 * Se calcula desde `FICHAS`, que está comprobada contra los formularios reales.
 * No hay una segunda lista que mantener: si mañana Barrett deja de pedir el SIA,
 * se cambia su ficha y esto cambia solo.
 */
export function exigenciaDe(campo: CampoBiometrico): Exigencia {
  const requeridoPor = CALCULADORAS.filter((c) => FICHAS[c].requeridos.includes(campo))
  const opcionalPara = CALCULADORAS.filter((c) => FICHAS[c].opcionales.includes(campo))
  const nivel: NivelExigencia =
    requeridoPor.length === CALCULADORAS.length
      ? 'OBLIGATORIO'
      : requeridoPor.length > 0
        ? 'SEGUN_CALCULADORA'
        : opcionalPara.length > 0
          ? 'OPCIONAL'
          : 'INFORMATIVO'
  return { nivel, requeridoPor, opcionalPara }
}

/**
 * Cómo se dice en pantalla cuánta falta hace un campo.
 *
 * En el caso intermedio **se nombran las calculadoras**, porque es la única
 * forma de que la frase sea accionable: «Obligatorio para Barrett Toric» dice qué
 * pierdes si lo dejas vacío. «Puede ser obligatorio» no dice nada.
 */
export function textoDeExigencia(e: Exigencia): string {
  switch (e.nivel) {
    case 'OBLIGATORIO':
      return 'Obligatorio'
    case 'SEGUN_CALCULADORA':
      return `Obligatorio para ${e.requeridoPor.map((c) => FICHAS[c].nombre).join(' y ')}`
    case 'OPCIONAL':
      return 'Opcional'
    case 'INFORMATIVO':
      return 'No se envía a ninguna calculadora'
  }
}

/**
 * Qué calculadoras no van a poder calcular con lo que hay, y por qué.
 *
 * Sirve para avisar **antes** de confirmar. Hasta ahora esto solo se sabía
 * después de pulsar el botón y esperar a que el navegador recorriera las tres
 * webs: cuarenta y siete segundos para enterarse de que faltaba un dato que se
 * podía haber escrito antes.
 *
 * Devuelve solo las que fallan. Si está vacío, las tres pueden calcular.
 */
export function quienNoPuedeCalcular(
  medidas: Readonly<Partial<Record<CampoBiometrico, unknown>>>,
  /**
   * ¿Hay un sexo confirmado en el caso?
   *
   * Va aparte porque el sexo NO es un `CampoBiometrico`: no está en el mapa del
   * ojo. Y tiene que estar aquí porque si no, este aviso mentía: decía que Kane
   * podía calcular y después salía «falta el sexo» tras esperar el recorrido
   * entero. Era el mismo problema de los 47 segundos que este aviso existe para
   * evitar, reintroducido por otra puerta.
   */
  haySexoConfirmado = true,
): readonly {
  readonly calculadora: Calculadora
  readonly faltan: readonly CampoBiometrico[]
  /** Le falta el sexo del paciente, que no es un campo del ojo. */
  readonly faltaElSexo: boolean
}[] {
  return CALCULADORAS.map((calculadora) => ({
    calculadora,
    faltan: FICHAS[calculadora].requeridos.filter((c) => medidas[c] === undefined),
    faltaElSexo: FICHAS[calculadora].exigeSexo === true && !haySexoConfirmado,
  })).filter((x) => x.faltan.length > 0 || x.faltaElSexo)
}
