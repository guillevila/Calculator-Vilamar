/**
 * almacen.test.ts — `prepararCarpetas` deja elegir dónde van los informes
 * (D57, 01/09/2026), sin mover el resto de datos internos del programa.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { casoNuevo } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { guardarCaso, leerCaso, listarCasos, prepararCarpetas } from './almacen.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-almacen-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

describe('prepararCarpetas', () => {
  it('sin ruta de informes, los guarda junto al resto de datos internos, como siempre', () => {
    const raiz = raizTemporal()
    const c = prepararCarpetas(raiz)
    expect(c.informes).toBe(join(raiz, 'informes'))
    expect(c.casos).toBe(join(raiz, 'casos'))
  })

  it('con una ruta de informes propia, solo esa carpeta se mueve — el resto sigue en la de siempre', () => {
    const raiz = raizTemporal()
    const escritorio = raizTemporal()
    const rutaInformes = join(escritorio, 'Calculadora Vilamar', 'informes')
    const c = prepararCarpetas(raiz, rutaInformes)
    expect(c.informes).toBe(rutaInformes)
    expect(c.casos).toBe(join(raiz, 'casos'))
    expect(c.documentos).toBe(join(raiz, 'documentos'))
    expect(c.sesiones).toBe(join(raiz, 'sesion-navegador'))
  })

  it('crea de verdad la carpeta de informes, aunque esté fuera de la carpeta de datos', () => {
    const raiz = raizTemporal()
    const escritorio = raizTemporal()
    const rutaInformes = join(escritorio, 'Calculadora Vilamar', 'informes')
    const c = prepararCarpetas(raiz, rutaInformes)
    // `mkdtempSync` no crea `rutaInformes`: si `prepararCarpetas` no la
    // hubiera creado de verdad, esto lanzaría al intentar usarla.
    expect(() => mkdtempSync(join(c.informes, 'x'))).not.toThrow()
  })
})

/**
 * Volver a abrir un caso guardado (02/09/2026): antes de esto, `leerCaso` y
 * `listarCasos` ya existían en este fichero pero no los usaba nadie — no
 * había ni un test que comprobara que de verdad hacen un viaje de ida y
 * vuelta completo.
 */
describe('guardarCaso / leerCaso / listarCasos — el viaje de ida y vuelta', () => {
  it('un caso guardado se lee tal cual, byte a byte', () => {
    const carpetas = prepararCarpetas(raizTemporal())
    const original = casoNuevo('id-1', 'CV-2026-0001', '2026-09-02T10:00:00.000Z')
    guardarCaso(carpetas, original)
    expect(leerCaso(carpetas, 'CV-2026-0001')).toEqual(original)
  })

  it('un código que no existe no lanza: devuelve null', () => {
    const carpetas = prepararCarpetas(raizTemporal())
    expect(leerCaso(carpetas, 'CV-2026-9999')).toBeNull()
  })

  it('listarCasos devuelve los códigos, más recientes primero', () => {
    const carpetas = prepararCarpetas(raizTemporal())
    guardarCaso(carpetas, casoNuevo('id-1', 'CV-2026-0001', '2026-09-01T10:00:00.000Z'))
    guardarCaso(carpetas, casoNuevo('id-2', 'CV-2026-0002', '2026-09-02T10:00:00.000Z'))
    expect(listarCasos(carpetas)).toEqual(['CV-2026-0002', 'CV-2026-0001'])
  })

  it('sin ningún caso guardado, no lanza: devuelve una lista vacía', () => {
    const carpetas = prepararCarpetas(raizTemporal())
    expect(listarCasos(carpetas)).toEqual([])
  })
})
