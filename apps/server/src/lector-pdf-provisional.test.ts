/**
 * lector-pdf-provisional.test.ts — Prueba lo que no necesita un PDF real:
 * qué formatos rechaza y qué pasa con un PDF corrupto. La lectura de texto
 * de verdad reutiliza `pdfjs-dist` y `reconstruirLineas`, que ya están
 * probados donde viven de verdad (esta versión es provisional — ver la
 * cabecera de `lector-pdf-provisional.ts`).
 */

import { describe, expect, it } from 'vitest'

import { ProveedorPdfProvisional } from './lector-pdf-provisional.js'

describe('ProveedorPdfProvisional', () => {
  const proveedor = new ProveedorPdfProvisional()

  it('puedeCon: solo PDF, nunca imágenes todavía', () => {
    expect(proveedor.puedeCon({ id: '1', nombre: 'a.pdf', formato: 'pdf', datos: new Uint8Array() })).toBe(
      true,
    )
    expect(proveedor.puedeCon({ id: '2', nombre: 'a.jpg', formato: 'jpg', datos: new Uint8Array() })).toBe(
      false,
    )
    expect(proveedor.puedeCon({ id: '3', nombre: 'a.png', formato: 'png', datos: new Uint8Array() })).toBe(
      false,
    )
  })

  it('extraer: una imagen sale con un aviso claro, no con datos vacíos sin explicar', async () => {
    const resultado = await proveedor.extraer({
      id: '1',
      nombre: 'foto.jpg',
      formato: 'jpg',
      datos: new Uint8Array([1, 2, 3]),
    })
    expect(resultado.paginas).toEqual([])
    expect(resultado.avisos).toHaveLength(1)
    expect(resultado.avisos[0]).toMatch(/todavía no sabe leer imágenes/)
  })

  it('extraer: un PDF corrupto sale con un aviso, no lanza', async () => {
    const resultado = await proveedor.extraer({
      id: '1',
      nombre: 'roto.pdf',
      formato: 'pdf',
      datos: new Uint8Array([1, 2, 3, 4, 5]),
    })
    expect(resultado.paginas).toEqual([])
    expect(resultado.avisos).toHaveLength(1)
    expect(resultado.avisos[0]).toMatch(/No se ha podido abrir el PDF/)
  })
})
