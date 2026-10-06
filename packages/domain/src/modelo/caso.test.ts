/**
 * caso.test.ts — `COLUMNAS_COMPARATIVA` (D48, 28/08/2026; D67, 02/09/2026).
 *
 * Desde que cada variante de córnea posterior (D45) es una casilla que se
 * pide por su cuenta —con su propio botón en la pantalla de cálculo, no algo
 * que se añade solo cuando el dataset tiene PK1/PK2—, esta lista dejó de
 * depender de ningún caso concreto: son siempre las mismas columnas, en el
 * mismo orden. Es justo esa lista la que tienen que compartir la
 * comparativa en pantalla, el informe y la pantalla de cálculo, o una
 * enseñaría una casilla que otra no ofrece.
 *
 * D67 añade una sexta: `BARRETT_TRUE_K_TORIC`, para los ojos con córnea
 * especial. No es una variante de córnea posterior —no forma pareja— así
 * que va al final, no dentro del bloque de Barrett.
 */

import { describe, expect, it } from 'vitest'

import { casoNuevo } from './caso.js'
import { COLUMNAS_COMPARATIVA, conPedidoLente } from './caso.js'

describe('COLUMNAS_COMPARATIVA', () => {
  it('son las seis casillas, Predicted antes que Measured PCA en cada pareja, True K Toric al final', () => {
    expect(COLUMNAS_COMPARATIVA).toEqual([
      'EVO_TORIC_SIN_CARA_POSTERIOR',
      'EVO_TORIC',
      'BARRETT_TORIC',
      'BARRETT_TORIC_CON_CARA_POSTERIOR',
      'KANE',
      'BARRETT_TRUE_K_TORIC',
    ])
  })

  it('Kane no lleva ninguna variante: su web no tiene córnea posterior', () => {
    expect(COLUMNAS_COMPARATIVA.filter((c) => c === 'KANE')).toHaveLength(1)
  })
})

describe('conPedidoLente (D93, 20/09/2026)', () => {
  it('graba el pedido de ese ojo, sin tocar el otro', () => {
    const caso = casoNuevo('c1', 'CV-2026-0042', '2026-09-20T10:00:00.000Z')
    const conPedido = conPedidoLente(caso, 'OD', {
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      cilindro: 1.0,
      eje: 90,
      decididoEn: '2026-09-20T11:00:00.000Z',
    })
    expect(conPedido.pedidosLente?.OD).toEqual({
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      cilindro: 1.0,
      eje: 90,
      decididoEn: '2026-09-20T11:00:00.000Z',
    })
    expect(conPedido.pedidosLente?.OS).toBeUndefined()
  })

  it('un pedido nuevo para el mismo ojo sustituye al anterior, no lo acumula', () => {
    const caso = casoNuevo('c1', 'CV-2026-0042', '2026-09-20T10:00:00.000Z')
    const primero = conPedidoLente(caso, 'OD', {
      fabricante: 'Alcon',
      modelo: 'SN6ATx',
      esfera: 20,
      decididoEn: '2026-09-20T11:00:00.000Z',
    })
    const segundo = conPedidoLente(primero, 'OD', {
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      decididoEn: '2026-09-20T12:00:00.000Z',
    })
    expect(segundo.pedidosLente?.OD?.fabricante).toBe('Bausch & Lomb')
  })

  it('los pedidos de los dos ojos conviven, cada uno el suyo', () => {
    const caso = casoNuevo('c1', 'CV-2026-0042', '2026-09-20T10:00:00.000Z')
    const conOD = conPedidoLente(caso, 'OD', {
      fabricante: 'Alcon',
      modelo: 'SN6ATx',
      esfera: 20,
      decididoEn: '2026-09-20T11:00:00.000Z',
    })
    const conLosDos = conPedidoLente(conOD, 'OS', {
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      decididoEn: '2026-09-20T12:00:00.000Z',
    })
    expect(conLosDos.pedidosLente?.OD?.fabricante).toBe('Alcon')
    expect(conLosDos.pedidosLente?.OS?.fabricante).toBe('Bausch & Lomb')
  })
})
