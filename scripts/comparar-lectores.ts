/**
 * comparar-lectores.ts — Qué lector leer y cuánto cuesta, medido.
 *
 *     pnpm comparar:lectores              # todos los contendientes
 *     pnpm comparar:lectores ocr haiku    # solo algunos
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * La pregunta «¿compensa el modelo caro?» no se puede contestar razonando. En
 * este proyecto el razonamiento ya ha perdido dos veces contra la medición:
 * «más resolución, mejor OCR» era falso, y «más confianza, más acierto» también.
 * Así que aquí no se opina: se pasan los mismos documentos por todos los
 * lectores y se cuenta.
 *
 * ── Lo que cuenta, y por qué así ────────────────────────────────────────────
 *
 * Cada dato leído cae en una de tres casillas, y NO valen lo mismo:
 *
 *   ✓ acierto   el número es el que pone el informe
 *   ✗ ERROR     hay un número, y es otro          ← el peligroso
 *   · ausente   no ha leído ese dato               ← el seguro
 *
 * Un dato ausente se ve: sale como NO ENCONTRADO y lo escribes tú. Un dato
 * equivocado que parece razonable —24.81 donde ponía 24.01— no se ve, pasa la
 * validación por rangos y cambia la lente. Por eso el veredicto descarta
 * cualquier lector con un solo ERROR antes de mirar el precio.
 *
 * ── La regla de elección ────────────────────────────────────────────────────
 *
 *   El lector MÁS BARATO que no cometa ni un error y lea más datos.
 *
 * No «el mejor»: a estos precios la diferencia entre modelos son céntimos por
 * informe, así que lo que interesa saber es a partir de cuál deja de mejorar.
 *
 * Los datos son sintéticos. No son de ninguna persona.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CampoBiometrico, Lateralidad } from '@vilamar/domain'
import { valorDe } from '@vilamar/domain'
import type { DocumentoEntrada, ResultadoExtraccion } from '@vilamar/extraction'
import { extraerDocumento } from '@vilamar/extraction'

import { crearLectorPdf } from '../apps/desktop/src/main/extraccion/lector-pdf.js'
import { crearMotorOcr } from '../apps/desktop/src/main/extraccion/ocr.js'
import {
  coste,
  enCentimos,
  TARIFAS,
  ANOTADO_EL,
} from '../apps/desktop/src/main/extraccion/precios.js'
import type { Uso } from '../apps/desktop/src/main/extraccion/precios.js'
import { ProveedorDocumentos } from '../apps/desktop/src/main/extraccion/proveedor.js'
import { crearRasterizador } from '../apps/desktop/src/main/extraccion/rasterizador.js'
import type { Esfuerzo } from '../apps/desktop/src/main/extraccion/vision-claude.js'
import { aResultado, pedirLectura } from '../apps/desktop/src/main/extraccion/vision-claude.js'

// ═══════════════════════════════════════════════════════════════════════════
//  Lo que pone el informe. Es la verdad contra la que se cuenta.
// ═══════════════════════════════════════════════════════════════════════════

const ESPERADO: Readonly<Record<Lateralidad, Readonly<Partial<Record<CampoBiometrico, number>>>>> =
  {
    OD: {
      AL: 24.07,
      K1: 41.22,
      K1_EJE: 175,
      K2: 42.52,
      K2_EJE: 85,
      ACD: 3.18,
      AQD: 2.65,
      LT: 4.53,
      CCT: 530,
      WTW: 11.9,
    },
    OS: {
      AL: 24.01,
      K1: 40.27,
      K1_EJE: 8,
      K2: 42.68,
      K2_EJE: 98,
      ACD: 3.23,
      AQD: 2.7,
      LT: 4.48,
      CCT: 533,
      WTW: 11.8,
    },
  }

const CAMPOS_ESPERADOS = Object.keys(ESPERADO.OD) as CampoBiometrico[]
/** 10 campos × 2 ojos. Se comprueba que salgan las cuentas, no se da por hecho. */
const POR_DOCUMENTO = CAMPOS_ESPERADOS.length * 2

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

// ═══════════════════════════════════════════════════════════════════════════
//  Los documentos. Cubren los casos que fallan de verdad, no solo el fácil.
// ═══════════════════════════════════════════════════════════════════════════

interface Documento {
  readonly nombre: string
  readonly descripcion: string
  readonly formato: 'pdf' | 'png' | 'jpeg'
  readonly datos: Uint8Array
}

async function generarDocumentos(salida: string): Promise<Documento[]> {
  const { chromium } = await import('playwright')
  const navegador = await chromium.launch()
  const docs: Documento[] = []

  const guardar = (
    nombre: string,
    descripcion: string,
    formato: Documento['formato'],
    datos: Buffer,
  ): void => {
    writeFileSync(join(salida, nombre), datos)
    docs.push({ nombre, descripcion, formato, datos: new Uint8Array(datos) })
  }

  // 1) El caso fácil: PDF con capa de texto. Aquí el lector local ya es exacto,
  //    así que sirve para comprobar que un modelo no lo empeora.
  const p = await navegador.newPage({ viewport: { width: 1100, height: 750 } })
  await p.setContent(HTML_INFORME)
  guardar(
    '1-con-texto.pdf',
    'PDF con texto dentro (el caso fácil)',
    'pdf',
    await p.pdf({ format: 'A4', printBackground: true }),
  )

  // 2) Captura de pantalla limpia.
  const limpia = await p.screenshot({ type: 'png' })
  guardar('2-captura.png', 'Captura de pantalla nítida', 'png', limpia)

  // 3) PDF que es solo una imagen: el escaneo.
  const b64limpia = Buffer.from(limpia).toString('base64')
  await p.setContent(
    `<html><body style="margin:0"><img src="data:image/png;base64,${b64limpia}" style="width:100%"></body></html>`,
  )
  guardar(
    '3-escaneado.pdf',
    'PDF que por dentro es solo una imagen',
    'pdf',
    await p.pdf({ format: 'A4', printBackground: true }),
  )
  await p.close()

  // 4) El que rompió el OCR: pequeño y muy comprimido.
  const chica = await navegador.newPage({ viewport: { width: 800, height: 520 } })
  await chica.setContent(
    HTML_INFORME.replace('padding: 40px; font-size: 12pt', 'padding: 26px; font-size: 9pt'),
  )
  const mala = await chica.screenshot({ type: 'jpeg', quality: 40 })
  guardar('4-comprimida.jpeg', 'JPEG pequeño y muy comprimido (rompió el OCR)', 'jpeg', mala)
  await chica.close()

  // 5) Esa misma imagen metida en un PDF A4: lo que hace «convertir a PDF».
  const conv = await navegador.newPage({ viewport: { width: 1000, height: 1400 } })
  await conv.setContent(
    `<body style="margin:0;padding:40px"><img src="data:image/jpeg;base64,${Buffer.from(mala).toString('base64')}" style="width:100%"></body>`,
  )
  guardar(
    '5-convertida.pdf',
    'La imagen mala convertida a PDF',
    'pdf',
    await conv.pdf({ format: 'A4', printBackground: true }),
  )
  await conv.close()

  // 6) Una foto de una pantalla: torcida, con brillo y algo desenfocada.
  const foto = await navegador.newPage({ viewport: { width: 1200, height: 900 } })
  await foto.setContent(`<body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;height:100vh">
    <div style="transform:rotate(-2.4deg) perspective(900px) rotateY(6deg);filter:blur(0.6px) brightness(1.08) contrast(0.92);box-shadow:0 0 60px rgba(255,255,255,.25)">
      <img src="data:image/png;base64,${b64limpia}" style="width:900px;display:block">
    </div></body>`)
  guardar(
    '6-foto-torcida.jpeg',
    'Foto de una pantalla: torcida, con brillo y algo movida',
    'jpeg',
    await foto.screenshot({ type: 'jpeg', quality: 70 }),
  )
  await foto.close()

  await navegador.close()
  return docs
}

// ═══════════════════════════════════════════════════════════════════════════
//  Los contendientes
// ═══════════════════════════════════════════════════════════════════════════

interface Contendiente {
  readonly clave: string
  readonly etiqueta: string
  /** Null para el OCR local: no cuesta dinero. */
  readonly modelo: string | null
  readonly esfuerzo?: Esfuerzo
  readonly pensar?: boolean
}

const CONTENDIENTES: readonly Contendiente[] = [
  { clave: 'ocr', etiqueta: 'OCR local (tesseract)', modelo: null },
  { clave: 'haiku', etiqueta: 'Haiku 4.5', modelo: 'claude-haiku-4-5', pensar: false },
  { clave: 'haiku+', etiqueta: 'Haiku 4.5 (pensando)', modelo: 'claude-haiku-4-5', pensar: true },
  { clave: 'sonnet-low', etiqueta: 'Sonnet 5 · low', modelo: 'claude-sonnet-5', esfuerzo: 'low' },
  { clave: 'sonnet', etiqueta: 'Sonnet 5 · medium', modelo: 'claude-sonnet-5', esfuerzo: 'medium' },
  {
    clave: 'sonnet-high',
    etiqueta: 'Sonnet 5 · high',
    modelo: 'claude-sonnet-5',
    esfuerzo: 'high',
  },
  { clave: 'opus', etiqueta: 'Opus 5 · medium', modelo: 'claude-opus-5', esfuerzo: 'medium' },
]

// ═══════════════════════════════════════════════════════════════════════════
//  Contar
// ═══════════════════════════════════════════════════════════════════════════

interface Marcador {
  aciertos: number
  errores: number
  ausentes: number
  /** Los errores, con detalle. Son lo que hay que mirar de verdad. */
  readonly detalleErrores: string[]
  /** Documentos que ni siquiera se pudieron leer. Cuentan como fallo entero. */
  readonly reventados: string[]
  dolares: number
  ms: number
}

function marcadorVacio(): Marcador {
  return {
    aciertos: 0,
    errores: 0,
    ausentes: 0,
    detalleErrores: [],
    reventados: [],
    dolares: 0,
    ms: 0,
  }
}

/**
 * Compara lo leído contra lo que pone el informe.
 *
 * Un documento que no se ha podido leer NO se salta: sus 20 campos entran como
 * ausentes. Saltarlo sería exactamente el error que ya se cometió dos veces en
 * este proyecto — un comprobador que informa de éxito porque no ha mirado.
 */
function puntuar(
  marcador: Marcador,
  documento: string,
  resultado: ResultadoExtraccion | null,
): void {
  for (const lado of ['OD', 'OS'] as Lateralidad[]) {
    const ojo = resultado?.ojos[lado]
    for (const campo of CAMPOS_ESPERADOS) {
      const esperado = ESPERADO[lado][campo]!
      const leido = ojo ? valorDe(ojo, campo) : undefined
      if (leido === undefined) {
        marcador.ausentes++
      } else if (Math.abs(leido - esperado) < 1e-9) {
        marcador.aciertos++
      } else {
        marcador.errores++
        marcador.detalleErrores.push(
          `${documento} · ${lado} ${campo}: leyó ${leido}, pone ${esperado}`,
        )
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Ejecutar
// ═══════════════════════════════════════════════════════════════════════════

function carpetaOcr(): string {
  const appData = process.env['APPDATA']
  if (appData) return join(appData, 'calculator-vilamar', 'datos-ocr')
  return join(homedir(), '.config', 'calculator-vilamar', 'datos-ocr')
}

async function main(): Promise<void> {
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const hayClave = (process.env['ANTHROPIC_API_KEY'] ?? '').trim().length > 0

  let contendientes = CONTENDIENTES.filter((c) => pedidos.length === 0 || pedidos.includes(c.clave))
  if (pedidos.length > 0 && contendientes.length === 0) {
    console.error(
      `No conozco «${pedidos.join(', ')}». Los que hay: ${CONTENDIENTES.map((c) => c.clave).join(', ')}`,
    )
    process.exit(2)
  }

  const conModelo = contendientes.filter((c) => c.modelo !== null)
  if (!hayClave && conModelo.length > 0) {
    console.log('')
    console.log('  ⚠ No hay ANTHROPIC_API_KEY, así que solo se puede medir el OCR local.')
    console.log('    Para comparar los modelos, pon la clave en el .env y vuelve a lanzarlo.')
    contendientes = contendientes.filter((c) => c.modelo === null)
    if (contendientes.length === 0) process.exit(1)
  }

  const salida = join(process.cwd(), 'local', 'comparacion')
  mkdirSync(salida, { recursive: true })
  console.log('')
  console.log('  Generando los documentos de prueba…')
  const documentos = await generarDocumentos(salida)
  console.log(`  ${documentos.length} documentos en local/comparacion/`)
  for (const d of documentos) {
    console.log(`    ${d.nombre.padEnd(22)} ${d.descripcion}`)
  }

  // Aviso de gasto ANTES de gastar. Un comparador que se lanza y factura sin
  // decir cuánto va a costar es una mala herramienta.
  if (conModelo.length > 0 && hayClave) {
    const llamadas = conModelo.length * documentos.length
    console.log('')
    console.log(
      `  Se van a hacer ${llamadas} llamadas a la API (${conModelo.length} configuraciones × ${documentos.length} documentos).`,
    )
    console.log('  Coste esperado: unos pocos euros como mucho. El real sale en la tabla.')
  }

  const rasterizador = crearRasterizador()
  const proveedorLocal = new ProveedorDocumentos({
    lectorPdf: crearLectorPdf(),
    motorOcr: crearMotorOcr({ carpetaDatos: carpetaOcr() }),
    rasterizador,
    maximoPaginasOcr: 5,
  })

  const marcadores = new Map<string, Marcador>()

  for (const c of contendientes) {
    const m = marcadorVacio()
    marcadores.set(c.clave, m)
    console.log('')
    console.log('─'.repeat(74))
    console.log(`  ${c.etiqueta}`)
    console.log('─'.repeat(74))

    for (const doc of documentos) {
      const entrada: DocumentoEntrada = {
        id: doc.nombre,
        nombre: doc.nombre,
        formato: doc.formato === 'jpeg' ? 'jpeg' : doc.formato,
        datos: doc.datos,
      }
      const comienzo = Date.now()
      let resultado: ResultadoExtraccion | null = null
      let nota = ''

      try {
        if (c.modelo === null) {
          resultado = await extraerDocumento(entrada, proveedorLocal, {
            ahora: () => new Date().toISOString(),
          })
        } else {
          const { leido, uso } = await pedirLectura(entrada, {
            modelo: c.modelo,
            ...(c.esfuerzo ? { esfuerzo: c.esfuerzo } : {}),
            ...(c.pensar === undefined ? {} : { pensar: c.pensar }),
          })
          m.dolares += coste(c.modelo, uso)
          nota = ` (${tokens(uso)})`
          resultado = aResultado(entrada, leido, new Date().toISOString(), c.modelo)
        }
      } catch (error) {
        // Un fallo NO se salta: el documento entra entero como no leído y queda
        // anotado. Un contendiente que revienta no puede parecer que va bien.
        m.reventados.push(
          `${doc.nombre}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      m.ms += Date.now() - comienzo
      const antes = { a: m.aciertos, e: m.errores }
      puntuar(m, doc.nombre, resultado)
      const a = m.aciertos - antes.a
      const e = m.errores - antes.e
      const simbolo = e > 0 ? '✗' : a === POR_DOCUMENTO ? '✓' : '·'
      console.log(
        `  ${simbolo} ${doc.nombre.padEnd(22)} ${String(a).padStart(2)}/${POR_DOCUMENTO} bien` +
          (e > 0 ? `, ${e} MAL` : '') +
          nota,
      )
    }
  }

  await rasterizador.cerrar()

  // ── La tabla ─────────────────────────────────────────────────────────────
  const total = documentos.length * POR_DOCUMENTO
  console.log('')
  console.log('═'.repeat(74))
  console.log(
    `  RESULTADO — ${documentos.length} documentos × ${POR_DOCUMENTO} datos = ${total} comparaciones`,
  )
  console.log('═'.repeat(74))
  console.log('')
  console.log('  lector                  bien   MAL  falta    coste/informe   tiempo/informe')
  console.log('  ' + '─'.repeat(70))

  for (const c of contendientes) {
    const m = marcadores.get(c.clave)!
    // Que las cuentas cuadren no se da por hecho: se comprueba.
    const suma = m.aciertos + m.errores + m.ausentes
    if (suma !== total) {
      throw new Error(`Las cuentas de «${c.clave}» no cuadran: ${suma} de ${total}.`)
    }
    const porInforme = m.dolares / documentos.length
    console.log(
      `  ${c.etiqueta.padEnd(22)} ${String(m.aciertos).padStart(4)}  ${String(m.errores).padStart(4)}  ${String(m.ausentes).padStart(5)}   ` +
        `${(c.modelo === null ? 'gratis' : enCentimos(porInforme)).padStart(13)}   ` +
        `${(m.ms / documentos.length / 1000).toFixed(1)} s`,
    )
  }

  console.log('')
  console.log(`  Tarifas anotadas el ${ANOTADO_EL}. Precio de lista, no incluye descuentos.`)

  // ── Los errores, uno a uno. Es lo que de verdad hay que mirar. ───────────
  for (const c of contendientes) {
    const m = marcadores.get(c.clave)!
    if (m.errores === 0 && m.reventados.length === 0) continue
    console.log('')
    console.log(`  ⚠ ${c.etiqueta}`)
    for (const d of m.detalleErrores) console.log(`      ${d}`)
    for (const r of m.reventados) console.log(`      no se pudo leer — ${r}`)
  }

  // ── El veredicto ─────────────────────────────────────────────────────────
  console.log('')
  console.log('═'.repeat(74))
  console.log('  VEREDICTO')
  console.log('═'.repeat(74))

  const limpios = contendientes
    .filter((c) => {
      const m = marcadores.get(c.clave)!
      return m.errores === 0 && m.reventados.length === 0
    })
    .sort((x, y) => {
      const mx = marcadores.get(x.clave)!
      const my = marcadores.get(y.clave)!
      // Primero el que más lee; a igualdad, el más barato.
      if (my.aciertos !== mx.aciertos) return my.aciertos - mx.aciertos
      return mx.dolares - my.dolares
    })

  if (limpios.length === 0) {
    console.log('')
    console.log('  Ninguno ha leído los documentos sin cometer un solo error.')
    console.log('  Eso NO significa que no se pueda usar: significa que la comprobación')
    console.log('  dato a dato en la pantalla de revisión sigue siendo imprescindible.')
  } else {
    const mejor = limpios[0]!
    const m = marcadores.get(mejor.clave)!
    // A igualdad de aciertos, el más barato de todos los limpios.
    const masBarato = limpios
      .filter((c) => marcadores.get(c.clave)!.aciertos === m.aciertos)
      .sort((x, y) => marcadores.get(x.clave)!.dolares - marcadores.get(y.clave)!.dolares)[0]!
    const mb = marcadores.get(masBarato.clave)!
    console.log('')
    console.log(`  Sin un solo error: ${limpios.map((c) => c.etiqueta).join(', ')}`)
    console.log('')
    console.log(`  → Recomendado: ${masBarato.etiqueta}`)
    console.log(
      `    ${mb.aciertos} de ${total} datos, cero equivocados, ${masBarato.modelo === null ? 'gratis' : enCentimos(mb.dolares / documentos.length) + ' por informe'}.`,
    )
    if (masBarato.modelo !== null) {
      console.log('')
      console.log(
        `    Para usarlo, en vision-claude.ts:  MODELO = '${masBarato.modelo}'` +
          (masBarato.esfuerzo ? `  ·  ESFUERZO = '${masBarato.esfuerzo}'` : ''),
      )
    }
  }

  console.log('')
  console.log('  Recuerda: aunque un lector acierte todo aquí, un dato leído por una')
  console.log('  máquina sigue saliendo en ámbar y hay que comprobarlo. Estos documentos')
  console.log('  son sintéticos; un informe real puede traer sorpresas que aquí no están.')
  console.log('')
}

function tokens(uso: Uso): string {
  const entrada = uso.entrada + uso.cacheEscrito + uso.cacheLeido
  return `${entrada} entrada / ${uso.salida} salida` + (uso.cacheLeido > 0 ? ', con caché' : '')
}

// Se comprueba al arrancar que hay tarifa para cada modelo. Descubrirlo a mitad
// de la comparación sería tirar el gasto ya hecho.
for (const c of CONTENDIENTES) {
  if (c.modelo !== null && !TARIFAS[c.modelo]) {
    throw new Error(`Falta la tarifa de «${c.modelo}» en precios.ts.`)
  }
}

await main()
