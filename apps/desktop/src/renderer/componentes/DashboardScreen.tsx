/**
 * DashboardScreen.tsx — Cuántas lentes se han calculado, por doctor y por
 * modelo (D82, 15/09/2026; filtro de fechas y exclusión de doctor D83,
 * 16/09/2026).
 *
 * No hay ninguna base de datos nueva detrás: el doctor y la lente elegida
 * ya viven dentro de cada caso guardado, igual que el resto de sus datos —
 * esta pantalla solo cuenta sobre lo que ya hay en `casos/`
 * (`resumenDashboard`, en el proceso principal). Un caso cuenta como
 * «lente calculada» cuando terminó su ciclo de cálculo (`COMPLETADO`) y
 * tiene un modelo de lente elegido.
 *
 * Las barras son `<div>` con un ancho proporcional al máximo, sin ninguna
 * librería de gráficos — bastan para dos listas cortas, y no añaden una
 * dependencia nueva por dos barras.
 *
 * **Excluir un doctor** (D83) no borra ningún caso: solo apunta su nombre
 * en una lista aparte (`doctores-excluidos.json`) que el resumen filtra
 * siempre, con o sin rango de fechas. Es para pruebas o casos metidos por
 * error, y es reversible — «Volver a incluir» lo deshace sin perder nada.
 *
 * **Eliminar un doctor** (D85, 16/09/2026) es distinto y mucho más
 * fuerte: saca de verdad de `casos/` los casos que forman su barra ahora
 * mismo (los mismos que cuenta, con el mismo rango de fechas si hay uno
 * puesto) — no un filtro de las estadísticas, sino sacar los casos reales
 * de en medio. Pide confirmación explícita antes de tocar nada
 * (`window.confirm`, el mismo cuadro «¿estás seguro?» de siempre en un
 * navegador) porque no tiene deshacer DESDE la pantalla — aunque, por
 * dentro, `ServicioCasos.eliminarCasosDeDoctor()` no los borra para
 * siempre: los archiva en `casos-borrados/<día>/`, igual que se hizo a
 * mano la primera vez que hizo falta esto.
 */

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

import type { ConteoDashboard, ResumenDashboard } from '@vilamar/domain'

import { api } from '../api.js'

function GraficoBarras({
  titulo,
  datos,
  color,
  testId,
  onExcluir,
  onEliminar,
}: {
  readonly titulo: string
  readonly datos: readonly ConteoDashboard[]
  readonly color: string
  readonly testId: string
  /** Si se pasa, cada fila enseña un botón para excluirla (solo tiene sentido por doctor). */
  readonly onExcluir?: (etiqueta: string) => void
  /** Igual, pero para eliminar de verdad sus casos (D85) — pide su propia confirmación. */
  readonly onEliminar?: (etiqueta: string) => void
}): JSX.Element {
  const maximo = Math.max(1, ...datos.map((d) => d.cantidad))
  return (
    <div className="tarjeta-seccion" data-testid={testId}>
      <h3>{titulo}</h3>
      {datos.length === 0 && <p className="sub">Todavía no hay ningún caso calculado.</p>}
      {datos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {datos.map((d) => (
            <div key={d.etiqueta} className="fila" style={{ gap: 10, alignItems: 'center' }}>
              <span style={{ width: 160, flexShrink: 0, fontSize: 13 }}>{d.etiqueta}</span>
              <div style={{ flex: 1, background: 'var(--gris-claro)', borderRadius: 4 }}>
                <div
                  style={{
                    width: `${(d.cantidad / maximo) * 100}%`,
                    minWidth: 4,
                    background: color,
                    borderRadius: 4,
                    padding: '4px 8px',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 600,
                    boxSizing: 'border-box',
                  }}
                >
                  {d.cantidad}
                </div>
              </div>
              {onExcluir && (
                <button
                  onClick={() => onExcluir(d.etiqueta)}
                  title={`No contar a «${d.etiqueta}» en las estadísticas`}
                  data-testid={`excluir-doctor-${d.etiqueta}`}
                  style={{ flexShrink: 0, padding: '3px 8px', fontSize: 12 }}
                >
                  Excluir
                </button>
              )}
              {onEliminar && (
                <button
                  onClick={() => onEliminar(d.etiqueta)}
                  title={`Eliminar de verdad los casos de «${d.etiqueta}»`}
                  data-testid={`eliminar-doctor-${d.etiqueta}`}
                  style={{ flexShrink: 0, padding: '3px 8px', fontSize: 12, color: 'var(--rojo)' }}
                >
                  Eliminar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardScreen({ onVolver }: { readonly onVolver: () => void }): JSX.Element {
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [excluidos, setExcluidos] = useState<readonly string[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [avisoEliminar, setAvisoEliminar] = useState<string | null>(null)

  const cargar = useCallback((rango?: { desde?: string; hasta?: string }) => {
    void api()
      .resumenDashboard(rango)
      .then(setResumen)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    cargar()
    void api().listarDoctoresExcluidosDeEstadisticas().then(setExcluidos)
  }, [cargar])

  function rangoActual(): { desde?: string; hasta?: string } | undefined {
    if (desde === '' && hasta === '') return undefined
    return {
      ...(desde !== '' ? { desde } : {}),
      ...(hasta !== '' ? { hasta } : {}),
    }
  }

  function aplicarRango(): void {
    cargar(rangoActual())
  }

  function verTodo(): void {
    setDesde('')
    setHasta('')
    cargar()
  }

  async function excluir(nombre: string): Promise<void> {
    setError(null)
    try {
      setExcluidos(await api().excluirDoctorDeEstadisticas(nombre))
      cargar(rangoActual())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function incluir(nombre: string): Promise<void> {
    setError(null)
    try {
      setExcluidos(await api().incluirDoctorEnEstadisticas(nombre))
      cargar(rangoActual())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function eliminar(nombre: string): Promise<void> {
    setError(null)
    setAvisoEliminar(null)
    const cuantos = resumen?.porDoctor.find((d) => d.etiqueta === nombre)?.cantidad ?? 0
    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar los ${cuantos} caso${cuantos === 1 ? '' : 's'} de «${nombre}»?\n\n` +
        'No se borran para siempre: se archivan fuera de la lista de casos, por si hace falta recuperarlos. ' +
        'Dejarán de contar aquí y de poder abrirse desde «Casos guardados».',
    )
    if (!confirmado) return
    try {
      const eliminados = await api().eliminarCasosDeDoctor(nombre, rangoActual())
      setAvisoEliminar(
        `Se ${eliminados === 1 ? 'ha' : 'han'} eliminado ${eliminados} caso${eliminados === 1 ? '' : 's'} de «${nombre}».`,
      )
      cargar(rangoActual())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="tarjeta">
      <h2>Dashboard</h2>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        Cuenta las lentes calculadas —casos ya terminados, con una lente elegida— por doctor y por
        modelo. No es un dato nuevo: sale de los mismos casos que ya tienes guardados.
      </p>

      <div className="fila" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="dashboard-desde">Desde</label>
          <input
            id="dashboard-desde"
            type="date"
            value={desde}
            data-testid="dashboard-desde"
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="dashboard-hasta">Hasta</label>
          <input
            id="dashboard-hasta"
            type="date"
            value={hasta}
            data-testid="dashboard-hasta"
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <button
          className="principal"
          onClick={aplicarRango}
          disabled={desde === '' && hasta === ''}
          data-testid="dashboard-filtrar"
        >
          Filtrar
        </button>
        <button onClick={verTodo} data-testid="dashboard-ver-todo">
          Ver todo
        </button>
      </div>
      <p className="pie-nota" style={{ marginTop: 4, marginBottom: 12 }}>
        Sin fechas, se cuenta todo — «Ver todo» quita el filtro si lo hubiera.
      </p>

      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}

      {avisoEliminar && (
        <p className="sub" data-testid="aviso-eliminar-doctor">
          {avisoEliminar}
        </p>
      )}

      {resumen === null && !error && <p className="sub">Buscando…</p>}

      {resumen !== null && (
        <>
          <p className="sub" data-testid="dashboard-total">
            {resumen.totalCalculados === 0
              ? 'Todavía no hay ningún caso calculado.'
              : `${resumen.totalCalculados} lente${resumen.totalCalculados === 1 ? '' : 's'} calculada${resumen.totalCalculados === 1 ? '' : 's'} en total.`}
          </p>
          <div className="fila" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <GraficoBarras
                titulo="Por doctor"
                datos={resumen.porDoctor}
                color="var(--azul)"
                testId="dashboard-por-doctor"
                onExcluir={(nombre) => void excluir(nombre)}
                onEliminar={(nombre) => void eliminar(nombre)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <GraficoBarras
                titulo="Por modelo de lente"
                datos={resumen.porModeloLente}
                color="var(--verde)"
                testId="dashboard-por-modelo"
              />
            </div>
          </div>
        </>
      )}

      {excluidos.length > 0 && (
        <>
          <div className="separador" />
          <h3>Doctores excluidos de las estadísticas</h3>
          <p className="pie-nota" style={{ marginTop: -6, marginBottom: 8 }}>
            Sus casos siguen intactos — solo no cuentan aquí.
          </p>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            {excluidos.map((nombre) => (
              <div
                key={nombre}
                className="fila"
                style={{
                  gap: 6,
                  alignItems: 'center',
                  background: 'var(--gris-claro)',
                  borderRadius: 4,
                  padding: '4px 8px',
                }}
              >
                <span style={{ fontSize: 13 }}>{nombre}</span>
                <button
                  onClick={() => void incluir(nombre)}
                  data-testid={`incluir-doctor-${nombre}`}
                  style={{ padding: '2px 6px', fontSize: 12 }}
                >
                  Volver a incluir
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="separador" />

      <div className="fila">
        <button onClick={onVolver} data-testid="volver-de-dashboard">
          Volver
        </button>
      </div>
    </div>
  )
}
