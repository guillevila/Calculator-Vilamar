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
  return derivarAcd(ojo, dispositivo, cuando)
}

/**
 * Obtiene la ACD a partir de AQD + CCT cuando el aparato lo permite.
 *
 * Los cinco casos, y qué hace cada uno:
 *
 *  1. **Hay ACD en el informe** → se usa esa y no se toca nada. Aunque también
 *     estén AQD y CCT: los tres datos se conservan y de comprobar que cuadran
 *     se encarga la validación, que es donde vive todo lo que mira si un dato es
 *     creíble. Aquí no se elige entre dos valores.
 *  2. **No hay ACD, hay AQD y CCT, y el aparato lo permite** → se deriva, y
 *     queda marcada como derivada con la cuenta escrita al lado.
 *  3. **No hay ACD, hay AQD, falta el CCT** → no se deriva. Se dice qué falta.
 *  4. **No hay ACD y el aparato no lo permite** → no se deriva. Se dice por qué,
 *     para que quien lo lea sepa que no es un fallo del programa.
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

  // Caso 4. Se comprueba ANTES que el CCT: si el aparato no admite la
  // derivación, que falte o no el grosor corneal es irrelevante, y decir «te
  // falta el CCT» mandaría a buscar un dato que no iba a servir de nada.
  if (!perfil.acdDesdeAqdMasCct) {
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

  // Caso 2. La única rama que crea un dato.
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

  return {
    ojo: conMedida(ojo, derivada),
    avisos: [
      `Este informe no trae la ACD, así que se ha calculado sumando ${explicacion} = ${formatearConUnidad(
        'ACD',
        valor,
      )}. Sale marcada como «derivada del informe»; compruébala antes de confirmar.`,
    ],
  }
}
