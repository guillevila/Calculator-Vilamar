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

/**
 * Reconoce el formato de una imagen por sus primeros bytes.
 *
 * No se fía de la extensión del fichero: un `.jpeg` puede ser cualquier cosa, y
 * quien lo subió no tiene por qué saberlo. Lo que importa es lo que hay dentro,
 * porque es lo que el navegador va a intentar decodificar.
 */
export function tipoDeImagen(datos: Uint8Array): string {
  const b = datos
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png'
  }
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  // RIFF….WEBP
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ftyp…heic / heif — las fotos de iPhone. El navegador puede no saber
  // decodificarlas; si no puede, se dirá con claridad.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return 'image/heic'
  }
  // Sin reconocer: se deja que el navegador lo intente por su cuenta.
  return 'application/octet-stream'
}

/** Localiza los ficheros de pdf.js dentro de node_modules. */
function rutasPdfJs(): { visor: string; trabajador: string } {
  const entrada = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  return { visor: entrada, trabajador: join(dirname(entrada), 'pdf.worker.mjs') }
}

/** La página que hace el trabajo. Se sirve desde el origen inventado. */
const PAGINA_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>rasterizar</title></head><body style="margin:0"></body></html>'

export interface Rasterizador {
  /**
   * Devuelve la página del PDF como PNG, dibujada al ancho que se pida.
   *
   * Se pide un ANCHO y no un factor de escala a propósito. Antes se dibujaba a
   * «escala 2» y luego se reescalaba al tamaño del OCR: **dos remuestreos**, y el
   * texto pequeño de un escaneo no sobrevive a eso. Dibujando directamente al
   * tamaño final hay uno solo, y pdf.js rasteriza desde el original vectorial o
   * desde la imagen a plena resolución.
   */
  readonly rasterizar: (
    datos: Uint8Array,
    pagina: number,
    anchoObjetivo?: number,
  ) => Promise<Uint8Array>
  /**
   * Prepara una imagen para el OCR: la decodifica y la devuelve como PNG
   * limpio, con un tamaño razonable.
   *
   * Hace dos cosas, y las dos importan:
   *
   *  1. **Normaliza el formato.** El navegador decodifica muchos más formatos y
   *     variantes que tesseract —JPEG progresivos, CMYK, perfiles de color
   *     raros—. Pasándolo por aquí, tesseract solo ve PNG. Un JPEG de móvil que
   *     hacía fallar el OCR con «Error attempting to read image» pasa a leerse.
   *  2. **Ajusta el tamaño al que mejor lee.** Sobre una captura pequeña, el
   *     reconocimiento pasa de leer «Ki 41.220» y «Lr 4.53» a leer «K1 41.22 D»
   *     y «LT 4.53», y de un 80 % de fiabilidad a un 92 %. Medido.
   *
   * Si la imagen no se puede decodificar, **lanza**. Antes devolvía la original
   * en silencio y el fallo aparecía después, dentro de tesseract, con un mensaje
   * que no le dice nada a nadie.
   */
  readonly prepararParaOcr: (imagen: Uint8Array) => Promise<Uint8Array>
  readonly cerrar: () => Promise<void>
}

/**
 * Ancho al que se lleva la imagen antes del OCR, en píxeles.
 *
 * Una captura pequeña se agranda hasta aquí; una foto de móvil ya lo supera y se
 * deja como está. Lo que NO se hace es multiplicar a ciegas: escalar ×2 una foto
 * de 4032 px la convertía en una de 8064, que ni cabe ni ayuda.
 */
export const ANCHO_OBJETIVO_OCR = 2200

/**
 * Ancho al que se dibuja una página de PDF antes de ampliarla para el OCR.
 *
 * **1190, que es A4 al doble de su tamaño natural.** Parece poco, y lo parece
 * porque lo lógico sería dibujar directamente a la resolución del OCR. Se probó,
 * y sale PEOR. Medido sobre el mismo PDF escaneado, contando cuántos de diez
 * números se leen bien:
 *
 *   | cómo se dibuja                | fiabilidad | aciertos |
 *   | ----------------------------- | ---------- | -------- |
 *   | directo a 1200 px             | 82 %       | 9 / 10   |
 *   | directo a 1600 px             | 86 %       | 7 / 10   |
 *   | directo a 2000 px             | 89 %       | 7 / 10   |
 *   | directo a 2480 px (300 ppp)   | 88 %       | 7 / 10   |
 *   | directo a 3000 px             | 87 %       | 6 / 10   |
 *   | **1190 y luego ampliar a 2200** | **90 %** | **10/10** |
 *
 * Dibujar grande reproduce a tamaño completo los defectos de compresión de la
 * imagen incrustada; dibujar pequeño y ampliar con suavizado los difumina y deja
 * los números más limpios.
 *
 * Fíjate también en que **la fiabilidad no sigue a los aciertos**: 89 % con 7 de
 * 10, y 90 % con 10 de 10. No sirve para elegir.
 *
 * Si alguien vuelve a «optimizar» esto subiendo la resolución, que rehaga la
 * tabla antes.
 */
export const ANCHO_RASTERIZADO_OCR = 1190

/**
 * Tope de ampliación.
 *
 * **2, y no más.** Con 3 el reconocimiento EMPEORA: aparecieron un «24.97» donde
 * ponía 24.07 y un «490.27» donde ponía 40.27. Más resolución no es mejor
 * indefinidamente, y un número mal leído pero dentro de rango es el fallo más
 * peligroso de este programa. Comprobado con los tres factores.
 */
export const AMPLIACION_MAXIMA = 2

/**
 * Tope de píxeles por lado.
 *
 * Chromium no captura un elemento indefinidamente grande, y al topar **recortaba
 * la imagen sin avisar**: de una foto de 4032 px salía media foto. Ahora, si no
 * cabe, se REDUCE de forma proporcional, que pierde detalle pero no contenido.
 */
export const LADO_MAXIMO = 4000

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
    async rasterizar(
      datos: Uint8Array,
      pagina: number,
      anchoObjetivo = ANCHO_RASTERIZADO_OCR,
    ): Promise<Uint8Array> {
      const { pagina: p, cerrar } = await abrirPagina()
      try {
        const medidas = await p.evaluate(
          async ({ origen, base64, numero, anchoPedido, ladoMaximo }) => {
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
            // El factor se calcula del ancho natural de la página, para llegar
            // al ancho pedido de una sola vez.
            const natural = pag.getViewport({ scale: 1 })
            let factor = anchoPedido / natural.width
            // Ni tan poco que no se lea, ni tanto que no quepa en un lienzo.
            factor = Math.max(
              1,
              Math.min(factor, ladoMaximo / Math.max(natural.width, natural.height)),
            )
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
            anchoPedido: anchoObjetivo,
            ladoMaximo: LADO_MAXIMO,
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

    async prepararParaOcr(imagen: Uint8Array): Promise<Uint8Array> {
      const { pagina: p, cerrar } = await abrirPagina()
      try {
        const medidas = await p.evaluate(
          async ({ base64, tipo, objetivo, ampliacionMaxima, ladoMaximo }) => {
            const img = new Image()
            // El tipo va de verdad. Antes decía siempre «image/png», también
            // para un JPEG: el navegador solía adivinarlo, pero no siempre.
            img.src = `data:${tipo};base64,${base64}`
            await img.decode()
            if (img.width === 0 || img.height === 0) throw new Error('imagen vacía')

            // Se lleva al ancho que mejor lee el OCR, sin pasarse: ampliar sí,
            // pero con tope; y si el resultado no cabe, se REDUCE en proporción
            // en lugar de recortarse.
            let factor = objetivo / img.width
            factor = Math.min(factor, ampliacionMaxima)
            const mayorLado = Math.max(img.width, img.height) * factor
            if (mayorLado > ladoMaximo) factor *= ladoMaximo / mayorLado

            const lienzo = document.createElement('canvas')
            lienzo.id = 'preparada'
            lienzo.width = Math.max(1, Math.round(img.width * factor))
            lienzo.height = Math.max(1, Math.round(img.height * factor))
            const ctx = lienzo.getContext('2d')
            if (!ctx) throw new Error('no se ha podido crear el lienzo')
            // Fondo blanco: un PNG con transparencia se lee fatal.
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, lienzo.width, lienzo.height)
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
            lienzo.style.display = 'block'
            document.body.appendChild(lienzo)
            return {
              ancho: lienzo.width,
              alto: lienzo.height,
              anchoOriginal: img.width,
              factor,
            }
          },
          {
            base64: Buffer.from(imagen).toString('base64'),
            tipo: tipoDeImagen(imagen),
            objetivo: ANCHO_OBJETIVO_OCR,
            ampliacionMaxima: AMPLIACION_MAXIMA,
            ladoMaximo: LADO_MAXIMO,
          },
        )

        // El viewport tiene que dar cabida al lienzo entero. Si se queda corto,
        // la captura sale recortada y se pierde media página en silencio.
        await p.setViewportSize({ width: medidas.ancho, height: medidas.alto })
        return new Uint8Array(await p.locator('#preparada').screenshot({ type: 'png' }))
      } catch (error) {
        // NO se devuelve la original: tesseract fallaría después con «Error
        // attempting to read image», que no le dice nada a nadie. Mejor decir
        // aquí lo que pasa, que es que el fichero no se ha podido abrir.
        throw new Error(
          'No se ha podido abrir esta imagen. Puede estar dañada, o estar en un formato que el programa no sabe leer. ' +
            'Prueba a abrirla y volver a guardarla como PNG o JPG, o escribe los datos a mano. ' +
            `Detalle técnico: ${error instanceof Error ? error.message : String(error)}`,
        )
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
