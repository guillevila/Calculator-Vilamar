/**
 * orquestador.ts — Lanza las calculadoras y protege los resultados.
 *
 * La regla que gobierna este fichero: **una calculadora que falla no puede
 * llevarse por delante a las otras dos, ni a el otro ojo**. Si Kane se rompe con
 * el ojo izquierdo, el derecho y las otras dos calculadoras siguen ahí.
 *
 * ## Las dos capas, y por qué son dos
 *
 *   ejecutarUnaCalculadoraParaUnOjo   ← la primitiva: UNA web, UN ojo
 *              ↑
 *          ejecutarCaso               ← recorre todos los ojos del caso
 *
 * La primitiva no sabe que existen dos ojos y no tiene por qué saberlo: rellena
 * un formulario y lee un resultado. Toda la decisión de «qué hay que ejecutar»
 * vive en la capa de arriba, en un solo sitio, y por eso se puede cambiar el
 * orden o reintentar una casilla suelta sin tocar ningún adaptador.
 *
 * **Antes solo había la capa de abajo**, con un `ojo` en las opciones, y el
 * resultado era que la aplicación calculaba el ojo de la pestaña activa y nada
 * más. No era un fallo de EVO —su adaptador abre página nueva, marca el radio
 * que toca y comprueba el eco del ojo—: es que **nadie le pedía el segundo**.
 *
 * ## El orden
 *
 * Se recorre CALCULADORA a calculadora y, dentro de cada una, los dos ojos:
 *
 *     EVO OD → EVO OS → Barrett OD → Barrett OS → Kane OD → Kane OS
 *
 * y no al revés, por un motivo concreto: **Kane pide aceptar sus condiciones**.
 * Con este orden se aceptan una vez y los dos ojos entran seguidos dentro de la
 * misma sesión del navegador. Recorriendo por ojos, el usuario tendría que
 * atender a Kane dos veces en la misma tanda.
 *
 * Se ejecutan de una en una, no a la vez, por dos motivos ya conocidos:
 *
 *  - Barrett necesita navegador con ventana y hay pasos que pide a una persona.
 *    Tres ventanas peleándose por la atención del usuario es peor experiencia.
 *  - El usuario tiene que poder VER qué está pasando.
 */

import type { Calculadora, Caso, Lateralidad, ResultadoCalculadora } from '@vilamar/domain'
import {
  APARATO_PRINCIPAL,
  aparatosDe,
  explicarBloqueo,
  fichaDe,
  ojosDelCaso,
  prepararEntradas,
  resultadoDe,
  resultadoVacio,
  sePuedeReintentar,
} from '@vilamar/domain'
import type { Browser, BrowserContext } from 'playwright'

import type {
  AdaptadorCalculadora,
  DatosCaptura,
  DatosDiagnostico,
  EventoProgreso,
} from './contrato.js'
import { AdaptadorBarrettToric } from './adapters/barrett.js'
import { AdaptadorBarrettTrueKToric } from './adapters/barrett-true-k.js'
import { AdaptadorEvoToric } from './adapters/evo.js'
import { AdaptadorKane } from './adapters/kane.js'
import { AdaptadorSinCaraPosterior } from './variante-sin-cara-posterior.js'

/**
 * Orden de ejecución.
 *
 * EVO no pide nada a nadie. Barrett puede pedir una comprobación. Kane pide
 * aceptar sus condiciones. De menos a más intervención, para que el usuario ya
 * tenga resultados en pantalla cuando le toque hacer algo.
 */
export const ORDEN_POR_DEFECTO: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

/** Los ojos, siempre en el mismo orden. El derecho primero, por convenio clínico. */
export const ORDEN_OJOS: readonly Lateralidad[] = ['OD', 'OS']

export function crearAdaptadores(): Readonly<Record<Calculadora, AdaptadorCalculadora>> {
  return {
    EVO_TORIC: new AdaptadorEvoToric(),
    // Mismo adaptador real, envuelto para que sus entradas nunca lleven la
    // córnea posterior y su resultado se guarde bajo su propia clave (D45).
    EVO_TORIC_SIN_CARA_POSTERIOR: new AdaptadorSinCaraPosterior(
      new AdaptadorEvoToric(),
      'EVO_TORIC_SIN_CARA_POSTERIOR',
    ),
    BARRETT_TORIC: new AdaptadorBarrettToric(),
    // Mismo formulario, con el paso extra de «Measured PCA» (D45).
    BARRETT_TORIC_CON_CARA_POSTERIOR: new AdaptadorBarrettToric(true),
    KANE: new AdaptadorKane(),
    // Calculadora aparte, no una variante de Barrett Toric — para un ojo con
    // córnea especial (D67). `prepararEntradas()` bloquea las dos entre sí.
    BARRETT_TRUE_K_TORIC: new AdaptadorBarrettTrueKToric(),
  }
}

/**
 * Una casilla del cálculo: qué web, para qué ojo y de qué aparato.
 *
 * Es la unidad de todo lo que hace este fichero — planificar, ejecutar y
 * reintentar—, y es la misma clave con la que el caso guarda los resultados
 * (`${calculadora}:${ojo}:${aparato}`). Que sea la misma no es casualidad: es lo
 * que impide que un resultado acabe en la casilla de otro.
 *
 * `aparato` es de D47 (27/08/2026): un caso que solo usa un biómetro lleva
 * siempre `APARATO_PRINCIPAL` aquí, así que no cambia nada para quien no
 * necesita varios.
 */
export interface TareaCalculo {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly aparato: string
}

/**
 * Qué hay que ejecutar para este caso.
 *
 * Calculadora a calculadora, dentro de cada una los ojos que el caso tiene, y
 * dentro de cada ojo, cada aparato/biómetro que ese ojo tenga (D47). Un caso
 * de un solo ojo y un solo aparato produce las mismas tareas que antes de
 * D47; no se inventa el que falta.
 */
export function planificarCaso(
  caso: Caso,
  opciones?: {
    readonly calculadoras?: readonly Calculadora[]
    readonly ojos?: readonly Lateralidad[]
    /** Restringe a estos aparatos, cuando el ojo los tenga. Sin especificar, todos. */
    readonly aparatos?: readonly string[]
  },
): readonly TareaCalculo[] {
  const calculadoras = opciones?.calculadoras ?? ORDEN_POR_DEFECTO
  const disponibles = ojosDelCaso(caso)
  const ojos = (opciones?.ojos ?? ORDEN_OJOS).filter((o) => disponibles.includes(o))

  return calculadoras.flatMap((calculadora) =>
    ojos.flatMap((ojo) => {
      const aparatosDelOjo = aparatosDe(caso, ojo).filter(
        (a) => opciones?.aparatos === undefined || opciones.aparatos.includes(a),
      )
      return aparatosDelOjo.map((aparato) => ({ calculadora, ojo, aparato }))
    }),
  )
}

/**
 * Las casillas que todavía no tienen un resultado aprovechable.
 *
 * Es lo que da sentido a «Reintentar»: **volver a ejecutar lo que falló**, no
 * repetir lo que ya salió bien. Una casilla está pendiente si no tiene resultado
 * o si el que tiene admite reintento (`EXTERNAL_ERROR`, `NEEDS_USER_ACTION`,
 * `PARTIAL`).
 *
 * `MISSING_INPUTS` y `ADAPTER_BROKEN` **no** se reintentan solos, y es
 * deliberado: al primero le falta un dato clínico y al segundo una reparación
 * del conector. Repetirlos daría exactamente el mismo fallo y haría creer que se
 * está intentando algo.
 */
export function tareasPendientes(
  caso: Caso,
  opciones?: {
    readonly calculadoras?: readonly Calculadora[]
    readonly ojos?: readonly Lateralidad[]
    readonly aparatos?: readonly string[]
  },
): readonly TareaCalculo[] {
  return planificarCaso(caso, opciones).filter((t) => {
    const r = resultadoDe(caso, t.calculadora, t.ojo, t.aparato)
    return r === undefined || sePuedeReintentar(r.estado)
  })
}

export interface OpcionesCaso {
  readonly caso: Caso
  /**
   * Las casillas exactas a ejecutar. Si no se pasan, se planifican con
   * `calculadoras` × ojos del caso.
   *
   * Pasarlas es lo que permite reintentar UNA casilla —«EVO, ojo izquierdo»—
   * sin volver a tocar las demás.
   */
  readonly tareas?: readonly TareaCalculo[]
  readonly calculadoras?: readonly Calculadora[]
  readonly ojos?: readonly Lateralidad[]
  readonly navegador: Browser
  /**
   * Contexto reutilizable. Si se pasa, las sesiones y las cookies se conservan
   * entre ejecuciones y el usuario no repite pasos.
   */
  readonly contexto?: BrowserContext
  readonly progreso: (evento: EventoProgreso) => void
  /**
   * Cada resultado, en cuanto está. Permite ir pintando la pantalla.
   *
   * Lleva también la `tarea` de la que salió: un `ResultadoCalculadora` no
   * sabe de qué aparato son sus datos (D47) — esa información solo existe en
   * la tarea que lo pidió, así que quien guarda el resultado la necesita para
   * guardarlo bajo la clave correcta.
   */
  readonly alTerminarUna: (resultado: ResultadoCalculadora, tarea: TareaCalculo) => void
  readonly ahora: () => string
  readonly guardarDiagnostico: (d: DatosDiagnostico) => Promise<string>
  readonly guardarCaptura: (d: DatosCaptura) => Promise<string>
  readonly cancelado: () => boolean
  /**
   * Los adaptadores a usar. Se puede sustituir para probar el aislamiento de
   * fallos sin abrir tres webs reales, que es lo que hacen los tests.
   */
  readonly adaptadores?: Readonly<Record<Calculadora, AdaptadorCalculadora>>
}

/**
 * Ejecuta un caso entero: todas las calculadoras, para todos sus ojos.
 *
 * Devuelve SIEMPRE un resultado por cada casilla pedida, incluso si falló.
 * Nunca lanza: un fallo es un dato, no una excepción que corta el proceso.
 *
 * **Un contexto de navegador para toda la tanda.** Las sesiones y las cookies se
 * conservan entre casillas, que es lo que hace que las condiciones de Kane se
 * acepten una vez y valgan para los dos ojos. Cada casilla abre y cierra su
 * propia PÁGINA —eso lo hace cada adaptador—, así que no queda estado del ojo
 * anterior en el formulario.
 */
export async function ejecutarCaso(
  opciones: OpcionesCaso,
): Promise<readonly ResultadoCalculadora[]> {
  const adaptadores = opciones.adaptadores ?? crearAdaptadores()
  const tareas =
    opciones.tareas ??
    planificarCaso(opciones.caso, {
      ...(opciones.calculadoras !== undefined ? { calculadoras: opciones.calculadoras } : {}),
      ...(opciones.ojos !== undefined ? { ojos: opciones.ojos } : {}),
    })

  const resultados: ResultadoCalculadora[] = []

  const contexto =
    opciones.contexto ??
    (await opciones.navegador.newContext({ viewport: { width: 1500, height: 1050 } }))
  const contextoPropio = opciones.contexto === undefined

  try {
    for (const tarea of tareas) {
      if (opciones.cancelado()) break

      const adaptador = adaptadores[tarea.calculadora]
      const resultado = await ejecutarUnaCalculadoraParaUnOjo(adaptador, contexto, {
        caso: opciones.caso,
        ojo: tarea.ojo,
        aparato: tarea.aparato,
        // El adaptador no sabe de qué ojo habla el aviso que emite, así que se
        // le añade aquí. Sin esto, la pantalla enseñaría «Calculando en EVO…»
        // dos veces seguidas sin decir de cuál de los dos ojos.
        progreso: (e) => opciones.progreso({ ...e, ojo: tarea.ojo }),
        ahora: opciones.ahora,
        guardarDiagnostico: opciones.guardarDiagnostico,
        guardarCaptura: opciones.guardarCaptura,
        cancelado: opciones.cancelado,
      })

      resultados.push(resultado)
      opciones.alTerminarUna(resultado, tarea)
    }
  } finally {
    if (contextoPropio) await contexto.close().catch(() => undefined)
  }

  return resultados
}

/** Lo que necesita la primitiva para ejecutar una casilla. */
export interface OpcionesUnaCasilla {
  readonly caso: Caso
  readonly ojo: Lateralidad
  /** De qué biómetro coger los datos (D47). Sin especificar, `APARATO_PRINCIPAL`. */
  readonly aparato?: string
  readonly progreso: (evento: EventoProgreso) => void
  readonly ahora: () => string
  readonly guardarDiagnostico: (d: DatosDiagnostico) => Promise<string>
  readonly guardarCaptura: (d: DatosCaptura) => Promise<string>
  readonly cancelado: () => boolean
}

/**
 * Una calculadora, un ojo, con todas sus formas de fallar contenidas.
 *
 * Es **la primitiva** del sistema: no sabe que existe otro ojo ni otras
 * calculadoras. Cualquier excepción que se escape de un adaptador se convierte
 * aquí en un resultado con estado, y esa es la red que garantiza el aislamiento.
 *
 * Los cuatro estados de salida no se mezclan nunca, porque significan cosas muy
 * distintas para quien lee la pantalla:
 *
 *  - `MISSING_INPUTS` — falta un dato clínico. Lo arregla el usuario escribiendo.
 *  - `NEEDS_USER_ACTION` — hay que aceptar algo o resolver una comprobación.
 *  - `ADAPTER_BROKEN` — la web ya no coincide con el conector. Lo arregla quien
 *    mantiene el programa; el usuario no puede hacer nada.
 *  - `EXTERNAL_ERROR` — la web falló o no respondió. Reintentar tiene sentido.
 *
 * Presentar un selector roto como si faltara un dato clínico mandaría al usuario
 * a buscar en su informe un número que ya tiene.
 */
export async function ejecutarUnaCalculadoraParaUnOjo(
  adaptador: AdaptadorCalculadora,
  contexto: BrowserContext,
  opciones: OpcionesUnaCasilla,
): Promise<ResultadoCalculadora> {
  const { caso, ojo, ahora } = opciones
  const aparato = opciones.aparato ?? APARATO_PRINCIPAL

  // 1 — El dominio decide si esto puede salir. El adaptador no puede saltárselo.
  const preparacion = prepararEntradas(caso, adaptador.calculadora, ojo, aparato)
  if (!preparacion.ok) {
    const motivo = explicarBloqueo(preparacion) ?? 'Faltan datos.'
    return {
      ...resultadoVacio(adaptador.calculadora, ojo, 'MISSING_INPUTS', ahora(), motivo),
      faltan:
        preparacion.ok === false && preparacion.motivo === 'FALTAN_DATOS'
          ? preparacion.detalle.faltan
          : undefined,
    }
  }

  // 2 — Comprobaciones propias de esa web.
  const problemas = adaptador.validarEntradas(preparacion.entradas)
  if (problemas.length > 0) {
    return resultadoVacio(
      adaptador.calculadora,
      ojo,
      'MISSING_INPUTS',
      ahora(),
      `${fichaDe(adaptador.calculadora).nombre}: ${problemas.join(' ')}`,
    )
  }

  // 3 — A ejecutar. Todo lo que salga mal se queda dentro de este try.
  try {
    const resultado = await adaptador.ejecutar({
      contexto,
      entradas: preparacion.entradas,
      progreso: opciones.progreso,
      ahora,
      guardarDiagnostico: opciones.guardarDiagnostico,
      guardarCaptura: opciones.guardarCaptura,
      cancelado: opciones.cancelado,
    })

    // Última guarda, y no es paranoia: un resultado con el ojo cambiado sería
    // clínicamente peligroso y **parecería perfectamente válido**. Un adaptador
    // con un fallo aquí no puede contaminar el caso.
    if (resultado.ojo !== ojo) {
      return resultadoVacio(
        adaptador.calculadora,
        ojo,
        'ADAPTER_BROKEN',
        ahora(),
        `${adaptador.nombre} ha devuelto un resultado del ${resultado.ojo} cuando se le pidió el ${ojo}. No se usa: un resultado con el ojo cambiado parecería correcto.`,
      )
    }
    return resultado
  } catch (error) {
    // Un adaptador no debería llegar aquí —los suyos los captura él— pero si
    // llega, no se lleva por delante a las demás.
    const diagnosticoId = await opciones
      .guardarDiagnostico({
        calculadora: adaptador.calculadora,
        fase: 'CALCULANDO',
        url: adaptador.url,
        errorTecnico: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
      .catch(() => undefined)

    return {
      ...resultadoVacio(
        adaptador.calculadora,
        ojo,
        'EXTERNAL_ERROR',
        ahora(),
        `${adaptador.nombre} ha fallado de forma inesperada. Los demás resultados se conservan y puedes reintentar solo este.`,
      ),
      diagnosticoId,
    }
  }
}

/**
 * ¿Hace falta abrir el navegador con ventana para esta tanda?
 *
 * Basta con que una de las calculadoras lo necesite. Barrett lo necesita
 * siempre; Kane, porque puede pedirle algo al usuario.
 */
export function necesitaVentana(calculadoras: readonly Calculadora[]): boolean {
  const adaptadores = crearAdaptadores()
  return calculadoras.some((c) => adaptadores[c].requiereNavegadorVisible)
}
