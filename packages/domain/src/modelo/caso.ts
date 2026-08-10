/**
 * caso.ts — Un cálculo de principio a fin.
 *
 * Un caso es todo lo que pasa desde que se sube un informe hasta que sale el
 * PDF: los documentos, lo que se leyó de ellos, lo que corrigió el cirujano, lo
 * que dijo cada calculadora y qué falló.
 *
 * El estado del caso NO es decorativo: es lo que impide que un dato sin revisar
 * llegue a una calculadora. El paso de `EN_REVISION` a `CONFIRMADO` solo puede
 * darlo una persona.
 */

import type { Calculadora, ResultadoCalculadora } from './calculadoras.js'
import type { DocumentoCargado } from './documento.js'
import type { Lateralidad } from './lateralidad.js'
import type { OjoBiometrico } from './medida.js'
import { ojoVacio, todasConfirmadas } from './medida.js'

export type EstadoCaso =
  /** Recién creado, sin nada dentro. */
  | 'BORRADOR'
  /** Hay documentos, todavía sin leer. */
  | 'DOCUMENTOS_CARGADOS'
  /** Se ha leído lo que se ha podido; falta que lo mire una persona. */
  | 'EN_REVISION'
  /** Una persona ha revisado y confirmado los datos. Solo desde aquí se calcula. */
  | 'CONFIRMADO'
  /** Se está hablando con las calculadoras. */
  | 'CALCULANDO'
  /** Ha terminado el ciclo, con éxito total o parcial. */
  | 'COMPLETADO'

export const NOMBRE_ESTADO: Readonly<Record<EstadoCaso, string>> = {
  BORRADOR: 'Nuevo cálculo',
  DOCUMENTOS_CARGADOS: 'Documentos cargados',
  EN_REVISION: 'Pendiente de revisión',
  CONFIRMADO: 'Datos confirmados',
  CALCULANDO: 'Calculando',
  COMPLETADO: 'Terminado',
}

export interface Caso {
  readonly id: string
  /**
   * Código local, corto y legible: «CV-2026-0007».
   *
   * Es un identificador de ESTE programa. No es el número de historia del
   * paciente y no debe serlo nunca: es lo único que se manda a las webs
   * externas cuando exigen un nombre.
   */
  readonly codigo: string
  readonly estado: EstadoCaso
  readonly creadoEn: string
  readonly actualizadoEn: string
  readonly documentos: readonly DocumentoCargado[]
  /** Un ojo, el otro, o los dos. Un caso puede tener solo uno. */
  readonly ojos: Readonly<Partial<Record<Lateralidad, OjoBiometrico>>>
  /** Resultados por calculadora y ojo. La clave es `${calculadora}:${ojo}`. */
  readonly resultados: Readonly<Record<string, ResultadoCalculadora>>
  /** Modelo de lente elegido para este caso. */
  readonly lente?: LenteElegida
  /** Notas del usuario. No se envían a ningún sitio. */
  readonly notas?: string
}

export interface LenteElegida {
  readonly fabricante?: string
  readonly modelo?: string
  /** Cómo se llama ese modelo en cada web, cuando difiere. */
  readonly nombreEnEvo?: string
  readonly nombreEnBarrett?: string
}

export function claveResultado(calculadora: Calculadora, ojo: Lateralidad): string {
  return `${calculadora}:${ojo}`
}

export function casoNuevo(id: string, codigo: string, cuando: string): Caso {
  return {
    id,
    codigo,
    estado: 'BORRADOR',
    creadoEn: cuando,
    actualizadoEn: cuando,
    documentos: [],
    ojos: {},
    resultados: {},
  }
}

export function ojosDelCaso(caso: Caso): readonly Lateralidad[] {
  return (['OD', 'OS'] as const).filter((l) => caso.ojos[l] !== undefined)
}

export function ojoDe(caso: Caso, lado: Lateralidad): OjoBiometrico {
  return caso.ojos[lado] ?? ojoVacio(lado)
}

export function conOjo(caso: Caso, ojo: OjoBiometrico, cuando: string): Caso {
  return {
    ...caso,
    ojos: { ...caso.ojos, [ojo.lateralidad]: ojo },
    actualizadoEn: cuando,
  }
}

export function conResultado(caso: Caso, resultado: ResultadoCalculadora, cuando: string): Caso {
  return {
    ...caso,
    resultados: {
      ...caso.resultados,
      [claveResultado(resultado.calculadora, resultado.ojo)]: resultado,
    },
    actualizadoEn: cuando,
  }
}

export function resultadoDe(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
): ResultadoCalculadora | undefined {
  return caso.resultados[claveResultado(calculadora, ojo)]
}

/**
 * ¿Se puede pasar a CONFIRMADO?
 *
 * Hace falta al menos un ojo y que TODOS los datos presentes de los ojos que se
 * van a calcular estén revisados. Un dato sin revisar no sale de aquí.
 */
export function sePuedeConfirmar(caso: Caso): boolean {
  const ojos = ojosDelCaso(caso)
  if (ojos.length === 0) return false
  return ojos.every((l) => todasConfirmadas(ojoDe(caso, l)))
}

/**
 * Confirma el caso. Es la puerta por la que pasan los datos hacia las webs, y
 * solo se abre con una acción explícita de una persona.
 */
export function confirmar(caso: Caso, cuando: string): Caso {
  if (!sePuedeConfirmar(caso)) {
    throw new Error(
      'No se puede confirmar un caso con datos sin revisar. ' +
        'Todo lo que se envía a una calculadora tiene que haberlo mirado una persona.',
    )
  }
  return { ...caso, estado: 'CONFIRMADO', actualizadoEn: cuando }
}

/**
 * ¿Ha pulsado el usuario «Confirmar» en este caso?
 *
 * Es la PRIMERA de las dos barreras que hay antes de una web externa, y solo
 * mira el estado: si hubo un acto explícito de confirmación.
 *
 * La segunda barrera —que CADA campo que se va a enviar esté revisado— vive en
 * `prepararEntradas`, y es la que importa cuando alguien añade un dato nuevo
 * después de confirmar. Se dejan separadas a propósito: si esta función
 * volviera a comprobar campo por campo, la de abajo sería inalcanzable y no se
 * podría probar que funciona.
 */
export function autorizadoACalcular(caso: Caso): boolean {
  return caso.estado === 'CONFIRMADO' || caso.estado === 'CALCULANDO' || caso.estado === 'COMPLETADO'
}
