/**
 * probar-lectura.ts — Prueba la lectura de documentos DE VERDAD.
 *
 * Genera tres documentos sintéticos y los pasa por el mismo proveedor que usa la
 * aplicación:
 *
 *   1. un PDF con capa de texto      → se lee el texto nativo, instantáneo
 *   2. una imagen PNG                → OCR
 *   3. un PDF que es solo una imagen → se rasteriza y se le pasa el OCR
 *
 * Es el camino que más veces se rompe y el que menos se puede probar con tests
 * deterministas, porque depende de pdfjs, de tesseract y de un navegador.
 *
 *     pnpm probar:lectura
 *
 * Los datos son sintéticos. No son de ninguna persona.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { valorDe } from '@vilamar/domain'
import { extraerDocumento } from '@vilamar/extraction'

import { crearLectorPdf } from '../apps/desktop/src/main/extraccion/lector-pdf.js'
import { crearMotorOcr } from '../apps/desktop/src/main/extraccion/ocr.js'
import { ProveedorDocumentos } from '../apps/desktop/src/main/extraccion/proveedor.js'
import { crearRasterizador } from '../apps/desktop/src/main/extraccion/rasterizador.js'

const SALIDA = join(process.cwd(), 'local', 'lectura')
mkdirSync(SALIDA, { recursive: true })

function carpetaOcr(): string {
  const appData = process.env['APPDATA']
  if (appData) return join(appData, 'calculator-vilamar', 'datos-ocr')
  return join(homedir(), '.config', 'calculator-vilamar', 'datos-ocr')
}

/** Un informe sintético con la forma de un ANTERION a dos columnas. */
const HTML_INFORME = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial; padding: 40px; font-size: 12pt; }
  h1 { font-size: 15pt; margin: 0 0 4px; }
  .cols { display: flex; gap: 90px; margin-top: 20px; }
  pre { font-size: 12pt; line-height: 1.7; margin: 0; }
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

const { chromium } = await import('playwright')
const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1100, height: 750 } })
await pagina.setContent(HTML_INFORME)

// 1) PDF con texto
const pdfConTexto = await pagina.pdf({ format: 'A4', printBackground: true })
writeFileSync(join(SALIDA, 'con-texto.pdf'), pdfConTexto)

// 2) Imagen
const imagen = await pagina.screenshot({ type: 'png' })
writeFileSync(join(SALIDA, 'informe.png'), imagen)

// 3) PDF que es solo una imagen (como un escaneo)
const base64 = Buffer.from(imagen).toString('base64')
await pagina.setContent(
  `<html><body style="margin:0"><img src="data:image/png;base64,${base64}" style="width:100%"></body></html>`,
)
const pdfEscaneado = await pagina.pdf({ format: 'A4', printBackground: true })
writeFileSync(join(SALIDA, 'escaneado.pdf'), pdfEscaneado)
await navegador.close()

// ── El proveedor, igual que lo monta la aplicación ─────────────────────────
const rasterizador = crearRasterizador()
const proveedor = new ProveedorDocumentos({
  lectorPdf: crearLectorPdf(),
  motorOcr: crearMotorOcr({ carpetaDatos: carpetaOcr() }),
  rasterizador,
  maximoPaginasOcr: 5,
})

const casos: { nombre: string; formato: 'pdf' | 'png'; datos: Uint8Array }[] = [
  { nombre: 'con-texto.pdf', formato: 'pdf', datos: new Uint8Array(pdfConTexto) },
  { nombre: 'informe.png', formato: 'png', datos: new Uint8Array(imagen) },
  { nombre: 'escaneado.pdf', formato: 'pdf', datos: new Uint8Array(pdfEscaneado) },
]

const ESPERADO: Record<string, Record<string, number>> = {
  OD: { AL: 24.07, K1: 41.22, K1_EJE: 175, K2: 42.52, K2_EJE: 85, ACD: 3.18, LT: 4.53, CCT: 530 },
  OS: { AL: 24.01, K1: 40.27, K1_EJE: 8, K2: 42.68, K2_EJE: 98, ACD: 3.23, LT: 4.48, CCT: 533 },
}

let fallos = 0

for (const caso of casos) {
  console.log('')
  console.log('═'.repeat(66))
  console.log(`  ${caso.nombre}`)
  console.log('═'.repeat(66))

  const comienzo = Date.now()
  const r = await extraerDocumento(
    { id: caso.nombre, nombre: caso.nombre, formato: caso.formato, datos: caso.datos },
    proveedor,
    { ahora: () => new Date().toISOString() },
  )
  const ms = Date.now() - comienzo

  console.log(`  método      : ${r.metodo} (${r.proveedor})`)
  console.log(`  aparato     : ${r.dispositivo.dispositivo}`)
  console.log(`  disposición : ${r.disposicion}`)
  console.log(`  tiempo      : ${ms} ms`)
  for (const a of r.avisos) console.log(`  aviso       : ${a}`)

  for (const lado of ['OD', 'OS'] as const) {
    const ojo = r.ojos[lado]
    if (!ojo) {
      // Un ojo ausente NO es «sin datos que comparar»: es un fallo de lectura.
      // La primera versión de este script hacía `continue` aquí y luego decía
      // «los tres caminos leen bien» con dos caminos rotos.
      console.log(`  ${lado} ✗ NO SE HA LEÍDO NADA de este ojo`)
      fallos++
      continue
    }
    const partes: string[] = []
    let malos = 0
    for (const [campo, esperado] of Object.entries(ESPERADO[lado] ?? {})) {
      const leido = valorDe(ojo, campo as never)
      const bien = leido === esperado
      if (!bien) malos++
      partes.push(`${campo}=${leido ?? '—'}${bien ? '' : ` (esperaba ${esperado})`}`)
    }
    console.log(`  ${lado} ${malos === 0 ? '✓' : `✗ ${malos} mal`}: ${partes.join('  ')}`)
    if (malos > 0) fallos++
  }
}

await rasterizador.cerrar()

console.log('')
console.log(
  fallos === 0
    ? '✓ Los tres caminos leen bien el informe.'
    : `✗ ${fallos} ojos con datos incorrectos.`,
)
console.log(`Documentos de prueba en ${SALIDA}`)
process.exit(fallos === 0 ? 0 : 1)
