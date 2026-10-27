import { estimarLenteRecomendada } from '@vilamar/domain'
import { describe, expect, it } from 'vitest'

import { construirOpcionesDeBarrett } from './barrett-opciones.js'

// Las dos tablas de Barrett del caso CV-2026-0437 (OD), tal como salen de la web.
const POTENCIAS = [
  ['IOL Power', 'Toric Power', 'Refraction - (S.E.Q.)'],
  ['15.5 S.E (Biconvex)', 'T4', '-0.22 S.E.'],
  ['15.0 S.E (Biconvex)', 'T4', '0.11 S.E.'],
  ['14.5 S.E (Biconvex)', 'T4', '0.44 S.E.'],
]
const TORICAS = [
  ['Toric Power', 'IOL Cylinder', 'Residual Astigmatism'],
  ['T3', '1.5', '0.41 Cyl Axis 43'],
  ['T4', '2.25', '0.08 Cyl Axis 133'],
  ['T5', '3', '0.56 Cyl Axis 133'],
]

describe('construirOpcionesDeBarrett', () => {
  it('cada esfera lleva el cilindro de su designación, y la destacada es la del medio', () => {
    const { opciones, indiceDestacada } = construirOpcionesDeBarrett(POTENCIAS, TORICAS)
    expect(indiceDestacada).toBe(1)
    expect(opciones[0]).toMatchObject({
      esfera: 15.5,
      designacion: 'T4',
      cilindro: 2.25,
      cilindroResidual: 0.08,
      ejeResidual: 133,
      refraccionPrevista: -0.22,
      recomendada: false,
    })
    expect(opciones[1]).toMatchObject({ esfera: 15, recomendada: true })
  })

  it('las lentes tóricas que ninguna esfera usa (T3, T5) se guardan, sin esfera', () => {
    const { opciones } = construirOpcionesDeBarrett(POTENCIAS, TORICAS)
    expect(opciones).toHaveLength(5)
    expect(opciones.slice(3)).toEqual([
      {
        designacion: 'T3',
        cilindro: 1.5,
        cilindroResidual: 0.41,
        ejeResidual: 43,
        eje: 43,
        recomendada: false,
      },
      {
        designacion: 'T5',
        cilindro: 3,
        cilindroResidual: 0.56,
        ejeResidual: 133,
        eje: 133,
        recomendada: false,
      },
    ])
    // Ninguna de las añadidas se marca como destacada ni cambia cuál es la destacada.
    expect(opciones.filter((o) => o.recomendada)).toHaveLength(1)
  })

  it('con la escalera completa, el criterio propio elige T3 (1.5 D), no T4: caso 0437', () => {
    const { opciones } = construirOpcionesDeBarrett(POTENCIAS, TORICAS)
    expect(estimarLenteRecomendada(opciones, 42)).toMatchObject({
      esfera: 15.5,
      cilindro: 1.5,
      cilindroResidual: 0.41,
      ejeResidual: 43,
    })
  })

  it('sin tabla tórica, solo las esferas y sin inventar cilindro', () => {
    const { opciones } = construirOpcionesDeBarrett(POTENCIAS, [])
    expect(opciones).toHaveLength(3)
    expect(opciones.every((o) => o.cilindro === undefined)).toBe(true)
  })

  it('una fila tórica sin cilindro legible no se añade', () => {
    const { opciones } = construirOpcionesDeBarrett(POTENCIAS, [
      ['Toric Power', 'IOL Cylinder', 'Residual Astigmatism'],
      ['T9', '—', '0.41 Cyl Axis 43'],
    ])
    expect(opciones).toHaveLength(3)
  })
})
