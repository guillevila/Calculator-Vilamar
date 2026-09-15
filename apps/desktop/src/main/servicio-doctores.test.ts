/**
 * La agenda de doctores (D80, 15/09/2026): añadir, editar, borrar, y que
 * sobreviva a un reinicio (se guarda en disco igual que un caso).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioDoctores } from './servicio-doctores.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-doctores-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioDoctores {
  let contador = 0
  return new ServicioDoctores({
    carpetas: prepararCarpetas(raizTemporal()),
    nuevoId: () => `doctor-${++contador}`,
  })
}

describe('ServicioDoctores', () => {
  it('empieza vacío', () => {
    expect(servicioDePrueba().listar()).toEqual([])
  })

  it('añade un doctor nuevo sin id, con su SIA y su eje', () => {
    const servicio = servicioDePrueba()
    const siguientes = servicio.guardar({ nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 })
    expect(siguientes).toEqual([
      { id: 'doctor-1', nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 },
    ])
  })

  it('un doctor sin SIA ni eje se guarda con esos dos campos en null', () => {
    const servicio = servicioDePrueba()
    const [doctor] = servicio.guardar({ nombre: 'Dr. Ruiz', sia: null, ejeIncision: null })
    expect(doctor?.sia).toBeNull()
    expect(doctor?.ejeIncision).toBeNull()
  })

  it('editar (con id) sustituye al doctor, no lo duplica', () => {
    const servicio = servicioDePrueba()
    const [creado] = servicio.guardar({ nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 })
    const siguientes = servicio.guardar({
      id: creado?.id,
      nombre: 'Dra. López',
      sia: 0.4,
      ejeIncision: 100,
    })
    expect(siguientes).toHaveLength(1)
    expect(siguientes[0]).toEqual({
      id: creado?.id,
      nombre: 'Dra. López',
      sia: 0.4,
      ejeIncision: 100,
    })
  })

  it('rechaza un nombre vacío', () => {
    const servicio = servicioDePrueba()
    expect(() => servicio.guardar({ nombre: '   ', sia: null, ejeIncision: null })).toThrow()
  })

  it('eliminar quita al doctor de la lista', () => {
    const servicio = servicioDePrueba()
    const [creado] = servicio.guardar({ nombre: 'Dr. Ruiz', sia: null, ejeIncision: null })
    expect(creado).toBeDefined()
    const siguientes = servicio.eliminar(creado!.id)
    expect(siguientes).toEqual([])
  })

  it('se ordena alfabéticamente, no por orden de creación', () => {
    const servicio = servicioDePrueba()
    servicio.guardar({ nombre: 'Zamora', sia: null, ejeIncision: null })
    servicio.guardar({ nombre: 'Álvarez', sia: null, ejeIncision: null })
    expect(servicio.listar().map((d) => d.nombre)).toEqual(['Álvarez', 'Zamora'])
  })

  it('sobrevive a una segunda instancia sobre la misma carpeta (persistencia real)', () => {
    const raiz = raizTemporal()
    const carpetasPrueba = prepararCarpetas(raiz)
    let contador = 0
    const primero = new ServicioDoctores({
      carpetas: carpetasPrueba,
      nuevoId: () => `d${++contador}`,
    })
    primero.guardar({ nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 })

    const segundo = new ServicioDoctores({
      carpetas: carpetasPrueba,
      nuevoId: () => `d${++contador}`,
    })
    expect(segundo.listar()).toEqual([
      { id: 'd1', nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 },
    ])
  })
})
