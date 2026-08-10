/**
 * Comprueba que pdfjs-dist lee texto y posiciones en Node, y que tesseract.js
 * arranca. Antes de escribir código que dependa de ellos.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.argv[2] ?? '.'
mkdirSync(SALIDA, { recursive: true })

// 1) Generar un PDF DE VERDAD con capa de texto, con datos sintéticos.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial;font-size:11pt;padding:40px}
h1{font-size:14pt} pre{font-size:11pt}
.cols{display:flex;gap:80px}
</style></head><body>
<h1>HEIDELBERG ENGINEERING &nbsp; ANTERION</h1>
<p>Cataract App - Biometry Report</p>
<div class="cols">
<pre>OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
AQD (endo)     2.65 mm
LT             4.53 mm
CCT             530 um
WTW           11.90 mm</pre>
<pre>OS
AL            24.01 mm
K1            40.27 D @ 8
K2            42.68 D @ 98
ACD (epi)      3.23 mm
AQD (endo)     2.70 mm
LT             4.48 mm
CCT             533 um
WTW           11.80 mm</pre>
</div>
</body></html>`

const navegador = await chromium.launch()
const pagina = await navegador.newPage()
await pagina.setContent(html)
const rutaPdf = join(SALIDA, 'anterion-sintetico.pdf')
await pagina.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
await navegador.close()
console.log('✓ PDF sintético generado:', rutaPdf)

// 2) Leerlo con pdfjs-dist en Node.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const datos = new Uint8Array(readFileSync(rutaPdf))
const doc = await pdfjs.getDocument({ data: datos, useSystemFonts: true }).promise
console.log('✓ pdfjs abre el documento. Páginas:', doc.numPages)

const p1 = await doc.getPage(1)
const vista = p1.getViewport({ scale: 1 })
const contenido = await p1.getTextContent()
console.log('✓ elementos de texto:', contenido.items.length)
const bloques = contenido.items
  .filter((i) => 'str' in i && i.str.trim())
  .slice(0, 6)
  .map((i) => ({
    texto: i.str,
    x: (i.transform[4] / vista.width).toFixed(3),
    y: (1 - i.transform[5] / vista.height).toFixed(3),
  }))
console.log('  primeros bloques con posición:', JSON.stringify(bloques, null, 1))
const todo = contenido.items.map((i) => ('str' in i ? i.str : '')).join(' ')
console.log('  ¿contiene 24.07?', todo.includes('24.07'))
console.log('  ¿contiene ANTERION?', todo.toUpperCase().includes('ANTERION'))
