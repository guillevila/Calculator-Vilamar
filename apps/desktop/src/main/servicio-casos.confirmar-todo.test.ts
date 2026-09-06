/**
 * Reproducción del fallo reportado por el dueño (06/09/2026): un caso real
 * con 34 datos de un Heidelberg ANTERION, tras pulsar «Confirmar todo»,
 * queda con todos los campos en blanco.
 *
 * El test de e2e existente para D70 solo prueba UN campo derivado con el
 * aparato por defecto (`APARATO_PRINCIPAL`) — este reproduce el caso real:
 * muchos campos, en un aparato con nombre propio (no el principal).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ojoDe } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-confirmar-todo-'))
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
    ahora: () => new Date('2026-09-06T10:00:00.000Z'),
    abrirNavegador: () => Promise.reject(new Error('no usado')),
    imprimirPdf: () => Promise.reject(new Error('no usado')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('confirmarTodoElOjo — reproducción del caso real (aparato con nombre propio, muchos campos)', () => {
  it('no borra los datos del dataset al confirmarlo de golpe', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({ nombrePaciente: 'Paciente De Prueba' })

    const aparato = 'Heidelberg ANTERION'
    const valores: Record<string, number> = {
      AL: 23.45,
      K1: 43.1,
      K1_EJE: 10,
      K2: 44.2,
      K2_EJE: 100,
      ACD: 3.1,
      AQD: 3.6,
      LT: 4.5,
      CCT: 540,
      WTW: 11.8,
    } as const

    for (const [campo, valor] of Object.entries(valores)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      servicio.editarMedida('OD', campo as any, valor, aparato)
    }

    const antes = ojoDe(servicio.obtener()!, 'OD', aparato)
    for (const campo of Object.keys(valores)) {
      expect(antes.medidas[campo as keyof typeof antes.medidas]?.valor).toBeDefined()
    }

    const resultado = servicio.confirmarTodoElOjo('OD', aparato)
    const despues = ojoDe(resultado, 'OD', aparato)

    for (const [campo, valor] of Object.entries(valores)) {
      const m = despues.medidas[campo as keyof typeof despues.medidas]
      expect(m?.valor, `el campo ${campo} ha desaparecido tras confirmar todo`).toBe(valor)
      expect(m?.confirmadoPorUsuario, `el campo ${campo} no quedó confirmado`).toBe(true)
    }
  })
})
