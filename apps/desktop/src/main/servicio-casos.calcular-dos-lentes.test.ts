/**
 * «Camino corto» de D55 (14/09/2026, petición expresa del dueño del
 * proyecto): comparar dos lentes exige hoy cinco pasos manuales —calcular,
 * generar el PDF, volver a los datos, intercambiar la lente, calcular otra
 * vez, generar otra vez—, y el dueño pidió un solo gesto que haga todo eso.
 *
 * `calcularConDosLentes()` es un orquestador fino: no lleva NINGUNA lógica
 * de constantes ni de cálculo propia, solo reutiliza `calcular()`,
 * `generarPdf()` e `intercambiarLentes()` en el mismo orden en que ya se
 * hacían a mano. Por eso este test no monta un navegador real ni mockea
 * Playwright —eso ya lo cubre el resto de la suite y `pnpm test:e2e`—:
 * espía los propios métodos de la instancia y comprueba que el orden, los
 * argumentos y el resultado son los que tienen que ser.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-dos-lentes-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  vi.restoreAllMocks()
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioCasos {
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raizTemporal()),
    proveedor: { nombre: 'test', puedeCon: () => false, extraer: () => Promise.reject(new Error('no usado')) },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-14T10:00:00.000Z'),
    abrirNavegador: () => Promise.reject(new Error('no usado — calcular() va espiado en este test')),
    imprimirPdf: () => Promise.reject(new Error('no usado — generarPdf() va espiado en este test')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('calcularConDosLentes — el camino corto de D55', () => {
  it('rechaza si no hay ninguna lente alternativa aparcada', async () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.elegirLente('Alcon', 'SN6ATx')

    await expect(servicio.calcularConDosLentes()).rejects.toThrow(/lente alternativa/i)
  })

  it('calcula la lente activa, genera su PDF, intercambia, calcula la otra y genera el segundo PDF — en ese orden', async () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.elegirLente('Alcon', 'SN6ATx')
    servicio.elegirLenteSecundaria({ fabricante: 'B&L', modelo: 'MX60T' })

    const rutasA = [{ ojo: 'OD' as const, ruta: 'A.pdf' }]
    const rutasB = [{ ojo: 'OD' as const, ruta: 'B.pdf' }]
    const orden: string[] = []

    const calcularSpy = vi
      .spyOn(servicio, 'calcular')
      .mockImplementation(async () => {
        orden.push('calcular')
        return []
      })
    const generarPdfSpy = vi
      .spyOn(servicio, 'generarPdf')
      .mockImplementation(async () => {
        const esLaPrimera = orden.filter((o) => o === 'generarPdf').length === 0
        orden.push('generarPdf')
        return { rutas: esLaPrimera ? rutasA : rutasB }
      })
    const intercambiarSpy = vi.spyOn(servicio, 'intercambiarLentes').mockImplementation(() => {
      orden.push('intercambiarLentes')
      return { caso: servicio.obtener()!, avisos: [] }
    })

    const r = await servicio.calcularConDosLentes(['EVO_TORIC_SIN_CARA_POSTERIOR'])

    expect(orden).toEqual(['calcular', 'generarPdf', 'intercambiarLentes', 'calcular', 'generarPdf'])
    expect(calcularSpy).toHaveBeenNthCalledWith(1, ['EVO_TORIC_SIN_CARA_POSTERIOR'])
    expect(calcularSpy).toHaveBeenNthCalledWith(2, ['EVO_TORIC_SIN_CARA_POSTERIOR'])
    expect(intercambiarSpy).toHaveBeenCalledTimes(1)
    expect(generarPdfSpy).toHaveBeenCalledTimes(2)

    expect(r.lenteA.modelo).toBe('SN6ATx')
    expect(r.lenteA.rutas).toEqual(rutasA)
    expect(r.lenteB.modelo).toBe('MX60T')
    expect(r.lenteB.rutas).toEqual(rutasB)
  })
})
