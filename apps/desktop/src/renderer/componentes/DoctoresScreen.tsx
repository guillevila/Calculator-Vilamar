/**
 * DoctoresScreen.tsx — La agenda de doctores (D80, 15/09/2026).
 *
 * Pantalla aparte del flujo del caso (petición expresa del dueño del
 * proyecto): añadir, editar o borrar un doctor no tiene nada que ver con el
 * caso que se esté mirando ahora mismo, así que vive detrás de su propio
 * botón en la barra superior, alcanzable desde cualquier paso.
 *
 * Elegir uno de estos doctores en el caso en curso se hace desde el
 * desplegable de `Identificacion.tsx`, no desde aquí — esta pantalla solo
 * mantiene la lista.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import type { Doctor } from '@vilamar/domain'
import { definicionDe } from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly onVolver: () => void
}

const LIMITE_SIA = definicionDe('SIA').limite
const LIMITE_EJE = definicionDe('EJE_INCISION').limite

interface FormularioDoctor {
  readonly id: string | null
  readonly nombre: string
  readonly sia: string
  readonly ejeIncision: string
}

const FORMULARIO_VACIO: FormularioDoctor = { id: null, nombre: '', sia: '', ejeIncision: '' }

/** `''` → `null` (todavía no se guarda ese dato); un número válido → ese número. */
function aNumeroOpcional(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

export function DoctoresScreen({ onVolver }: Props): JSX.Element {
  const [doctores, setDoctores] = useState<readonly Doctor[] | null>(null)
  const [form, setForm] = useState<FormularioDoctor>(FORMULARIO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargar(): void {
    void api()
      .listarDoctores()
      .then(setDoctores)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(cargar, [])

  function editar(d: Doctor): void {
    setError(null)
    setForm({
      id: d.id,
      nombre: d.nombre,
      sia: d.sia === null ? '' : String(d.sia),
      ejeIncision: d.ejeIncision === null ? '' : String(d.ejeIncision),
    })
  }

  async function guardar(): Promise<void> {
    setError(null)
    if (form.nombre.trim() === '') {
      setError('El doctor necesita un nombre.')
      return
    }
    setGuardando(true)
    try {
      const siguientes = await api().guardarDoctor({
        id: form.id ?? undefined,
        nombre: form.nombre.trim(),
        sia: aNumeroOpcional(form.sia),
        ejeIncision: aNumeroOpcional(form.ejeIncision),
      })
      setDoctores(siguientes)
      setForm(FORMULARIO_VACIO)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id: string): Promise<void> {
    setError(null)
    setGuardando(true)
    try {
      setDoctores(await api().eliminarDoctor(id))
      if (form.id === id) setForm(FORMULARIO_VACIO)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Doctores</h2>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        El SIA y el eje de incisión de aquí son un punto de partida propio de cada doctor —no del
        caso—: al elegirlo en «Identificación», se aplican a los datos del caso en curso como si se
        hubieran tecleado a mano. Un doctor sin SIA ni eje guardados todavía no cambia nada al
        elegirlo.
      </p>

      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}

      {doctores === null && <p className="sub">Buscando…</p>}
      {doctores !== null && doctores.length === 0 && (
        <p className="sub">Todavía no has guardado ningún doctor.</p>
      )}
      {doctores !== null && doctores.length > 0 && (
        <table className="revision" data-testid="tabla-doctores">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>SIA (D)</th>
              <th>Eje de incisión (°)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {doctores.map((d) => (
              <tr key={d.id}>
                <td>{d.nombre}</td>
                <td>{d.sia === null ? '—' : d.sia}</td>
                <td>{d.ejeIncision === null ? '—' : d.ejeIncision}</td>
                <td>
                  <div className="fila" style={{ gap: 6 }}>
                    <button
                      onClick={() => editar(d)}
                      disabled={guardando}
                      data-testid={`editar-doctor-${d.id}`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(d.id)}
                      disabled={guardando}
                      data-testid={`eliminar-doctor-${d.id}`}
                    >
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="separador" />

      <h3>{form.id === null ? 'Añadir doctor' : `Editando a ${form.nombre}`}</h3>
      <div className="fila" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <label htmlFor="doctor-nombre">Nombre</label>
          <input
            id="doctor-nombre"
            value={form.nombre}
            data-testid="doctor-nombre"
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="doctor-sia">SIA (D)</label>
          <input
            id="doctor-sia"
            type="number"
            step="0.01"
            min={LIMITE_SIA.min}
            max={LIMITE_SIA.max}
            value={form.sia}
            data-testid="doctor-sia"
            onChange={(e) => setForm((f) => ({ ...f, sia: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="doctor-eje">Eje de incisión (°)</label>
          <input
            id="doctor-eje"
            type="number"
            step="1"
            min={LIMITE_EJE.min}
            max={LIMITE_EJE.max}
            value={form.ejeIncision}
            data-testid="doctor-eje"
            onChange={(e) => setForm((f) => ({ ...f, ejeIncision: e.target.value }))}
          />
        </div>
      </div>
      <div className="fila" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="principal"
          onClick={() => void guardar()}
          disabled={guardando}
          data-testid="guardar-doctor"
        >
          {form.id === null ? 'Añadir' : 'Guardar cambios'}
        </button>
        {form.id !== null && (
          <button onClick={() => setForm(FORMULARIO_VACIO)} disabled={guardando}>
            Cancelar edición
          </button>
        )}
      </div>

      <div className="separador" />

      <div className="fila">
        <button onClick={onVolver} disabled={guardando} data-testid="volver-de-doctores">
          Volver
        </button>
      </div>
    </div>
  )
}
