/**
 * rasterizador.test.ts — Reconocer el formato por los bytes, no por el nombre.
 *
 * Un `.jpeg` puede ser cualquier cosa, y quien lo sube no tiene por qué saberlo.
 * Mentirle al navegador sobre el formato es lo que hacía que un JPEG acabara en
 * «Error attempting to read image» dentro de tesseract.
 */

import { describe, expect, it } from 'vitest'

import { tipoDeImagen } from './rasterizador.js'

/** Cabeceras reales, cortas: solo los bytes que identifican el formato. */
const CABECERAS: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  'image/bmp': [0x42, 0x4d, 0x00, 0x00, 0x00, 0x00],
}

describe('reconocer el formato de una imagen', () => {
  for (const [esperado, bytes] of Object.entries(CABECERAS)) {
    it(`reconoce ${esperado}`, () => {
      expect(tipoDeImagen(new Uint8Array(bytes))).toBe(esperado)
    })
  }

  it('reconoce WEBP por su marca RIFF/WEBP', () => {
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
    expect(tipoDeImagen(new Uint8Array(webp))).toBe('image/webp')
  })

  it('reconoce HEIC, que es lo que hace un iPhone por defecto', () => {
    const heic = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]
    expect(tipoDeImagen(new Uint8Array(heic))).toBe('image/heic')
  })

  it('con algo que no reconoce, no se inventa un formato', () => {
    expect(tipoDeImagen(new Uint8Array([1, 2, 3, 4]))).toBe('application/octet-stream')
    expect(tipoDeImagen(new Uint8Array([]))).toBe('application/octet-stream')
  })

  it('no se fía de la extensión: un PNG llamado .jpeg se reconoce como PNG', () => {
    const png = CABECERAS['image/png'] as number[]
    expect(tipoDeImagen(new Uint8Array(png))).toBe('image/png')
  })
})
