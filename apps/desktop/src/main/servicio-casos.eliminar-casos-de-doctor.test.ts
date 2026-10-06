/**
 * `eliminarCasosDeDoctor()` (D85, 16/09/2026): el botón «Eliminar» del
 * dashboard, junto a «Excluir» — pero de verdad saca los casos de
 * `casos/`, archivándolos en vez de borrarlos para siempre.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { casoNuevo } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { guardarCaso, prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-eliminar-doctor-'))
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
    ahora: () => new Date('2026-09-16T10:00:00.000Z'),
    abrirNavegador: () => Promise.reject(new Error('no usado')),
    imprimirPdf: () => Promise.reject(new Error('no usado')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return { servicio: new ServicioCasos(dep), carpetas: carpetasPrueba }
}

describe('ServicioCasos.eliminarCasosDeDoctor', () => {
  it('archiva los casos «lente calculada» de ese doctor, y devuelve cuántos', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-16T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dra. Prueba',
      lente: { modelo: 'LuxSmart' },
    })
    guardarCaso(c, {
      ...casoNuevo('2', 'CV-2026-0002', '2026-09-16T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dra. Prueba',
      lente: { modelo: 'Eyhance' },
    })
    guardarCaso(c, {
      ...casoNuevo('3', 'CV-2026-0003', '2026-09-16T10:00:00.000Z'),
      estado: 'COMPLETADO',
      nombreCirujano: 'Dr. Ruiz',
      lente: { modelo: 'LuxSmart' },
    })

    const eliminados = servicio.eliminarCasosDeDoctor('Dra. Prueba')
    expect(eliminados).toBe(2)

    expect(existsSync(join(c.casos, 'CV-2026-0001.json'))).toBe(false)
    expect(existsSync(join(c.casos, 'CV-2026-0002.json'))).toBe(false)
    expect(existsSync(join(c.casos, 'CV-2026-0003.json'))).toBe(true)
    expect(existsSync(join(c.raiz, 'casos-borrados', '2026-09-16', 'CV-2026-0001.json'))).toBe(true)
    expect(existsSync(join(c.raiz, 'casos-borrados', '2026-09-16', 'CV-2026-0002.json'))).toBe(true)

    // Ya no cuenta en el dashboard, pero el otro doctor sigue intacto.
    const resumen = servicio.resumenDashboard()
    expect(resumen.porDoctor).toEqual([{ etiqueta: 'Dr. Ruiz', cantidad: 1 }])
  })

  it('un caso que no ha terminado, del mismo doctor, no se toca', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-16T10:00:00.000Z'),
      estado: 'CALCULANDO',
      nombreCirujano: 'Dra. Prueba',
    })
    expect(servicio.eliminarCasosDeDoctor('Dra. Prueba')).toBe(0)
    expect(existsSync(join(c.casos, 'CV-2026-0001.json'))).toBe(true)
  })

  it('respeta el rango de fechas — solo elimina lo que el dashboard estuviera contando', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-16T10:00:00.000Z'),
      estado: 'COMPLETADO',
      actualizadoEn: '2020-01-01T00:00:00.000Z',
      nombreCirujano: 'Dra. Prueba',
      lente: { modelo: 'LuxSmart' },
    })
    const eliminados = servicio.eliminarCasosDeDoctor('Dra. Prueba', {
      desde: '2026-01-01',
      hasta: '2026-12-31',
    })
    expect(eliminados).toBe(0)
    expect(existsSync(join(c.casos, 'CV-2026-0001.json'))).toBe(true)
  })

  it('«Sin doctor» elimina los casos sin nombreCirujano', () => {
    const { servicio, carpetas: c } = servicioDePrueba()
    guardarCaso(c, {
      ...casoNuevo('1', 'CV-2026-0001', '2026-09-16T10:00:00.000Z'),
      estado: 'COMPLETADO',
      lente: { modelo: 'LuxSmart' },
    })
    expect(servicio.eliminarCasosDeDoctor('Sin doctor')).toBe(1)
    expect(existsSync(join(c.casos, 'CV-2026-0001.json'))).toBe(false)
  })
})
