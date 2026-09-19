/**
 * lector-pdf-provisional.ts — Lee el texto que un PDF ya trae dentro.
 *
 * ⚠️ **Versión PROVISIONAL, para este primer corte del servidor** (Fase 1
 * del plan móvil, 20/09/2026): solo PDF con texto nativo. Sin OCR, sin
 * lector de visión, sin imágenes (JPG/PNG) ni PDF escaneados.
 *
 * Es una copia reducida de la parte de texto nativo de
 * `apps/desktop/src/main/extraccion/lector-pdf.ts` (misma librería,
 * `pdfjs-dist`, mismo truco de reconstruir líneas a partir de los trozos
 * con posición que devuelve pdf.js). Se duplica aquí a propósito, en vez de
 * reutilizar esa carpeta: sacarla a un paquete compartido (como se hizo con
 * `ServicioCasos` → `@vilamar/casos`) es más trabajo del que le tocaba a
 * esta sesión, y además la usan directamente tres scripts de la raíz
 * (`pnpm ocr:preparar`, `probar:lectura`, `comparar:lectores`) — decisión
 * tomada con el dueño del proyecto el 20/09/2026.
 *
 * Cuando `extraccion/` se mueva de verdad a `packages/extraction`, este
 * fichero se borra y el servidor pasa a usar el proveedor completo (OCR +
 * PDF + visión), igual que la app de escritorio.
 */

import type {
  BloqueTexto,
  DocumentoEntrada,
  PaginaDocumento,
  ProveedorExtraccion,
  TextoDocumento,
} from '@vilamar/extraction'
import { reconstruirLineas, traeTextoDeVerdad } from '@vilamar/extraction'

// Construcción «legacy»: es la que funciona en Node sin APIs de navegador.
type ModuloPdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let moduloCache: ModuloPdfjs | null = null

async function pdfjs(): Promise<ModuloPdfjs> {
  if (moduloCache) return moduloCache
  const modulo = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as ModuloPdfjs
  moduloCache = modulo
  return modulo
}

interface TrozoConPosicion {
  readonly texto: string
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

/** Lee solo la capa de texto nativa de un PDF. No sabe rasterizar páginas. */
export async function leerTextoDePdf(datos: Uint8Array): Promise<readonly PaginaDocumento[]> {
  const modulo = await pdfjs()
  // Copia: pdf.js se queda con el array que se le pasa (ver el aviso en el
  // fichero original).
  const doc = await modulo.getDocument({ data: new Uint8Array(datos), useSystemFonts: true }).promise
  const paginas: PaginaDocumento[] = []

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n)
      const vista = pagina.getViewport({ scale: 1 })
      const contenido = await pagina.getTextContent()

      const trozos: TrozoConPosicion[] = []
      for (const item of contenido.items) {
        if (!('str' in item)) continue
        const texto = item.str
        if (texto.trim() === '') continue
        const x = item.transform[4] / vista.width
        const y = 1 - item.transform[5] / vista.height
        trozos.push({
          texto,
          x,
          y,
          ancho: (item.width ?? 0) / vista.width,
          alto: (item.height ?? 0) / vista.height,
        })
      }

      const bloques: BloqueTexto[] = trozos.map((t) => ({
        texto: t.texto,
        x: t.x,
        y: t.y,
        ancho: t.ancho,
        alto: t.alto,
      }))
      paginas.push({ numero: n, texto: reconstruirLineas(trozos), bloques })
    }
  } finally {
    await doc.destroy()
  }

  return paginas
}

/**
 * Proveedor mínimo del servidor: solo PDF con texto nativo — ver la
 * cabecera de este fichero para lo que falta y por qué.
 */
export class ProveedorPdfProvisional implements ProveedorExtraccion {
  readonly nombre = 'servidor (provisional: solo PDF con texto)'

  puedeCon(documento: DocumentoEntrada): boolean {
    return documento.formato === 'pdf'
  }

  async extraer(documento: DocumentoEntrada): Promise<TextoDocumento> {
    if (documento.formato !== 'pdf') {
      return this.fallo(
        `El servidor todavía no sabe leer imágenes (${documento.formato}) — de momento solo PDF con texto. Usa la aplicación de escritorio para este documento.`,
      )
    }

    let paginas: readonly PaginaDocumento[]
    try {
      paginas = await leerTextoDePdf(documento.datos)
    } catch (error) {
      return this.fallo(
        `No se ha podido abrir el PDF. ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const todoElTexto = paginas.map((p) => p.texto).join('\n')
    if (traeTextoDeVerdad(todoElTexto)) {
      return { paginas, proveedor: this.nombre, metodo: 'TEXTO_PDF', avisos: [] }
    }

    return this.fallo(
      'Este PDF no trae texto dentro (parece un escaneo o una foto). El servidor todavía no sabe leer eso — usa la aplicación de escritorio para este documento.',
    )
  }

  private fallo(mensaje: string): TextoDocumento {
    return { paginas: [], proveedor: this.nombre, metodo: 'TEXTO_PDF', avisos: [mensaje] }
  }
}
