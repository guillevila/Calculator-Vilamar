/**
 * vision-claude.ts — Leer el informe con un modelo de visión en vez de un OCR.
 *
 * ── Por qué existe esto ─────────────────────────────────────────────────────
 *
 * El reconocimiento de texto (tesseract) es un reconocedor de CARACTERES: mira
 * unos trazos y decide a qué letra se parecen. No sabe qué es un informe de
 * biometría. Por eso produce números equivocados con aspecto de correctos —está
 * medido en este proyecto: leyó **24.81 donde ponía 24.01, con un 93 % de
 * confianza**, y en el mismo documento un 24.07 leído bien declaraba un 79 %.
 *
 * Un modelo de visión lee el documento como lo lee una persona: ve la maqueta,
 * sabe que «AL» es una longitud axial en milímetros, que K1 y K2 llevan eje, y
 * que las dos columnas son los dos ojos. Esa comprensión es justo la
 * comprobación que el OCR no puede hacer.
 *
 * ── Lo que NO cambia ────────────────────────────────────────────────────────
 *
 * **Un dato leído por este lector sigue sin darse por bueno.** Entra con
 * procedencia `VISION`, que el dominio trata igual que `OCR`: sale en ámbar y
 * hay que comprobarlo uno a uno. Un modelo mejor equivocándose menos veces sigue
 * siendo un modelo que se equivoca, y aquí un número mal leído cambia la lente.
 * Ver la invariante 11.
 *
 * ── El dato sale del ordenador ──────────────────────────────────────────────
 *
 * Esto es lo único de todo el programa que manda algo a internet. El informe
 * —con lo que lleve escrito— viaja a la API de Anthropic. Son datos de salud.
 * Por eso está **apagado mientras no haya una clave configurada**: sin
 * `ANTHROPIC_API_KEY` este lector se declara no disponible y la aplicación usa
 * el OCR local, como hasta ahora. Encenderlo es una decisión del usuario, no un
 * comportamiento por defecto.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  CampoBiometrico,
  Dispositivo,
  Lateralidad,
  OjoBiometrico,
  Procedencia,
} from '@vilamar/domain'
import { CAMPOS, conMedida, crearMedida, definicionDe, ojoVacio } from '@vilamar/domain'
import type { DocumentoEntrada, LectorVision, ResultadoExtraccion } from '@vilamar/extraction'

/**
 * El modelo. Fijo y explícito, no configurable por variable de entorno.
 *
 * En una herramienta clínica importa poder decir con qué se leyó un informe. Si
 * el modelo pudiera cambiar por una variable suelta, dos lecturas del mismo
 * documento podrían no ser comparables y nadie sabría por qué. Cambiarlo es
 * cambiar el código, con su commit y su nota en el registro de cambios.
 */
export const MODELO = 'claude-opus-5'

/** Formatos que el modelo acepta directamente, sin convertir nada. */
const TIPOS_IMAGEN: Readonly<Record<string, 'image/jpeg' | 'image/png'>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/**
 * Los campos que se piden, con su descripción para el modelo.
 *
 * Se generan desde `REGISTRO_CAMPOS` del dominio a propósito: si mañana se añade
 * un campo, aparece aquí solo. Una segunda lista escrita a mano se desincroniza
 * el día que alguien toque una y no la otra, y el síntoma sería un campo que
 * nunca se lee sin que nadie entienda por qué.
 */
function catalogoDeCampos(): string {
  return CAMPOS.map((c) => {
    const d = definicionDe(c)
    const rango = d.limite ? ` [${d.limite.min}–${d.limite.max}]` : ''
    return `- ${c}: ${d.etiqueta} (${d.etiquetaClinica}), en ${d.unidad}${rango}`
  }).join('\n')
}

/** El esquema al que se obliga la respuesta. Nada fuera de esto puede volver. */
function esquema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['dispositivo', 'ojos', 'notas'],
    properties: {
      dispositivo: {
        type: 'string',
        enum: ['ANTERION', 'IOLMASTER_700', 'PENTACAM', 'DESCONOCIDO'],
        description:
          'El aparato que generó el informe, si se reconoce por su maqueta o su logotipo.',
      },
      ojos: {
        type: 'array',
        description:
          'Un elemento por cada ojo que aparezca en el documento. Si solo hay uno, un elemento.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['lado', 'comoSeSabe', 'medidas'],
          properties: {
            lado: { type: 'string', enum: ['OD', 'OS'] },
            comoSeSabe: {
              type: 'string',
              description:
                'Qué hay en el documento que indica que esta columna o sección es ese ojo (la etiqueta literal: «OD», «OS», «Right», «Left»…).',
            },
            medidas: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['campo', 'valor', 'textoOriginal'],
                properties: {
                  campo: { type: 'string', enum: [...CAMPOS] },
                  valor: {
                    type: 'number',
                    description:
                      'El número tal y como está impreso, sin convertir de unidad y sin redondear.',
                  },
                  textoOriginal: {
                    type: 'string',
                    description:
                      'La línea literal del informe de donde sale, copiada carácter a carácter. Sirve para que una persona la compare de un vistazo.',
                  },
                },
              },
            },
          },
        },
      },
      notas: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Cualquier cosa que quien revise deba saber: un dato borroso, una etiqueta ambigua, una unidad rara, algo que no encaja.',
      },
    },
  }
}

const INSTRUCCIONES = `Eres un lector de informes de biometría ocular. Tu único trabajo es TRANSCRIBIR lo que está impreso en el documento. No calculas, no interpretas y no aconsejas.

Reglas, por orden de importancia:

1. NO INVENTES NADA. Si un dato no está en el documento, no lo pongas. Una medida ausente es una medida ausente; no es un cero, ni un valor típico, ni un valor deducido del otro ojo.

2. NO CONVIERTAS UNIDADES ni redondees. Copia el número tal y como está impreso. Si pone 530 um, el valor es 530. Si pone 0.530 mm, el valor es 0.530 y lo dices en las notas.

3. NO MEZCLES LOS OJOS. La mayoría de estos informes traen dos columnas, una por ojo. Si no puedes determinar con seguridad de qué ojo es una columna, NO la asignes: devuelve la lista de ojos vacía y explícalo en las notas. Asignar mal un ojo es el peor error posible en este documento.

4. DISTINGUE ACD DE AQD. ACD se mide desde el epitelio corneal; AQD desde el endotelio. Se parecen y no son lo mismo. Si el informe no deja claro cuál es, no lo asignes y dilo en las notas.

5. CADA MEDIDA LLEVA SU LÍNEA ORIGINAL. En textoOriginal copia literalmente la línea del informe de donde sale el número, sin reescribirla. Es lo que permite a una persona comprobarlo sin volver al papel.

6. SI UN NÚMERO NO SE LEE CON CLARIDAD, no lo adivines: omítelo y dilo en las notas. Un hueco se ve; un número equivocado que parece razonable, no.

Campos que puedes devolver (no hay otros):

${catalogoDeCampos()}`

/** La forma de la respuesta, ya validada por el esquema. */
interface Leido {
  readonly dispositivo: Dispositivo
  readonly ojos: readonly {
    readonly lado: Lateralidad
    readonly comoSeSabe: string
    readonly medidas: readonly {
      readonly campo: CampoBiometrico
      readonly valor: number
      readonly textoOriginal: string
    }[]
  }[]
  readonly notas: readonly string[]
}

export interface OpcionesVision {
  /** La clave. Si no hay, el lector se declara no disponible. */
  readonly clave?: string | undefined
  readonly ahora?: () => string
}

/**
 * Crea el lector. Nunca lanza al crearse: si no hay clave, se crea apagado.
 *
 * Se construye siempre, disponible o no, para que la aplicación pueda decir en
 * la interfaz «hay un lector mejor, y está apagado» en lugar de comportarse
 * distinto sin explicar por qué.
 */
export function crearLectorVision(opciones: OpcionesVision = {}): LectorVision {
  const clave = opciones.clave ?? process.env['ANTHROPIC_API_KEY']
  const ahora = opciones.ahora ?? ((): string => new Date().toISOString())

  return {
    nombre: `Claude (${MODELO})`,

    disponible: () => typeof clave === 'string' && clave.trim().length > 0,

    porQueNoDisponible:
      'No hay clave de API configurada. Se está usando el reconocimiento de texto local, que se equivoca más. Para activarlo, pon ANTHROPIC_API_KEY en el fichero .env.',

    async leer(documento: DocumentoEntrada): Promise<ResultadoExtraccion> {
      if (typeof clave !== 'string' || clave.trim().length === 0) {
        throw new Error('El lector de visión no está configurado.')
      }
      const cliente = new Anthropic({ apiKey: clave })
      const respuesta = await cliente.messages.create({
        model: MODELO,
        max_tokens: 16000,
        // Un informe de biometría es denso y hay que mirarlo con cuidado; que el
        // modelo decida cuánto pensar es mejor que fijarlo a ojo.
        thinking: { type: 'adaptive' },
        system: INSTRUCCIONES,
        output_config: { format: { type: 'json_schema', schema: esquema() } },
        messages: [
          {
            role: 'user',
            content: [
              contenidoDelDocumento(documento),
              {
                type: 'text',
                text: 'Transcribe los datos de biometría de este informe siguiendo las reglas.',
              },
            ],
          },
        ],
      })

      // Antes de leer el contenido hay que mirar por qué paró. Si el modelo se
      // negó, `content` puede venir vacío y leer `content[0]` reventaría con un
      // error que no le dice nada a nadie.
      if (respuesta.stop_reason === 'refusal') {
        throw new Error(
          'El modelo no ha querido procesar este documento. Usa la lectura local o escribe los datos a mano.',
        )
      }
      if (respuesta.stop_reason === 'max_tokens') {
        throw new Error(
          'La respuesta se ha cortado por ser demasiado larga. Prueba a subir las páginas por separado.',
        )
      }

      const bruto = respuesta.content.find((b) => b.type === 'text')
      if (!bruto || bruto.type !== 'text') {
        throw new Error('El modelo no ha devuelto ningún dato.')
      }
      const leido = JSON.parse(bruto.text) as Leido
      return aResultado(documento, leido, ahora())
    },
  }
}

/** Un PDF va como documento (el modelo lo abre él); una imagen, como imagen. */
function contenidoDelDocumento(documento: DocumentoEntrada): Anthropic.ContentBlockParam {
  const base64 = Buffer.from(documento.datos).toString('base64')
  if (documento.formato === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    }
  }
  const tipo = TIPOS_IMAGEN[documento.formato]
  if (!tipo) {
    throw new Error(`No se puede mandar un archivo «${documento.formato}» al lector de visión.`)
  }
  return { type: 'image', source: { type: 'base64', media_type: tipo, data: base64 } }
}

/**
 * Convierte lo leído en medidas del dominio.
 *
 * Aquí es donde cada dato recibe su procedencia `VISION` y su evidencia. Todo
 * lo que salga de esta función queda marcado como leído por una máquina, y por
 * tanto pendiente de que lo compruebe una persona.
 */
export function aResultado(
  documento: DocumentoEntrada,
  leido: Leido,
  cuando: string,
): ResultadoExtraccion {
  const avisos: string[] = [
    'Este informe lo ha leído un modelo de visión. Acierta mucho más que el reconocimiento de texto, pero sigue sin ser una lectura exacta: comprueba cada dato contra el documento antes de confirmarlo.',
    ...leido.notas,
  ]

  const ojos: Partial<Record<Lateralidad, OjoBiometrico>> = {}
  const explicaciones: string[] = []

  for (const bloque of leido.ojos) {
    // Dos bloques para el mismo ojo significa que el modelo no ha sabido
    // separarlos. Antes que quedarse con uno al azar, se descartan los dos.
    if (ojos[bloque.lado]) {
      avisos.push(
        `El documento parece traer dos veces el ojo ${bloque.lado}. No se ha cogido ninguno de los dos: revísalo y escribe los valores a mano.`,
      )
      delete ojos[bloque.lado]
      continue
    }

    let ojo = ojoVacio(bloque.lado)
    for (const m of bloque.medidas) {
      // Un valor no finito no es un dato. Se descarta con aviso, no en silencio.
      if (!Number.isFinite(m.valor)) {
        avisos.push(`No se ha podido leer ${m.campo} de ${bloque.lado}: el valor no es un número.`)
        continue
      }
      const procedencia: Procedencia = {
        metodo: 'VISION',
        documentoId: documento.id,
        registradoEn: cuando,
        evidencia: { texto: m.textoOriginal, pagina: 1 },
      }
      ojo = conMedida(ojo, crearMedida(m.campo, bloque.lado, m.valor, procedencia))
    }
    ojos[bloque.lado] = ojo
    explicaciones.push(`${bloque.lado}: ${bloque.comoSeSabe}`)
  }

  if (Object.keys(ojos).length === 0) {
    avisos.push(
      'No se ha podido saber con seguridad de qué ojo son los datos, así que no se ha rellenado ninguno. Es la única forma de no mezclarlos. Escribe tú los valores del ojo que corresponda.',
    )
  }

  return {
    documentoId: documento.id,
    dispositivo: {
      dispositivo: leido.dispositivo,
      // El modelo no devuelve una puntuación numérica, y no se inventa una: o
      // ha reconocido el aparato o no.
      confianza: leido.dispositivo === 'DESCONOCIDO' ? 0 : 1,
      indicios: ['Reconocido por el modelo de visión a partir de la maqueta del informe.'],
    },
    disposicion: Object.keys(ojos).length === 2 ? 'DOS_COLUMNAS' : 'UN_OJO',
    explicacionOjos:
      explicaciones.length > 0
        ? explicaciones.join(' · ')
        : 'No se ha identificado ningún ojo en el documento.',
    ojos,
    avisos,
    proveedor: `Claude (${MODELO})`,
    metodo: 'VISION',
  }
}
