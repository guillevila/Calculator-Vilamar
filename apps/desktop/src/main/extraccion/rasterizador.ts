/**
 * rasterizador.ts — Convierte una página de PDF en imagen, sin módulos nativos.
 *
 * Hace falta para los informes que son un PDF con una foto dentro: no traen
 * texto, así que la única forma de leerlos es pasarles el OCR, y para eso hay
 * que tener la página como imagen.
 *
 * En Node, rasterizar un PDF suele significar instalar un lienzo nativo
 * (`canvas`, `@napi-rs/canvas`), que compila código C++ y convierte «instalar el
 * programa» en una tarde de configuración. Ese error ya se cometió una vez en
 * este proyecto y está en el log de lecciones.
 *
 * Aquí se resuelve con lo que ya hay: **el Chromium que descarga Playwright**.
 * Se abre una página, se carga dentro el pdf.js que ya está en node_modules, se
 * dibuja la página en un lienzo de verdad y se hace una captura.
 *
 * ── Por qué se sirve por HTTP interceptado y no desde el disco ──────────────
 *
 * pdfjs-dist solo trae versión de módulo (`.mjs`), y **Chromium no deja importar
 * un módulo por `file://`**: falla con «Failed to fetch dynamically imported
 * module». `about:blank` tampoco vale, porque no tiene origen desde el que
 * importar. Las dos cosas se probaron y las dos fallaron.
 *
 * Así que se le da un origen: Playwright intercepta las peticiones a un dominio
 * inventado y las responde con los ficheros del disco. La página, pdf.js y su
 * worker comparten origen, los módulos cargan, y **no sale ni una petición a
 * internet**: lo que no está en la lista se responde con un 404.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** Dominio inventado. Nunca se resuelve por DNS: todo se responde en local. */
const ORIGEN = 'https://pdfjs.vilamar.local'

/** Localiza los ficheros de pdf.js dentro de node_modules. */
function rutasPdfJs(): { visor: string; trabajador: string } {
  const entrada = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  return { visor: entrada, trabajador: join(dirname(entrada), 'pdf.worker.mjs') }
}

/** La página que hace el trabajo. Se sirve desde el origen inventado. */
const PAGINA_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>rasterizar</title></head><body style="margin:0"></body></html>'

export interface Rasterizador {
  /** Devuelve la página del PDF como PNG. */
  readonly rasterizar: (datos: Uint8Array, pagina: number, escala?: number) => Promise<Uint8Array>
  /**
   * Agranda una imagen antes de pasarle el OCR.
   *
   * No es un adorno: sobre una captura de pantalla normal, el reconocimiento
   * pasa de leer «Ki 41.220» y «Lr 4.53» a leer «K1 41.22 D» y «LT 4.53», y de
   * un 80 % de fiabilidad a un 92 %. Medido, no supuesto.
   */
  readonly escalar: (imagen: Uint8Array, factor?: number) => Promise<Uint8Array>
  readonly cerrar: () => Promise<void>
}

/**
 * Cuánto se agranda una imagen antes del OCR.
 *
 * **2, y no más.** Con 3 el reconocimiento EMPEORA: aparecieron un «24.97» donde
 * ponía 24.07 y un «490.27» donde ponía 40.27. Más resolución no es mejor
 * indefinidamente, y un número mal leído pero dentro de rango es el fallo más
 * peligroso de este programa. Comprobado con los tres factores.
 */
export const FACTOR_ESCALA_OCR = 2

/**
 * Crea un rasterizador que reutiliza un solo navegador.
 *
 * Abrir Chromium cuesta un par de segundos; hacerlo una vez por página de un PDF
 * de diez páginas sería absurdo.
 */
export function crearRasterizador(): Rasterizador {
  // El navegador se abre a la primera petición, no al arrancar la aplicación: la
  // mayoría de los informes traen texto y no llega a hacer falta.
  let navegadorPromesa: Promise<import('playwright').Browser> | null = null

  const navegador = async (): Promise<import('playwright').Browser> => {
    if (!navegadorPromesa) {
      navegadorPromesa = import('playwright').then((pw) => pw.chromium.launch({ headless: true }))
    }
    return navegadorPromesa
  }

  /**
   * Abre una página lista para trabajar, con pdf.js servido desde el disco.
   *
   * Todo lo que la página pida y no esté en la lista se responde con un 404: es
   * imposible que esto acabe descargando algo de internet.
   */
  const abrirPagina = async (): Promise<{
    pagina: import('playwright').Page
    cerrar: () => Promise<void>
  }> => {
    const { visor, trabajador } = rutasPdfJs()
    const nav = await navegador()
    const contexto = await nav.newContext({ viewport: { width: 1200, height: 1600 } })

    await contexto.route(`${ORIGEN}/**`, async (ruta) => {
      const camino = new URL(ruta.request().url()).pathname
      const js = 'text/javascript; charset=utf-8'
      if (camino === '/pagina.html') {
        return ruta.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: PAGINA_HTML,
        })
      }
      if (camino === '/pdf.mjs') {
        return ruta.fulfill({ status: 200, contentType: js, body: readFileSync(visor) })
      }
      if (camino === '/pdf.worker.mjs') {
        return ruta.fulfill({ status: 200, contentType: js, body: readFileSync(trabajador) })
      }
      return ruta.fulfill({ status: 404, body: 'no existe' })
    })

    const pagina = await contexto.newPage()
    await pagina.goto(`${ORIGEN}/pagina.html`, { waitUntil: 'domcontentloaded' })
    return { pagina, cerrar: () => contexto.close().catch(() => undefined) }
  }

  return {
    async rasterizar(datos: Uint8Array, pagina: number, escala = 2): Promise<Uint8Array> {
      const { pagina: p, cerrar } = await abrirPagina()
      try {
        const medidas = await p.evaluate(
          async ({ origen, base64, numero, factor }) => {
            // El import va escondido en un `new Function` para que ningún
            // empaquetador lo reescriba: este código se ejecuta DENTRO del
            // navegador. Con vite-node, un `import()` normal se convierte en su
            // ayudante interno y falla con «__vite_ssr_dynamic_import__ is not
            // defined».
            const importar = new Function('u', 'return import(u)') as (
              u: string,
            ) => Promise<unknown>

            const pdfjs = (await importar(`${origen}/pdf.mjs`)) as {
              GlobalWorkerOptions: { workerSrc: string }
              getDocument: (opciones: unknown) => { promise: Promise<unknown> }
            }
            pdfjs.GlobalWorkerOptions.workerSrc = `${origen}/pdf.worker.mjs`

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
            lienzo.id = 'pagina'
            lienzo.width = Math.ceil(vista.width)
            lienzo.height = Math.ceil(vista.height)
            lienzo.style.display = 'block'
            document.body.appendChild(lienzo)

            const ctx = lienzo.getContext('2d')
            if (!ctx) throw new Error('No se ha podido crear el lienzo')
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, lienzo.width, lienzo.height)
            await pag.render({ canvasContext: ctx, viewport: vista }).promise

            return { ancho: lienzo.width, alto: lienzo.height }
          },
          {
            origen: ORIGEN,
            base64: Buffer.from(datos).toString('base64'),
            numero: pagina,
            factor: escala,
          },
        )

        await p.setViewportSize({
          width: Math.min(medidas.ancho, 4000),
          height: Math.min(medidas.alto, 4000),
        })
        return new Uint8Array(await p.locator('#pagina').screenshot({ type: 'png' }))
      } finally {
        await cerrar()
      }
    },

    async escalar(imagen: Uint8Array, factor = FACTOR_ESCALA_OCR): Promise<Uint8Array> {
      if (factor <= 1) return imagen
      const { pagina: p, cerrar } = await abrirPagina()
      try {
        const medidas = await p.evaluate(
          async ({ base64, f }) => {
            const img = new Image()
            img.src = `data:image/png;base64,${base64}`
            await img.decode()
            const lienzo = document.createElement('canvas')
            lienzo.id = 'escalada'
            lienzo.width = Math.round(img.width * f)
            lienzo.height = Math.round(img.height * f)
            const ctx = lienzo.getContext('2d')
            if (!ctx) throw new Error('No se ha podido crear el lienzo')
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
            lienzo.style.display = 'block'
            document.body.appendChild(lienzo)
            return { ancho: lienzo.width, alto: lienzo.height }
          },
          { base64: Buffer.from(imagen).toString('base64'), f: factor },
        )
        await p.setViewportSize({
          width: Math.min(medidas.ancho, 4000),
          height: Math.min(medidas.alto, 4000),
        })
        return new Uint8Array(await p.locator('#escalada').screenshot({ type: 'png' }))
      } catch {
        // Si no se puede escalar, se reconoce la original. Peor, pero no se cae.
        return imagen
      } finally {
        await cerrar()
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
    return existsSync(visor) && existsSync(trabajador)
  } catch {
    return false
  }
}
