import { describe, expect, it } from 'vitest'

import { CALCULADORAS, FICHAS, VARIANTE_CARA_POSTERIOR } from './calculadoras.js'

describe('D45: variantes de córnea posterior', () => {
  it('EVO se la quita a su variante; Barrett se la añade a la suya', () => {
    expect(VARIANTE_CARA_POSTERIOR.EVO_TORIC).toEqual({
      calculadora: 'EVO_TORIC_SIN_CARA_POSTERIOR',
      sentido: 'SIN',
    })
    expect(VARIANTE_CARA_POSTERIOR.BARRETT_TORIC).toEqual({
      calculadora: 'BARRETT_TORIC_CON_CARA_POSTERIOR',
      sentido: 'CON',
    })
    // Kane no tiene ningún campo de córnea posterior en su formulario.
    expect(VARIANTE_CARA_POSTERIOR.KANE).toBeUndefined()
  })

  it('ninguna variante está en CALCULADORAS: no se eligen a mano, se calculan solas', () => {
    for (const variante of Object.values(VARIANTE_CARA_POSTERIOR)) {
      expect(CALCULADORAS).not.toContain(variante.calculadora)
    }
  })

  it('la ficha de EVO_TORIC_SIN_CARA_POSTERIOR es igual que la de EVO salvo la córnea posterior', () => {
    const evo = FICHAS.EVO_TORIC
    const sinCaraPosterior = FICHAS.EVO_TORIC_SIN_CARA_POSTERIOR
    expect(sinCaraPosterior.requeridos).toEqual(evo.requeridos)
    expect(evo.opcionales).toEqual(
      expect.arrayContaining(['PK1', 'PK1_EJE', 'PK2', 'PK2_EJE']),
    )
    for (const campo of ['PK1', 'PK1_EJE', 'PK2', 'PK2_EJE'] as const) {
      expect(sinCaraPosterior.opcionales).not.toContain(campo)
    }
  })

  it('la ficha de BARRETT_TORIC_CON_CARA_POSTERIOR es igual que la de Barrett más la córnea posterior', () => {
    const barrett = FICHAS.BARRETT_TORIC
    const conCaraPosterior = FICHAS.BARRETT_TORIC_CON_CARA_POSTERIOR
    expect(conCaraPosterior.requeridos).toEqual(barrett.requeridos)
    for (const campo of ['PK1', 'PK1_EJE', 'PK2', 'PK2_EJE'] as const) {
      expect(barrett.opcionales).not.toContain(campo)
      expect(conCaraPosterior.opcionales).toContain(campo)
    }
    // El resto de opcionales de Barrett se conservan tal cual.
    for (const campo of barrett.opcionales) {
      expect(conCaraPosterior.opcionales).toContain(campo)
    }
  })
})
