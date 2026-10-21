/**
 * xlsx.ts — Escritor mínimo de libros de Excel (.xlsx), sin dependencias.
 *
 * Un .xlsx es un zip de ficheros XML. Aquí se escribe lo justo para un informe
 * vistoso: varias hojas, colores de fondo y de letra, negrita, bordes, formato de
 * número, celdas combinadas, anchos de columna, alturas de fila, paneles
 * inmovilizados y filtro automático. Los textos van «en línea» (sin tabla de
 * cadenas compartidas) y el zip va sin comprimir, que Excel abre sin problema.
 *
 * Se escribe a mano a propósito: una librería más habría que empaquetarla con la
 * aplicación, y esto son unas pocas docenas de líneas.
 */

import { Buffer } from 'node:buffer'

export interface EstiloCelda {
  /** Color de fondo, «RRGGBB». */
  readonly fondo?: string
  /** Color de la letra, «RRGGBB». */
  readonly color?: string
  readonly negrita?: boolean
  readonly cursiva?: boolean
  readonly tamano?: number
  readonly alinH?: 'left' | 'center' | 'right'
  readonly alinV?: 'top' | 'center' | 'bottom'
  readonly ajustar?: boolean
  /** Color del borde fino de las cuatro caras, «RRGGBB». */
  readonly borde?: string
  /** Formato de número de Excel: `0.00`, `0`, `yyyy-mm-dd`… */
  readonly formato?: string
}

export type ValorCelda = string | number | null

export interface Celda {
  readonly v: ValorCelda
  readonly e?: EstiloCelda
}

export interface Hoja {
  readonly nombre: string
  /** Filas de celdas; `null` = celda vacía sin estilo. */
  readonly filas: readonly (readonly (Celda | null)[])[]
  /** Ancho de cada columna, en caracteres. */
  readonly anchos?: readonly number[]
  /** Alto de filas concretas (por número de fila desde 1), en puntos. */
  readonly alturas?: Readonly<Record<number, number>>
  /** Rangos combinados, «A1:C1». */
  readonly combinadas?: readonly string[]
  /** Inmoviliza esas filas y columnas de arriba/izquierda. */
  readonly congelar?: { readonly filas: number; readonly columnas: number }
  /** Filtro automático sobre ese rango, «A5:T30». */
  readonly filtro?: string
  /** Color de la pestaña, «RRGGBB». */
  readonly colorPestana?: string
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of datos) c = (TABLA_CRC[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** «A», «B»… «Z», «AA»… para la columna `i` (desde 0). */
export function letraDeColumna(i: number): string {
  let n = i
  let letras = ''
  do {
    letras = String.fromCharCode(65 + (n % 26)) + letras
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return letras
}

/** Escapa para XML y quita los caracteres de control que Excel no admite. */
function esc(texto: string): string {
  return (
    texto
      // eslint-disable-next-line no-control-regex -- justo lo que se quiere quitar
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** Nombre de hoja válido: sin `\ / ? * [ ] :` y de hasta 31 caracteres. */
function nombreDeHoja(nombre: string): string {
  return nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja'
}

// ── Estilos ─────────────────────────────────────────────────────────────────

class RegistroDeEstilos {
  private readonly fuentes: string[] = []
  private readonly rellenos: string[] = []
  private readonly bordes: string[] = []
  private readonly formatos = new Map<string, number>()
  private readonly xfs: string[] = []
  private readonly indices = new Map<string, number>()

  constructor() {
    // Lo que Excel exige que exista siempre: fuente 0, rellenos 0 y 1, borde 0, xf 0.
    this.fuentes.push(this.xmlFuente({}))
    this.rellenos.push('<fill><patternFill patternType="none"/></fill>')
    this.rellenos.push('<fill><patternFill patternType="gray125"/></fill>')
    this.bordes.push('<border><left/><right/><top/><bottom/><diagonal/></border>')
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')
    this.indices.set('{}', 0)
  }

  private xmlFuente(e: EstiloCelda): string {
    return (
      '<font>' +
      (e.negrita ? '<b/>' : '') +
      (e.cursiva ? '<i/>' : '') +
      `<sz val="${e.tamano ?? 11}"/>` +
      `<color rgb="FF${e.color ?? '000000'}"/>` +
      '<name val="Calibri"/><family val="2"/></font>'
    )
  }

  private indiceEn(lista: string[], xml: string): number {
    const i = lista.indexOf(xml)
    if (i >= 0) return i
    lista.push(xml)
    return lista.length - 1
  }

  indice(e: EstiloCelda | undefined): number {
    if (!e) return 0
    const clave = JSON.stringify(e)
    const existente = this.indices.get(clave)
    if (existente !== undefined) return existente

    const fuente = this.indiceEn(this.fuentes, this.xmlFuente(e))
    const relleno = e.fondo
      ? this.indiceEn(
          this.rellenos,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${e.fondo}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0
    const borde = e.borde
      ? this.indiceEn(
          this.bordes,
          '<border>' +
            ['left', 'right', 'top', 'bottom']
              .map((l) => `<${l} style="thin"><color rgb="FF${e.borde}"/></${l}>`)
              .join('') +
            '<diagonal/></border>',
        )
      : 0
    let numFmtId = 0
    if (e.formato) {
      const predefinidos: Record<string, number> = { '0': 1, '0.00': 2 }
      const conocido = predefinidos[e.formato]
      if (conocido !== undefined) numFmtId = conocido
      else {
        let id = this.formatos.get(e.formato)
        if (id === undefined) {
          id = 164 + this.formatos.size
          this.formatos.set(e.formato, id)
        }
        numFmtId = id
      }
    }
    const alin =
      e.alinH || e.alinV || e.ajustar
        ? `<alignment${e.alinH ? ` horizontal="${e.alinH}"` : ''}${
            e.alinV ? ` vertical="${e.alinV}"` : ''
          }${e.ajustar ? ' wrapText="1"' : ''}/>`
        : ''
    this.xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fuente}" fillId="${relleno}" borderId="${borde}" xfId="0"` +
        (numFmtId ? ' applyNumberFormat="1"' : '') +
        ' applyFont="1"' +
        (relleno ? ' applyFill="1"' : '') +
        (borde ? ' applyBorder="1"' : '') +
        (alin ? ' applyAlignment="1">' + alin + '</xf>' : '/>'),
    )
    const i = this.xfs.length - 1
    this.indices.set(clave, i)
    return i
  }

  xml(): string {
    const numFmts =
      this.formatos.size > 0
        ? `<numFmts count="${this.formatos.size}">` +
          [...this.formatos.entries()]
            .map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(codigo)}"/>`)
            .join('') +
          '</numFmts>'
        : ''
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts +
      `<fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts>` +
      `<fills count="${this.rellenos.length}">${this.rellenos.join('')}</fills>` +
      `<borders count="${this.bordes.length}">${this.bordes.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    )
  }
}

// ── Hojas ───────────────────────────────────────────────────────────────────

function xmlHoja(hoja: Hoja, estilos: RegistroDeEstilos): string {
  const columnas = hoja.anchos
    ? '<cols>' +
      hoja.anchos
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('') +
      '</cols>'
    : ''

  const filas = hoja.filas
    .map((fila, r) => {
      const numero = r + 1
      const alto = hoja.alturas?.[numero]
      const celdas = fila
        .map((celda, c) => {
          if (!celda) return ''
          const ref = `${letraDeColumna(c)}${numero}`
          const s = estilos.indice(celda.e)
          const atributoS = s ? ` s="${s}"` : ''
          if (celda.v === null || celda.v === '') return `<c r="${ref}"${atributoS}/>`
          if (typeof celda.v === 'number') {
            return Number.isFinite(celda.v)
              ? `<c r="${ref}"${atributoS}><v>${celda.v}</v></c>`
              : `<c r="${ref}"${atributoS}/>`
          }
          return `<c r="${ref}"${atributoS} t="inlineStr"><is><t xml:space="preserve">${esc(celda.v)}</t></is></c>`
        })
        .join('')
      return `<row r="${numero}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${celdas}</row>`
    })
    .join('')

  const congelar = hoja.congelar
    ? `<pane${hoja.congelar.columnas > 0 ? ` xSplit="${hoja.congelar.columnas}"` : ''}${
        hoja.congelar.filas > 0 ? ` ySplit="${hoja.congelar.filas}"` : ''
      } topLeftCell="${letraDeColumna(hoja.congelar.columnas)}${hoja.congelar.filas + 1}" activePane="${
        hoja.congelar.filas > 0 && hoja.congelar.columnas > 0
          ? 'bottomRight'
          : hoja.congelar.filas > 0
            ? 'bottomLeft'
            : 'topRight'
      }" state="frozen"/>`
    : ''

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (hoja.colorPestana ? `<sheetPr><tabColor rgb="FF${hoja.colorPestana}"/></sheetPr>` : '') +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${congelar}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    columnas +
    `<sheetData>${filas}</sheetData>` +
    (hoja.filtro ? `<autoFilter ref="${hoja.filtro}"/>` : '') +
    (hoja.combinadas && hoja.combinadas.length > 0
      ? `<mergeCells count="${hoja.combinadas.length}">${hoja.combinadas
          .map((m) => `<mergeCell ref="${m}"/>`)
          .join('')}</mergeCells>`
      : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToHeight="0"/>' +
    '</worksheet>'
  )
}

// ── Zip (sin comprimir) ─────────────────────────────────────────────────────

function crearZip(ficheros: readonly { nombre: string; contenido: string }[]): Uint8Array {
  const partes: Buffer[] = []
  const directorio: Buffer[] = []
  let desplazamiento = 0
  // Fecha y hora fijas (1 de enero de 2026): el zip no necesita más.
  const hora = 0
  const dia = ((2026 - 1980) << 9) | (1 << 5) | 1

  for (const f of ficheros) {
    const nombre = Buffer.from(f.nombre, 'utf8')
    const datos = Buffer.from(f.contenido, 'utf8')
    const crc = crc32(datos)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(0, 8) // sin compresión
    local.writeUInt16LE(hora, 10)
    local.writeUInt16LE(dia, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(datos.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(nombre.length, 26)
    local.writeUInt16LE(0, 28)
    partes.push(local, nombre, datos)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(hora, 12)
    central.writeUInt16LE(dia, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(datos.length, 20)
    central.writeUInt32LE(datos.length, 24)
    central.writeUInt16LE(nombre.length, 28)
    central.writeUInt32LE(desplazamiento, 42)
    directorio.push(central, nombre)

    desplazamiento += local.length + nombre.length + datos.length
  }

  const tamanoDirectorio = directorio.reduce((s, b) => s + b.length, 0)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(ficheros.length, 8)
  fin.writeUInt16LE(ficheros.length, 10)
  fin.writeUInt32LE(tamanoDirectorio, 12)
  fin.writeUInt32LE(desplazamiento, 16)

  return Buffer.concat([...partes, ...directorio, fin])
}

// ── Libro ───────────────────────────────────────────────────────────────────

/** Un libro de Excel (.xlsx) con esas hojas, listo para escribir a disco. */
export function crearXlsx(hojas: readonly Hoja[]): Uint8Array {
  const estilos = new RegistroDeEstilos()
  const hojasXml = hojas.map((h) => xmlHoja(h, estilos))
  const nombres = hojas.map((h) => nombreDeHoja(h.nombre))

  const ficheros = [
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas
          .map(
            (_h, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        nombres
          .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets></workbook>',
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas
          .map(
            (_h, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    ...hojasXml.map((xml, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: xml })),
    // Los estilos se escriben al final: el registro se llena al recorrer las hojas.
    { nombre: 'xl/styles.xml', contenido: estilos.xml() },
  ]
  return crearZip(ficheros)
}
