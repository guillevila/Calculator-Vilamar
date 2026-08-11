/**
 * detector.ts — Qué aparato generó este informe.
 *
 * Se decide por indicios del propio texto: el nombre del fabricante, el del
 * aparato y las etiquetas que solo usa él. Cada indicio suma; el que más suma
 * gana, siempre que llegue a un mínimo.
 *
 * Cuando ninguno llega al mínimo, la respuesta es DESCONOCIDO. No es un fallo:
 * es la respuesta correcta. Un informe no reconocido se lee igualmente con
 * reglas genéricas, y la pantalla dice que no se ha reconocido en lugar de
 * fingir que sí — que es lo que llevaría a leerlo con la plantilla equivocada.
 */

import type { Dispositivo, DispositivoDetectado } from '@vilamar/domain'

import type { TextoDocumento } from '../contratos.js'

interface Indicio {
  readonly patron: RegExp
  readonly peso: number
  readonly descripcion: string
}

interface HuellaDispositivo {
  readonly dispositivo: Dispositivo
  readonly indicios: readonly Indicio[]
}

/**
 * Las huellas de cada aparato.
 *
 * Los pesos altos son para lo que solo puede venir de ese aparato (su nombre
 * comercial). Los bajos, para etiquetas que comparte con otros y que por sí
 * solas no demuestran nada.
 */
const HUELLAS: readonly HuellaDispositivo[] = [
  {
    dispositivo: 'ANTERION',
    indicios: [
      { patron: /\bANTERION\b/i, peso: 10, descripcion: 'Nombre del aparato: ANTERION' },
      { patron: /\bHEIDELBERG\b/i, peso: 6, descripcion: 'Fabricante: Heidelberg Engineering' },
      { patron: /Cataract\s*App/i, peso: 4, descripcion: 'Módulo «Cataract App»' },
      { patron: /\bAQD\b/i, peso: 3, descripcion: 'Usa AQD, propio de este aparato' },
      { patron: /Metrics?\s*App/i, peso: 2, descripcion: 'Módulo «Metrics App»' },
    ],
  },
  {
    dispositivo: 'IOLMASTER_700',
    indicios: [
      { patron: /IOLMaster\s*700/i, peso: 10, descripcion: 'Nombre del aparato: IOLMaster 700' },
      { patron: /\bIOLMaster\b/i, peso: 6, descripcion: 'Familia IOLMaster' },
      { patron: /\bZEISS\b/i, peso: 5, descripcion: 'Fabricante: Carl Zeiss' },
      {
        patron: /\bTK\d?\b|Total\s*Keratometry/i,
        peso: 4,
        descripcion: 'Queratometría total (TK)',
      },
      { patron: /\bSWEPT\s*SOURCE\b/i, peso: 2, descripcion: 'Tecnología swept-source' },
    ],
  },
  {
    dispositivo: 'PENTACAM',
    indicios: [
      { patron: /\bPENTACAM\b/i, peso: 10, descripcion: 'Nombre del aparato: Pentacam' },
      { patron: /\bOCULUS\b/i, peso: 6, descripcion: 'Fabricante: OCULUS' },
      { patron: /Scheimpflug/i, peso: 5, descripcion: 'Tecnología Scheimpflug' },
      { patron: /Holladay\s*(Report|EKR)/i, peso: 4, descripcion: 'Informe Holladay' },
      { patron: /\bPachy\b|Pachymetry/i, peso: 2, descripcion: 'Mapa paquimétrico' },
    ],
  },
]

/** Con menos de esto, no se afirma nada. */
const UMBRAL = 10

export function detectarDispositivo(documento: TextoDocumento): DispositivoDetectado {
  const texto = documento.paginas.map((p) => p.texto).join('\n')
  return detectarEnTexto(texto)
}

export function detectarEnTexto(texto: string): DispositivoDetectado {
  let mejor: { dispositivo: Dispositivo; puntos: number; indicios: string[] } | null = null
  let maximoPosible = 0

  for (const huella of HUELLAS) {
    let puntos = 0
    const encontrados: string[] = []
    for (const indicio of huella.indicios) {
      if (indicio.patron.test(texto)) {
        puntos += indicio.peso
        encontrados.push(indicio.descripcion)
      }
    }
    const total = huella.indicios.reduce((s, i) => s + i.peso, 0)
    if (!mejor || puntos > mejor.puntos) {
      mejor = { dispositivo: huella.dispositivo, puntos, indicios: encontrados }
      maximoPosible = total
    }
  }

  if (!mejor || mejor.puntos < UMBRAL) {
    return {
      dispositivo: 'DESCONOCIDO',
      confianza: 0,
      indicios: mejor && mejor.indicios.length > 0 ? mejor.indicios : ['No se reconoce el aparato'],
    }
  }

  return {
    dispositivo: mejor.dispositivo,
    confianza: Math.min(1, mejor.puntos / maximoPosible),
    indicios: mejor.indicios,
  }
}
