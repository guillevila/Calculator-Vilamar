import { describe, expect, it } from 'vitest'

import type { EntradaBandeja } from './bandeja.js'
import { ordenarBandeja } from './bandeja.js'

function entrada(datos: Partial<EntradaBandeja> & { id: string }): EntradaBandeja {
  return {
    delegado: 'Delegado de prueba',
    descripcion: '',
    prioridad: 'NORMAL',
    notas: '',
    creadoEn: '2026-09-15T10:00:00.000Z',
    casoCodigo: null,
    enviado: false,
    rutaFoto: null,
    ...datos,
  }
}

describe('ordenarBandeja', () => {
  it('URGENTE va antes que NORMAL, y NORMAL antes que BAJA', () => {
    const orden = ordenarBandeja([
      entrada({ id: 'baja', prioridad: 'BAJA' }),
      entrada({ id: 'urgente', prioridad: 'URGENTE' }),
      entrada({ id: 'normal', prioridad: 'NORMAL' }),
    ])
    expect(orden.map((e) => e.id)).toEqual(['urgente', 'normal', 'baja'])
  })

  it('a igual prioridad, quien llegó antes va primero (FIFO)', () => {
    const orden = ordenarBandeja([
      entrada({ id: 'segundo', creadoEn: '2026-09-15T11:00:00.000Z' }),
      entrada({ id: 'primero', creadoEn: '2026-09-15T09:00:00.000Z' }),
    ])
    expect(orden.map((e) => e.id)).toEqual(['primero', 'segundo'])
  })

  it('lo enviado va siempre al final, aunque sea URGENTE', () => {
    const orden = ordenarBandeja([
      entrada({ id: 'urgente-enviado', prioridad: 'URGENTE', enviado: true }),
      entrada({ id: 'baja-pendiente', prioridad: 'BAJA' }),
    ])
    expect(orden.map((e) => e.id)).toEqual(['baja-pendiente', 'urgente-enviado'])
  })

  it('no muta la lista original', () => {
    const original = [
      entrada({ id: 'a', prioridad: 'BAJA' }),
      entrada({ id: 'b', prioridad: 'URGENTE' }),
    ]
    const copia = [...original]
    ordenarBandeja(original)
    expect(original).toEqual(copia)
  })
})
