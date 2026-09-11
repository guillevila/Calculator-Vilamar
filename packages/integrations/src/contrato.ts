/**
 * contrato.ts — Qué es un adaptador de calculadora.
 *
 * Un adaptador es lo único del programa que sabe HTML. Encapsula una web
 * ajena entera: su dirección, sus campos, sus botones, sus rarezas y sus
 * formas de fallar. Fuera de `src/adapters/` no debe aparecer ni un selector.
 *
 * La prueba de que la frontera está bien puesta: si mañana EVO cambia su botón
 * de calcular, se toca un fichero y no se enteran ni el modelo biométrico, ni
 * la lectura de informes, ni la interfaz, ni los otros dos adaptadores.
 */

import type {
  Calculadora,
  EntradasCalculadora,
  EstadoAdaptador,
  Lateralidad,
  ResultadoCalculadora,
} from '@vilamar/domain'
import type { BrowserContext, Page } from 'playwright'

/** En qué punto del proceso está un adaptador. Sirve para diagnosticar. */
export type FaseAdaptador =
  | 'NAVEGANDO'
  | 'PREPARANDO'
  | 'RELLENANDO'
  | 'ESPERANDO_AL_USUARIO'
  | 'CALCULANDO'
  | 'LEYENDO_RESULTADO'
  | 'TERMINADO'

/** Lo que el adaptador va contando mientras trabaja, para enseñarlo en pantalla. */
export interface EventoProgreso {
  readonly calculadora: Calculadora
  /**
   * De qué ojo habla este aviso.
   *
   * Lo rellena el orquestador, no el adaptador: un adaptador solo sabe que está
   * rellenando un formulario. Sin este dato, un caso con los dos ojos enseñaría
   * «Calculando en EVO…» dos veces seguidas sin decir de cuál de los dos, que es
   * justo cuando el usuario necesita saberlo.
   */
  readonly ojo?: Lateralidad
  readonly fase: FaseAdaptador
  /** En lenguaje normal. Es lo que lee el usuario. */
  readonly mensaje: string
  /** Si hace falta que la persona haga algo en el navegador. */
  readonly requiereUsuario?: boolean
}

export interface ContextoEjecucion {
  readonly contexto: BrowserContext
  readonly entradas: EntradasCalculadora
  /** Para ir informando. Nunca recibe datos de paciente. */
  readonly progreso: (evento: EventoProgreso) => void
  /** Reloj inyectado, para que los tests no dependan de la hora. */
  readonly ahora: () => string
  /**
   * Guarda material de diagnóstico cuando algo falla: captura de pantalla,
   * fase, selector esperado. Devuelve un identificador para el informe.
   *
   * Se inyecta porque el adaptador no debe decidir dónde se escribe en disco.
   */
  readonly guardarDiagnostico: (d: DatosDiagnostico) => Promise<string>
  /**
   * Guarda una captura de la pantalla de resultados, cuando el cálculo sale
   * bien. Devuelve un identificador para `ResultadoCalculadora.capturaId`.
   *
   * Es el mismo patrón que `guardarDiagnostico` y por la misma razón: el
   * adaptador no decide dónde se escribe en disco. La diferencia es que esto
   * es la prueba de un ÉXITO, no de un fallo — sirve para el PDF de cada
   * calculadora, no para reparar un conector roto.
   */
  readonly guardarCaptura: (
    calculadora: Calculadora,
    ojo: Lateralidad,
    datos: Uint8Array,
  ) => Promise<string>
  /** Señal para cancelar desde la interfaz. */
  readonly cancelado: () => boolean
}

export interface DatosDiagnostico {
  readonly calculadora: Calculadora
  readonly fase: FaseAdaptador
  readonly url: string
  readonly selectorEsperado?: string
  readonly errorTecnico: string
  /** PNG. Puede no haberla si el navegador ya no responde. */
  readonly captura?: Uint8Array
}

/**
 * El contrato que cumplen Kane, EVO y Barrett.
 *
 * `ejecutar` no lanza excepciones hacia fuera: cualquier fallo se convierte en
 * un `ResultadoCalculadora` con su estado. Es lo que permite que una
 * calculadora se rompa sin llevarse por delante a las otras dos.
 */
export interface AdaptadorCalculadora {
  readonly calculadora: Calculadora
  readonly nombre: string
  readonly url: string

  /**
   * Si esta web necesita navegador con ventana.
   *
   * No es un capricho: la calculadora de Barrett vive en un dominio que
   * responde 403 al navegador sin ventana. Comprobado abriéndola.
   */
  readonly requiereNavegadorVisible: boolean

  /**
   * Comprueba que las entradas sirven para ESTA web, más allá de que el
   * dominio ya haya validado que están todas.
   */
  validarEntradas(entradas: EntradasCalculadora): readonly string[]

  ejecutar(contexto: ContextoEjecucion): Promise<ResultadoCalculadora>
}

/** Error interno de un adaptador. No sale nunca de esta capa. */
export class ErrorAdaptador extends Error {
  constructor(
    readonly estado: EstadoAdaptador,
    /** Lo que se le enseña al usuario. Sin selectores ni trazas. */
    readonly mensajeUsuario: string,
    readonly fase: FaseAdaptador,
    readonly selectorEsperado?: string,
    causa?: unknown,
  ) {
    super(`${estado}: ${mensajeUsuario}`)
    this.name = 'ErrorAdaptador'
    if (causa instanceof Error) this.cause = causa
  }
}

/**
 * Espera a que una persona resuelva algo en el navegador.
 *
 * Aparece cuando la web pide aceptar condiciones o resolver una comprobación
 * anti-robot. El programa NO lo hace por su cuenta: enseña el navegador, avisa
 * y espera. Cuando detecta que ya está, sigue.
 *
 * `condicion` se comprueba cada dos segundos. Si se agota el tiempo, se
 * devuelve `false` y el adaptador termina en NEEDS_USER_ACTION: los datos no se
 * pierden y se puede reintentar solo esa calculadora.
 */
export async function esperarAlUsuario(
  pagina: Page,
  condicion: () => Promise<boolean>,
  opciones: { readonly limiteMs: number; readonly cancelado: () => boolean },
): Promise<boolean> {
  const limite = Date.now() + opciones.limiteMs
  while (Date.now() < limite) {
    if (opciones.cancelado()) return false
    try {
      if (await condicion()) return true
    } catch {
      // La página puede estar navegando justo ahora: se reintenta.
    }
    await pagina.waitForTimeout(2000)
  }
  return false
}

/**
 * Convierte un número al texto que espera un formulario.
 *
 * Se hace aquí, en la capa de integración, y no en el dominio: cuántos
 * decimales quiere cada web es asunto de cada web.
 */
export function formatearParaWeb(valor: number, decimales: number): string {
  return valor.toFixed(decimales)
}
