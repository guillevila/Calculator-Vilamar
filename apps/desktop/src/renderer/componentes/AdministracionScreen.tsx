/**
 * AdministracionScreen.tsx — El departamento de Administración (25/10/2026,
 * petición del dueño: todo lo del reparto y el cobro a otros oftalmólogos, en un
 * sitio que solo aparece en SU instalación y no en las copias).
 *
 * Hoy enseña dos cosas reales: las condiciones de cobro (que se pueden cambiar y
 * se guardan en este ordenador) y cuánto se ha usado la aplicación EN ESTE
 * ordenador, mes a mes, con el tramo en el que caería. Lo que necesita un
 * servidor —usuarios, aprobaciones, contador de cada médico, cobro— NO existe
 * todavía y se dice tal cual, para no dar la falsa impresión de que funciona.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import {
  NOMBRE_METRICA,
  PLAN_DE_PARTIDA,
  cantidadSegunMetrica,
  situacionDeTramo,
} from '@vilamar/domain'
import type { MetricaDeCobro, PlanDeCobro } from '@vilamar/domain'

import type { DatosAdministracion } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly onVolver: () => void
}

const METRICAS = Object.keys(NOMBRE_METRICA) as MetricaDeCobro[]

const euros = (n: number): string => `${n.toLocaleString('es-ES')} €`

function nombreDeMes(mes: string): string {
  const [anio, m] = mes.split('-')
  const d = new Date(Number(anio), Number(m) - 1, 1)
  return Number.isNaN(d.getTime())
    ? mes
    : d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export function AdministracionScreen({ onVolver }: Props): JSX.Element {
  const [datos, setDatos] = useState<DatosAdministracion | null>(null)
  const [plan, setPlan] = useState<PlanDeCobro>(PLAN_DE_PARTIDA)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    api()
      .datosAdministracion()
      .then((d) => {
        setDatos(d)
        setPlan(d.plan)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [])

  const cambiar = (cambio: Partial<PlanDeCobro>): void => {
    setPlan((p) => ({ ...p, ...cambio }))
    setGuardado(false)
  }
  const numero = (texto: string): number => {
    const n = Number(texto.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const planCorrecto = plan.tamanoTramo > 0 && plan.precioPorTramo > 0 && plan.avisarDesde > 0

  async function guardar(): Promise<void> {
    setError(null)
    try {
      const d = await api().guardarPlanDeCobro(plan)
      setDatos(d)
      setPlan(d.plan)
      setGuardado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <div data-testid="pantalla-administracion">
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Administración</h2>
        <button onClick={onVolver} data-testid="administracion-volver">
          Volver
        </button>
      </div>

      <div className="aviso">
        Esta sección solo aparece en tu instalación; las copias que repartas no la llevan. Ojo: es
        una puerta de la pantalla, no una cerradura — no sustituye a un control de usuarios de
        verdad.
      </div>

      {error && <div className="aviso aviso-error">{error}</div>}

      <section className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Condiciones de cobro</h2>
        <p className="sub">
          De partida: 10 € por cada 100 ojos, con aviso a los 80. Se guardan en este ordenador.
        </p>
        <div className="fila" style={{ flexWrap: 'wrap', gap: 16 }}>
          <label>
            Qué se cuenta como «un cálculo»
            <select
              value={plan.metrica}
              onChange={(e) => cambiar({ metrica: e.target.value as MetricaDeCobro })}
              data-testid="plan-metrica"
            >
              {METRICAS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_METRICA[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tamaño del tramo
            <input
              type="number"
              min={1}
              value={plan.tamanoTramo}
              onChange={(e) => cambiar({ tamanoTramo: numero(e.target.value) })}
              data-testid="plan-tamano"
            />
          </label>
          <label>
            Precio de cada tramo (€)
            <input
              type="number"
              min={1}
              value={plan.precioPorTramo}
              onChange={(e) => cambiar({ precioPorTramo: numero(e.target.value) })}
              data-testid="plan-precio"
            />
          </label>
          <label>
            Avisar a partir de
            <input
              type="number"
              min={1}
              value={plan.avisarDesde}
              onChange={(e) => cambiar({ avisarDesde: numero(e.target.value) })}
              data-testid="plan-aviso"
            />
          </label>
        </div>
        <div className="fila" style={{ marginTop: 12 }}>
          <button
            className="principal"
            onClick={() => void guardar()}
            disabled={!planCorrecto}
            data-testid="plan-guardar"
          >
            Guardar condiciones
          </button>
          {guardado && <span className="sub">Guardado.</span>}
        </div>
      </section>

      <section className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Uso de esta instalación, mes a mes</h2>
        <p className="sub">
          Cuenta «{NOMBRE_METRICA[plan.metrica].toLowerCase()}» de los casos hechos aquí (los
          importados de otra app no cuentan). El tramo es el que caería con las condiciones de
          arriba.
        </p>
        {datos === null ? (
          <p className="sub">Cargando…</p>
        ) : datos.uso.length === 0 ? (
          <p className="sub" data-testid="uso-vacio">
            Todavía no hay uso registrado.
          </p>
        ) : (
          <table className="revision" data-testid="tabla-uso">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Informes leídos</th>
                <th>Ojos calculados</th>
                <th>Resultados</th>
                <th>Tramo</th>
                <th>Importe</th>
                <th>Aviso</th>
              </tr>
            </thead>
            <tbody>
              {datos.uso.map((u) => {
                const s = situacionDeTramo(cantidadSegunMetrica(u, plan.metrica), plan)
                return (
                  <tr key={u.mes}>
                    <td>{nombreDeMes(u.mes)}</td>
                    <td>{u.informesLeidos}</td>
                    <td>{u.ojosCalculados}</td>
                    <td>{u.resultadosDeCalculadora}</td>
                    <td>
                      {s.tramo} ({s.cantidad} de {s.tramo * plan.tamanoTramo})
                    </td>
                    <td>{euros(s.precio)}</td>
                    <td>
                      {s.avisar ? `Quedan ${s.hastaElSiguiente} para el siguiente tramo` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Todavía no existe</h2>
        <ul>
          <li>Usuarios y contraseñas, y aprobar o bloquear a cada médico.</li>
          <li>El contador de cada médico (aquí solo se ve el uso de este ordenador).</li>
          <li>Avisar al médico cuando se acerque a su tramo, y el cobro.</li>
        </ul>
        <p className="sub">
          Todo eso necesita un servidor central; está pendiente de decidir cuál. Mientras tanto, no
          se debe repartir la aplicación a más gente (faltan también los permisos de las
          calculadoras).
        </p>
      </section>
    </div>
  )
}
