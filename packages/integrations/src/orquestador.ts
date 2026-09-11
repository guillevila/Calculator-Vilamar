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

import type {
  Calculadora,
  Caso,
  Catalogo,
  EntradasCalculadora,
  Lateralidad,
  ResultadoCalculadora,
} from '@vilamar/domain'
import {
  constanteDelCatalogoPara,
  esToricaSegunCatalogo,
  explicarBloqueo,
  fichaDe,
  modeloDelCatalogoPara,
  ojosDelCaso,
  prepararEntradas,
  resultadoDe,
  resultadoVacio,
  sePuedeReintentar,
} from '@vilamar/domain'
import type { Browser, BrowserContext } from 'playwright'

import type { AdaptadorCalculadora, DatosDiagnostico, EventoProgreso } from './contrato.js'
import { AdaptadorBarrettToric } from './adapters/barrett.js'
import { AdaptadorBarrettTrueKToric } from './adapters/barrett-true-k-toric.js'
import { AdaptadorEvoToric } from './adapters/evo.js'
import { AdaptadorKane } from './adapters/kane.js'

/**
 * Orden de ejecución POR DEFECTO — las tres calculadoras habituales.
 *
 * EVO no pide nada a nadie. Barrett puede pedir una comprobación. Kane pide
 * aceptar sus condiciones. De menos a más intervención, para que el usuario ya
 * tenga resultados en pantalla cuando le toque hacer algo.
 *
 * Barrett True-K Toric NO está aquí a propósito: es para ojos con cirugía
 * refractiva previa o queratocono, que son la minoría de los casos. Se lanza
 * solo cuando el usuario la elige explícitamente (D53), nunca por defecto.
 */
export const ORDEN_POR_DEFECTO: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

/** Los ojos, siempre en el mismo orden. El derecho primero, por convenio clínico. */
export const ORDEN_OJOS: readonly Lateralidad[] = ['OD', 'OS']

export function crearAdaptadores(): Readonly<Record<Calculadora, AdaptadorCalculadora>> {
  return {
    EVO_TORIC: new AdaptadorEvoToric(),
    BARRETT_TORIC: new AdaptadorBarrettToric(),
    KANE: new AdaptadorKane(),
    BARRETT_TRUE_K_TORIC: new AdaptadorBarrettTrueKToric(),
  }
}

/**
 * Una casilla del cálculo: qué web y para qué ojo.
 *
 * Es la unidad de todo lo que hace este fichero — planificar, ejecutar y
 * reintentar—, y es la misma clave con la que el caso guarda los resultados
 * (`${calculadora}:${ojo}`). Que sea la misma no es casualidad: es lo que impide
 * que un resultado acabe en la casilla de otro.
 */
export interface TareaCalculo {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
}

/**
 * Qué hay que ejecutar para este caso.
 *
 * Calculadora a calculadora y, dentro de cada una, los ojos que el caso tiene.
 * Un caso de un solo ojo produce la mitad de tareas; no se inventa el que falta.
 */
export function planificarCaso(
  caso: Caso,
  opciones?: {
    readonly calculadoras?: readonly Calculadora[]
    readonly ojos?: readonly Lateralidad[]
  },
): readonly TareaCalculo[] {
  const calculadoras = opciones?.calculadoras ?? ORDEN_POR_DEFECTO
  const disponibles = ojosDelCaso(caso)
  const ojos = (opciones?.ojos ?? ORDEN_OJOS).filter((o) => disponibles.includes(o))

  return calculadoras.flatMap((calculadora) => ojos.map((ojo) => ({ calculadora, ojo })))
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
  },
): readonly TareaCalculo[] {
  return planificarCaso(caso, opciones).filter((t) => {
    const r = resultadoDe(caso, t.calculadora, t.ojo)
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
  /** El catálogo de lentes propio. Ver `OpcionesUnaCasilla.catalogo`. */
  readonly catalogo?: Catalogo
  readonly navegador: Browser
  /**
   * Contexto reutilizable. Si se pasa, las sesiones y las cookies se conservan
   * entre ejecuciones y el usuario no repite pasos.
   */
  readonly contexto?: BrowserContext
  readonly progreso: (evento: EventoProgreso) => void
  /** Cada resultado, en cuanto está. Permite ir pintando la pantalla. */
  readonly alTerminarUna: (resultado: ResultadoCalculadora) => void
  readonly ahora: () => string
  readonly guardarDiagnostico: (d: DatosDiagnostico) => Promise<string>
  /** Ver `ContextoEjecucion.guardarCaptura`. */
  readonly guardarCaptura: (
    calculadora: Calculadora,
    ojo: Lateralidad,
    datos: Uint8Array,
  ) => Promise<string>
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
        // El adaptador no sabe de qué ojo habla el aviso que emite, así que se
        // le añade aquí. Sin esto, la pantalla enseñaría «Calculando en EVO…»
        // dos veces seguidas sin decir de cuál de los dos ojos.
        progreso: (e) => opciones.progreso({ ...e, ojo: tarea.ojo }),
        ahora: opciones.ahora,
        guardarDiagnostico: opciones.guardarDiagnostico,
        guardarCaptura: opciones.guardarCaptura,
        cancelado: opciones.cancelado,
        catalogo: opciones.catalogo,
      })

      resultados.push(resultado)
      opciones.alTerminarUna(resultado)
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
  readonly progreso: (evento: EventoProgreso) => void
  readonly ahora: () => string
  readonly guardarDiagnostico: (d: DatosDiagnostico) => Promise<string>
  /** Ver `ContextoEjecucion.guardarCaptura`. */
  readonly guardarCaptura: (
    calculadora: Calculadora,
    ojo: Lateralidad,
    datos: Uint8Array,
  ) => Promise<string>
  readonly cancelado: () => boolean
  /**
   * El catálogo de lentes propio, para que Barrett y Kane usen cada uno su
   * propia constante para la lente elegida. Opcional porque el cálculo tiene
   * que poder seguir funcionando sin catálogo, exactamente como antes.
   */
  readonly catalogo?: Catalogo
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

/**
 * Ajusta las entradas con lo que sepa el catálogo de la lente elegida, para
 * ESTA calculadora en concreto: su constante A, si la trae; el nombre EXACTO
 * que hay que buscar en el desplegable de esa web, si es distinto del nombre
 * bonito del catálogo (ver `NombresEnWeb`); y si es tórica, que Kane necesita
 * saber ANTES de buscar el modelo (ver kane.ts). Sin catálogo, o sin la lente
 * en él, devuelve `entradas` tal cual.
 */
function conDatosDelCatalogo(
  entradas: EntradasCalculadora,
  caso: Caso,
  calculadora: Calculadora,
  catalogo: Catalogo | undefined,
): EntradasCalculadora {
  const modelo = caso.lente?.modelo
  if (!catalogo || !modelo) return entradas
  const eleccion = { fabricante: caso.lente?.fabricante, modelo }
  const constante = constanteDelCatalogoPara(catalogo, eleccion, calculadora)
  const nombreEnWeb = modeloDelCatalogoPara(catalogo, eleccion, calculadora)
  const torica = esToricaSegunCatalogo(catalogo, eleccion)

  return {
    ...entradas,
    ...(nombreEnWeb !== undefined ? { modeloLente: nombreEnWeb } : {}),
    ...(torica !== undefined ? { lenteTorica: torica } : {}),
    ...(constante !== undefined
      ? { valores: { ...entradas.valores, CONSTANTE_A: constante } }
      : {}),
  }
}

export async function ejecutarUnaCalculadoraParaUnOjo(
  adaptador: AdaptadorCalculadora,
  contexto: BrowserContext,
  opciones: OpcionesUnaCasilla,
): Promise<ResultadoCalculadora> {
  const { caso, ojo, ahora } = opciones

  // 1 — El dominio decide si esto puede salir. El adaptador no puede saltárselo.
  const preparacion = prepararEntradas(caso, adaptador.calculadora, ojo, opciones.catalogo)
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

  // 1b — Si la lente elegida está en el catálogo propio: su constante A para
  // ESTA calculadora (si la trae) y el nombre EXACTO que hay que buscar en su
  // desplegable (si es distinto del nombre bonito del catálogo — casi
  // siempre lo es: Kane dice «B+L LuxLife», no «Lux Life»).
  //
  // La constante es un FALLBACK para EVO y Kane: si reconocen el modelo en su
  // propia web, rellenan la suya y no se pisa (ver evo.ts y kane.ts). El
  // nombre, en cambio, hace falta siempre que quiera intentarse el
  // reconocimiento — sin el nombre correcto no hay nada que reconocer.
  const entradas = conDatosDelCatalogo(
    preparacion.entradas,
    caso,
    adaptador.calculadora,
    opciones.catalogo,
  )

  // 2 — Comprobaciones propias de esa web.
  const problemas = adaptador.validarEntradas(entradas)
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
      entradas,
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
