/**
 * La bandeja de casos (D81, 15/09/2026): crear, editar, vincular a un
 * caso, marcar como enviado, borrar — y que sobreviva a un reinicio.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioBandeja } from './servicio-bandeja.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-bandeja-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioBandeja {
  let contador = 0
  return new ServicioBandeja({
    carpetas: prepararCarpetas(raizTemporal()),
    nuevoId: () => `entrada-${++contador}`,
    ahora: () => new Date('2026-09-15T10:00:00.000Z'),
  })
}

describe('ServicioBandeja', () => {
  it('empieza vacía', () => {
    expect(servicioDePrueba().listar()).toEqual([])
  })

  it('crea una entrada nueva, sin caso vinculado ni enviar todavía', () => {
    const servicio = servicioDePrueba()
    const [entrada] = servicio.crear({
      delegado: 'Delegado Norte',
      descripcion: 'Paciente de prueba',
      prioridad: 'URGENTE',
      notas: 'Llamó dos veces',
    })
    expect(entrada).toEqual({
      id: 'entrada-1',
      delegado: 'Delegado Norte',
      descripcion: 'Paciente de prueba',
      prioridad: 'URGENTE',
      notas: 'Llamó dos veces',
      creadoEn: '2026-09-15T10:00:00.000Z',
      casoCodigo: null,
      enviado: false,
      rutaFoto: null,
    })
  })

  it('rechaza una entrada sin delegado', () => {
    const servicio = servicioDePrueba()
    expect(() =>
      servicio.crear({ delegado: '  ', descripcion: '', prioridad: 'NORMAL', notas: '' }),
    ).toThrow()
  })

  it('la lista sale ya ordenada por prioridad', () => {
    const servicio = servicioDePrueba()
    servicio.crear({ delegado: 'A', descripcion: '', prioridad: 'BAJA', notas: '' })
    servicio.crear({ delegado: 'B', descripcion: '', prioridad: 'URGENTE', notas: '' })
    expect(servicio.listar().map((e) => e.delegado)).toEqual(['B', 'A'])
  })

  it('editar cambia solo los campos que se pasan', () => {
    const servicio = servicioDePrueba()
    const [creada] = servicio.crear({
      delegado: 'Delegado Norte',
      descripcion: 'Paciente A',
      prioridad: 'NORMAL',
      notas: '',
    })
    const [editada] = servicio.editar(creada!.id, { prioridad: 'URGENTE' })
    expect(editada?.prioridad).toBe('URGENTE')
    expect(editada?.descripcion).toBe('Paciente A')
  })

  it('vincularCaso engancha el código del caso real', () => {
    const servicio = servicioDePrueba()
    const [creada] = servicio.crear({
      delegado: 'Delegado Norte',
      descripcion: '',
      prioridad: 'NORMAL',
      notas: '',
    })
    const [vinculada] = servicio.vincularCaso(creada!.id, 'CV-2026-0007')
    expect(vinculada?.casoCodigo).toBe('CV-2026-0007')
  })

  it('marcarEnviado la manda al final de la lista, aunque sea urgente', () => {
    const servicio = servicioDePrueba()
    const [urgente] = servicio.crear({
      delegado: 'Urgente',
      descripcion: '',
      prioridad: 'URGENTE',
      notas: '',
    })
    servicio.crear({ delegado: 'Normal', descripcion: '', prioridad: 'NORMAL', notas: '' })
    const siguientes = servicio.marcarEnviado(urgente!.id, true)
    expect(siguientes.map((e) => e.delegado)).toEqual(['Normal', 'Urgente'])
    expect(siguientes[1]?.enviado).toBe(true)
  })

  it('eliminar quita la entrada de la lista', () => {
    const servicio = servicioDePrueba()
    const [creada] = servicio.crear({
      delegado: 'Delegado Norte',
      descripcion: '',
      prioridad: 'NORMAL',
      notas: '',
    })
    expect(servicio.eliminar(creada!.id)).toEqual([])
  })

  it('editar/vincular/eliminar sobre una entrada que ya no existe, falla en vez de crear una nueva', () => {
    const servicio = servicioDePrueba()
    expect(() => servicio.editar('no-existe', { prioridad: 'BAJA' })).toThrow()
    expect(() => servicio.vincularCaso('no-existe', 'CV-2026-0007')).toThrow()
  })

  it('sobrevive a una segunda instancia sobre la misma carpeta (persistencia real)', () => {
    const raiz = raizTemporal()
    const carpetasPrueba = prepararCarpetas(raiz)
    let contador = 0
    const primero = new ServicioBandeja({
      carpetas: carpetasPrueba,
      nuevoId: () => `e${++contador}`,
      ahora: () => new Date('2026-09-15T10:00:00.000Z'),
    })
    primero.crear({ delegado: 'Delegado Norte', descripcion: '', prioridad: 'NORMAL', notas: '' })

    const segundo = new ServicioBandeja({
      carpetas: carpetasPrueba,
      nuevoId: () => `e${++contador}`,
      ahora: () => new Date('2026-09-15T10:00:00.000Z'),
    })
    expect(segundo.listar()).toHaveLength(1)
  })
})
