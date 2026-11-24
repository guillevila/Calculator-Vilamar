import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import type { FilaTracker, ResultadoTracker } from '@vilamar/domain'
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

const FILA: FilaTracker = {
  nombrePaciente: 'Paciente Sintético',
  codigo: 'CV-2026-0001',
  doctor: 'Dra. Prueba',
  aparato: 'ZEISS IOLMaster 700',
  sexo: 'Female',
  od: {
    kPlana: 43.25,
    ejeKPlana: 10,
    kCurva: 44.75,
    ejeKCurva: 100,
    longitudAxial: 23.5,
    acd: 3.1,
    cct: 540,
    pkPlana: -6.1,
    objetivo: -0.25,
  },
  lenteOd: { nombre: 'B&L LuxSmart', esfera: 22.5, cilindro: 1.5, eje: 91 },
}

const RESULTADO: ResultadoTracker = { filas: [FILA], casosConAparatosOmitidos: 0 }
const SIN_FILAS: ResultadoTracker = { filas: [], casosConAparatosOmitidos: 0 }

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

describe('libroDeEstudio — formato del LuxLife Experience Tracker', () => {
  const GENERADO = '2026-11-24T10:00:00.000Z'

  it('lleva la identificación, el preoperatorio y la lente elegida, con las cabeceras de la plantilla', () => {
    const z = leerZip(libroDeEstudio(RESULTADO, ['Doctor: Dra. Prueba'], GENERADO))
    const hoja = z['xl/worksheets/sheet1.xml']!
    expect(hoja).toContain('Paciente Sintético')
    expect(hoja).toContain('CV-2026-0001')
    expect(hoja).toContain('ZEISS IOLMaster 700')
    expect(hoja).toContain('Preoperative data')
    expect(hoja).toContain('Operative data')
    expect(hoja).toContain('Pre-Op Flat K')
    expect(hoja).toContain('Pre-Op Posterior Steep K')
    expect(hoja).toContain('IOL spherical power (D)')
    expect(hoja).toContain('IOL cylinder power (D)')
    expect(hoja).toContain('IOL axis (°)')
    expect(hoja).toContain('Postoperative week 1')
    expect(hoja).toContain('Postoperative Month 6')
    expect(hoja).toContain('<v>23.5</v>')
    expect(hoja).toContain('<v>22.5</v>')
    expect(z['xl/worksheets/sheet2.xml']).toContain('Dra. Prueba')
  })

  it('no lleva ninguna calculadora ni lentes estimadas', () => {
    const hoja = leerZip(libroDeEstudio(RESULTADO, [], GENERADO))['xl/worksheets/sheet1.xml']!
    for (const nombre of ['Kane', 'KANE', 'EVO', 'Barrett', 'BARRETT', 'estimad']) {
      expect(hoja).not.toContain(nombre)
    }
  })

  it('la diferencia entre K plana y curva es una fórmula, con su resultado ya puesto', () => {
    const hoja = leerZip(libroDeEstudio(RESULTADO, [], GENERADO))['xl/worksheets/sheet1.xml']!
    expect(hoja).toMatch(
      /<f>IF\(OR\([A-Z]+7=&quot;&quot;,[A-Z]+7=&quot;&quot;\),&quot;&quot;,ABS\([A-Z]+7-[A-Z]+7\)\)<\/f><v>1\.5<\/v>/,
    )
  })

  it('un dato ausente queda vacío, no a cero', () => {
    const sinK = { filas: [{ ...FILA, od: { longitudAxial: 23.5 } }], casosConAparatosOmitidos: 0 }
    const hoja = leerZip(libroDeEstudio(sinK, [], GENERADO))['xl/worksheets/sheet1.xml']!
    expect(hoja).not.toContain('<v>0</v>')
  })

  it('las listas desplegables de sexo y de «Include» están', () => {
    const hoja = leerZip(libroDeEstudio(RESULTADO, [], GENERADO))['xl/worksheets/sheet1.xml']!
    expect(hoja).toContain('<formula1>"Male,Female"</formula1>')
    expect(hoja).toContain('<formula1>"Yes,No"</formula1>')
  })

  it('con dos aparatos hay dos filas; si hay aparatos de más, las notas lo dicen', () => {
    const dos = {
      filas: [FILA, { ...FILA, aparato: 'OCULUS Pentacam' }],
      casosConAparatosOmitidos: 1,
    }
    const z = leerZip(libroDeEstudio(dos, [], GENERADO))
    expect(z['xl/worksheets/sheet1.xml']).toContain('OCULUS Pentacam')
    expect(z['xl/worksheets/sheet2.xml']).toContain('más de dos aparatos')
  })

  it('sin filas, el libro se crea igual (solo cabeceras y notas)', () => {
    expect(() => libroDeEstudio(SIN_FILAS, [], GENERADO)).not.toThrow()
  })

  it('guardado en disco es un zip válido', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'vilamar-xlsx-'))
    carpetas.push(raiz)
    const destino = join(raiz, 'estudio.xlsx')
    writeFileSync(destino, libroDeEstudio(RESULTADO, [], GENERADO))
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
