/**
 * seleccion-lente.ts — Elegir una lente y, con ella, su constante.
 *
 * Es el único sitio del programa donde una constante de la tabla del informe se
 * convierte en la `CONSTANTE_A` del caso. Todo lo demás —la extracción, la
 * pantalla, los adaptadores— no puede hacerlo.
 *
 * Tenerlo en un solo sitio es lo que permite garantizar las cuatro reglas de
 * golpe, en vez de repetirlas en cada pantalla:
 *
 *  1. **Sin lente elegida no hay constante.** Un informe con cuatro lentes tiene
 *     cuatro constantes posibles y ninguna es la del caso.
 *  2. **Cambiar de lente cambia la constante en el mismo movimiento.** No hay
 *     ningún estado intermedio en el que sobreviva la de la lente anterior.
 *  3. **Una lente que no está en el informe no hereda nada.** Ni de la más
 *     parecida, ni de otra de la misma marca, ni del promedio.
 *  4. **Lo que ha escrito una persona no se pisa.** Se avisa y decide ella.
 */

import type { CampoBiometrico } from './campos.js'
import type { Caso, LenteElegida } from './caso.js'
import { conOjo, ojosDelCaso, ojoDe } from './caso.js'
import type { Lateralidad } from './lateralidad.js'
import type { Emparejamiento, LenteDetectada } from './lente.js'
import { describirLente, emparejarLente } from './lente.js'
import { conMedida, crearMedida, obtener, sinMedida } from './medida.js'
import type { Procedencia } from './procedencia.js'
import { esManual } from './procedencia.js'

/** La lente que quiere el usuario, tal y como la escribe o la elige. */
export interface EleccionLente {
  readonly fabricante?: string
  readonly modelo: string
  /**
   * Cómo se llama esta misma lente en el desplegable de EVO/Kane, cuando
   * difiere del nombre general (petición expresa del dueño, 27/08/2026).
   * Ver `LenteElegida` en `caso.ts`.
   */
  readonly nombreEnEvo?: string
  readonly nombreEnKane?: string
}

export interface ResultadoSeleccion {
  readonly caso: Caso
  /** Lo que hay que decirle al usuario, en lenguaje normal. */
  readonly avisos: readonly string[]
  /** Qué pasó al buscarla en el informe. La interfaz lo usa para explicarse. */
  readonly emparejamiento: Emparejamiento
}

/**
 * Elige la lente del caso y resuelve su constante A.
 *
 * Los cuatro caminos posibles:
 *
 * | Situación                                        | Qué hace con la constante              |
 * | ------------------------------------------------ | -------------------------------------- |
 * | La lente está en el informe y trae constante     | La escribe, como DEL_INFORME           |
 * | La lente está pero sin constante                 | Deja el hueco. Lo dice                 |
 * | La lente NO está en el informe                   | **Quita** la de la lente anterior      |
 * | Varias lentes del informe encajan                | No elige ninguna. Pide revisión        |
 *
 * En los tres últimos casos, si la constante que hay la escribió una persona,
 * **no se toca**: se avisa de que quizá ya no corresponde y decide ella.
 */
export function elegirLente(
  caso: Caso,
  eleccion: EleccionLente,
  cuando: string,
): ResultadoSeleccion {
  const lentes = caso.lentesDelInforme ?? []
  const emparejamiento = emparejarLente(lentes, eleccion)
  const avisos: string[] = []

  const base: LenteElegida = {
    fabricante: eleccion.fabricante === '' ? undefined : eleccion.fabricante,
    modelo: eleccion.modelo,
    ...(eleccion.nombreEnEvo ? { nombreEnEvo: eleccion.nombreEnEvo } : {}),
    ...(eleccion.nombreEnKane ? { nombreEnKane: eleccion.nombreEnKane } : {}),
  }

  if (emparejamiento.estado === 'AMBIGUA') {
    // El informe se contradice: la misma lente con dos constantes. Elegir una
    // sería inventarse cuál de las dos lecturas es la buena.
    avisos.push(
      `El informe nombra «${eleccion.modelo}» más de una vez con constantes distintas ` +
        `(${emparejamiento.candidatas.map((l) => l.constanteA?.toFixed(2) ?? 'sin constante').join(', ')}). ` +
        'No se ha cogido ninguna: mira el informe y escribe tú la que corresponda.',
    )
    return { ...quitarSiEraDeLaTabla(caso, base, cuando, avisos), avisos, emparejamiento }
  }

  if (emparejamiento.estado === 'NO_ESTA') {
    if (lentes.length > 0) {
      avisos.push(
        `«${eleccion.modelo}» no aparece en el informe, así que no se le ha puesto ninguna constante A. ` +
          'No se reutiliza la de otra lente: escríbela tú. ' +
          `El informe sí trae ${lentes.length === 1 ? 'esta' : 'estas'}: ${lentes.map(describirLente).join(' · ')}.`,
      )
    }
    return { ...quitarSiEraDeLaTabla(caso, base, cuando, avisos), avisos, emparejamiento }
  }

  const lente = emparejamiento.lente
  if (lente.constanteA === undefined) {
    avisos.push(
      `El informe nombra «${lente.modelo}» pero no da su constante A. Escríbela tú: no se deduce de las otras lentes.`,
    )
    return { ...quitarSiEraDeLaTabla(caso, base, cuando, avisos), avisos, emparejamiento }
  }

  // Hay constante en el informe para esta lente. Se escribe en los ojos del caso.
  const constante = lente.constanteA
  const conflictos: Lateralidad[] = []
  let resultado = caso

  for (const lado of ojosDelCaso(caso)) {
    const ojo = ojoDe(resultado, lado)
    const actual = obtener(ojo, 'CONSTANTE_A')

    // Lo escrito a mano no se pisa NUNCA, ni para «mejorarlo».
    if (actual !== undefined && esManual(actual.procedencia)) {
      conflictos.push(lado)
      continue
    }

    resultado = conOjo(
      resultado,
      conMedida(
        ojo,
        crearMedida('CONSTANTE_A', lado, constante, procedenciaDeLaTabla(lente, cuando)),
      ),
      cuando,
    )
  }

  if (conflictos.length > 0) {
    avisos.push(
      `La constante A que hay la escribiste tú, así que no se ha cambiado. El informe da ` +
        `${constante.toFixed(2)} para «${lente.modelo}»: si quieres esa, bórrala y vuelve a elegir la lente.`,
    )
  }

  if (ojosDelCaso(caso).length === 0) {
    avisos.push(
      `Todavía no hay datos de ningún ojo, así que la constante A de «${lente.modelo}» ` +
        `(${constante.toFixed(2)}) se aplicará cuando los haya.`,
    )
  }

  return {
    caso: {
      ...resultado,
      lente: { ...base, constanteDeLaTabla: { modelo: lente.modelo, valor: constante } },
      actualizadoEn: cuando,
    },
    avisos,
    emparejamiento,
  }
}

/**
 * Quita la constante A si —y solo si— era la de la lente anterior.
 *
 * Es la regla 2 y la 3 juntas, y la razón de que `constanteDeLaTabla` exista. Hay
 * tres orígenes posibles para la constante que hay puesta y cada uno merece un
 * trato distinto:
 *
 *  - **De la tabla de lentes de la lente que se acaba de descartar** → sobra. Si
 *    se quedara, el caso calcularía con la constante de una lente que no se va a
 *    implantar, y el número resultante sería perfectamente creíble.
 *  - **De una línea suelta del informe** («A constant: 119.1»), que no pertenece a
 *    ningún modelo concreto → se respeta. Es un dato del informe.
 *  - **Escrita por una persona** → se respeta, y se dice que quizá ya no vale.
 */
function quitarSiEraDeLaTabla(
  caso: Caso,
  lente: LenteElegida,
  cuando: string,
  avisos: string[],
): { readonly caso: Caso } {
  const anterior = caso.lente?.constanteDeLaTabla
  let resultado = caso

  if (anterior !== undefined) {
    let quitada = false
    for (const lado of ojosDelCaso(caso)) {
      const ojo = ojoDe(resultado, lado)
      const actual = obtener(ojo, 'CONSTANTE_A')
      // Solo se quita si sigue siendo exactamente la que puso la tabla. Si alguien
      // la ha cambiado por su cuenta, ya no es «la de la lente anterior».
      if (actual === undefined || esManual(actual.procedencia) || actual.valor !== anterior.valor) {
        continue
      }
      resultado = conOjo(resultado, sinMedida(ojo, 'CONSTANTE_A'), cuando)
      quitada = true
    }
    if (quitada) {
      avisos.push(
        `Se ha quitado la constante A ${anterior.valor.toFixed(2)}, que era la de «${anterior.modelo}». ` +
          'Una constante no se hereda de una lente a otra.',
      )
    }
  }

  return {
    caso: { ...resultado, lente, actualizadoEn: cuando },
  }
}

/**
 * La procedencia de una constante sacada de la tabla de lentes.
 *
 * Hereda el método de lectura de la propia lente —texto del PDF, OCR o visión—,
 * y con él su fiabilidad y su evidencia. Eso importa: si la tabla se leyó por OCR,
 * la constante también hay que comprobarla a mano, y así lo pide el resto del
 * programa sin que este fichero tenga que saber nada de ello.
 */
function procedenciaDeLaTabla(lente: LenteDetectada, cuando: string): Procedencia {
  return { ...lente.procedencia, registradoEn: cuando }
}

/**
 * Qué campos de un ojo dependen de la lente elegida.
 *
 * Se declara para que quede escrito que la selección de lente **solo** toca la
 * constante A. El factor de lente de Barrett es una decisión distinta y no se
 * deduce de aquí.
 */
export const CAMPOS_DE_LA_LENTE: readonly CampoBiometrico[] = ['CONSTANTE_A']

/**
 * Aparca una segunda lente candidata, sin tocar el cálculo — petición
 * expresa del dueño del proyecto (01/09/2026): poder comparar dos lentes
 * con la misma biometría sin escribir los datos dos veces.
 *
 * A propósito NO aplica ninguna de las cuatro reglas de `elegirLente`
 * (constante A, avisos, emparejamiento): mientras está aquí aparcada, esta
 * lente no participa en ningún cálculo, así que no hay nada suyo que
 * resolver todavía. Eso ocurre solo al activarla con `intercambiarLentes`.
 */
export function elegirLenteSecundaria(
  caso: Caso,
  eleccion: EleccionLente | undefined,
  cuando: string,
): Caso {
  if (eleccion === undefined) {
    const { lenteSecundaria: _borrada, ...resto } = caso
    return { ...resto, actualizadoEn: cuando }
  }
  const lenteSecundaria: LenteElegida = {
    fabricante: eleccion.fabricante === '' ? undefined : eleccion.fabricante,
    modelo: eleccion.modelo,
    ...(eleccion.nombreEnEvo ? { nombreEnEvo: eleccion.nombreEnEvo } : {}),
    ...(eleccion.nombreEnKane ? { nombreEnKane: eleccion.nombreEnKane } : {}),
  }
  return { ...caso, lenteSecundaria, actualizadoEn: cuando }
}

/**
 * Activa la lente aparcada: pasa a ser `lente` —con su propia constante A,
 * resuelta con las mismas cuatro reglas de `elegirLente`— y la que era
 * `lente` pasa a `lenteSecundaria`, lista para volver a intercambiarse.
 *
 * **Los resultados ya calculados se borran.** Son del cálculo anterior, con
 * la lente anterior —y con Barrett, con SU constante A—; conservarlos
 * enseñaría un informe que dice hablar de una lente pero calculó con otra.
 * Nunca se adivina cuál seguiría siendo válida: se avisa con un caso vacío
 * y se recalcula. El caso vuelve a `CONFIRMADO`: los datos de biometría
 * siguen revisados, pero hace falta un cálculo nuevo antes de tener nada
 * que enseñar.
 *
 * Sin lente aparcada no hay nada que intercambiar: se devuelve el caso tal
 * cual, sin avisos.
 */
export function intercambiarLentes(caso: Caso, cuando: string): ResultadoSeleccion {
  // El segundo caso (sin `modelo`) no debería darse nunca en la práctica:
  // `elegirLenteSecundaria` siempre lo exige. Se comprueba igual porque
  // `LenteElegida.modelo` es opcional en el tipo, y esta función no puede
  // fabricar un modelo que no está.
  const modelo = caso.lenteSecundaria?.modelo
  if (caso.lenteSecundaria === undefined || modelo === undefined) {
    return { caso, avisos: [], emparejamiento: { estado: 'NO_ESTA' } }
  }
  const lenteSecundaria = caso.lenteSecundaria
  const resultado = elegirLente(
    caso,
    {
      fabricante: lenteSecundaria.fabricante,
      modelo,
      ...(lenteSecundaria.nombreEnEvo ? { nombreEnEvo: lenteSecundaria.nombreEnEvo } : {}),
      ...(lenteSecundaria.nombreEnKane ? { nombreEnKane: lenteSecundaria.nombreEnKane } : {}),
    },
    cuando,
  )
  return {
    ...resultado,
    caso: {
      ...resultado.caso,
      lenteSecundaria: caso.lente,
      resultados: {},
      estado: caso.estado === 'COMPLETADO' ? 'CONFIRMADO' : caso.estado,
      actualizadoEn: cuando,
    },
  }
}
