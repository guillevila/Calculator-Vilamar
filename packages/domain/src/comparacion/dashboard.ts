/**
 * dashboard.ts — Cuántas lentes se han calculado, por doctor y por modelo
 * (D82, 15/09/2026; filtro de fechas y exclusión de doctor D83, 16/09/2026).
 *
 * No hay ningún dato nuevo que guardar para esto: el doctor (`nombreCirujano`)
 * y la lente elegida (`lente.modelo`/`lente.fabricante`) ya viven dentro de
 * cada `Caso`, en el mismo sitio que el resto de sus datos — no hace falta
 * unificar nada ni mover ficheros. Esto es solo una VISTA: cuenta, sobre los
 * casos que ya existen, cuántos terminaron con una lente elegida.
 *
 * Un caso cuenta como «lente calculada» cuando `estado === 'COMPLETADO'`
 * (el ciclo de cálculo ha terminado, con éxito total o parcial — mismo
 * criterio que ya usa `NOMBRE_ESTADO`) y tiene un modelo de lente elegido.
 * Un caso que se quedó a medias, o donde nunca se eligió lente, no cuenta:
 * no sería una lente «calculada», sería un caso sin terminar.
 */

import type { Caso } from '../modelo/caso.js'

export interface ConteoDashboard {
  readonly etiqueta: string
  readonly cantidad: number
}

export interface ResumenDashboard {
  readonly totalCalculados: number
  readonly porDoctor: readonly ConteoDashboard[]
  readonly porModeloLente: readonly ConteoDashboard[]
}

/**
 * Fechas en «YYYY-MM-DD» (lo que da un `<input type="date">`), inclusive
 * en los dos extremos. Sin ninguna de las dos, no se filtra por fecha — el
 * total de siempre. Se compara contra `actualizadoEn` del caso: no hay un
 * momento aparte de «cuándo terminó de calcularse», y en la práctica un
 * caso ya `COMPLETADO` casi nunca se vuelve a tocar, así que es el dato
 * más cercano a «cuándo se calculó» que ya existe.
 */
export interface RangoFechas {
  readonly desde?: string
  readonly hasta?: string
}

export interface OpcionesDashboard {
  readonly rango?: RangoFechas
  /**
   * Nombres de doctor (D83, 16/09/2026) cuyos casos no deben contar —
   * pruebas o casos metidos por error, sin tener que borrar el caso real.
   * Se compara sin mayúsculas ni espacios de sobra, para que una mayúscula
   * distinta no cree un doctor «nuevo» que se cuela sin querer.
   */
  readonly doctoresExcluidos?: readonly string[]
}

const SIN_DOCTOR = 'Sin doctor'
const SIN_MODELO = 'Sin modelo'

/** «B&L LuxSmart» si hay fabricante y no está ya repetido en el modelo; si no, solo el modelo. */
function etiquetaLente(lente: Caso['lente']): string {
  const modelo = (lente?.modelo ?? '').trim()
  if (modelo === '') return SIN_MODELO
  const fabricante = (lente?.fabricante ?? '').trim()
  if (fabricante === '' || modelo.toLowerCase().includes(fabricante.toLowerCase())) return modelo
  return `${fabricante} ${modelo}`
}

function contarPor(casos: readonly Caso[], clave: (c: Caso) => string): readonly ConteoDashboard[] {
  const cuenta = new Map<string, number>()
  for (const caso of casos) {
    const etiqueta = clave(caso)
    cuenta.set(etiqueta, (cuenta.get(etiqueta) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

/** El día de `actualizadoEn` (YYYY-MM-DD) cae dentro de [desde, hasta], inclusive. */
function dentroDelRango(actualizadoEn: string, rango: RangoFechas): boolean {
  const dia = actualizadoEn.slice(0, 10)
  if (rango.desde && dia < rango.desde) return false
  if (rango.hasta && dia > rango.hasta) return false
  return true
}

/** El nombre del doctor tal como se agrupa y se enseña — «Sin doctor» si el caso no lo trae. */
function etiquetaDoctor(c: Caso): string {
  return (c.nombreCirujano ?? '').trim() || SIN_DOCTOR
}

function seleccionarCalculados(
  casos: readonly Caso[],
  opciones: OpcionesDashboard,
): readonly Caso[] {
  const excluidos = new Set((opciones.doctoresExcluidos ?? []).map((d) => d.trim().toLowerCase()))
  return casos.filter((c) => {
    if (c.estado !== 'COMPLETADO') return false
    if ((c.lente?.modelo ?? '').trim() === '') return false
    // Se compara contra la misma etiqueta que se enseña y se pulsa en
    // pantalla («Sin doctor» incluida) — no contra `nombreCirujano` en
    // crudo, o excluir «Sin doctor» no coincidía nunca con nada (fallo
    // real reportado por el dueño, 16/09/2026: el botón «Excluir» de esa
    // fila no hacía nada).
    if (excluidos.has(etiquetaDoctor(c).toLowerCase())) return false
    if (opciones.rango && !dentroDelRango(c.actualizadoEn, opciones.rango)) return false
    return true
  })
}

export function calcularResumenDashboard(
  casos: readonly Caso[],
  opciones: OpcionesDashboard = {},
): ResumenDashboard {
  const calculados = seleccionarCalculados(casos, opciones)
  return {
    totalCalculados: calculados.length,
    porDoctor: contarPor(calculados, etiquetaDoctor),
    porModeloLente: contarPor(calculados, (c) => etiquetaLente(c.lente)),
  }
}

/**
 * Los casos «lente calculada» que pertenecen a un doctor concreto —
 * exactamente los mismos que forman su barra en el dashboard, con el
 * mismo rango de fechas que se esté mirando (D85, 16/09/2026). Lo que se
 * ve es lo que se borraría: nunca más casos de los que la barra cuenta.
 */
export function casosCalculadosDeDoctor(
  casos: readonly Caso[],
  nombreDoctor: string,
  opciones: OpcionesDashboard = {},
): readonly Caso[] {
  const buscado = nombreDoctor.trim().toLowerCase()
  return seleccionarCalculados(casos, opciones).filter(
    (c) => etiquetaDoctor(c).toLowerCase() === buscado,
  )
}
