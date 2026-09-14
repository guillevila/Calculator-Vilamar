/**
 * proveedor.test.ts — El OCR no corrige el giro por su cuenta (D59, 02/09/2026).
 *
 * Una foto de móvil torcida, o subida de lado, sale con el texto ilegible.
 * Lo que se prueba aquí es la DECISIÓN de cuándo probar a girar —solo si la
 * primera lectura ya sale poco fiable— y que se elige la mejor de las
 * cuatro, sin tocar el caso normal (foto bien orientada) con trabajo de más.
 */

import { describe, expect, it } from 'vitest'

import type { DocumentoEntrada } from '@vilamar/extraction'

import type { PiezasProveedor } from './proveedor.js'
import { ProveedorDocumentos, UMBRAL_FIABILIDAD_BAJA } from './proveedor.js'
import type { Rasterizador } from './rasterizador.js'

function documentoImagen(): DocumentoEntrada {
  return { id: 'd1', formato: 'jpg', datos: new Uint8Array([1, 2, 3]), nombre: 'foto.jpg' }
}

/** Una imagen «preparada» distinta por cada giro, para poder distinguirlas. */
function marcador(grados: number): Uint8Array {
  return new Uint8Array([grados])
}

interface Config {
  /** Fiabilidad de cada orientación, indexada por grados: 0, 90, 180, 270. */
  readonly fiabilidadPorGiro: Partial<Record<number, number>>
}

function piezasDePrueba(config: Config): {
  piezas: PiezasProveedor
  giros: number[]
} {
  const giros: number[] = []

  const rasterizador: Rasterizador = {
    rasterizar: () => Promise.resolve(marcador(0)),
    prepararParaOcr: () => Promise.resolve(marcador(0)),
    rotar: (_imagen, grados) => {
      giros.push(grados)
      return Promise.resolve(marcador(grados))
    },
    cerrar: () => Promise.resolve(),
  }

  const piezas: PiezasProveedor = {
    lectorPdf: {
      leer: () => Promise.resolve([]),
      rasterizar: () => Promise.resolve(marcador(0)),
      numeroDePaginas: () => Promise.resolve(1),
    },
    motorOcr: {
      nombre: 'motor de prueba',
      reconocer: (imagen) => {
        // El «grados» de la imagen es su único byte, puesto por el marcador.
        const grados = imagen[0] ?? 0
        const confianzaMedia = config.fiabilidadPorGiro[grados] ?? 0
        return Promise.resolve({ texto: `leído a ${grados}°`, bloques: [], confianzaMedia })
      },
    },
    rasterizador,
  }

  return { piezas, giros }
}

describe('el OCR no corrige el giro solo: se prueba solo cuando hace falta (D59)', () => {
  it('una foto bien orientada no prueba ningún giro — no hay trabajo de más', async () => {
    const { piezas, giros } = piezasDePrueba({ fiabilidadPorGiro: { 0: 0.95 } })
    const proveedor = new ProveedorDocumentos(piezas)

    const r = await proveedor.extraer(documentoImagen())

    expect(r.confianzaMedia).toBe(0.95)
    expect(giros).toEqual([])
    expect(r.avisos.some((a) => a.includes('girada'))).toBe(false)
  })

  it('con la primera lectura poco fiable, prueba los tres giros y elige el mejor', async () => {
    const { piezas, giros } = piezasDePrueba({
      fiabilidadPorGiro: { 0: 0.1, 90: 0.2, 180: 0.97, 270: 0.3 },
    })
    const proveedor = new ProveedorDocumentos(piezas)

    const r = await proveedor.extraer(documentoImagen())

    expect(giros).toEqual([90, 180, 270])
    expect(r.confianzaMedia).toBe(0.97)
    expect(r.paginas[0]?.texto).toBe('leído a 180°')
    expect(r.avisos.some((a) => a.includes('girada') && a.includes('180'))).toBe(true)
  })

  it('si ningún giro mejora la lectura, se queda con la original sin girar', async () => {
    const { piezas, giros } = piezasDePrueba({
      fiabilidadPorGiro: { 0: 0.3, 90: 0.1, 180: 0.05, 270: 0.2 },
    })
    const proveedor = new ProveedorDocumentos(piezas)

    const r = await proveedor.extraer(documentoImagen())

    expect(giros).toEqual([90, 180, 270])
    expect(r.confianzaMedia).toBe(0.3)
    expect(r.paginas[0]?.texto).toBe('leído a 0°')
    expect(r.avisos.some((a) => a.includes('girada'))).toBe(false)
    expect(r.avisos.some((a) => a.includes('poca fiabilidad'))).toBe(true)
  })

  it('el umbral que decide si se prueba a girar es el mismo que avisa de poca fiabilidad', async () => {
    const { piezas, giros } = piezasDePrueba({
      fiabilidadPorGiro: { 0: UMBRAL_FIABILIDAD_BAJA },
    })
    const proveedor = new ProveedorDocumentos(piezas)

    await proveedor.extraer(documentoImagen())

    // Justo en el umbral: ya se considera fiable, no hace falta probar a girar.
    expect(giros).toEqual([])
  })
})
