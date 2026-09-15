/**
 * Fallo real reportado por el dueño del proyecto (15/09/2026): al elegir
 * calcular solo OD (D66, «Ojos a calcular»), `generarPdf()` sacaba igual un
 * segundo PDF de OS —vacío, sin ningún resultado— porque OS tenía datos de
 * biometría (de una foto cargada, por ejemplo) aunque nunca se hubiera
 * pedido calcularlo.
 *
 * `ejecutarCaso` (de `@vilamar/integrations`) abre un navegador real contra
 * EVO/Barrett/Kane — aquí se sustituye por una versión de prueba que
 * completa cada tarea que se le pida sin tocar ninguna web, para poder
 * comprobar `generarPdf()` sin depender de una calculadora externa.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ResultadoCalculadora } from '@vilamar/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DependenciasServicio } from './servicio-casos.js'

vi.mock('@vilamar/integrations', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@vilamar/integrations')>()
  return {
    ...real,
    ejecutarCaso: vi.fn(
      async ({
        tareas,
        alTerminarUna,
      }: {
        readonly tareas: readonly { calculadora: string; ojo: 'OD' | 'OS'; aparato: string }[]
        readonly alTerminarUna: (resultado: ResultadoCalculadora, tarea: (typeof tareas)[number]) => void
      }) => {
        for (const tarea of tareas) {
          const resultado: ResultadoCalculadora = {
            calculadora: tarea.calculadora as ResultadoCalculadora['calculadora'],
            ojo: tarea.ojo,
            estado: 'SUCCESS',
            obtenidoEn: '2026-09-15T10:00:00.000Z',
            opciones: [{ esfera: 21, recomendada: true }],
            recomendada: { esfera: 21, recomendada: true },
          }
          alTerminarUna(resultado, tarea)
        }
        return []
      },
    ),
  }
})

const { prepararCarpetas } = await import('./almacen.js')
const { ServicioCasos } = await import('./servicio-casos.js')

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-generar-pdf-'))
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

function servicioDePrueba(): InstanceType<typeof ServicioCasos> {
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raizTemporal()),
    proveedor: { nombre: 'test', puedeCon: () => false, extraer: () => Promise.reject(new Error('no usado')) },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-15T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('generarPdf — no saca un PDF vacío de un ojo que nunca se calculó', () => {
  it('con datos en los dos ojos pero solo OD calculado, solo sale el PDF de OD', async () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente De Prueba', nombreCirujano: 'Dra. Prueba' })

    // Los dos ojos tienen datos de biometría (p. ej. de una foto cargada),
    // pero solo se pide calcular OD.
    servicio.editarMedida('OD', 'AL', 24.0)
    servicio.editarMedida('OS', 'AL', 24.3)

    await servicio.calcular(['KANE'], { ojo: 'OD' })

    const caso = servicio.obtener()!
    expect(caso.resultados['KANE:OD:Principal']).toBeDefined()
    expect(caso.resultados['KANE:OS:Principal']).toBeUndefined()

    const { rutas } = await servicio.generarPdf()

    expect(rutas).toHaveLength(1)
    expect(rutas[0]?.ojo).toBe('OD')
  })

  it('con los dos ojos calculados, salen los dos PDF de siempre', async () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente De Prueba', nombreCirujano: 'Dra. Prueba' })

    servicio.editarMedida('OD', 'AL', 24.0)
    servicio.editarMedida('OS', 'AL', 24.3)

    await servicio.calcular(['KANE'])

    const { rutas } = await servicio.generarPdf()

    expect(rutas.map((r) => r.ojo).sort()).toEqual(['OD', 'OS'])
  })

  // Un caso sin ningún resultado —nadie ha pulsado «Calcular» todavía— no
  // es «un ojo que se dejó fuera a propósito»: es, sencillamente, un PDF
  // pedido antes de calcular. Sin esta comprobación, la primera versión de
  // este arreglo (15/09/2026) excluía TODOS los ojos cuando ninguno tenía
  // resultados, dejando `generarPdf()` sin sacar ningún PDF — rotura real
  // encontrada al pasar la suite completa de interfaz.
  it('sin haber calculado nada todavía, sigue saliendo un PDF por cada ojo con datos', async () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente De Prueba', nombreCirujano: 'Dra. Prueba' })

    servicio.editarMedida('OD', 'AL', 24.0)
    servicio.editarMedida('OS', 'AL', 24.3)

    const { rutas } = await servicio.generarPdf()

    expect(rutas.map((r) => r.ojo).sort()).toEqual(['OD', 'OS'])
  })
})
