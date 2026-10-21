/**
 * analisis.ts — «Análisis de resultados»: buscar casos ya hechos y resumirlos
 * (instrucciones del dueño, 21/10/2026).
 *
 * Como el dashboard, es solo una VISTA sobre los casos que ya existen: no guarda
 * nada. Se puede buscar entre fechas, por lente, por doctor, por ojo, por
 * calculadora usada y por texto (código o paciente), y de cada caso encontrado
 * se devuelve lo justo para abrirlo directamente en su resultado.
 *
 * Qué casos entran: los terminados (`COMPLETADO`) y, si se pide, los que se
 * quedaron a medias pero ya tienen documentos leídos. Un caso que nunca pasó de
 * «Nuevo cálculo» no tiene nada que analizar. Los doctores excluidos del
 * dashboard (pruebas) tampoco cuentan aquí.
 *
 * Se cuenta por OJOS calculados, igual que el dashboard (`ojosContados`).
 */

import type { Calculadora } from '../modelo/calculadoras.js'
import type { Caso, EstadoCaso } from '../modelo/caso.js'
import { ojosDelCaso } from '../modelo/caso.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import {
  claveDeLenteParaAgrupar,
  dentroDelRango,
  etiquetaDoctor,
  etiquetaLente,
  ojosContados,
} from './dashboard.js'
import type { ConteoDashboard, RangoFechas } from './dashboard.js'

export interface FiltroAnalisis {
  readonly rango?: RangoFechas
  /** Nombre de doctor tal como se enseña («Sin doctor» incluido). */
  readonly doctor?: string
  /** Clave de agrupación de la lente (`OpcionesAnalisis.lentes[].clave`). */
  readonly lente?: string
  readonly ojo?: Lateralidad
  readonly calculadora?: Calculadora
  /** Trozo del código o del nombre del paciente, sin mayúsculas ni tildes. */
  readonly texto?: string
  /** Por defecto solo los terminados; con `true`, también los que quedaron a medias con documentos leídos. */
  readonly incluirAMedias?: boolean
}

export interface FilaAnalisis {
  readonly codigo: string
  readonly nombrePaciente?: string
  readonly doctor: string
  readonly lente: string
  readonly estado: EstadoCaso
  readonly actualizadoEn: string
  /** Los ojos con algún resultado de calculadora. */
  readonly ojos: readonly Lateralidad[]
  /** Las calculadoras con algún resultado utilizable. */
  readonly calculadoras: readonly Calculadora[]
  /** Cuántas casillas se intentaron y no salieron. */
  readonly fallos: number
}

export interface OpcionesAnalisis {
  readonly doctores: readonly string[]
  readonly lentes: readonly { readonly clave: string; readonly etiqueta: string }[]
}

export interface ResultadoAnalisis {
  readonly filas: readonly FilaAnalisis[]
  readonly totalCasos: number
  readonly totalOjos: number
  readonly ojosOD: number
  readonly ojosOS: number
  readonly casosConFallos: number
  readonly porDoctor: readonly ConteoDashboard[]
  readonly porLente: readonly ConteoDashboard[]
  readonly porCalculadora: readonly ConteoDashboard[]
  /** «2026-10» → ojos calculados ese mes, de más antiguo a más reciente. */
  readonly porMes: readonly ConteoDashboard[]
  readonly opciones: OpcionesAnalisis
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function resultadosUtiles(caso: Caso): Caso['resultados'][string][] {
  return Object.values(caso.resultados).filter(
    (r) => r.estado === 'SUCCESS' || r.estado === 'PARTIAL',
  )
}

/** Los ojos que aporta un caso: los que tienen resultado; si ninguno, los que tienen datos. */
function ojosDelAnalisis(caso: Caso): readonly Lateralidad[] {
  const conResultado = new Set(resultadosUtiles(caso).map((r) => r.ojo))
  const ojos = conResultado.size > 0 ? [...conResultado] : [...ojosDelCaso(caso)]
  return (['OD', 'OS'] as const).filter((o) => ojos.includes(o))
}

function contar(etiquetas: readonly string[]): readonly ConteoDashboard[] {
  const cuenta = new Map<string, number>()
  for (const e of etiquetas) cuenta.set(e, (cuenta.get(e) ?? 0) + 1)
  return [...cuenta.entries()]
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

/** ¿Es un caso que se puede analizar, aparte de los filtros? */
function entra(caso: Caso, incluirAMedias: boolean, excluidos: ReadonlySet<string>): boolean {
  if (excluidos.has(etiquetaDoctor(caso).toLowerCase())) return false
  if (caso.estado === 'COMPLETADO') return true
  return incluirAMedias && caso.estado !== 'BORRADOR'
}

/** Los casos que cumplen el filtro (sobre casos que ya pueden analizarse). */
function aplicarFiltro(candidatos: readonly Caso[], filtro: FiltroAnalisis): readonly Caso[] {
  const texto = filtro.texto ? normalizar(filtro.texto) : ''
  return candidatos.filter((c) => {
    if (filtro.rango && !dentroDelRango(c.actualizadoEn, filtro.rango)) return false
    if (filtro.doctor && etiquetaDoctor(c).toLowerCase() !== filtro.doctor.trim().toLowerCase()) {
      return false
    }
    if (filtro.lente && claveDeLenteParaAgrupar(c.lente) !== filtro.lente) return false
    if (filtro.ojo && !ojosDelAnalisis(c).includes(filtro.ojo)) return false
    if (
      filtro.calculadora &&
      !resultadosUtiles(c).some(
        (r) => r.calculadora === filtro.calculadora && (!filtro.ojo || r.ojo === filtro.ojo),
      )
    ) {
      return false
    }
    if (texto !== '') {
      const pajar = normalizar(`${c.codigo} ${c.nombrePaciente ?? ''}`)
      if (!pajar.includes(texto)) return false
    }
    return true
  })
}

/**
 * Los casos que ve el análisis con este filtro —los mismos que enseña la lista—,
 * para quien necesita más datos de cada uno (el Excel de estudio).
 */
export function casosDelAnalisis(
  casos: readonly Caso[],
  filtro: FiltroAnalisis = {},
  doctoresExcluidos: readonly string[] = [],
): readonly Caso[] {
  const excluidos = new Set(doctoresExcluidos.map((d) => d.trim().toLowerCase()))
  return aplicarFiltro(
    casos.filter((c) => entra(c, filtro.incluirAMedias === true, excluidos)),
    filtro,
  )
}

export function analizarCasos(
  casos: readonly Caso[],
  filtro: FiltroAnalisis = {},
  doctoresExcluidos: readonly string[] = [],
): ResultadoAnalisis {
  const excluidos = new Set(doctoresExcluidos.map((d) => d.trim().toLowerCase()))
  const candidatos = casos.filter((c) => entra(c, filtro.incluirAMedias === true, excluidos))

  // Las listas desplegables salen de TODOS los candidatos, no de los ya
  // filtrados: si no, al elegir un doctor desaparecerían los demás.
  const etiquetasPorClave = new Map<string, Map<string, number>>()
  for (const c of candidatos) {
    const clave = claveDeLenteParaAgrupar(c.lente)
    const etiqueta = etiquetaLente(c.lente)
    const m = etiquetasPorClave.get(clave) ?? new Map<string, number>()
    m.set(etiqueta, (m.get(etiqueta) ?? 0) + 1)
    etiquetasPorClave.set(clave, m)
  }
  const opciones: OpcionesAnalisis = {
    doctores: [...new Set(candidatos.map(etiquetaDoctor))].sort((a, b) => a.localeCompare(b, 'es')),
    lentes: [...etiquetasPorClave.entries()]
      .map(([clave, m]) => ({
        clave,
        etiqueta: [...m.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'),
        )[0]![0],
      }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
  }

  const elegidos = aplicarFiltro(candidatos, filtro)

  const filas: FilaAnalisis[] = elegidos
    .map((c) => ({
      codigo: c.codigo,
      ...(c.nombrePaciente ? { nombrePaciente: c.nombrePaciente } : {}),
      doctor: etiquetaDoctor(c),
      lente: etiquetaLente(c.lente),
      estado: c.estado,
      actualizadoEn: c.actualizadoEn,
      ojos: ojosDelAnalisis(c),
      calculadoras: [...new Set(resultadosUtiles(c).map((r) => r.calculadora))],
      fallos: Object.values(c.resultados).filter(
        (r) => r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL',
      ).length,
    }))
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))

  // Ojos repetidos tantas veces como pesa cada caso, para que las barras sumen
  // lo mismo que «ojos calculados».
  const repetir = <T>(c: Caso, valor: T): T[] =>
    Array.from({ length: ojosContados(c) }, () => valor)
  // La misma etiqueta para todas las formas de escribir una lente (D90).
  const etiquetaDeGrupo = new Map(opciones.lentes.map((l) => [l.clave, l.etiqueta]))
  const porCalculadora = contar(
    elegidos.flatMap((c) => resultadosUtiles(c).map((r) => r.calculadora as string)),
  )

  return {
    filas,
    totalCasos: elegidos.length,
    totalOjos: elegidos.reduce((s, c) => s + ojosContados(c), 0),
    ojosOD: elegidos.filter((c) => ojosDelAnalisis(c).includes('OD')).length,
    ojosOS: elegidos.filter((c) => ojosDelAnalisis(c).includes('OS')).length,
    casosConFallos: filas.filter((f) => f.fallos > 0).length,
    porDoctor: contar(elegidos.flatMap((c) => repetir(c, etiquetaDoctor(c)))),
    porLente: contar(
      elegidos.flatMap((c) =>
        repetir(c, etiquetaDeGrupo.get(claveDeLenteParaAgrupar(c.lente)) ?? etiquetaLente(c.lente)),
      ),
    ),
    porCalculadora,
    porMes: [...contar(elegidos.flatMap((c) => repetir(c, c.actualizadoEn.slice(0, 7))))].sort(
      (a, b) => a.etiqueta.localeCompare(b.etiqueta),
    ),
    opciones,
  }
}
