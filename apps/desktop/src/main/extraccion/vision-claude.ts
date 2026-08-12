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
import {
  CAMPOS,
  conMedida,
  crearMedida,
  definicionDe,
  nombreLateralidad,
  normalizarOjo,
  ojoVacio,
} from '@vilamar/domain'
import type { DocumentoEntrada, LectorVision, ResultadoExtraccion } from '@vilamar/extraction'

import type { Uso } from './precios.js'

export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * El modelo con el que lee la aplicación.
 *
 * Fijo en el código y no en una variable de entorno: en una herramienta clínica
 * importa poder decir con qué se leyó cada informe, y un modelo cambiable por
 * una variable suelta haría que dos lecturas del mismo documento pudieran no ser
 * comparables sin que nadie supiera por qué (decisión D18).
 *
 * **Por qué este y no el más caro.** La regla de elección es: *el modelo más
 * barato que acierte TODO*. Un informe cuesta céntimos con cualquiera de ellos,
 * así que la pregunta útil no es «cuál es el mejor» sino «a partir de cuál deja
 * de mejorar». Eso se mide con `pnpm comparar:lectores`, que imprime aciertos y
 * coste real de cada modelo sobre los mismos documentos.
 *
 * ⚠️ PROVISIONAL mientras no se ejecute esa comparación: está elegido por
 * criterio, no por medición. En este proyecto el criterio ya ha perdido dos
 * veces contra la medición (la resolución del rasterizado y la fiabilidad del
 * OCR), así que no se da por bueno hasta que haya tabla.
 */
export const MODELO = 'claude-sonnet-5'

/**
 * Cuánto piensa antes de responder.
 *
 * Transcribir un informe no es un problema de razonamiento profundo: es mirar
 * con cuidado. Y pensar se paga como salida, que es la parte cara. `medium` es
 * el punto de partida; el comparador prueba también `low` y `high` para ver si
 * la diferencia se nota en los aciertos o solo en la factura.
 *
 * ⚠️ Provisional, igual que `MODELO`.
 */
export const ESFUERZO: Esfuerzo = 'medium'

/** Tope de tamaño. Por encima, un aviso claro en vez de un error crudo de la API. */
const MAXIMO_BYTES = 20 * 1024 * 1024

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
export function catalogoDeCampos(): string {
  return CAMPOS.map((c) => {
    const d = definicionDe(c)
    const rango = d.limite ? ` [${d.limite.min}-${d.limite.max}]` : ''
    return `- ${c}: ${d.etiqueta} (${d.etiquetaClinica}), en ${d.unidad}${rango}`
  }).join('\n')
}

/** El esquema al que se obliga la respuesta. Nada fuera de esto puede volver. */
export function esquema(): Record<string, unknown> {
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
                'Qué hay en el documento que indica que esta columna o sección es ese ojo (la etiqueta literal: OD, OS, Right, Left...).',
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

/** Las instrucciones. Idénticas en todas las lecturas, para poder cachearlas. */
export function instrucciones(): string {
  return `Eres un lector de informes de biometría ocular. Tu único trabajo es TRANSCRIBIR lo que está impreso en el documento. No calculas, no interpretas y no aconsejas.

Reglas, por orden de importancia:

1. NO INVENTES NADA. Si un dato no está en el documento, no lo pongas. Una medida ausente es una medida ausente; no es un cero, ni un valor típico, ni un valor deducido del otro ojo.

2. NO CONVIERTAS UNIDADES ni redondees. Copia el número tal y como está impreso. Si pone 530 um, el valor es 530. Si pone 0.530 mm, el valor es 0.530 y lo dices en las notas.

3. NO MEZCLES LOS OJOS. La mayoría de estos informes traen dos columnas, una por ojo. Si no puedes determinar con seguridad de qué ojo es una columna, NO la asignes: devuelve la lista de ojos vacía y explícalo en las notas. Asignar mal un ojo es el peor error posible en este documento.

4. DISTINGUE ACD DE AQD. ACD se mide desde el epitelio corneal; AQD desde el endotelio. Se parecen y no son lo mismo. Si el informe no deja claro cuál es, no lo asignes y dilo en las notas.

5. CADA MEDIDA LLEVA SU LÍNEA ORIGINAL. En textoOriginal copia literalmente la línea del informe de donde sale el número, sin reescribirla. Es lo que permite a una persona comprobarlo sin volver al papel.

6. SI UN NÚMERO NO SE LEE CON CLARIDAD, no lo adivines: omítelo y dilo en las notas. Un hueco se ve; un número equivocado que parece razonable, no.

Campos que puedes devolver (no hay otros):

${catalogoDeCampos()}`
}

/** La forma de la respuesta, ya validada por el esquema. */
export interface Leido {
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
  /** Solo para el comparador. La aplicación no lo pasa: usa `MODELO`. */
  readonly modelo?: string
  readonly esfuerzo?: Esfuerzo
  /** Pensar antes de responder. Se paga como salida, así que se puede apagar. */
  readonly pensar?: boolean
}

/**
 * Ajustes que dependen del modelo.
 *
 * No todos aceptan lo mismo, y pedirle a uno algo que no admite es un error 400
 * en mitad de una lectura. Se resuelve aquí, en un sitio, y no repartido por el
 * fichero.
 */
export function ajustesDelModelo(
  modelo: string,
  esfuerzo: Esfuerzo,
  pensar: boolean,
): Record<string, unknown> {
  const formato = { type: 'json_schema', schema: esquema() }

  if (modelo.startsWith('claude-haiku')) {
    // Anterior a la familia 4.6: no admite `effort`, y pensar se pide con un
    // presupuesto de tokens en vez de con un nivel.
    const salida: Record<string, unknown> = { output_config: { format: formato } }
    if (pensar) salida['thinking'] = { type: 'enabled', budget_tokens: 4000 }
    return salida
  }

  if (!pensar && (esfuerzo === 'xhigh' || esfuerzo === 'max')) {
    // Apagar el pensamiento por encima de `high` lo rechaza la API. Mejor
    // decirlo aquí que descubrirlo a mitad de una comparación de treinta
    // documentos, con la mitad del gasto ya hecho.
    throw new Error(
      `No se puede apagar el pensamiento con esfuerzo «${esfuerzo}»: la API lo rechaza. Usa «high» o menos.`,
    )
  }

  return {
    thinking: pensar ? { type: 'adaptive' } : { type: 'disabled' },
    output_config: { format: formato, effort: esfuerzo },
  }
}

/** Un PDF va como documento (el modelo lo abre él); una imagen, como imagen. */
export function contenidoDelDocumento(documento: DocumentoEntrada): Anthropic.ContentBlockParam {
  if (documento.datos.byteLength > MAXIMO_BYTES) {
    throw new Error(
      `«${documento.nombre}» pesa ${Math.round(
        documento.datos.byteLength / 1024 / 1024,
      )} MB y el máximo son ${MAXIMO_BYTES / 1024 / 1024}. Sube las páginas por separado, o una imagen más pequeña.`,
    )
  }
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
 * Pide la lectura y devuelve también lo que ha costado.
 *
 * El coste sale de aquí, junto a la respuesta, porque la pregunta «¿compensa el
 * modelo caro?» no se responde con los aciertos por un lado y una estimación de
 * precio por otro. Van juntos o no sirven de nada.
 */
export async function pedirLectura(
  documento: DocumentoEntrada,
  opciones: OpcionesVision = {},
): Promise<{ leido: Leido; uso: Uso; modelo: string }> {
  const clave = opciones.clave ?? process.env['ANTHROPIC_API_KEY']
  if (typeof clave !== 'string' || clave.trim().length === 0) {
    throw new Error('El lector de visión no está configurado.')
  }
  const modelo = opciones.modelo ?? MODELO
  const cliente = new Anthropic({ apiKey: clave })

  const parametros: Record<string, unknown> = {
    model: modelo,
    max_tokens: 32000,
    // Las instrucciones son idénticas en todas las lecturas, así que se cachean:
    // a partir de la segunda cuestan la décima parte. En Haiku no llegan al
    // mínimo cacheable y sencillamente no tiene efecto — no es un fallo.
    system: [{ type: 'text', text: instrucciones(), cache_control: { type: 'ephemeral' } }],
    ...ajustesDelModelo(modelo, opciones.esfuerzo ?? ESFUERZO, opciones.pensar ?? true),
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
  }

  // Se transmite en flujo aunque no se muestre nada por pantalla: con el
  // pensamiento activado una respuesta puede tardar, y una petición normal se
  // cortaría por tiempo de espera antes de terminar.
  const flujo = cliente.messages.stream(parametros as unknown as Anthropic.MessageStreamParams)
  const respuesta = await flujo.finalMessage()

  // Antes de leer el contenido hay que mirar por qué paró. Si el modelo se negó,
  // `content` puede venir vacío y leer `content[0]` reventaría con un error que
  // no le dice nada a nadie.
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

  return {
    leido: JSON.parse(bruto.text) as Leido,
    modelo,
    uso: {
      entrada: respuesta.usage.input_tokens,
      salida: respuesta.usage.output_tokens,
      cacheEscrito: respuesta.usage.cache_creation_input_tokens ?? 0,
      cacheLeido: respuesta.usage.cache_read_input_tokens ?? 0,
    },
  }
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
  const modelo = opciones.modelo ?? MODELO

  return {
    nombre: `Claude (${modelo})`,

    disponible: () => typeof clave === 'string' && clave.trim().length > 0,

    porQueNoDisponible:
      'No hay clave de API configurada. Se está usando el reconocimiento de texto local, que se equivoca más. Para activarlo, pon ANTHROPIC_API_KEY en el fichero .env.',

    async leer(documento: DocumentoEntrada): Promise<ResultadoExtraccion> {
      const { leido } = await pedirLectura(documento, { ...opciones, clave })
      return aResultado(documento, leido, ahora(), modelo)
    },
  }
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
  modelo: string = MODELO,
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

    // La misma normalización por aparato que aplica el lector local.
    //
    // Va aquí y no solo en el pipeline porque este camino NO pasa por
    // `interpretarTexto`: el modelo de visión devuelve el resultado ya montado.
    // Dejarlo fuera haría que la ACD se derivara o no según con qué lector se
    // hubiese leído el informe, que es la clase de diferencia invisible que
    // luego nadie entiende.
    const normalizado = normalizarOjo(ojo, leido.dispositivo, cuando)
    ojos[bloque.lado] = normalizado.ojo
    avisos.push(...normalizado.avisos.map((a) => `${nombreLateralidad(bloque.lado)}: ${a}`))
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
    // Con qué modelo se leyó este informe queda en el caso, no solo en un log.
    proveedor: `Claude (${modelo})`,
    metodo: 'VISION',
  }
}
