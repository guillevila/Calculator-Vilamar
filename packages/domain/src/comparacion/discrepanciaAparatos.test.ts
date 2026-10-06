import { describe, expect, it } from 'vitest'

import { conMedida, confirmarTodas, crearMedida, ojoVacio } from '../modelo/medida.js'
import type { Procedencia } from '../modelo/procedencia.js'
import { detectarDiscrepancias } from './discrepanciaAparatos.js'

const CUANDO = '2026-08-27T10:00:00.000Z'
const MANUAL: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }

function dataset(aparato: string, al: number, k1: number, confirmado = true) {
  let ojo = ojoVacio('OD', aparato)
  ojo = conMedida(ojo, crearMedida('AL', 'OD', al, MANUAL))
  ojo = conMedida(ojo, crearMedida('K1', 'OD', k1, MANUAL))
  return confirmado ? confirmarTodas(ojo) : ojo
}

describe('detectarDiscrepancias', () => {
  it('con un solo dataset no hay nada que comparar', () => {
    expect(detectarDiscrepancias([dataset('IOLMaster', 23.5, 43)])).toHaveLength(0)
  })

  it('dos aparatos con valores parecidos no generan discrepancia', () => {
    const a = dataset('IOLMaster', 23.5, 43.0)
    const b = dataset('ANTERION', 23.52, 43.1)
    expect(detectarDiscrepancias([a, b])).toHaveLength(0)
  })

  it('una AL muy distinta entre dos aparatos se detecta', () => {
    const a = dataset('IOLMaster', 23.5, 43.0)
    const b = dataset('ANTERION', 24.2, 43.0)
    const discrepancias = detectarDiscrepancias([a, b])
    expect(discrepancias).toHaveLength(1)
    expect(discrepancias[0]?.campo).toBe('AL')
    expect(discrepancias[0]?.aparatoA).toBe('IOLMaster')
    expect(discrepancias[0]?.aparatoB).toBe('ANTERION')
    expect(discrepancias[0]?.diferencia).toBeCloseTo(0.7, 5)
  })

  it('un dataset sin confirmar no se compara todavía', () => {
    const a = dataset('IOLMaster', 23.5, 43.0)
    const b = dataset('ANTERION', 24.2, 43.0, false)
    expect(detectarDiscrepancias([a, b])).toHaveLength(0)
  })

  it('con tres aparatos, compara cada par por separado', () => {
    const a = dataset('IOLMaster', 23.5, 43.0)
    const b = dataset('ANTERION', 24.2, 43.0)
    const c = dataset('Pentacam', 23.55, 43.0)
    const discrepancias = detectarDiscrepancias([a, b, c])
    // Solo el par IOLMaster/ANTERION y ANTERION/Pentacam discrepan en AL.
    expect(discrepancias).toHaveLength(2)
  })
})
