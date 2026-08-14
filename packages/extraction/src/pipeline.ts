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
  LenteDetectada,
  Medida,
  OjoBiometrico,
  Procedencia,
} from '@vilamar/domain'
import {
  conMedida,
  crearMedida,
  describirLente,
  lentesContradictorias,
  nombreLateralidad,
  normalizarOjo,
  ojoVacio,
  perfilDe,
  sinRepetidas,
} from '@vilamar/domain'

import type { DocumentoEntrada, ProveedorExtraccion, TextoDocumento } from './contratos.js'
import { detectarDispositivo } from './deteccion/detector.js'
import { reglasDe } from './parsers/dispositivos.js'
import { extraerLentes } from './parsers/lentes.js'
import type { DatosDePaciente } from './parsers/paciente.js'
import { extraerDatosDePaciente } from './parsers/paciente.js'
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
  /**
   * Los modelos de lente que el informe nombra, con su constante A.
   *
   * **Fuera de `ojos` a propósito.** Una constante A pertenece al modelo de lente,
   * no al ojo: la misma lente lleva la misma constante se implante en el derecho o
   * en el izquierdo. Ponerla dentro de un ojo obligaría a decidir de qué ojo es una
   * tabla que no habla de ojos.
   *
   * Y ninguna de estas es todavía la `CONSTANTE_A` del caso. Son las candidatas;
   * cuál vale lo decide quien elige la lente.
   */
  readonly lentes: readonly LenteDetectada[]
  /**
   * El sexo y el nombre, cuando el informe los trae.
   *
   * Fuera de `ojos` por lo mismo que las lentes: una persona no tiene un sexo
   * por ojo. El nombre entra solo para poder deducir el sexo que pide una de las
   * calculadoras, y **no sale de este ordenador** — ver `parsers/paciente.ts`.
   */
  readonly paciente: DatosDePaciente
  /** Cosas que el usuario tiene que saber, en lenguaje normal. */
  readonly avisos: readonly string[]
  readonly proveedor: string
  readonly metodo: TextoDocumento['metodo']
}

/**
 * Un lector que entiende el documento, en vez de reconocer caracteres.
 *
 * Devuelve directamente el resultado, sin pasar por el texto ni por las reglas
 * de cada aparato: un modelo de visión ve la maqueta y sabe qué es cada número,
 * así que buscar «AL» con una expresión regular sobre su transcripción sería
 * tirar por el camino la parte útil.
 *
 * Es opcional a propósito. Manda el documento fuera del ordenador, y eso lo
 * decide quien lo usa, no el programa: mientras no esté configurado, la
 * aplicación lee en local igual que siempre.
 */
export interface LectorVision {
  readonly nombre: string
  /** ¿Está configurado? Si no, se lee en local, y eso no es un error. */
  disponible(): boolean
  /** Por qué no está disponible, en lenguaje normal. Se enseña al usuario. */
  readonly porQueNoDisponible: string
  leer(documento: DocumentoEntrada): Promise<ResultadoExtraccion>
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

    // Aquí termina la lectura literal y empieza la normalización del aparato.
    // Hasta esta línea, lo que hay es exactamente lo que pone el informe; a
    // partir de ella puede haber además algún dato canónico obtenido de otros
    // del mismo informe, siempre marcado como derivado y con la cuenta escrita.
    //
    // La capa vive en el dominio y no en un parser a propósito: decidir que en
    // este aparato la ACD es la AQD más el grosor corneal es conocimiento
    // clínico, no conocimiento de cómo está maquetado el PDF.
    const normalizado = normalizarOjo(ojo, dispositivo.dispositivo, cuando)
    ojos[lado] = normalizado.ojo
    // Se dice de qué ojo habla cada aviso. Con dos ojos sin ACD, si no, salen
    // dos mensajes idénticos y no hay forma de saber a cuál mirar.
    avisos.push(...normalizado.avisos.map((a) => `${nombreLateralidad(lado)}: ${a}`))
  }

  if (Object.keys(ojos).length === 0) {
    // Antes de decir «no he encontrado nada», hay que comprobar si es verdad.
    //
    // Hay un caso muy concreto en el que no lo es: los datos SÍ se han leído,
    // pero no se ha podido determinar de qué ojo son, así que no se ha asignado
    // ninguno. Decirle al usuario que no hay nada cuando el problema es otro le
    // manda a teclear trece datos que el programa ya tiene delante.
    const sueltos = aplicarReglas(completo, reglas, 1, texto.confianzaMedia)
    if (sueltos.length > 0) {
      avisos.push(
        `Se han reconocido ${sueltos.length} datos en el documento, pero NO se ha podido saber de qué ojo son, así que no se ha asignado ninguno. ` +
          'Es la única forma segura de no mezclar los dos ojos. Indica tú los valores del ojo que corresponda; los tienes en el documento original.',
      )
    } else {
      avisos.push(
        'No se ha podido leer ningún dato biométrico de este documento. Puedes escribirlos a mano.',
      )
    }
  }

  // ── La tabla de lentes ────────────────────────────────────────────────────
  //
  // Se lee del documento COMPLETO, no de los trozos por ojo, y eso es una
  // decisión con motivo: la tabla de modelos de LIO no habla de ojos. En un
  // informe a dos columnas caería en la columna de un ojo por pura maqueta, y
  // entonces la misma lente saldría solo para OD; en uno por secciones podría
  // aparecer repetida bajo cada ojo, y saldría dos veces.
  //
  // Leyendo el documento entero y quitando las repeticiones exactas, los dos
  // formatos dan lo mismo: la lista de lentes que el informe propone. Si la misma
  // lente aparece con constantes DISTINTAS, eso NO se unifica — se conserva y se
  // avisa, porque es una contradicción del documento y no del programa.
  const lentes = leerLentes(completo, texto, documentoId, dispositivo, cuando)
  const contradictorias = lentesContradictorias(lentes)
  if (contradictorias.length > 0) {
    avisos.push(
      `El informe nombra la misma lente con constantes A distintas: ${contradictorias
        .map(describirLente)
        .join(' · ')}. No se ha elegido ninguna — compruébalo en el informe.`,
    )
  }

  return {
    documentoId,
    dispositivo,
    disposicion: segmentacion.disposicion,
    explicacionOjos: segmentacion.explicacion,
    ojos,
    lentes,
    paciente: extraerDatosDePaciente(completo),
    avisos,
    proveedor: texto.proveedor,
    metodo: texto.metodo,
  }
}

/**
 * Lee la tabla de lentes, si el perfil del aparato dice cómo está montada.
 *
 * Con `NINGUNA` no se mira el texto siquiera. Es la guarda que impide que «un
 * número junto a SRK/T» se convierta en una constante A en cualquier documento.
 */
function leerLentes(
  completo: string,
  texto: TextoDocumento,
  documentoId: string,
  dispositivo: DispositivoDetectado,
  cuando: string,
): readonly LenteDetectada[] {
  const perfil = perfilDe(dispositivo.dispositivo)
  const leidas = extraerLentes(completo, perfil.tablaDeLentes, 1, texto.confianzaMedia)

  return sinRepetidas(
    leidas.map((l) => ({
      modelo: l.modelo,
      ...(l.fabricante !== undefined ? { fabricante: l.fabricante } : {}),
      ...(l.constanteA !== undefined ? { constanteA: l.constanteA } : {}),
      ...(l.etiquetaConstante !== undefined ? { etiquetaConstante: l.etiquetaConstante } : {}),
      procedencia: {
        metodo: texto.metodo,
        documentoId,
        dispositivoId: dispositivo.dispositivo,
        ...(texto.confianzaMedia !== undefined ? { confianza: texto.confianzaMedia } : {}),
        registradoEn: cuando,
        evidencia: { texto: l.evidencia, pagina: l.pagina, regla: l.regla },
      },
    })),
  )
}

/** En qué página está la mayor parte de un trozo de texto. */
function paginaDe(texto: TextoDocumento, trozo: string): number {
  const muestra = trozo.slice(0, 200)
  for (const pagina of texto.paginas) {
    if (pagina.texto.includes(muestra.slice(0, 40))) return pagina.numero
  }
  return texto.paginas[0]?.numero ?? 1
}
