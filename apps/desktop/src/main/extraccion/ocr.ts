/**
 * ocr.ts — Reconocimiento de texto sobre imagen, en local.
 *
 * Usa tesseract.js, que es WebAssembly puro: no compila nada y, una vez tiene
 * los datos del idioma en disco, funciona **sin conexión**.
 *
 * Tres cosas que costaron un fallo cada una. Merece la pena leerlas antes de
 * tocar este fichero:
 *
 *  1. tesseract.js descarga los datos del idioma (unos 5 MB) la primera vez y,
 *     por defecto, los deja **en la carpeta desde la que se ejecuta el
 *     programa**. La primera prueba dejó un `eng.traineddata` de 5 MB en la raíz
 *     del repositorio.
 *
 *  2. Si esa descarga falla —sin internet, DNS caído, CDN bloqueado por la red
 *     de una clínica— el fallo **no llega como promesa rechazada**: lo emite su
 *     worker como evento de error, se convierte en excepción no capturada y
 *     **mata el proceso principal de Electron**. La aplicación se cerraba con un
 *     cuadro de diálogo lleno de código y el usuario perdía el caso.
 *
 *     Por eso aquí **la descarga la hacemos nosotros**, con `node:https`, antes
 *     de crear el worker. Así el fallo es un error normal que se puede explicar,
 *     y tesseract encuentra el fichero en su caché y nunca toca la red.
 *
 *  3. `langPath` apunta también a la carpeta local. Es un cinturón de seguridad:
 *     si por lo que fuera la caché no valiera, lee de disco y falla en local, en
 *     lugar de irse a internet.
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { get } from 'node:https'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import type { BloqueTexto, MotorOcr } from '@vilamar/extraction'

export interface OpcionesOcr {
  /** Dónde guardar los datos del idioma. Nunca la carpeta del proyecto. */
  readonly carpetaDatos: string
  /** Idiomas de tesseract. «eng» va bien para informes de biometría. */
  readonly idioma?: string
  /**
   * Si se permite descargar los datos cuando no están.
   *
   * Se puede apagar para una instalación sin salida a internet: entonces, si los
   * datos no están, se dice y no se intenta nada.
   */
  readonly permitirDescarga?: boolean
}

/**
 * El error que se da cuando no hay con qué reconocer texto.
 *
 * Tiene su propio tipo para que quien lo reciba pueda dar un mensaje útil en vez
 * de repetir una traza técnica.
 */
export class ErrorDatosOcr extends Error {
  constructor(
    readonly mensajeUsuario: string,
    causa?: unknown,
  ) {
    super(mensajeUsuario)
    this.name = 'ErrorDatosOcr'
    if (causa instanceof Error) this.cause = causa
  }
}

/**
 * De dónde salen los datos del idioma.
 *
 * Es la misma dirección que usaría tesseract.js por su cuenta; la diferencia es
 * que aquí controlamos qué pasa cuando falla.
 */
function urlDatos(idioma: string): string {
  return `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${idioma}/4.0.0_best_int/${idioma}.traineddata.gz`
}

function rutaDatos(carpeta: string, idioma: string): string {
  return join(carpeta, `${idioma}.traineddata`)
}

/** ¿Están ya los datos del idioma en disco? */
export function datosDeIdiomaPresentes(carpeta: string, idioma = 'eng'): boolean {
  const ruta = rutaDatos(carpeta, idioma)
  try {
    // Un fichero a medio descargar no vale. El de inglés pesa unos 4 MB.
    return existsSync(ruta) && statSync(ruta).size > 1_000_000
  } catch {
    return false
  }
}

/**
 * Descarga los datos del idioma y los deja descomprimidos donde tesseract los
 * busca.
 *
 * Se escribe primero en un fichero temporal y se renombra al final: si se corta
 * la descarga, no queda un fichero a medias que parezca válido.
 */
export async function descargarDatosDeIdioma(carpeta: string, idioma = 'eng'): Promise<void> {
  mkdirSync(carpeta, { recursive: true })
  const destino = rutaDatos(carpeta, idioma)
  const temporal = `${destino}.descargando`

  try {
    await new Promise<void>((resolver, rechazar) => {
      const peticion = get(urlDatos(idioma), { timeout: 60_000 }, (respuesta) => {
        // jsdelivr redirige; hay que seguirlo a mano con node:https.
        const destinoRedireccion = respuesta.headers.location
        if (
          respuesta.statusCode !== undefined &&
          respuesta.statusCode >= 300 &&
          respuesta.statusCode < 400 &&
          destinoRedireccion
        ) {
          respuesta.resume()
          get(destinoRedireccion, { timeout: 60_000 }, (segunda) => {
            if (segunda.statusCode !== 200) {
              rechazar(new Error(`El servidor respondió ${segunda.statusCode}`))
              segunda.resume()
              return
            }
            pipeline(segunda, createGunzip(), createWriteStream(temporal)).then(resolver, rechazar)
          })
            .on('error', rechazar)
            .on('timeout', () => rechazar(new Error('La descarga tardó demasiado')))
          return
        }

        if (respuesta.statusCode !== 200) {
          rechazar(new Error(`El servidor respondió ${respuesta.statusCode}`))
          respuesta.resume()
          return
        }
        pipeline(respuesta, createGunzip(), createWriteStream(temporal)).then(resolver, rechazar)
      })
      peticion.on('error', rechazar)
      peticion.on('timeout', () => {
        peticion.destroy(new Error('La descarga tardó demasiado'))
      })
    })

    renameSync(temporal, destino)
  } catch (error) {
    try {
      if (existsSync(temporal)) unlinkSync(temporal)
    } catch {
      /* da igual: es un temporal */
    }

    const detalle = error instanceof Error ? error.message : String(error)
    const sinRed = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(detalle)

    throw new ErrorDatosOcr(
      sinRed
        ? 'Para leer un documento escaneado hace falta descargar una vez los datos del reconocimiento de texto (unos 5 MB), y ahora mismo no hay conexión a internet. ' +
            'Puedes escribir los datos a mano, o conectarte un momento y volver a subir el documento. Si el informe es un PDF con texto dentro, se lee sin necesidad de esto.'
        : `No se han podido preparar los datos del reconocimiento de texto (${detalle}). Puedes escribir los datos a mano mientras tanto.`,
      error,
    )
  }
}

export function crearMotorOcr(opciones: OpcionesOcr): MotorOcr {
  const idioma = opciones.idioma ?? 'eng'
  const permitirDescarga = opciones.permitirDescarga ?? true
  mkdirSync(opciones.carpetaDatos, { recursive: true })

  return {
    nombre: `tesseract.js (${idioma})`,

    async reconocer(imagen: Uint8Array) {
      // ── Lo primero: asegurarse de que hay con qué reconocer ───────────────
      // Se hace ANTES de crear el worker, y con nuestra propia descarga, porque
      // si se le deja a tesseract y falla, el fallo llega como excepción no
      // capturada y se lleva por delante la aplicación entera.
      if (!datosDeIdiomaPresentes(opciones.carpetaDatos, idioma)) {
        if (!permitirDescarga) {
          throw new ErrorDatosOcr(
            'Faltan los datos del reconocimiento de texto y la descarga automática está desactivada. Ejecuta «pnpm ocr:preparar» una vez con conexión.',
          )
        }
        await descargarDatosDeIdioma(opciones.carpetaDatos, idioma)
      }

      const { createWorker } = await import('tesseract.js')

      let trabajador: Awaited<ReturnType<typeof createWorker>> | null = null
      try {
        trabajador = await createWorker(idioma, undefined, {
          // Aquí están los datos, y aquí los busca primero.
          cachePath: opciones.carpetaDatos,
          // Cinturón de seguridad: si la caché falla, lee de esta carpeta en
          // lugar de irse a internet.
          langPath: opciones.carpetaDatos,
          gzip: false,
        })
      } catch (error) {
        throw new ErrorDatosOcr(
          'No se ha podido arrancar el reconocimiento de texto. Puedes escribir los datos a mano.',
          error,
        )
      }

      try {
        const { data } = await trabajador.recognize(Buffer.from(imagen))

        // Las palabras vienen con su caja en píxeles; se pasan a proporción para
        // que valgan igual si la imagen se reescala.
        //
        // tesseract.js no publica el tamaño de la página en su resultado, así
        // que se toma la esquina inferior derecha de la palabra más lejana. Es
        // una aproximación por defecto —el margen derecho de la hoja se pierde—
        // pero lo que usa la separación por columnas son posiciones RELATIVAS
        // entre sí, y esas no cambian por escalar todo el mapa.
        const palabras = data.words ?? []
        const ancho = Math.max(1, ...palabras.map((p) => p.bbox.x1))
        const alto = Math.max(1, ...palabras.map((p) => p.bbox.y1))
        const bloques: BloqueTexto[] = palabras
          .filter((p) => p.text.trim() !== '')
          .map((p) => ({
            texto: p.text,
            x: p.bbox.x0 / ancho,
            y: p.bbox.y0 / alto,
            ancho: (p.bbox.x1 - p.bbox.x0) / ancho,
            alto: (p.bbox.y1 - p.bbox.y0) / alto,
            confianza: p.confidence / 100,
          }))

        return {
          texto: data.text,
          bloques,
          confianzaMedia: (data.confidence ?? 0) / 100,
        }
      } finally {
        await trabajador.terminate().catch(() => undefined)
      }
    },
  }
}
