/**
 * Petición del dueño (27/10/2026): con dos aparatos en un ojo, uno completo y otro
 * al que le falta un dato necesario, el cálculo arrancaba y solo al final salía que
 * de un aparato no había resultado. Ahora `faltanParaCalcular` dice, ANTES de lanzar
 * nada, qué falta y en qué ojo y aparato.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import type { DependenciasServicio } from './servicio-casos.js'
import { ServicioCasos } from './servicio-casos.js'

const carpetas: string[] = []

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioCasos {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-faltan-'))
  carpetas.push(raiz)
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raiz),
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado')),
    },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-10-27T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('faltanParaCalcular', () => {
  it('con un caso casi vacío dice qué falta del caso y del ojo, y el texto lo explica', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5)

    const f = servicio.faltanParaCalcular(['KANE'], { ojo: 'OD' })

    // El sexo no sale aquí: un caso nuevo lo trae con «Hombre» por defecto (decisión
    // anterior del dueño, para no pedir un clic más); si se borrara, sí se pediría.
    expect(f.generales).toEqual(['el nombre del paciente', 'el doctor', 'el tipo de lente'])
    expect(f.porAparato).toHaveLength(1)
    expect(f.porAparato[0]).toMatchObject({ ojo: 'OD' })
    expect(f.porAparato[0]?.faltan).toEqual(
      expect.arrayContaining(['K1', 'la ACD', 'el SIA', 'el eje de la incisión', 'la constante A']),
    )
    expect(f.porAparato[0]?.faltan).not.toContain('la longitud axial (AL)')
    expect(f.texto).toMatch(/^No se puede calcular porque faltan datos necesarios\./)
  })

  it('con dos aparatos en el ojo, avisa del que está incompleto aunque el otro esté completo', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    const completo = {
      AL: 23.5,
      K1: 43,
      K1_EJE: 10,
      K2: 44,
      K2_EJE: 100,
      ACD: 3.1,
      SIA: 0.1,
      EJE_INCISION: 90,
      CONSTANTE_A: 119,
      REFRACCION_OBJETIVO: 0,
    } as const
    for (const [campo, valor] of Object.entries(completo)) {
      servicio.editarMedida('OD', campo as never, valor, 'IOLMaster')
    }
    // El segundo aparato: todo menos la ACD.
    for (const [campo, valor] of Object.entries(completo)) {
      if (campo !== 'ACD') servicio.editarMedida('OD', campo as never, valor, 'Pentacam')
    }

    const f = servicio.faltanParaCalcular(['EVO_TORIC_SIN_CARA_POSTERIOR'], { ojo: 'OD' })

    expect(f.porAparato).toEqual([{ ojo: 'OD', aparato: 'Pentacam', faltan: ['la ACD'] }])
    expect(f.texto).toContain('aparato «Pentacam»: la ACD.')
  })
})
