/**
 * Pruebas del almacén de capturas.
 *
 * Lo importante: una captura se guarda y se relee byte a byte, y no releer
 * una que no existe no puede lanzar — el informe tiene que poder seguir sin
 * ella (ver plantilla.ts, hoja «no se pudo guardar la captura»).
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { crearAlmacenCapturas } from './capturas.js'

function carpetaTemporal(): string {
  return mkdtempSync(join(tmpdir(), 'vilamar-capturas-'))
}

describe('crearAlmacenCapturas', () => {
  it('guarda una captura y la relee byte a byte por su id', async () => {
    const almacen = crearAlmacenCapturas(carpetaTemporal())
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

    const id = await almacen.guardar({ calculadora: 'EVO_TORIC', ojo: 'OD', png })
    const releida = almacen.leer(id)

    expect(releida).toEqual(png)
  })

  it('el id incluye la calculadora y el ojo, para poder identificarla a simple vista', async () => {
    const almacen = crearAlmacenCapturas(carpetaTemporal())
    const id = await almacen.guardar({
      calculadora: 'KANE',
      ojo: 'OS',
      png: new Uint8Array([1]),
    })
    expect(id.toLowerCase()).toContain('kane')
    expect(id.toLowerCase()).toContain('os')
  })

  it('leer un id que no existe devuelve null, no lanza', () => {
    const almacen = crearAlmacenCapturas(carpetaTemporal())
    expect(almacen.leer('no-existe')).toBeNull()
  })

  it('el fichero de metadatos no lleva ningún dato identificativo del paciente', async () => {
    const carpeta = carpetaTemporal()
    const almacen = crearAlmacenCapturas(carpeta)
    const id = await almacen.guardar({
      calculadora: 'BARRETT_TORIC',
      ojo: 'OD',
      png: new Uint8Array([1]),
    })
    const metadatos = readFileSync(join(carpeta, `${id}.json`), 'utf8').toLowerCase()
    for (const prohibido of ['fecha de nacimiento', 'nhc', 'apellidos', 'dni', 'nombre']) {
      expect(metadatos).not.toContain(prohibido)
    }
  })
})
