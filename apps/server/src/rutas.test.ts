import { describe, expect, it } from 'vitest'

import { archivoEntranteDesdeSubida, estadoHttpDelError, mensajeDelError } from './rutas.js'

describe('archivoEntranteDesdeSubida', () => {
  it('convierte un fichero de multer en el ArchivoEntrante que espera cargarDocumentos', () => {
    const datos = new Uint8Array([1, 2, 3])
    const archivo = archivoEntranteDesdeSubida({ originalname: 'informe.pdf', buffer: datos })
    expect(archivo).toEqual({ nombre: 'informe.pdf', datos })
  })
})

describe('estadoHttpDelError', () => {
  it('un Error normal —lo que ServicioCasos rechaza a propósito— es un 400', () => {
    expect(estadoHttpDelError(new Error('el caso no tiene ojos con datos'))).toBe(400)
  })

  it('cualquier otra cosa lanzada es un 500', () => {
    expect(estadoHttpDelError('algo raro')).toBe(500)
    expect(estadoHttpDelError(undefined)).toBe(500)
  })
})

describe('mensajeDelError', () => {
  it('de un Error, su mensaje tal cual', () => {
    expect(mensajeDelError(new Error('ese doctor ya no está guardado'))).toBe(
      'ese doctor ya no está guardado',
    )
  })

  it('de cualquier otra cosa, un mensaje genérico — nunca expone lo lanzado tal cual', () => {
    expect(mensajeDelError('detalle interno')).toBe('Fallo inesperado del servidor.')
  })
})
