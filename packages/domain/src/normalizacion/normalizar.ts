/**
 * normalizar.ts — La capa que va entre «lo que pone el informe» y «el dato canónico».
 *
 * El recorrido de un dato es este, y esta capa es el tercer paso:
 *
 *   documento → extracción literal → **normalización del aparato** → modelo
 *   canónico → revisión humana → calculadoras
 *
 * La diferencia entre el segundo paso y el tercero es la que sostiene todo lo
 * demás: **el extractor dice qué pone el informe; esta capa decide si un dato
 * canónico se puede obtener de otros datos del mismo informe.** Si la
 * derivación viviera dentro del parser, «lo que pone el papel» y «lo que hemos
 * deducido» acabarían siendo indistinguibles, y entonces no se podría auditar
 * nada.
 *
 * Tres reglas que esta capa NO se salta:
 *
 *  1. **Nunca pisa un dato leído.** Si el informe trae la ACD, se usa esa.
 *  2. **Nunca inventa.** Si falta cualquiera de los ingredientes, no hay
 *     derivación; hay un aviso que dice qué falta.
 *  3. **Nunca destruye los originales.** AQD y CCT siguen siendo medidas
 *     independientes, con su propia procedencia y su propia evidencia.
 */

import type { CampoBiometrico } from '../modelo/campos.js'
import { definicionDe, formatearConUnidad } from '../modelo/campos.js'
import type { Dispositivo } from '../modelo/documento.js'
import type { Medida, OjoBiometrico } from '../modelo/medida.js'
import { conMedida, crearMedida, obtener } from '../modelo/medida.js'
import type { Procedencia } from '../modelo/procedencia.js'
import { perfilDe } from './perfiles.js'

/**
 * Cuánto pueden diferir la ACD del informe y la suma AQD + CCT sin que sea un
 * problema, en milímetros.
 *
 * No es un número elegido a ojo. La cuenta:
 *
 *  - La ACD y la AQD vienen redondeadas a dos decimales → hasta 0.005 mm cada una.
 *  - El CCT viene redondeado al micrómetro → 0.0005 mm.
 *  - Los aparatos no siempre miden las tres cosas en el mismo barrido, y el
 *    grosor corneal se toma en el centro, que no tiene por qué coincidir al
 *    micrómetro con el eje de la medida de profundidad.
 *
 * Con eso, algo más de una centésima se explica solo por redondeo. **0.05 mm**
 * deja sitio de sobra para eso y sigue siendo mucho menor que el error que
 * queremos cazar: confundir ACD con AQD desplaza el valor medio milímetro
 * —el grosor entero de una córnea—, diez veces la tolerancia.
 */
export const TOLERANCIA_ACD_MM = 0.05

/** El grosor corneal en milímetros. Es un cambio de unidad, no un cálculo clínico. */
export function cctEnMm(cctEnMicras: number): number {
  return cctEnMicras / 1000
}

/**
 * Redondea a los decimales con los que existe ese campo.
 *
 * Hace falta por dos motivos. Uno aritmético: en coma flotante, 2.65 + 0.53 da
 * 3.1799999999999997, y guardar eso ensucia el dato y los tests sin aportar
 * nada. Y otro de producto: la ACD es un campo de dos decimales, así que una
 * ACD derivada tiene que tener la misma forma que una leída — si no, se
 * distinguirían por el número de cifras en vez de por su etiqueta de origen.
 *
 * Lo que se descarta es como mucho media milésima de milímetro, y los sumandos
 * exactos quedan guardados aparte, en sus propias medidas y en la explicación de
 * la derivación.
 */
function redondearAlCampo(campo: CampoBiometrico, valor: number): number {
  const factor = 10 ** definicionDe(campo).decimales
  return Math.round(valor * factor) / factor
}

/**
 * Lo que hace falta saber de un ojo para juzgar la coherencia de su ACD.
 *
 * Se devuelve `null` cuando no están las tres medidas: sin las tres no hay nada
 * que comparar, y eso no es un fallo.
 */
export function comparacionAcd(
  ojo: OjoBiometrico,
): { readonly acd: number; readonly suma: number; readonly diferencia: number } | null {
  const acd = obtener(ojo, 'ACD')?.valor
  const aqd = obtener(ojo, 'AQD')?.valor
  const cct = obtener(ojo, 'CCT')?.valor
  if (acd === undefined || aqd === undefined || cct === undefined) return null
  const suma = aqd + cctEnMm(cct)
  return { acd, suma, diferencia: Math.abs(acd - suma) }
}

export interface ResultadoNormalizacion {
  readonly ojo: OjoBiometrico
  /** Lo que el usuario tiene que saber, en lenguaje normal. */
  readonly avisos: readonly string[]
}

/**
 * Aplica la normalización propia del aparato a los datos de un ojo.
 *
 * Es **idempotente**: volver a llamarla sobre su propio resultado no cambia
 * nada, porque en cuanto hay una ACD —leída o derivada— la función no toca
 * nada más. Eso importa porque hay dos caminos de lectura (el local y el del
 * modelo de visión) y conviene que aplicar la capa dos veces por error sea
 * inofensivo en vez de un dato duplicado o un aviso repetido.
 */
export function normalizarOjo(
  ojo: OjoBiometrico,
  dispositivo: Dispositivo,
  cuando: string,
): ResultadoNormalizacion {
  const conAcd = derivarAcd(ojo, dispositivo, cuando)
  const conEjes = derivarEjesPerpendiculares(conAcd.ojo, cuando)
  return { ojo: conEjes.ojo, avisos: [...conAcd.avisos, ...conEjes.avisos] }
}

/**
 * Los dos meridianos de una córnea son perpendiculares: si un informe solo
 * trae el eje de uno, el del otro es ese +90° (D122, 07/10/2026, petición
 * expresa del dueño: las fotos del Pentacam traen a menudo solo el eje de
 * K1 posterior, y «siempre es así»).
 *
 * Solo se completa un eje que FALTA, y solo si el otro eje y las dos
 * potencias del par están: nunca se pisa un eje leído (un astigmatismo
 * irregular puede tener ejes no perpendiculares) y nunca se crea un
 * meridiano a medias. El dato sale marcado como derivado, con la cuenta
 * escrita, y con un aviso para comprobarlo.
 */
const PARES_DE_EJES: readonly (readonly [
  CampoBiometrico,
  CampoBiometrico,
  CampoBiometrico,
  CampoBiometrico,
])[] = [
  ['K1', 'K1_EJE', 'K2', 'K2_EJE'],
  ['TK1', 'TK1_EJE', 'TK2', 'TK2_EJE'],
  ['PK1', 'PK1_EJE', 'PK2', 'PK2_EJE'],
]

function derivarEjesPerpendiculares(ojo: OjoBiometrico, cuando: string): ResultadoNormalizacion {
  let actual = ojo
  const avisos: string[] = []
  for (const [p1, e1, p2, e2] of PARES_DE_EJES) {
    if (obtener(actual, p1) === undefined || obtener(actual, p2) === undefined) continue
    const eje1 = obtener(actual, e1)
    const eje2 = obtener(actual, e2)
    if ((eje1 === undefined) === (eje2 === undefined)) continue
    const origen = (eje1 ?? eje2)!
    const faltante = eje1 === undefined ? e1 : e2
    const valor = (Math.round(origen.valor) + 90) % 180
    const explicacion = `${origen.campo} ${formatearConUnidad(origen.campo, origen.valor)} + 90° (los dos meridianos son perpendiculares)`
    const procedencia: Procedencia = {
      metodo: 'DERIVADO',
      documentoId: origen.procedencia.documentoId,
      dispositivoId: origen.procedencia.dispositivoId,
      registradoEn: cuando,
      derivacion: { deCampos: [origen.campo], explicacion },
    }
    actual = conMedida(actual, crearMedida(faltante, ojo.lateralidad, valor, procedencia))
    avisos.push(
      `El informe no trae ${definicionDe(faltante).etiqueta.toLowerCase()}, así que se ha puesto ${formatearConUnidad(faltante, valor)} (${explicacion}). Sale marcado como «derivado del informe»; compruébalo antes de confirmar.`,
    )
  }
  return { ojo: actual, avisos }
}

/**
 * Obtiene la ACD a partir de AQD + CCT cuando el aparato lo permite, o cuando
 * el propio informe trae un campo llamado AQD aunque no se haya podido
 * confirmar qué aparato es.
 *
 * Los seis casos, y qué hace cada uno:
 *
 *  1. **Hay ACD en el informe** → se usa esa y no se toca nada. Aunque también
 *     estén AQD y CCT: los tres datos se conservan y de comprobar que cuadran
 *     se encarga la validación, que es donde vive todo lo que mira si un dato es
 *     creíble. Aquí no se elige entre dos valores.
 *  2. **No hay ACD, hay AQD y CCT, y el aparato lo permite** → se deriva, y
 *     queda marcada como derivada con la cuenta escrita al lado.
 *  2b. **No hay ACD, hay AQD y CCT, y el aparato NO se ha reconocido**
 *     (DESCONOCIDO, D116, 06/10/2026) → se deriva igual, pero avisando de
 *     que el aparato no está confirmado. Un campo llamado literalmente «AQD»
 *     —distinto de la ACD— es, por sí solo, la prueba: ningún otro aparato
 *     de los que lee este programa publica ese dato con ese nombre, así que
 *     si aparece, el informe sigue la misma convención que el ANTERION —se
 *     reconozca o no su maqueta—. Caso real que motivó esto: `CV-2026-0299`,
 *     una foto de WhatsApp recortada sin logotipo visible — el lector de
 *     visión leyó bien el AQD y el CCT de los dos ojos, pero al no poder
 *     confirmar el aparato por su maqueta, antes esto se quedaba sin
 *     calcular: un ojo exigió escribir la ACD a mano y el otro se quedó sin
 *     ningún valor.
 *  3. **No hay ACD, hay AQD, falta el CCT** → no se deriva. Se dice qué falta.
 *  4. **No hay ACD, el aparato SÍ se ha reconocido, y no lo permite**
 *     (IOLMaster, Pentacam) → no se deriva. Se dice por qué, para que quien
 *     lo lea sepa que no es un fallo del programa. A diferencia del caso 2b,
 *     aquí el aparato SÍ se conoce y se sabe que su AQD —si la tuviera— no
 *     seguiría esta misma relación: la duda no es «qué aparato es», es «este
 *     aparato concreto no funciona así».
 *  5. **No hay ni AQD** → no hay nada que decir aquí; que falte la ACD ya lo
 *     enseña la pantalla de revisión.
 */
function derivarAcd(
  ojo: OjoBiometrico,
  dispositivo: Dispositivo,
  cuando: string,
): ResultadoNormalizacion {
  const acd = obtener(ojo, 'ACD')
  const aqd = obtener(ojo, 'AQD')
  const cct = obtener(ojo, 'CCT')

  // Caso 1 y caso 5.
  if (acd !== undefined) return { ojo, avisos: [] }
  if (aqd === undefined) return { ojo, avisos: [] }

  const perfil = perfilDe(dispositivo)
  // Caso 2b: el aparato no se ha confirmado, pero el propio campo AQD —que
  // ningún otro aparato conocido publica con ese nombre— ya es la evidencia.
  const aparatoNoConfirmado = dispositivo === 'DESCONOCIDO'
  const puedeDerivar = perfil.acdDesdeAqdMasCct || aparatoNoConfirmado

  // Caso 4. Se comprueba ANTES que el CCT: si el aparato no admite la
  // derivación, que falte o no el grosor corneal es irrelevante, y decir «te
  // falta el CCT» mandaría a buscar un dato que no iba a servir de nada.
  if (!puedeDerivar) {
    return {
      ojo,
      avisos: [
        `Este informe trae AQD (${formatearConUnidad('AQD', aqd.valor)}) pero no ACD, y las tres calculadoras necesitan la ACD. ` +
          `No se ha calculado: ${perfil.razonAcd} Compruébalo en el informe y escribe la ACD a mano.`,
      ],
    }
  }

  // Caso 3.
  if (cct === undefined) {
    return {
      ojo,
      avisos: [
        `Este informe trae AQD (${formatearConUnidad('AQD', aqd.valor)}) pero no ACD ni grosor corneal (CCT). ` +
          'En este aparato la ACD es la AQD más el grosor de la córnea, pero sin el grosor no se puede calcular. Escribe la ACD a mano.',
      ],
    }
  }

  // Caso 2 y 2b. La única rama que crea un dato.
  const exacta = aqd.valor + cctEnMm(cct.valor)
  const valor = redondearAlCampo('ACD', exacta)

  // La explicación nombra los dos campos y lleva el CCT en las dos unidades: en
  // µm, que es como lo imprime el informe, y en mm, que es como entra en la
  // suma. Sin los nombres, «2.65 mm + 530 µm» no se puede contrastar con nada; y
  // el paso de µm a mm es justamente donde se escondería un error de mil.
  const explicacion =
    `AQD ${formatearConUnidad('AQD', aqd.valor)} + CCT ${formatearConUnidad('CCT', cct.valor)} ` +
    `(${cctEnMm(cct.valor).toFixed(3)} mm)`

  const procedencia: Procedencia = {
    metodo: 'DERIVADO',
    // Se hereda de dónde salieron los sumandos, para que el dato derivado se
    // pueda rastrear hasta el mismo documento y el mismo aparato.
    documentoId: aqd.procedencia.documentoId,
    dispositivoId: aqd.procedencia.dispositivoId,
    registradoEn: cuando,
    derivacion: { deCampos: ['AQD', 'CCT'], explicacion },
    // Sin `confianza` y sin `evidencia`, a propósito. Una cuenta no tiene
    // fiabilidad de lectura, y su evidencia no es una línea del documento: son
    // las evidencias de los dos sumandos, que siguen guardadas en sus medidas.
  }

  const derivada: Medida = crearMedida('ACD', ojo.lateralidad, valor, procedencia)

  // D116: en el caso 2b, el aviso deja claro que el aparato no está
  // confirmado, para que se compruebe con más cuidado de lo normal — no es
  // la misma certeza que un ANTERION reconocido por su maqueta.
  const notaAparato = aparatoNoConfirmado
    ? ' No se ha podido confirmar qué aparato es, pero el propio informe trae un dato llamado «AQD», distinto de la ACD, que solo usan aparatos como el ANTERION — compruébala con más cuidado de lo normal.'
    : ''

  return {
    ojo: conMedida(ojo, derivada),
    avisos: [
      `Este informe no trae la ACD, así que se ha calculado sumando ${explicacion} = ${formatearConUnidad(
        'ACD',
        valor,
      )}.${notaAparato} Sale marcada como «derivada del informe»; compruébala antes de confirmar.`,
    ],
  }
}
