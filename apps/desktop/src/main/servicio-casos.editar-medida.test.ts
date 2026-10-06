/**
 * El eje de K2 se rellena solo al escribir el eje de K1 (D91, 20/09/2026).
 *
 * Petición expresa del dueño del proyecto: «cuando se ponga el eje de la
 * queratometría en los datos a mano, al poner el eje de K1 automáticamente
 * marcar el eje de K2 a 90º, para ser más rápido». Las dos queratometrías
 * son, por definición clínica, perpendiculares entre sí.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { APARATO_PRINCIPAL } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import type { DependenciasServicio } from './servicio-casos.js'

const { prepararCarpetas } = await import('./almacen.js')
const { ServicioCasos } = await import('./servicio-casos.js')

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-editar-medida-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): InstanceType<typeof ServicioCasos> {
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raizTemporal()),
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado')),
    },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-20T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('editarMedida — el eje de K2 se rellena solo con el de K1 + 90° (D91)', () => {
  it('al escribir el eje de K1, el de K2 se rellena a K1 + 90°', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'K1_EJE', 10)
    const caso = servicio.obtener()!
    expect(caso.ojos.OD?.[0]?.medidas.K2_EJE?.valor).toBe(100)
  })

  it('el eje de K2 se envuelve dentro de 0-180°, no se pasa de 180', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'K1_EJE', 175)
    const caso = servicio.obtener()!
    expect(caso.ojos.OD?.[0]?.medidas.K2_EJE?.valor).toBe(85)
  })

  it('si K2 ya tenía su propio eje, escribir el de K1 no lo pisa (un astigmatismo irregular puede necesitarlo distinto)', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'K2_EJE', 70)
    servicio.editarMedida('OD', 'K1_EJE', 10)
    const caso = servicio.obtener()!
    expect(caso.ojos.OD?.[0]?.medidas.K2_EJE?.valor).toBe(70)
  })

  it('escribir el eje de K2 directamente NO rellena el de K1 — solo funciona en el sentido K1 → K2', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'K2_EJE', 85)
    const caso = servicio.obtener()!
    expect(caso.ojos.OD?.[0]?.medidas.K1_EJE).toBeUndefined()
  })

  it('borrar el eje de K1 (valor null) no toca el de K2', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'K1_EJE', 10)
    servicio.editarMedida('OD', 'K1_EJE', null)
    const caso = servicio.obtener()!
    expect(caso.ojos.OD?.[0]?.medidas.K2_EJE?.valor).toBe(100)
    expect(caso.ojos.OD?.[0]?.medidas.K1_EJE).toBeUndefined()
  })
})

/**
 * SIA, eje de la incisión, refracción objetivo y constante A se comparten
 * en TODO el caso (D95, 21/09/2026, ampliado desde D46/D80: antes solo se
 * heredaban del otro ojo con el MISMO aparato, y solo al crear el dataset).
 *
 * Petición expresa del dueño del proyecto: «a veces se me pasa en uno de
 * los ojos o en uno de los aparatos poner todas las cosas... quiero que si
 * se meten los datos aunque sea una vez, por defecto se pongan esos mismos
 * datos... en los otros aparatos y otro ojo».
 */
describe('editarMedida — SIA, eje, target y constante se comparten en todo el caso (D95)', () => {
  const CAMPOS = ['SIA', 'EJE_INCISION', 'REFRACCION_OBJETIVO', 'CONSTANTE_A'] as const

  for (const campo of CAMPOS) {
    it(`${campo}: escrito en un aparato, se copia también a un SEGUNDO aparato del MISMO ojo que aún no lo tenga`, () => {
      const servicio = servicioDePrueba()
      servicio.nuevo()
      servicio.editarMedida('OD', 'AL', 23.5, 'IOLMaster')
      servicio.editarMedida('OD', 'AL', 23.4, 'ANTERION')
      servicio.editarMedida('OD', campo, 0.5, 'IOLMaster')
      const caso = servicio.obtener()!
      const anterion = caso.ojos.OD?.find((o) => o.aparato === 'ANTERION')
      expect(anterion?.medidas[campo]?.valor).toBe(0.5)
    })

    it(`${campo}: escrito en OD, se copia también a OS, aunque OS tenga un aparato con OTRO nombre`, () => {
      const servicio = servicioDePrueba()
      servicio.nuevo()
      servicio.editarMedida('OD', 'AL', 23.5, 'IOLMaster')
      servicio.editarMedida('OS', 'AL', 23.1, 'Pentacam')
      servicio.editarMedida('OD', campo, 0.5, 'IOLMaster')
      const caso = servicio.obtener()!
      const os = caso.ojos.OS?.find((o) => o.aparato === 'Pentacam')
      expect(os?.medidas[campo]?.valor).toBe(0.5)
    })

    it(`${campo}: no pisa un valor que la persona ya haya escrito en el otro dataset, aunque sea distinto`, () => {
      const servicio = servicioDePrueba()
      servicio.nuevo()
      servicio.editarMedida('OD', 'AL', 23.5)
      servicio.editarMedida('OS', 'AL', 23.1)
      servicio.editarMedida('OS', campo, 0.75)
      servicio.editarMedida('OD', campo, 0.5)
      const caso = servicio.obtener()!
      expect(caso.ojos.OS?.[0]?.medidas[campo]?.valor).toBe(0.75)
    })

    it(`${campo}: también se propaga en una edición POSTERIOR, no solo al crear el dataset`, () => {
      const servicio = servicioDePrueba()
      servicio.nuevo()
      servicio.editarMedida('OD', 'AL', 23.5)
      servicio.editarMedida('OS', 'AL', 23.1)
      // Los dos datasets ya existen, con AL puesto, antes de escribir el campo.
      servicio.editarMedida('OD', campo, 0.5)
      const caso = servicio.obtener()!
      expect(caso.ojos.OS?.[0]?.medidas[campo]?.valor).toBe(0.5)
    })
  }

  it('la lente elegida ya es del caso entero: no hace falta copiarla a ningún dataset', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5)
    servicio.editarMedida('OS', 'AL', 23.1)
    servicio.elegirLente('Alcon', 'SN60WF')
    const caso = servicio.obtener()!
    expect(caso.lente?.modelo).toBe('SN60WF')
  })
})

/**
 * La córnea especial (D67) es clínica de CADA ojo — nunca se copia al otro
 * ojo, solo entre los aparatos del MISMO ojo (D95, 21/09/2026). Copiarla al
 * otro lado podría mandar un ojo normal a Barrett True K Toric, o uno con
 * córnea especial a Barrett Toric — el error exacto que D67 evita.
 */
describe('editarSituacionCorneal — se comparte entre aparatos del mismo ojo, nunca con el otro ojo (D95)', () => {
  it('marcarla en un aparato la copia a otro aparato del MISMO ojo que aún no la tenga', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5, 'IOLMaster')
    servicio.editarMedida('OD', 'AL', 23.4, 'ANTERION')
    servicio.editarSituacionCorneal('OD', 'IOLMaster', 'LASIK_MIOPE')
    const caso = servicio.obtener()!
    const anterion = caso.ojos.OD?.find((o) => o.aparato === 'ANTERION')
    expect(anterion?.situacionCorneal).toBe('LASIK_MIOPE')
  })

  it('NUNCA se copia al otro ojo, aunque sí tenga dataset', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5)
    servicio.editarMedida('OS', 'AL', 23.1)
    servicio.editarSituacionCorneal('OD', APARATO_PRINCIPAL, 'QUERATOCONO')
    const caso = servicio.obtener()!
    expect(caso.ojos.OS?.[0]?.situacionCorneal).toBeUndefined()
  })

  it('no pisa una situación corneal ya marcada en el otro aparato del mismo ojo, aunque sea distinta', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5, 'IOLMaster')
    servicio.editarMedida('OD', 'AL', 23.4, 'ANTERION')
    servicio.editarSituacionCorneal('OD', 'ANTERION', 'QUERATOTOMIA_RADIAL')
    servicio.editarSituacionCorneal('OD', 'IOLMaster', 'LASIK_MIOPE')
    const caso = servicio.obtener()!
    const anterion = caso.ojos.OD?.find((o) => o.aparato === 'ANTERION')
    expect(anterion?.situacionCorneal).toBe('QUERATOTOMIA_RADIAL')
  })

  it('quitarla (undefined) no la borra de otros aparatos', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5, 'IOLMaster')
    servicio.editarMedida('OD', 'AL', 23.4, 'ANTERION')
    servicio.editarSituacionCorneal('OD', 'IOLMaster', 'LASIK_MIOPE')
    servicio.editarSituacionCorneal('OD', 'IOLMaster', undefined)
    const caso = servicio.obtener()!
    const anterion = caso.ojos.OD?.find((o) => o.aparato === 'ANTERION')
    expect(anterion?.situacionCorneal).toBe('LASIK_MIOPE')
  })
})
