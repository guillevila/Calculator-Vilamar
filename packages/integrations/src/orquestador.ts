/**
 * orquestador.ts — Lanza las calculadoras y protege los resultados.
 *
 * La regla que gobierna este fichero: **una calculadora que falla no puede
 * llevarse por delante a las otras dos**. Si Kane se rompe y EVO y Barrett
 * funcionan, el usuario se queda con EVO y Barrett.
 *
 * Se ejecutan de una en una, no a la vez, por dos motivos concretos:
 *
 *  - Barrett necesita navegador con ventana y hay pasos que pide a una persona.
 *    Tres ventanas peleándose por la atención del usuario es peor experiencia
 *    que una detrás de otra.
 *  - El usuario tiene que poder VER qué está pasando, que es justo lo que se
 *    pidió del producto.
 *
 * El orden no es casual: primero las que salen solas, y las que pueden pedir
 * intervención al final. Así el usuario ya tiene resultados en pantalla cuando
 * le toca hacer algo, y si decide no hacerlo no se queda sin nada.
 */

import type {
  Calculadora,
  Caso,
  Lateralidad,
  ResultadoCalculadora,
} from '@vilamar/domain'
import { explicarBloqueo, fichaDe, prepararEntradas, resultadoVacio } from '@vilamar/domain'
import type { Browser, BrowserContext } from 'playwright'

import type { AdaptadorCalculadora, DatosDiagnostico, EventoProgreso } from './contrato.js'
import { AdaptadorBarrettToric } from './adapters/barrett.js'
import { AdaptadorEvoToric } from './adapters/evo.js'
import { AdaptadorKane } from './adapters/kane.js'

/**
 * Orden de ejecución.
 *
 * EVO no pide nada a nadie. Barrett puede pedir una comprobación. Kane pide
 * aceptar sus condiciones. De menos a más intervención.
 */
export const ORDEN_POR_DEFECTO: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

export function crearAdaptadores(): Readonly<Record<Calculadora, AdaptadorCalculadora>> {
  return {
    EVO_TORIC: new AdaptadorEvoToric(),
    BARRETT_TORIC: new AdaptadorBarrettToric(),
    KANE: new AdaptadorKane(),
  }
}

export interface OpcionesOrquestador {
  readonly caso: Caso
  readonly ojo: Lateralidad
  /** Cuáles lanzar. Por defecto, las tres. */
  readonly calculadoras?: readonly Calculadora[]
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
  readonly cancelado: () => boolean
  /**
   * Los adaptadores a usar. Se puede sustituir para probar el aislamiento de
   * fallos sin abrir tres webs reales, que es lo que hacen los tests.
   */
  readonly adaptadores?: Readonly<Record<Calculadora, AdaptadorCalculadora>>
}

/**
 * Ejecuta las calculadoras pedidas para un ojo.
 *
 * Devuelve SIEMPRE un resultado por cada calculadora pedida, incluso si falló.
 * Nunca lanza: un fallo es un dato, no una excepción que corta el proceso.
 */
export async function ejecutarCalculadoras(
  opciones: OpcionesOrquestador,
): Promise<readonly ResultadoCalculadora[]> {
  const adaptadores = opciones.adaptadores ?? crearAdaptadores()
  const lista = opciones.calculadoras ?? ORDEN_POR_DEFECTO
  const resultados: ResultadoCalculadora[] = []

  const contexto =
    opciones.contexto ?? (await opciones.navegador.newContext({ viewport: { width: 1500, height: 1050 } }))
  const contextoPropio = opciones.contexto === undefined

  try {
    for (const clave of lista) {
      if (opciones.cancelado()) break

      const adaptador = adaptadores[clave]
      const resultado = await ejecutarUna(adaptador, contexto, opciones)
      resultados.push(resultado)
      opciones.alTerminarUna(resultado)
    }
  } finally {
    if (contextoPropio) await contexto.close().catch(() => undefined)
  }

  return resultados
}

/**
 * Una sola calculadora, con todas sus formas de fallar contenidas.
 *
 * Cualquier excepción que se escape de un adaptador se convierte aquí en un
 * resultado con estado. Es la red que garantiza el aislamiento.
 */
async function ejecutarUna(
  adaptador: AdaptadorCalculadora,
  contexto: BrowserContext,
  opciones: OpcionesOrquestador,
): Promise<ResultadoCalculadora> {
  const { caso, ojo, ahora } = opciones

  // 1 — El dominio decide si esto puede salir. El adaptador no puede saltárselo.
  const preparacion = prepararEntradas(caso, adaptador.calculadora, ojo)
  if (!preparacion.ok) {
    const motivo = explicarBloqueo(preparacion) ?? 'Faltan datos.'
    return {
      ...resultadoVacio(adaptador.calculadora, ojo, 'MISSING_INPUTS', ahora(), motivo),
      faltan: preparacion.ok === false && preparacion.motivo === 'FALTAN_DATOS'
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
    return await adaptador.ejecutar({
      contexto,
      entradas: preparacion.entradas,
      progreso: opciones.progreso,
      ahora,
      guardarDiagnostico: opciones.guardarDiagnostico,
      cancelado: opciones.cancelado,
    })
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
