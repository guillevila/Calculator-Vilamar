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
