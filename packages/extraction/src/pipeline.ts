/**
 * pipeline.ts — De un documento a datos con procedencia.
 *
 *   documento → texto → qué aparato es → qué ojo es cada cosa → medidas
 *
 * Lo que sale de aquí NO está listo para calcular: está listo para que una
 * persona lo revise. Ninguna de estas funciones confirma nada.
 */

import type {
  DispositivoDetectado,
  Lateralidad,
  Medida,
  OjoBiometrico,
  Procedencia,
} from '@vilamar/domain'
import { conMedida, crearMedida, ojoVacio } from '@vilamar/domain'

import type { DocumentoEntrada, ProveedorExtraccion, TextoDocumento } from './contratos.js'
import { detectarDispositivo } from './deteccion/detector.js'
import { reglasDe } from './parsers/dispositivos.js'
import type { Extraido } from './parsers/nucleo.js'
import { aplicarReglas } from './parsers/nucleo.js'
import type { Disposicion } from './parsers/segmentar.js'
import { segmentarPorOjo } from './parsers/segmentar.js'

export interface ResultadoExtraccion {
  readonly documentoId: string
  readonly dispositivo: DispositivoDetectado
  readonly disposicion: Disposicion
  /** En qué se ha basado para separar los ojos. Se enseña al usuario. */
  readonly explicacionOjos: string
  readonly ojos: Readonly<Partial<Record<Lateralidad, OjoBiometrico>>>
  /** Cosas que el usuario tiene que saber, en lenguaje normal. */
  readonly avisos: readonly string[]
  readonly proveedor: string
  readonly metodo: TextoDocumento['metodo']
}

/**
 * Convierte lo leído en medidas del dominio, cada una con su procedencia.
 */
function aMedidas(
  extraidos: readonly Extraido[],
  ojo: Lateralidad,
  documentoId: string,
  dispositivoId: string,
  metodo: TextoDocumento['metodo'],
  cuando: string,
): readonly Medida[] {
  return extraidos.map((e) => {
    const procedencia: Procedencia = {
      metodo,
      documentoId,
      dispositivoId,
      confianza: e.confianza,
      registradoEn: cuando,
      evidencia: { texto: e.evidencia, pagina: e.pagina, regla: e.regla },
    }
    // Se crea la medida SIN confirmar. Confirmar es de la persona.
    return crearMedida(e.campo, ojo, e.valor, procedencia, false)
  })
}

export interface OpcionesExtraccion {
  /** Reloj inyectado: el dominio no llama a `Date.now()` por su cuenta. */
  readonly ahora: () => string
}

/**
 * Lee un documento entero y devuelve lo que ha encontrado, por ojo.
 */
export async function extraerDocumento(
  documento: DocumentoEntrada,
  proveedor: ProveedorExtraccion,
  opciones: OpcionesExtraccion,
): Promise<ResultadoExtraccion> {
  const texto = await proveedor.extraer(documento)
  return interpretarTexto(documento.id, texto, opciones)
}

/**
 * La parte que no toca ficheros: de texto ya leído a medidas.
 *
 * Está separada a propósito para poder probarla con textos sintéticos, sin PDF,
 * sin OCR y sin navegador.
 */
export function interpretarTexto(
  documentoId: string,
  texto: TextoDocumento,
  opciones: OpcionesExtraccion,
): ResultadoExtraccion {
  const cuando = opciones.ahora()
  const avisos: string[] = [...texto.avisos]

  const dispositivo = detectarDispositivo(texto)
  if (dispositivo.dispositivo === 'DESCONOCIDO') {
    avisos.push(
      'No se ha reconocido el aparato que generó el informe. Se ha leído con reglas generales, así que revisa los datos con más cuidado de lo normal.',
    )
  }

  const completo = texto.paginas.map((p) => p.texto).join('\n')
  const bloques = texto.paginas.flatMap((p) => p.bloques)
  const segmentacion = segmentarPorOjo(completo, bloques)

  if (segmentacion.disposicion === 'DESCONOCIDA') {
    avisos.push(
      'El documento no dice claramente qué datos son de cada ojo. No se ha asignado ninguno: indícalo tú antes de calcular.',
    )
  }

  const reglas = reglasDe(dispositivo.dispositivo)
  const ojos: Partial<Record<Lateralidad, OjoBiometrico>> = {}

  for (const lado of ['OD', 'OS'] as const) {
    const trozo = segmentacion.porOjo[lado]
    if (trozo === undefined) continue

    // La página se atribuye por dónde aparece la mayor parte del texto del ojo.
    const pagina = paginaDe(texto, trozo)
    const extraidos = aplicarReglas(trozo, reglas, pagina, texto.confianzaMedia)
    if (extraidos.length === 0) continue

    let ojo = ojoVacio(lado)
    for (const medida of aMedidas(
      extraidos,
      lado,
      documentoId,
      dispositivo.dispositivo,
      texto.metodo,
      cuando,
    )) {
      ojo = conMedida(ojo, medida)
    }
    ojos[lado] = ojo
  }

  if (Object.keys(ojos).length === 0) {
    avisos.push(
      'No se ha podido leer ningún dato biométrico de este documento. Puedes escribirlos a mano.',
    )
  }

  return {
    documentoId,
    dispositivo,
    disposicion: segmentacion.disposicion,
    explicacionOjos: segmentacion.explicacion,
    ojos,
    avisos,
    proveedor: texto.proveedor,
    metodo: texto.metodo,
  }
}

/** En qué página está la mayor parte de un trozo de texto. */
function paginaDe(texto: TextoDocumento, trozo: string): number {
  const muestra = trozo.slice(0, 200)
  for (const pagina of texto.paginas) {
    if (pagina.texto.includes(muestra.slice(0, 40))) return pagina.numero
  }
  return texto.paginas[0]?.numero ?? 1
}
