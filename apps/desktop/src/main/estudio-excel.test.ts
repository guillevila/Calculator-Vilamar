import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import type { FilaEstudio } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { descripcionDeFiltro, libroDeEstudio } from './estudio-excel.js'
import { crearXlsx, letraDeColumna } from './xlsx.js'

const carpetas: string[] = []
afterEach(() => {
  while (carpetas.length > 0) rmSync(carpetas.pop()!, { recursive: true, force: true })
})

/** Lee un zip sin comprimir (o deflate) y devuelve nombre → texto. */
function leerZip(datos: Uint8Array): Record<string, string> {
  const b = Buffer.from(datos)
  const salida: Record<string, string> = {}
  let fin = b.length - 22
  while (fin > 0 && b.readUInt32LE(fin) !== 0x06054b50) fin -= 1
  const total = b.readUInt16LE(fin + 10)
  let p = b.readUInt32LE(fin + 16)
  for (let i = 0; i < total; i += 1) {
    const metodo = b.readUInt16LE(p + 10)
    const tamano = b.readUInt32LE(p + 20)
    const nombreLen = b.readUInt16LE(p + 28)
    const extraLen = b.readUInt16LE(p + 30)
    const comentarioLen = b.readUInt16LE(p + 32)
    const desplazamiento = b.readUInt32LE(p + 42)
    const nombre = b.subarray(p + 46, p + 46 + nombreLen).toString('utf8')
    const localNombre = b.readUInt16LE(desplazamiento + 26)
    const localExtra = b.readUInt16LE(desplazamiento + 28)
    const ini = desplazamiento + 30 + localNombre + localExtra
    const crudo = b.subarray(ini, ini + tamano)
    salida[nombre] = (metodo === 8 ? inflateRawSync(crudo) : crudo).toString('utf8')
    p += 46 + nombreLen + extraLen + comentarioLen
  }
  return salida
}

const FILA: FilaEstudio = {
  nombrePaciente: 'Paciente Sintético',
  codigo: 'CV-2026-0001',
  fecha: '2026-09-15',
  doctor: 'Dra. Prueba',
  ojo: 'OD',
  aparato: 'ZEISS IOLMaster 700',
  longitudAxial: 23.5,
  k1: 43.25,
  ejeK1: 10,
  k2: 44.75,
  ejeK2: 100,
  tipoDeLente: 'B&L LuxSmart',
  lentes: {
    KANE: { esfera: 22.5, cilindro: 2.5, eje: 91, residualEsferico: -0.1, residualCilindrico: 0.2 },
    BARRETT_TORIC: { esfera: 22, residualEsferico: 0.1 },
  },
}

describe('xlsx', () => {
  it('letraDeColumna', () => {
    expect([0, 25, 26, 27, 701, 702].map(letraDeColumna)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ])
  })

  it('escribe un zip con las partes de un libro y escapa el texto', () => {
    const z = leerZip(
      crearXlsx([
        { nombre: 'Hoja: 1/2', filas: [[{ v: 'a<b & "c"' }, { v: 1.5, e: { formato: '0.00' } }]] },
      ]),
    )
    expect(Object.keys(z)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/styles.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    )
    expect(z['xl/worksheets/sheet1.xml']).toContain('a&lt;b &amp; &quot;c&quot;')
    expect(z['xl/workbook.xml']).toContain('name="Hoja  1 2"')
  })
})

describe('libroDeEstudio', () => {
  it('lleva paciente, preoperatorio y un bloque por calculadora con resultado', () => {
    const z = leerZip(libroDeEstudio([FILA], ['Doctor: Dra. Prueba'], '2026-10-21T10:00:00.000Z'))
    const hoja = z['xl/worksheets/sheet1.xml']!
    expect(hoja).toContain('Paciente Sintético')
    expect(hoja).toContain('PREOPERATORIO')
    expect(hoja).toContain('Longitud axial (mm)')
    expect(hoja).toContain('KANE')
    expect(hoja).toContain('BARRETT TORIC')
    expect(hoja).not.toContain('EVO TORIC') // sin resultado: no hay bloque
    expect(hoja).toContain('<v>23.5</v>')
    expect(z['xl/worksheets/sheet2.xml']).toContain('Dra. Prueba')
  })

  it('un dato ausente queda vacío, no a cero', () => {
    const z = leerZip(libroDeEstudio([{ ...FILA, k2: undefined }], [], '2026-10-21T10:00:00.000Z'))
    expect(z['xl/worksheets/sheet1.xml']).not.toContain('<v>0</v>')
  })

  it('sin filas, el libro se crea igual (solo cabeceras y notas)', () => {
    expect(() => libroDeEstudio([], [], '2026-10-21T10:00:00.000Z')).not.toThrow()
  })

  it('guardado en disco es un zip válido', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'vilamar-xlsx-'))
    carpetas.push(raiz)
    const destino = join(raiz, 'estudio.xlsx')
    writeFileSync(destino, libroDeEstudio([FILA], [], '2026-10-21T10:00:00.000Z'))
    expect(readFileSync(destino).subarray(0, 2).toString()).toBe('PK')
  })
})

describe('descripcionDeFiltro', () => {
  it('sin filtros lo dice; con ellos, uno por línea', () => {
    const op = { doctores: [], lentes: [{ clave: 'k', etiqueta: 'LuxSmart' }] }
    expect(descripcionDeFiltro({}, op)[0]).toContain('ninguno')
    expect(
      descripcionDeFiltro({ rango: { desde: '2026-01-01' }, lente: 'k', doctor: 'Dra. X' }, op),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Fechas'),
        'Doctor: Dra. X',
        'Lente: LuxSmart',
      ]),
    )
  })
})
