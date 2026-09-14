/**
 * Reproducción del fallo real del 14/09/2026: `ServicioCasos.validar()`
 * solo revisaba el aparato principal de cada ojo, así que un dato
 * clínicamente imposible en un aparato de verdad (no el principal) nunca
 * salía en la lista de avisos — misma familia que el fallo de
 * `elegirLente()`/`discrepanciasDeConstante()`, sin ningún test hasta ahora.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-validar-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
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
    abrirNavegador: () => Promise.reject(new Error('no usado')),
    imprimirPdf: () => Promise.reject(new Error('no usado')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('validar — recorre todos los aparatos de cada ojo, no solo el principal', () => {
  it('un dato imposible en un aparato que NO es el principal sí sale en los avisos', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente de prueba' })

    // AL de 60mm es clínicamente imposible — tiene que disparar un INVALID.
    servicio.editarMedida('OD', 'AL', 60, 'Heidelberg ANTERION')

    const avisos = servicio.validar()
    expect(
      avisos.some((a) => a.nivel === 'INVALID' && a.campo === 'AL'),
      'un AL de 60mm en un aparato no-principal no se validó',
    ).toBe(true)
  })

  it('valida los dos aparatos del mismo ojo a la vez, no solo uno', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente de prueba' })

    servicio.editarMedida('OD', 'AL', 23.5, 'ZEISS IOLMaster 700')
    servicio.editarMedida('OD', 'AL', 60, 'Heidelberg ANTERION')

    const avisos = servicio.validar()
    const invalidosAl = avisos.filter((a) => a.nivel === 'INVALID' && a.campo === 'AL')
    // Solo el ANTERION tiene el dato imposible; el ZEISS no debería añadir
    // ningún INVALID de AL, pero el ANTERION sí tiene que aparecer.
    expect(invalidosAl.length).toBeGreaterThan(0)
  })
})
