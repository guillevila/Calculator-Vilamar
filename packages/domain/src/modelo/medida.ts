/**
 * medida.ts — Un dato biométrico y el ojo al que pertenece.
 *
 * Aquí está la decisión más importante del modelo, y conviene entenderla antes
 * de tocar nada:
 *
 *   **Un dato que falta no se representa con un número. Se representa con su
 *   ausencia.**
 *
 * `Medida.valor` es un `number` a secas: no admite `null`, ni `0` como
 * comodín, ni `-1`, ni `NaN`. Un dato que no se ha encontrado simplemente NO
 * ESTÁ en el mapa de medidas del ojo. Eso hace que la regla «lo que falta no
 * es cero» no dependa de que alguien se acuerde de comprobarla: es imposible
 * escribir el caso contrario.
 */

import type { CampoBiometrico, Unidad } from './campos.js'
import { definicionDe, formatearConUnidad } from './campos.js'
import type { Lateralidad } from './lateralidad.js'
import type { Procedencia } from './procedencia.js'
import { esDerivado, esManual, esMedido, procedenciaManual } from './procedencia.js'

/**
 * Lo que decía el informe antes de que una persona lo cambiara.
 *
 * Existe porque corregir un dato **no puede borrar lo que ponía**. Si el informe
 * decía 24.07 y el cirujano escribe 24.08, las dos cosas importan: el 24.08 es
 * lo que se va a usar, y el 24.07 es lo que había impreso. Sin guardarlo, el
 * informe final diría «escrito a mano» sin poder explicar frente a qué, y nadie
 * podría auditar si la corrección fue un arreglo o un desliz.
 *
 * Se guarda el valor y su procedencia —que a su vez lleva la evidencia, o sea la
 * línea literal del documento—, no la `Medida` entera: así no hay estructuras
 * anidándose sin fin.
 */
export interface ValorOriginal {
  readonly valor: number
  readonly procedencia: Procedencia
}

export interface Medida {
  readonly campo: CampoBiometrico
  readonly ojo: Lateralidad
  /**
   * El valor. Siempre un número real y finito.
   *
   * Si no se conoce el dato, no se construye la medida. No hay ningún valor
   * de este campo que signifique «no lo sé».
   */
  readonly valor: number
  readonly unidad: Unidad
  readonly procedencia: Procedencia
  /**
   * Qué decía el informe antes de que alguien lo corrigiera, si lo decía.
   *
   * Presente **solo** cuando había un valor leído y una persona lo cambió. Es lo
   * que distingue un dato CORREGIDO de uno simplemente APORTADO: los dos tienen
   * procedencia manual, pero solo el corregido pisó algo que ya estaba.
   */
  readonly original?: ValorOriginal
  /**
   * Si una persona ha mirado este dato y ha dicho que está bien.
   *
   * Ningún dato sin confirmar sale hacia una calculadora externa. Es una
   * invariante del producto, no una preferencia de la pantalla.
   *
   * **Es información distinta de la procedencia**, y se mantienen separadas a
   * propósito: de dónde salió un número y si alguien lo ha revisado son dos
   * preguntas que se responden por separado y se enseñan por separado.
   */
  readonly confirmadoPorUsuario: boolean
}

/**
 * Las medidas de un ojo.
 *
 * Un campo que no aparece como clave es un campo NO ENCONTRADO. No hay otra
 * forma de decirlo, y por eso no hay forma de confundirlo con un cero.
 */
export type MapaMedidas = Partial<Readonly<Record<CampoBiometrico, Medida>>>

export interface OjoBiometrico {
  readonly lateralidad: Lateralidad
  readonly medidas: MapaMedidas
}

export function ojoVacio(lateralidad: Lateralidad): OjoBiometrico {
  return { lateralidad, medidas: {} }
}

export function crearMedida(
  campo: CampoBiometrico,
  ojo: Lateralidad,
  valor: number,
  procedencia: Procedencia,
  confirmadoPorUsuario = false,
): Medida {
  if (!Number.isFinite(valor)) {
    throw new Error(
      `Se ha intentado crear la medida ${campo} (${ojo}) con un valor que no es un número: ${String(valor)}. ` +
        'Un dato desconocido se representa no creando la medida, nunca con un número inventado.',
    )
  }
  return {
    campo,
    ojo,
    valor,
    unidad: definicionDe(campo).unidad,
    procedencia,
    confirmadoPorUsuario,
  }
}

/**
 * Escribe a mano el valor de un campo, conservando lo que hubiera antes.
 *
 * Es la única forma correcta de que una persona cambie un dato, y sustituye a
 * construir una `Medida` nueva de cero: eso último **destruía la evidencia**. Si
 * el informe decía 24.07 y alguien escribe 24.08, con la versión antigua el
 * 24.07 desaparecía y el informe final no podía explicar frente a qué se había
 * corregido.
 *
 * Dos detalles que importan:
 *
 *  - **Si ya estaba corregido, el original NO se pisa.** Corregir 24.07 → 24.08
 *    → 24.09 conserva el 24.07, que es lo que ponía el papel. Guardar el 24.08
 *    convertiría el rastro en un teléfono escacharrado.
 *  - **Un valor escrito a mano donde no había nada no genera original.** No hay
 *    nada que conservar, y fabricar uno haría parecer que se corrigió algo.
 *
 * Queda confirmado: lo ha escrito una persona mirando, así que no necesita que
 * otra persona lo revise.
 */
export function corregirMedida(
  ojo: OjoBiometrico,
  campo: CampoBiometrico,
  valor: number,
  cuando: string,
): OjoBiometrico {
  const anterior = obtener(ojo, campo)
  const nueva = crearMedida(campo, ojo.lateralidad, valor, procedenciaManual(cuando), true)

  // Solo se conserva un original si lo que había NO era ya una corrección: el
  // original de una corrección es siempre lo que decía el documento.
  const original: ValorOriginal | undefined =
    anterior === undefined
      ? undefined
      : (anterior.original ?? { valor: anterior.valor, procedencia: anterior.procedencia })

  return conMedida(ojo, original ? { ...nueva, original } : nueva)
}

/** ¿Está el dato? `false` significa que no consta. */
export function tiene(ojo: OjoBiometrico, campo: CampoBiometrico): boolean {
  return ojo.medidas[campo] !== undefined
}

export function obtener(ojo: OjoBiometrico, campo: CampoBiometrico): Medida | undefined {
  return ojo.medidas[campo]
}

/**
 * El valor numérico, o `undefined` si no está.
 *
 * Devuelve `undefined` y no `0` a propósito. Quien llame a esto tiene que
 * decidir explícitamente qué hacer cuando el dato no está.
 */
export function valorDe(ojo: OjoBiometrico, campo: CampoBiometrico): number | undefined {
  return ojo.medidas[campo]?.valor
}

/**
 * Coloca una medida en el ojo.
 *
 * Comprueba que la medida sea de ESE ojo. Mezclar OD y OS es el error que más
 * caro sale en este dominio, y no puede depender de que quien llame se acuerde.
 */
export function conMedida(ojo: OjoBiometrico, medida: Medida): OjoBiometrico {
  if (medida.ojo !== ojo.lateralidad) {
    throw new Error(
      `Se ha intentado guardar una medida de ${medida.ojo} en el ojo ${ojo.lateralidad} ` +
        `(campo ${medida.campo}). Los datos de los dos ojos no se mezclan nunca.`,
    )
  }
  return { ...ojo, medidas: { ...ojo.medidas, [medida.campo]: medida } }
}

/**
 * Quita un dato del ojo. Es la forma correcta de decir «esto no lo sabemos»:
 * se borra, no se pone a cero.
 */
export function sinMedida(ojo: OjoBiometrico, campo: CampoBiometrico): OjoBiometrico {
  if (!tiene(ojo, campo)) return ojo
  const medidas: Record<string, Medida> = { ...(ojo.medidas as Record<string, Medida>) }
  delete medidas[campo]
  return { ...ojo, medidas: medidas as MapaMedidas }
}

/** Marca un dato como revisado por una persona. */
export function confirmarMedida(ojo: OjoBiometrico, campo: CampoBiometrico): OjoBiometrico {
  const m = obtener(ojo, campo)
  if (!m) return ojo
  return conMedida(ojo, { ...m, confirmadoPorUsuario: true })
}

export function confirmarTodas(ojo: OjoBiometrico): OjoBiometrico {
  let resultado = ojo
  for (const campo of camposPresentes(ojo)) resultado = confirmarMedida(resultado, campo)
  return resultado
}

export function camposPresentes(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return Object.keys(ojo.medidas) as CampoBiometrico[]
}

export function camposSinConfirmar(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => !ojo.medidas[c]?.confirmadoPorUsuario)
}

export function todasConfirmadas(ojo: OjoBiometrico): boolean {
  return camposSinConfirmar(ojo).length === 0
}

/** Los campos que puso una persona a mano. */
export function camposManuales(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esManual(m.procedencia)
  })
}

/** Los campos que salieron de un documento. */
export function camposExtraidos(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esMedido(m.procedencia)
  })
}

/** Los campos que se calcularon a partir de otros. */
export function camposDerivados(ojo: OjoBiometrico): readonly CampoBiometrico[] {
  return camposPresentes(ojo).filter((c) => {
    const m = ojo.medidas[c]
    return m !== undefined && esDerivado(m.procedencia)
  })
}

/**
 * Marca de hueco para textos internos: registros, avisos, mensajes de error.
 *
 * ⚠️ **NO se enseña al usuario.** En pantalla y en el informe, un hueco se dice
 * con el vocabulario de origen —«No consta en el informe» o «Pendiente de
 * aportar», según quién se espere que aporte el campo—. Ver `textoDeOrigen`.
 *
 * El motivo es de producto: mientras los dos casos decían «NO ENCONTRADO», un
 * campo que el informe sencillamente no trae parecía un fallo del extractor. Y
 * un campo que decide el cirujano parecía un error de lectura en vez de una
 * tarea suya.
 *
 * Se conserva porque para un log sí vale: ahí lo que importa es que el hueco no
 * se confunda con un cero, no cómo suena.
 */
export const TEXTO_AUSENTE = 'NO ENCONTRADO'

/**
 * Cómo se enseña el VALOR de una medida: «41.22 D».
 *
 * Para el hueco devuelve `TEXTO_AUSENTE`, que es una marca interna. Si estás
 * pintando una pantalla o el informe, decide el texto con `textoDeOrigen` en vez
 * de usar el que sale de aquí.
 */
export function formatearMedida(ojo: OjoBiometrico, campo: CampoBiometrico): string {
  const m = obtener(ojo, campo)
  if (!m) return TEXTO_AUSENTE
  return formatearConUnidad(campo, m.valor)
}
