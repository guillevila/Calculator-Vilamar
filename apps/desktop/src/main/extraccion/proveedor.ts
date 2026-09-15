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
import { traeTextoDeVerdad } from '@vilamar/extraction'

import type { Rasterizador } from './rasterizador.js'

/**
 * Por debajo de esta fiabilidad, una lectura se enseña como «poca
 * fiabilidad» — y, desde D59 (02/09/2026), es también la señal para probar
 * a leer la imagen girada. No es una medida clínica: es el punto en el que,
 * medido con documentos reales, el reconocimiento ya no es de fiar (ver
 * `PROJECT_STATUS.md`, «Cuánto acierta el lector local»).
 */
export const UMBRAL_FIABILIDAD_BAJA = 0.6

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
      // Toda imagen pasa por el navegador y sale como PNG limpio del tamaño
      // que mejor lee el OCR. El navegador decodifica muchos más formatos que
      // tesseract, así que esto convierte un «Error attempting to read image»
      // en un informe legible. Si ni el navegador puede, lanza con un mensaje
      // que se entiende.
      const preparada = await this.piezas.rasterizador.prepararParaOcr(documento.datos)
      const { resultado: r, giroUsado } = await this.mejorGiro(preparada)
      const avisos: string[] = []
      if (giroUsado !== 0) {
        avisos.push(
          `La imagen estaba girada y se ha corregido antes de leerla (${giroUsado}°). Comprueba igualmente los datos.`,
        )
      }
      if (r.confianzaMedia < UMBRAL_FIABILIDAD_BAJA) {
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

  /**
   * Lee una imagen ya preparada probando también girada, si hace falta.
   *
   * El OCR no corrige el giro por su cuenta (D59, 02/09/2026): una foto de
   * móvil torcida o subida de lado sale con el texto ilegible y el
   * reconocimiento no saca casi nada. Aquí no se adivina el ángulo con
   * heurísticas: se lee tal cual, y **solo si esa primera lectura ya sale
   * poco fiable** (el mismo umbral que ya avisa al usuario, `UMBRAL_FIABILIDAD_BAJA`)
   * se prueba a girar 90°, 180° y 270° y se elige la lectura con más
   * fiabilidad de las cuatro. Con una foto bien orientada —el caso normal—
   * esto no añade ningún trabajo de más: se queda en la primera lectura.
   */
  private async mejorGiro(
    imagenPreparada: Uint8Array,
  ): Promise<{ resultado: Awaited<ReturnType<MotorOcr['reconocer']>>; giroUsado: 0 | 90 | 180 | 270 }> {
    const primera = await this.piezas.motorOcr.reconocer(imagenPreparada)
    if (primera.confianzaMedia >= UMBRAL_FIABILIDAD_BAJA) {
      return { resultado: primera, giroUsado: 0 }
    }

    let mejor = primera
    let giroUsado: 0 | 90 | 180 | 270 = 0
    for (const grados of [90, 180, 270] as const) {
      const girada = await this.piezas.rasterizador.rotar(imagenPreparada, grados)
      const resultado = await this.piezas.motorOcr.reconocer(girada)
      if (resultado.confianzaMedia > mejor.confianzaMedia) {
        mejor = resultado
        giroUsado = grados
      }
    }
    return { resultado: mejor, giroUsado }
  }

  private async extraerDePdf(documento: DocumentoEntrada): Promise<TextoDocumento> {
    let paginas: readonly PaginaDocumento[] = []
    try {
      paginas = await this.piezas.lectorPdf.leer(documento.datos)
    } catch (error) {
      return this.fallo(error, 'TEXTO_PDF', 'No se ha podido abrir el PDF. Puede estar dañado.')
    }

    // No basta con contar caracteres: un informe corto pero con texto perfecto
    // —un solo ojo, pocas líneas— se mandaba al OCR sin necesidad, y se leía
    // peor teniendo el texto exacto delante. Ver `traeTextoDeVerdad`.
    const todoElTexto = paginas.map((p) => p.texto).join('\n')
    if (traeTextoDeVerdad(todoElTexto)) {
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
      'Este PDF no traía texto dentro (o traía muy poco): se ha leído con reconocimiento de texto sobre la imagen, que puede equivocarse. Revisa los datos con más cuidado de lo normal.',
    ]
    // Si se recorta, se dice. Un recorte silencioso se lee como «lo he mirado todo».
    if (total > aLeer) {
      avisos.push(
        `El documento tiene ${total} páginas y se han leído las ${aLeer} primeras. Si los datos están más adelante, sube esas páginas por separado.`,
      )
    }

    const paginas: PaginaDocumento[] = []
    const confianzas: number[] = []
    let algunaGirada = false

    for (let n = 1; n <= aLeer; n++) {
      try {
        // Dos pasos, y en este orden: dibujar la página a tamaño moderado y
        // AMPLIARLA después. Dibujar directamente a alta resolución sale peor
        // —está medido en `ANCHO_RASTERIZADO_OCR`, con tabla— porque reproduce
        // los defectos de compresión de la imagen incrustada a tamaño completo.
        const imagen = await this.piezas.rasterizador.rasterizar(documento.datos, n)
        const lista = await this.piezas.rasterizador.prepararParaOcr(imagen)
        const { resultado: r, giroUsado } = await this.mejorGiro(lista)
        if (giroUsado !== 0) algunaGirada = true
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

    if (algunaGirada) {
      avisos.push(
        'Alguna página estaba girada y se ha corregido antes de leerla. Comprueba igualmente los datos.',
      )
    }

    const media =
      confianzas.length > 0 ? confianzas.reduce((a, b) => a + b, 0) / confianzas.length : 0
    if (confianzas.length > 0 && media < UMBRAL_FIABILIDAD_BAJA) {
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
