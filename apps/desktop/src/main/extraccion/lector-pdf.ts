/**
 * lector-pdf.ts — Lee el texto que un PDF ya trae dentro.
 *
 * Usa pdfjs-dist en el proceso principal. No necesita canvas ni nada nativo:
 * solo la capa de texto, que es lo que interesa cuando el informe se ha
 * imprimido a PDF desde el aparato.
 *
 * Un detalle que parece de fontanería y no lo es: **pdfjs no devuelve líneas,
 * devuelve trozos**. En un informe, «AL» y «24.07 mm» son dos elementos
 * distintos que solo comparten la altura. Si se juntara el texto en el orden en
 * que viene, las reglas de lectura no encontrarían nada, porque buscan la
 * etiqueta y el número en la misma línea.
 *
 * Por eso aquí se reconstruyen las líneas agrupando por altura y ordenando por
 * posición horizontal. Y además se conservan los trozos con su posición, que es
 * lo que permite separar las dos columnas de un informe sin depender del orden.
 */

import type { BloqueTexto, LectorPdf, PaginaDocumento } from '@vilamar/extraction'

// Se usa la construcción «legacy» porque es la que funciona en Node sin
// depender de APIs de navegador.
type ModuloPdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let moduloCache: ModuloPdfjs | null = null

async function pdfjs(): Promise<ModuloPdfjs> {
  if (moduloCache) return moduloCache
  const modulo = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as ModuloPdfjs
  moduloCache = modulo
  return modulo
}

/** Dos trozos están en la misma línea si su altura no difiere más que esto. */
const TOLERANCIA_LINEA = 0.006

interface TrozoConPosicion {
  readonly texto: string
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

/**
 * Reconstruye las líneas a partir de trozos posicionados.
 *
 * Se agrupa por altura y se ordena por horizontal. Entre dos trozos se pone un
 * separador de dos espacios cuando hay un hueco apreciable, porque ese hueco es
 * justo lo que separa la columna del ojo derecho de la del izquierdo y lo que
 * necesita el segmentador cuando trabaja con texto plano.
 */
export function reconstruirLineas(trozos: readonly TrozoConPosicion[]): string {
  const ordenados = [...trozos].sort((a, b) => a.y - b.y || a.x - b.x)
  const lineas: TrozoConPosicion[][] = []

  for (const trozo of ordenados) {
    const ultima = lineas[lineas.length - 1]
    const referencia = ultima?.[0]
    if (ultima && referencia && Math.abs(trozo.y - referencia.y) <= TOLERANCIA_LINEA) {
      ultima.push(trozo)
    } else {
      lineas.push([trozo])
    }
  }

  return lineas
    .map((linea) => {
      const enOrden = linea.sort((a, b) => a.x - b.x)
      let salida = ''
      let finAnterior = 0
      for (const [i, trozo] of enOrden.entries()) {
        if (i > 0) {
          const hueco = trozo.x - finAnterior
          salida += hueco > 0.02 ? '  ' : ' '
        }
        salida += trozo.texto
        finAnterior = trozo.x + trozo.ancho
      }
      return salida.trim()
    })
    .filter((l) => l.length > 0)
    .join('\n')
}

export function crearLectorPdf(): LectorPdf {
  return {
    async numeroDePaginas(datos: Uint8Array): Promise<number> {
      const modulo = await pdfjs()
      const doc = await modulo.getDocument({ data: datos, useSystemFonts: true }).promise
      const n = doc.numPages
      await doc.destroy()
      return n
    },

    async leer(datos: Uint8Array): Promise<readonly PaginaDocumento[]> {
      const modulo = await pdfjs()
      const doc = await modulo.getDocument({ data: datos, useSystemFonts: true }).promise
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
            // transform = [a, b, c, d, e, f]; e y f son la posición.
            const x = item.transform[4] / vista.width
            // El PDF cuenta la altura desde abajo; aquí se cuenta desde arriba.
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
            // El texto nativo de un PDF es exacto: no tiene «confianza».
          }))

          paginas.push({ numero: n, texto: reconstruirLineas(trozos), bloques })
        }
      } finally {
        await doc.destroy()
      }

      return paginas
    },

    async rasterizar(): Promise<Uint8Array> {
      // Convertir una página de PDF en imagen exige un lienzo, y en Node eso
      // significa un módulo nativo. No se hace aquí: quien lo necesite es el
      // proveedor híbrido, y lo resuelve con el navegador que ya trae
      // Playwright. Ver `rasterizador.ts`.
      throw new Error('Este lector no rasteriza páginas. Usa el rasterizador basado en navegador.')
    },
  }
}
