/**
 * proveedor.ts — El proveedor de lectura que usa la aplicación.
 *
 * Junta las tres piezas y decide cuál toca:
 *
 *   imagen (JPG/PNG)          → OCR
 *   PDF con capa de texto     → texto nativo (exacto, instantáneo)
 *   PDF sin texto (escaneado) → se convierte cada página en imagen → OCR
 *
 * La decisión no es «es un PDF, luego trae texto». Muchísimos informes de
 * biometría son un PDF con una foto dentro y cuatro palabras de cabecera. Si se
 * diera por bueno ese texto, el OCR no llegaría a ejecutarse nunca y el informe
 * saldría vacío sin que nadie entendiera por qué. Por eso se mira CUÁNTO texto
 * hay, y por debajo de un mínimo se trata como escaneado.
 */

import type {
  DocumentoEntrada,
  LectorPdf,
  MotorOcr,
  PaginaDocumento,
  ProveedorExtraccion,
  TextoDocumento,
} from '@vilamar/extraction'
import { MINIMO_CARACTERES_TEXTO_NATIVO } from '@vilamar/extraction'

import type { Rasterizador } from './rasterizador.js'

export interface PiezasProveedor {
  readonly lectorPdf: LectorPdf
  readonly motorOcr: MotorOcr
  readonly rasterizador: Rasterizador
  /** Cuántas páginas se procesan como mucho. Un PDF de 40 páginas no se OCRea entero. */
  readonly maximoPaginasOcr?: number
}

export class ProveedorDocumentos implements ProveedorExtraccion {
  readonly nombre = 'local (texto de PDF + OCR)'

  constructor(private readonly piezas: PiezasProveedor) {}

  puedeCon(documento: DocumentoEntrada): boolean {
    return ['pdf', 'jpg', 'jpeg', 'png'].includes(documento.formato)
  }

  async extraer(documento: DocumentoEntrada): Promise<TextoDocumento> {
    if (documento.formato === 'pdf') return this.extraerDePdf(documento)
    return this.extraerDeImagen(documento)
  }

  private async extraerDeImagen(documento: DocumentoEntrada): Promise<TextoDocumento> {
    try {
      const r = await this.piezas.motorOcr.reconocer(documento.datos)
      const avisos: string[] = []
      if (r.confianzaMedia < 0.6) {
        avisos.push(
          `El reconocimiento de esta imagen ha salido con poca fiabilidad (${Math.round(
            r.confianzaMedia * 100,
          )} %). Revisa los datos con especial cuidado; si la imagen está borrosa o torcida, una foto mejor da mejor resultado.`,
        )
      }
      return {
        paginas: [{ numero: 1, texto: r.texto, bloques: r.bloques }],
        proveedor: this.piezas.motorOcr.nombre,
        metodo: 'OCR',
        confianzaMedia: r.confianzaMedia,
        avisos,
      }
    } catch (error) {
      return this.fallo(error, 'OCR')
    }
  }

  private async extraerDePdf(documento: DocumentoEntrada): Promise<TextoDocumento> {
    let paginas: readonly PaginaDocumento[] = []
    try {
      paginas = await this.piezas.lectorPdf.leer(documento.datos)
    } catch (error) {
      return this.fallo(error, 'TEXTO_PDF', 'No se ha podido abrir el PDF. Puede estar dañado.')
    }

    const caracteres = paginas.reduce((s, p) => s + p.texto.replace(/\s/g, '').length, 0)
    if (caracteres >= MINIMO_CARACTERES_TEXTO_NATIVO) {
      return {
        paginas,
        proveedor: 'texto nativo del PDF',
        metodo: 'TEXTO_PDF',
        avisos: [],
      }
    }

    // Poco texto: es un PDF escaneado. Se pasa por el OCR.
    return this.ocrDePdfEscaneado(documento, paginas.length)
  }

  private async ocrDePdfEscaneado(
    documento: DocumentoEntrada,
    numeroPaginas: number,
  ): Promise<TextoDocumento> {
    const tope = this.piezas.maximoPaginasOcr ?? 5
    const total = Math.max(1, numeroPaginas)
    const aLeer = Math.min(total, tope)
    const avisos: string[] = [
      'Este PDF no traía texto dentro: es una imagen escaneada. Se ha leído con reconocimiento de texto, que puede equivocarse. Revisa los datos con más cuidado de lo normal.',
    ]
    // Si se recorta, se dice. Un recorte silencioso se lee como «lo he mirado todo».
    if (total > aLeer) {
      avisos.push(
        `El documento tiene ${total} páginas y se han leído las ${aLeer} primeras. Si los datos están más adelante, sube esas páginas por separado.`,
      )
    }

    const paginas: PaginaDocumento[] = []
    const confianzas: number[] = []

    for (let n = 1; n <= aLeer; n++) {
      try {
        const imagen = await this.piezas.rasterizador.rasterizar(documento.datos, n, 2)
        const r = await this.piezas.motorOcr.reconocer(imagen)
        paginas.push({ numero: n, texto: r.texto, bloques: r.bloques })
        confianzas.push(r.confianzaMedia)
      } catch (error) {
        avisos.push(
          `No se ha podido leer la página ${n}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    const media =
      confianzas.length > 0 ? confianzas.reduce((a, b) => a + b, 0) / confianzas.length : 0
    if (confianzas.length > 0 && media < 0.6) {
      avisos.push(
        `El reconocimiento ha salido con poca fiabilidad (${Math.round(media * 100)} %). Revisa cada dato contra el informe original.`,
      )
    }

    return {
      paginas,
      proveedor: `${this.piezas.motorOcr.nombre} sobre página rasterizada`,
      metodo: 'OCR',
      confianzaMedia: confianzas.length > 0 ? media : undefined,
      avisos,
    }
  }

  private fallo(
    error: unknown,
    metodo: TextoDocumento['metodo'],
    mensaje?: string,
  ): TextoDocumento {
    return {
      paginas: [],
      proveedor: this.nombre,
      metodo,
      avisos: [
        mensaje ??
          `No se ha podido leer el documento. ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
}
