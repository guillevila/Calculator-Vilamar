/**
 * Pruebas del lector de `.env` del servidor.
 *
 * Importa porque el fallo aquí es invisible: si no lee el fichero, quien
 * pone ANTHROPIC_API_KEY en su `.env` sigue viendo que el servidor solo lee
 * PDF con texto, sin saber por qué. Un «no pasa nada» es peor que un error.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { analizarEnv, cargarEnv, rutasDeEnv } from './ajustes.js'

describe('analizar un .env', () => {
  it('lee pares normales', () => {
    expect(analizarEnv('UNO=1\nDOS=dos')).toEqual({ UNO: '1', DOS: 'dos' })
  })

  it('ignora comentarios y líneas vacías', () => {
    expect(analizarEnv('# un comentario\n\nA=1\n   \n#B=2')).toEqual({ A: '1' })
  })

  it('quita las comillas, sean del tipo que sean', () => {
    expect(analizarEnv('A="con espacios"\nB=\'otro\'')).toEqual({
      A: 'con espacios',
      B: 'otro',
    })
  })

  it('respeta los iguales que van dentro del valor', () => {
    expect(analizarEnv('K=sk-ant-abc==')).toEqual({ K: 'sk-ant-abc==' })
  })

  it('descarta líneas sin clave en vez de inventar una vacía', () => {
    expect(analizarEnv('=sinclave\nsinigual\nA=1')).toEqual({ A: '1' })
  })
})

describe('cargar el .env', () => {
  const puestas: string[] = []
  afterEach(() => {
    for (const k of puestas) delete process.env[k]
    puestas.length = 0
  })

  it('lo busca primero en la carpeta de datos y luego en la de trabajo', () => {
    const rutas = rutasDeEnv('C:\\datos')
    expect(rutas).toHaveLength(2)
    expect(rutas[0]).toContain('datos')
  })

  it('carga las variables y devuelve qué fichero ha usado', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'vilamar-server-env-'))
    writeFileSync(join(carpeta, '.env'), 'VILAMAR_PRUEBA_A=valor\n')
    puestas.push('VILAMAR_PRUEBA_A')

    const usado = cargarEnv(carpeta)
    expect(usado).toContain('.env')
    expect(process.env['VILAMAR_PRUEBA_A']).toBe('valor')
  })

  it('NO pisa una variable que ya venga del sistema', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'vilamar-server-env-'))
    writeFileSync(join(carpeta, '.env'), 'VILAMAR_PRUEBA_B=del-fichero\n')
    process.env['VILAMAR_PRUEBA_B'] = 'del-sistema'
    puestas.push('VILAMAR_PRUEBA_B')

    cargarEnv(carpeta)
    expect(process.env['VILAMAR_PRUEBA_B']).toBe('del-sistema')
  })

  it('sin fichero, devuelve null y no rompe nada', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'vilamar-server-env-vacia-'))
    expect(cargarEnv(carpeta)).toBeNull()
  })
})
