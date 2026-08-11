/**
 * contratos.test.ts — Distinguir un PDF con texto de un escaneo.
 *
 * Costó un fallo: contar caracteres a secas mandaba al OCR un informe corto pero
 * con texto perfecto. Se leía peor teniendo el texto exacto delante.
 */

import { describe, expect, it } from 'vitest'

import { traeTextoDeVerdad } from './contratos.js'

describe('¿trae texto de verdad este PDF?', () => {
  it('un informe corto pero con números decimales SÍ trae texto', () => {
    const corto = ['ANTERION', 'OD', 'AL 24.07 mm', 'K1 41.22 D @ 175', 'ACD 3.18 mm'].join('\n')
    expect(corto.replace(/\s/g, '').length).toBeLessThan(120) // es corto de verdad
    expect(traeTextoDeVerdad(corto)).toBe(true)
  })

  it('un informe largo trae texto aunque no se le vean decimales', () => {
    expect(traeTextoDeVerdad('palabra '.repeat(40))).toBe(true)
  })

  it('la cabecera suelta de un escaneo NO cuenta como texto', () => {
    expect(traeTextoDeVerdad('Clinic report\nPage 1 of 1')).toBe(false)
    expect(traeTextoDeVerdad('')).toBe(false)
    expect(traeTextoDeVerdad('   \n  ')).toBe(false)
  })

  it('un número suelto tampoco basta: hacen falta al menos dos', () => {
    expect(traeTextoDeVerdad('Impreso el 01/01/2026 a las 10.30 h')).toBe(false)
  })

  it('acepta la coma decimal, que es la que usan los informes europeos', () => {
    const conComas = ['OD', 'AL 24,07 mm', 'K1 41,22 D', 'ACD 3,18 mm'].join('\n')
    expect(traeTextoDeVerdad(conComas)).toBe(true)
  })
})
