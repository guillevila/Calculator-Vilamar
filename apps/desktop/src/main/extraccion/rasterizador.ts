/**
 * rasterizador.ts — Convierte una página de PDF en imagen, sin módulos nativos.
 *
 * Hace falta para los informes que son un PDF con una foto dentro: no traen
 * texto, así que la única forma de leerlos es pasarles el OCR, y para eso hay
 * que tener la página como imagen.
 *
 * En Node, rasterizar un PDF suele significar instalar un lienzo nativo
 * (`canvas`, `@napi-rs/canvas`), que compila código C++ y convierte
 * «instalar el programa» en una tarde de configuración. Ese error ya se cometió
 * una vez en este proyecto y está en el log de lecciones.
 *
 * Aquí se resuelve con lo que ya hay: **el Chromium que descarga Playwright**.
 * Se abre una página local, se carga pdf.js dentro —el que ya está en
 * node_modules, no uno de internet—, se dibuja la página en un lienzo de verdad
 * y se hace una captura. Ninguna dependencia nueva y nada que compilar.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/** Localiza los ficheros de pdf.js dentro de node_modules. */
function rutasPdfJs(): { visor: string; trabajador: string } {
  const entrada = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  const carpeta = dirname(entrada)
  return {
    visor: entrada,
    trabajador: join(carpeta, 'pdf.worker.mjs'),
  }
}

export interface Rasterizador {
  /** Devuelve la página como PNG. `escala` 2 suele bastar para el OCR. */
  readonly rasterizar: (datos: Uint8Array, pagina: number, escala?: number) => Promise<Uint8Array>
  readonly cerrar: () => Promise<void>
}

/**
 * Crea un rasterizador que reutiliza un solo navegador.
 *
 * Abrir Chromium cuesta un par de segundos; hacerlo una vez por página de un
 * PDF de diez páginas sería absurdo.
 */
export function crearRasterizador(): Rasterizador {
  // El navegador se abre a la primera petición, no al arrancar la aplicación:
  // la mayoría de los informes traen texto y no llega a hacer falta.
  let navegadorPromesa: Promise<import('playwright').Browser> | null = null

  const navegador = async (): Promise<import('playwright').Browser> => {
    if (!navegadorPromesa) {
      navegadorPromesa = import('playwright').then((pw) => pw.chromium.launch({ headless: true }))
    }
    return navegadorPromesa
  }

  return {
    async rasterizar(datos: Uint8Array, pagina: number, escala = 2): Promise<Uint8Array> {
      const { visor, trabajador } = rutasPdfJs()
      const nav = await navegador()
      const contexto = await nav.newContext({ viewport: { width: 1200, height: 1600 } })
      const p = await contexto.newPage()

      try {
        // Una página en blanco con origen de fichero, para poder importar
        // pdf.js desde el disco. No se carga nada de internet.
        await p.goto(pathToFileURL(visor).href.replace(/pdf\.mjs$/, 'about-blank.html'), {
          waitUntil: 'domcontentloaded',
        }).catch(async () => {
          await p.setContent('<!doctype html><html><body></body></html>')
        })

        const medidas = await p.evaluate(
          async ({ urlVisor, urlTrabajador, base64, numero, factor }) => {
            const pdfjs = (await import(urlVisor)) as {
              GlobalWorkerOptions: { workerSrc: string }
              getDocument: (opciones: unknown) => { promise: Promise<unknown> }
            }
            pdfjs.GlobalWorkerOptions.workerSrc = urlTrabajador

            const binario = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
            const doc = (await pdfjs.getDocument({ data: binario, useSystemFonts: true })
              .promise) as {
              numPages: number
              getPage: (n: number) => Promise<{
                getViewport: (o: { scale: number }) => { width: number; height: number }
                render: (o: unknown) => { promise: Promise<void> }
              }>
            }
            if (numero > doc.numPages) throw new Error(`La página ${numero} no existe`)

            const pag = await doc.getPage(numero)
            const vista = pag.getViewport({ scale: factor })
            const lienzo = document.createElement('canvas')
            lienzo.width = Math.ceil(vista.width)
            lienzo.height = Math.ceil(vista.height)
            lienzo.id = 'pagina'
            lienzo.style.display = 'block'
            document.body.style.margin = '0'
            document.body.appendChild(lienzo)

            const ctx = lienzo.getContext('2d')
            if (!ctx) throw new Error('No se ha podido crear el lienzo')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, lienzo.width, lienzo.height)
            await pag.render({ canvasContext: ctx, viewport: vista }).promise

            return { ancho: lienzo.width, alto: lienzo.height }
          },
          {
            urlVisor: pathToFileURL(visor).href,
            urlTrabajador: pathToFileURL(trabajador).href,
            base64: Buffer.from(datos).toString('base64'),
            numero: pagina,
            factor: escala,
          },
        )

        await p.setViewportSize({
          width: Math.min(medidas.ancho, 4000),
          height: Math.min(medidas.alto, 4000),
        })
        const imagen = await p.locator('#pagina').screenshot({ type: 'png' })
        return new Uint8Array(imagen)
      } finally {
        await contexto.close().catch(() => undefined)
      }
    },

    async cerrar(): Promise<void> {
      if (!navegadorPromesa) return
      const nav = await navegadorPromesa.catch(() => null)
      navegadorPromesa = null
      await nav?.close().catch(() => undefined)
    },
  }
}

/** Comprueba que los ficheros de pdf.js están donde se esperan. */
export function pdfJsDisponible(): boolean {
  try {
    const { visor, trabajador } = rutasPdfJs()
    readFileSync(visor)
    readFileSync(trabajador)
    return true
  } catch {
    return false
  }
}
