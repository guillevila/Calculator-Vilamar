import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioLaboratorios } from './servicio-laboratorios.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-laboratorios-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioLaboratorios {
  let n = 0
  return new ServicioLaboratorios({
    carpetas: prepararCarpetas(raizTemporal()),
    nuevoId: () => `id-${++n}`,
  })
}

describe('ServicioLaboratorios', () => {
  it('empieza vacío, y guarda uno nuevo sin id', () => {
    const servicio = servicioDePrueba()
    expect(servicio.listar()).toEqual([])
    const siguientes = servicio.guardar({ fabricante: 'Bausch & Lomb', email: 'pedidos@bl.com' })
    expect(siguientes).toEqual([
      { id: 'id-1', fabricante: 'Bausch & Lomb', email: 'pedidos@bl.com' },
    ])
  })

  it('con id, edita el existente en vez de añadir uno nuevo', () => {
    const servicio = servicioDePrueba()
    servicio.guardar({ fabricante: 'Alcon', email: 'viejo@alcon.com' })
    const [creado] = servicio.listar()
    servicio.guardar({ id: creado!.id, fabricante: 'Alcon', email: 'nuevo@alcon.com' })
    expect(servicio.listar()).toEqual([
      { id: creado!.id, fabricante: 'Alcon', email: 'nuevo@alcon.com' },
    ])
  })

  it('elimina por id', () => {
    const servicio = servicioDePrueba()
    servicio.guardar({ fabricante: 'Alcon', email: 'a@alcon.com' })
    const [creado] = servicio.listar()
    expect(servicio.eliminar(creado!.id)).toEqual([])
  })

  it('rechaza fabricante o email vacíos', () => {
    const servicio = servicioDePrueba()
    expect(() => servicio.guardar({ fabricante: '', email: 'a@a.com' })).toThrow()
    expect(() => servicio.guardar({ fabricante: 'Alcon', email: '' })).toThrow()
  })

  it('ordena alfabéticamente por fabricante', () => {
    const servicio = servicioDePrueba()
    servicio.guardar({ fabricante: 'Zeiss', email: 'z@z.com' })
    servicio.guardar({ fabricante: 'Alcon', email: 'a@a.com' })
    expect(servicio.listar().map((l) => l.fabricante)).toEqual(['Alcon', 'Zeiss'])
  })

  it('emailDe busca sin distinguir mayúsculas ni espacios de sobra', () => {
    const servicio = servicioDePrueba()
    servicio.guardar({ fabricante: 'Bausch & Lomb', email: 'pedidos@bl.com' })
    expect(servicio.emailDe('  bausch & lomb  ')).toBe('pedidos@bl.com')
    expect(servicio.emailDe('Alcon')).toBeUndefined()
  })
})
