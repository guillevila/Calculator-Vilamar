import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { archivoEntranteDesdeSubida, estadoHttpDelError, mensajeDelError, rutaDescargaSegura } from './rutas.js'

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

describe('rutaDescargaSegura', () => {
  const raiz = join('C:', 'datos', 'usuarios', 'ana', 'informes')

  it('una ruta relativa normal, dentro de la raíz, se resuelve', () => {
    const ruta = rutaDescargaSegura(raiz, join('Dr. Pérez', 'Calculados', 'CV-2026-0001_OD.pdf'))
    expect(ruta).toBe(join(raiz, 'Dr. Pérez', 'Calculados', 'CV-2026-0001_OD.pdf'))
  })

  it('la raíz misma también es válida', () => {
    expect(rutaDescargaSegura(raiz, '.')).toBe(raiz)
  })

  it('un intento de salir de la raíz con «..» se rechaza', () => {
    expect(rutaDescargaSegura(raiz, join('..', '..', 'otro-usuario', 'informes', 'secreto.pdf'))).toBeNull()
  })

  it('una ruta absoluta de otra parte del disco también se rechaza', () => {
    expect(rutaDescargaSegura(raiz, join('C:', 'Windows', 'System32', 'cualquier-cosa'))).toBeNull()
  })

  it('una carpeta que solo COMPARTE PREFIJO con la raíz, sin ser parte de ella, se rechaza', () => {
    // "informes-otro-usuario" empieza igual que "informes" en texto, pero no es una subcarpeta.
    const ruta = rutaDescargaSegura(raiz, join('..', 'informes-otro-usuario', 'archivo.pdf'))
    expect(ruta).toBeNull()
  })
})
