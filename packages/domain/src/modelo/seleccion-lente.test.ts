/**
 * seleccion-lente.test.ts — La constante A se aplica a TODOS los aparatos
 * de un ojo, no solo al que se mire por defecto.
 *
 * No existía ningún test para este fichero antes de encontrar el fallo real
 * del 14/09/2026 (ver el log de lecciones): con un ojo de varios aparatos
 * (D47), `elegirLente()` solo escribía la constante nueva en un aparato
 * «Principal» fantasma —creado sobre la marcha, porque `ojoDe()` sin
 * aparato cae en ese por defecto— mientras los aparatos de verdad se
 * quedaban con la constante de la lente anterior, sin ningún aviso.
 * Reproducido con los datos reales del caso CV-2026-0143 del dueño del
 * proyecto (dos aparatos, dos lentes, D55).
 */
import { describe, expect, it } from 'vitest'

import { casoNuevo, conOjo, datasetsDe, ojosDelCaso, ojoDe } from './caso.js'
import type { Caso } from './caso.js'
import { conMedida, crearMedida, obtener, ojoVacio } from './medida.js'
import { elegirLente, elegirLenteSecundaria, intercambiarLentes } from './seleccion-lente.js'

const CUANDO = '2026-09-14T10:00:00.000Z'
const MANUAL = { metodo: 'MANUAL', registradoEn: CUANDO } as const

function casoConDosAparatos(): Caso {
  let od1 = ojoVacio('OD', 'ZEISS IOLMaster 700')
  od1 = conMedida(od1, crearMedida('AL', 'OD', 23.5, MANUAL))
  let od2 = ojoVacio('OD', 'Heidelberg ANTERION')
  od2 = conMedida(od2, crearMedida('AL', 'OD', 23.4, MANUAL))

  let caso: Caso = casoNuevo('c1', 'CV-PRUEBA-001', CUANDO)
  caso = conOjo(caso, od1, CUANDO)
  caso = conOjo(caso, od2, CUANDO)
  return caso
}

describe('elegirLente — constante del catálogo (D69) con varios aparatos', () => {
  it('aplica la constante a TODOS los aparatos del ojo, no solo a uno por defecto', () => {
    const caso = casoConDosAparatos()
    const r = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO)

    for (const aparato of ['ZEISS IOLMaster 700', 'Heidelberg ANTERION']) {
      const ojo = ojoDe(r.caso, 'OD', aparato)
      expect(obtener(ojo, 'CONSTANTE_A')?.valor, `${aparato} no recibió la constante`).toBe(119.1)
    }
  })

  it('no crea un aparato «Principal» fantasma cuando el ojo no lo tiene', () => {
    const caso = casoConDosAparatos()
    const r = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO)

    expect(datasetsDe(r.caso, 'OD').map((o) => o.aparato).sort()).toEqual(
      ['Heidelberg ANTERION', 'ZEISS IOLMaster 700'].sort(),
    )
  })

  it('cambiar de lente actualiza la constante en los dos aparatos, y quita la anterior de los dos', () => {
    let caso = casoConDosAparatos()
    caso = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO).caso
    const r = elegirLente(caso, { modelo: 'B&L Envy', constanteConocida: 119.28 }, CUANDO)

    for (const aparato of ['ZEISS IOLMaster 700', 'Heidelberg ANTERION']) {
      const ojo = ojoDe(r.caso, 'OD', aparato)
      expect(
        obtener(ojo, 'CONSTANTE_A')?.valor,
        `${aparato} se quedó con la constante de la lente anterior`,
      ).toBe(119.28)
    }
    // Tampoco aquí debe aparecer un aparato «Principal» que nadie pidió.
    expect(datasetsDe(r.caso, 'OD').map((o) => o.aparato).sort()).toEqual(
      ['Heidelberg ANTERION', 'ZEISS IOLMaster 700'].sort(),
    )
  })

  it('no pisa una constante escrita a mano en uno de los aparatos, y sí actualiza el otro', () => {
    let caso = casoConDosAparatos()
    // El cirujano escribió la constante a mano en un aparato concreto.
    const conManual = conMedida(
      ojoDe(caso, 'OD', 'Heidelberg ANTERION'),
      crearMedida('CONSTANTE_A', 'OD', 999, MANUAL),
    )
    caso = conOjo(caso, conManual, CUANDO)

    const r = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO)

    expect(obtener(ojoDe(r.caso, 'OD', 'ZEISS IOLMaster 700'), 'CONSTANTE_A')?.valor).toBe(119.1)
    expect(obtener(ojoDe(r.caso, 'OD', 'Heidelberg ANTERION'), 'CONSTANTE_A')?.valor).toBe(999)
    expect(r.avisos.some((a) => /escribiste tú/.test(a))).toBe(true)
  })
})

describe('intercambiarLentes — reproducción exacta del caso real CV-2026-0143', () => {
  it('tras el intercambio, los dos aparatos reales tienen la constante de la lente nueva, sin aparato fantasma', () => {
    let caso = casoConDosAparatos()
    // Primera lente, aplicada a los dos aparatos (Aspire).
    caso = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO).caso
    // Se aparca la segunda lente para comparar (Envy, D55).
    caso = elegirLenteSecundaria(caso, { modelo: 'B&L Envy', constanteConocida: 119.28 }, CUANDO)

    const r = intercambiarLentes(caso, CUANDO)

    expect(r.caso.lente?.modelo).toBe('B&L Envy')
    expect(r.caso.lenteSecundaria?.modelo).toBe('B&L Aspire')

    for (const aparato of ['ZEISS IOLMaster 700', 'Heidelberg ANTERION']) {
      const ojo = ojoDe(r.caso, 'OD', aparato)
      expect(
        obtener(ojo, 'CONSTANTE_A')?.valor,
        `${aparato} no tiene la constante de la lente nueva tras el intercambio`,
      ).toBe(119.28)
    }

    // El fallo real: aparecía un tercer aparato «Principal», vacío, que
    // nadie había pedido, con la constante nueva puesta ahí en vez de en
    // los aparatos de verdad.
    const aparatosTrasIntercambio = datasetsDe(r.caso, 'OD').map((o) => o.aparato)
    expect(aparatosTrasIntercambio).not.toContain('Principal')
    expect(aparatosTrasIntercambio.sort()).toEqual(
      ['Heidelberg ANTERION', 'ZEISS IOLMaster 700'].sort(),
    )
  })

  it('borra los resultados ya calculados de los dos aparatos (D55, sin cambio de comportamiento)', () => {
    let caso = casoConDosAparatos()
    caso = elegirLente(caso, { modelo: 'B&L Aspire', constanteConocida: 119.1 }, CUANDO).caso
    caso = elegirLenteSecundaria(caso, { modelo: 'B&L Envy', constanteConocida: 119.28 }, CUANDO)
    caso = {
      ...caso,
      resultados: {
        'KANE:OD:ZEISS IOLMaster 700': {
          calculadora: 'KANE',
          ojo: 'OD',
          estado: 'SUCCESS',
          obtenidoEn: CUANDO,
          opciones: [],
        },
      },
    }

    const r = intercambiarLentes(caso, CUANDO)
    expect(r.caso.resultados).toEqual({})
  })

  it('sin lente aparcada, no hace nada y no avisa', () => {
    const caso = casoConDosAparatos()
    const r = intercambiarLentes(caso, CUANDO)
    expect(r.caso).toBe(caso)
    expect(r.avisos).toEqual([])
  })
})

describe('ojosDelCaso sigue sin verse afectado por el aparato de la constante', () => {
  it('un ojo con dos aparatos sigue contando como un solo ojo del caso', () => {
    const caso = casoConDosAparatos()
    expect(ojosDelCaso(caso)).toEqual(['OD'])
  })
})
