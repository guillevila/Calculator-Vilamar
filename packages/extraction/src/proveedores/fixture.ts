/**
 * fixture.ts — Un proveedor que devuelve texto preparado.
 *
 * Sirve para dos cosas legítimas: probar todo el recorrido sin depender de un
 * PDF ni de un OCR, y poder seguir construyendo el resto del programa mientras
 * la lectura real de documentos madura.
 *
 * Lo que NO sirve es para decir que la extracción funciona. Un fixture
 * demuestra que el programa sabe interpretar un texto; no demuestra que sepa
 * leerlo de una imagen. En `PROJECT_STATUS.md` esa diferencia está escrita.
 */

import type {
  DocumentoEntrada,
  PaginaDocumento,
  ProveedorExtraccion,
  TextoDocumento,
} from '../contratos.js'

export class ProveedorFixture implements ProveedorExtraccion {
  readonly nombre = 'fixture'

  constructor(private readonly textos: Readonly<Record<string, string>>) {}

  puedeCon(): boolean {
    return true
  }

  async extraer(documento: DocumentoEntrada): Promise<TextoDocumento> {
    const texto = this.textos[documento.nombre] ?? this.textos[documento.id]
    if (texto === undefined) {
      return {
        paginas: [],
        proveedor: this.nombre,
        metodo: 'TEXTO_PDF',
        avisos: [`No hay ningún texto de prueba para «${documento.nombre}».`],
      }
    }
    return textoAUnDocumento(texto, this.nombre)
  }
}

/** Envuelve un texto plano como si fuera un documento de una página. */
export function textoAUnDocumento(
  texto: string,
  proveedor = 'texto',
  metodo: TextoDocumento['metodo'] = 'TEXTO_PDF',
  confianzaMedia?: number,
): TextoDocumento {
  const pagina: PaginaDocumento = { numero: 1, texto, bloques: [] }
  return { paginas: [pagina], proveedor, metodo, confianzaMedia, avisos: [] }
}
