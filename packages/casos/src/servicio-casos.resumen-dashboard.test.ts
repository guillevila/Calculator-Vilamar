/**
 * `resumenDashboard()` (D82, 15/09/2026): recorre `casos/`, igual que
 * `listarCasosGuardados()`, y cuenta lentes calculadas por doctor y por
 * modelo. No hay ningún fichero nuevo que sincronizar: lee justo lo que ya
 * guarda cada caso.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { casoNuevo } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { guardarCaso, prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-dashboard-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): {
  servicio: ServicioCasos
  carpetas: ReturnType<typeof prepararCarpetas>
} {
  const carpetasPrueba = prepararCarpetas(raizTemporal())
  const dep: DependenciasServicio = {
    carpetas: carpetasPrueba,
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado')),
    },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-15T10:00:00.000Z'),
    abrirNavegador: () => Promise.reject(new Error('no usado')),
    imprimirPdf: () => Promise.reject(new Error('no usado')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return { servicio: new ServicioCasos(dep), carpetas: carpetasPrueba }
}

describe('ServicioCasos.resumenDashboard', () => {
  it('sin ningún caso guardado, sale vacío', () => {
    const { servicio } = servicioDePrueba()
    expect(servicio.resumenDashboard()).toEqual({
      totalCalculados: 0,
      porDoctor: [],
      porModeloLente: [],
    })
  })

  it('cuenta los casos COMPLETADOS con lente, escritos directamente en disco', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-15T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dra. López',
      lente: { modelo: 'LuxSmart', fabricante: 'B&L' },
    })
    guardarCaso(c, {
      ...casoNuevo('2', 'CV-2026-0002', '2026-09-15T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dra. López',
      lente: { modelo: 'Eyhance' },
    })
    // Un caso sin terminar: no cuenta, aunque tenga lente elegida.
    guardarCaso(c, {
      ...casoNuevo('3', 'CV-2026-0003', '2026-09-15T10:00:00.000Z'),
      estado: 'CALCULANDO',
      lente: { modelo: 'Eyhance' },
    })

    const resumen = servicio.resumenDashboard()
    expect(resumen.totalCalculados).toBe(2)
    expect(resumen.porDoctor).toEqual([{ etiqueta: 'Dra. López', cantidad: 2 }])
    expect(resumen.porModeloLente).toEqual(
      expect.arrayContaining([
        { etiqueta: 'B&L LuxSmart', cantidad: 1 },
        { etiqueta: 'Eyhance', cantidad: 1 },
      ]),
    )
  })

  it('filtra por rango de fechas (D83)', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-15T10:00:00.000Z'),
      estado: 'COMPLETADO',
      actualizadoEn: '2026-01-01T10:00:00.000Z',
      lente: { modelo: 'LuxSmart' },
    })
    guardarCaso(c, {
      ...casoNuevo('2', 'CV-2026-0002', '2026-09-15T10:00:00.000Z'),
      estado: 'COMPLETADO',
      actualizadoEn: '2026-09-15T10:00:00.000Z',
      lente: { modelo: 'LuxSmart' },
    })

    expect(
      servicio.resumenDashboard({ desde: '2026-09-01', hasta: '2026-09-30' }).totalCalculados,
    ).toBe(1)
    expect(servicio.resumenDashboard().totalCalculados).toBe(2)
  })

  it('un doctor excluido deja de contar, y se puede volver a incluir (D83)', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-15T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dra. Prueba',
      lente: { modelo: 'LuxSmart' },
    })

    expect(servicio.listarDoctoresExcluidos()).toEqual([])
    expect(servicio.excluirDoctorDeEstadisticas('Dra. Prueba')).toEqual(['Dra. Prueba'])
    expect(servicio.resumenDashboard().totalCalculados).toBe(0)

    expect(servicio.incluirDoctorEnEstadisticas('Dra. Prueba')).toEqual([])
    expect(servicio.resumenDashboard().totalCalculados).toBe(1)
  })

  it('excluir el mismo doctor dos veces no lo duplica', () => {
    const { servicio } = servicioDePrueba()
    servicio.excluirDoctorDeEstadisticas('Dra. Prueba')
    expect(servicio.excluirDoctorDeEstadisticas('dra. prueba')).toEqual(['Dra. Prueba'])
  })
})
