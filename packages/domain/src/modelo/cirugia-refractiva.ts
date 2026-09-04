/**
 * cirugia-refractiva.ts — Si el ojo ha tenido cirugía refractiva antes, y de
 * qué tipo.
 *
 * Existe por EVO: su formulario tiene un desplegable, «Post LASIK/PRK/RK», que
 * cambia cómo calcula la potencia en un ojo que ya se operó de miopía,
 * hipermetropía o queratotomía radial antes de la cirugía de catarata —la
 * córnea de un ojo así no se comporta como una córnea virgen, y usar la fórmula
 * estándar sobre ella da un resultado sistemáticamente equivocado.
 *
 * Petición del dueño del proyecto (04/09/2026), confirmando además que en la
 * práctica casi nunca hay datos previos a la cirugía refractiva —ni la
 * queratometría de antes, ni la refracción de antes o después—: **este dato es
 * solo si ha habido cirugía y de qué tipo**, nada más. EVO tiene, en su propio
 * formulario, campos para esos datos históricos si algún día se tienen, pero no
 * son parte de este modelo mientras no haga falta pedirlos.
 *
 * ## Por qué es del OJO y no del caso
 *
 * A diferencia del sexo (`sexo.ts`), esto SÍ puede ser distinto entre el ojo
 * derecho y el izquierdo: una persona puede haberse operado de miopía en un ojo
 * y no en el otro, o de tipos distintos en cada uno. Meterlo en el caso
 * obligaría a que los dos ojos dijeran lo mismo, y eso no es cierto siempre.
 */

import type { Procedencia } from './procedencia.js'

/**
 * Las opciones. Cerradas a propósito, y son exactamente las cuatro que ofrece
 * el desplegable de EVO —verificado contra su formulario real, 04/09/2026—:
 * «No», «Myopic», «Hyperopic», «Radial Keratotomy».
 */
export type CirugiaRefractivaPrevia = 'NINGUNA' | 'MIOPICA' | 'HIPERMETROPICA' | 'RK'

export const CIRUGIAS_REFRACTIVAS: readonly CirugiaRefractivaPrevia[] = [
  'NINGUNA',
  'MIOPICA',
  'HIPERMETROPICA',
  'RK',
]

export const TEXTO_CIRUGIA_REFRACTIVA: Readonly<Record<CirugiaRefractivaPrevia, string>> = {
  NINGUNA: 'Ninguna',
  MIOPICA: 'Miópica (LASIK/PRK)',
  HIPERMETROPICA: 'Hipermetrópica (LASIK/PRK)',
  RK: 'Queratotomía radial (RK)',
}

/**
 * Un dato del OJO que se revisa como cualquier otro: valor, procedencia, lo
 * que hubiera antes si se corrigió, y si una persona lo ha confirmado.
 *
 * Misma forma que `DatoDeCaso` de `sexo.ts` —valor, procedencia, original,
 * confirmación—, pero deliberadamente NO se reutiliza ese tipo: uno vive en el
 * caso y este en el ojo, y son conceptos distintos aunque la forma coincida.
 */
export interface CirugiaRefractivaDelOjo {
  readonly valor: CirugiaRefractivaPrevia
  readonly procedencia: Procedencia
  readonly original?: { readonly valor: CirugiaRefractivaPrevia; readonly procedencia: Procedencia }
  readonly confirmadoPorUsuario: boolean
}

/**
 * Lo escribe una persona, conservando lo que hubiera antes.
 *
 * Mismo criterio que `aportarSexo`/`corregirMedida`: si había un valor, se
 * guarda como original y el dato pasa a ser CORREGIDO; si no, es APORTADO. Al
 * corregir dos veces se conserva SIEMPRE lo primero, no el paso intermedio.
 */
export function aportarCirugiaRefractiva(
  anterior: CirugiaRefractivaDelOjo | undefined,
  valor: CirugiaRefractivaPrevia,
  cuando: string,
): CirugiaRefractivaDelOjo {
  const original =
    anterior === undefined
      ? undefined
      : (anterior.original ?? { valor: anterior.valor, procedencia: anterior.procedencia })
  return {
    valor,
    procedencia: { metodo: 'MANUAL', registradoEn: cuando },
    ...(original ? { original } : {}),
    // Lo acaba de escribir una persona mirándolo.
    confirmadoPorUsuario: true,
  }
}
