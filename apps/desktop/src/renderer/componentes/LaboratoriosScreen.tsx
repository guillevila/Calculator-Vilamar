/**
 * LaboratoriosScreen.tsx — A qué email se pide la lente, según el fabricante
 * (D93, 20/09/2026).
 *
 * Pantalla aparte del flujo del caso, igual que «Doctores» (D80): gestionar
 * esta lista no tiene nada que ver con el caso que se esté mirando ahora
 * mismo. El botón «Pedir al laboratorio», en la pantalla de resultados, usa
 * esta lista para saber a qué email mandar cada pedido — no se elige aquí.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import type { Laboratorio } from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly onVolver: () => void
}

interface FormularioLaboratorio {
  readonly id: string | null
  readonly fabricante: string
  readonly email: string
}

const FORMULARIO_VACIO: FormularioLaboratorio = { id: null, fabricante: '', email: '' }

export function LaboratoriosScreen({ onVolver }: Props): JSX.Element {
  const [laboratorios, setLaboratorios] = useState<readonly Laboratorio[] | null>(null)
  const [form, setForm] = useState<FormularioLaboratorio>(FORMULARIO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargar(): void {
    void api()
      .listarLaboratorios()
      .then(setLaboratorios)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(cargar, [])

  function editar(l: Laboratorio): void {
    setError(null)
    setForm({ id: l.id, fabricante: l.fabricante, email: l.email })
  }

  async function guardar(): Promise<void> {
    setError(null)
    if (form.fabricante.trim() === '') {
      setError('Hace falta el nombre del fabricante.')
      return
    }
    if (form.email.trim() === '') {
      setError('Hace falta el email del laboratorio.')
      return
    }
    setGuardando(true)
    try {
      const siguientes = await api().guardarLaboratorio({
        id: form.id ?? undefined,
        fabricante: form.fabricante.trim(),
        email: form.email.trim(),
      })
      setLaboratorios(siguientes)
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
      setLaboratorios(await api().eliminarLaboratorio(id))
      if (form.id === id) setForm(FORMULARIO_VACIO)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Laboratorios</h2>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        El email de aquí es al que se manda el correo al pulsar «Pedir al laboratorio», en la
        pantalla de un caso terminado — según el fabricante de la lente que se haya elegido pedir
        para ese ojo, no según con qué se calculó.
      </p>

      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}

      {laboratorios === null && <p className="sub">Buscando…</p>}
      {laboratorios !== null && laboratorios.length === 0 && (
        <p className="sub">Todavía no has guardado ningún laboratorio.</p>
      )}
      {laboratorios !== null && laboratorios.length > 0 && (
        <table className="revision" data-testid="tabla-laboratorios">
          <thead>
            <tr>
              <th>Fabricante</th>
              <th>Email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {laboratorios.map((l) => (
              <tr key={l.id}>
                <td>{l.fabricante}</td>
                <td>{l.email}</td>
                <td>
                  <div className="fila" style={{ gap: 6 }}>
                    <button
                      onClick={() => editar(l)}
                      disabled={guardando}
                      data-testid={`editar-laboratorio-${l.id}`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void eliminar(l.id)}
                      disabled={guardando}
                      data-testid={`eliminar-laboratorio-${l.id}`}
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

      <h3>{form.id === null ? 'Añadir laboratorio' : `Editando ${form.fabricante}`}</h3>
      <div className="fila" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <label htmlFor="laboratorio-fabricante">Fabricante</label>
          <input
            id="laboratorio-fabricante"
            value={form.fabricante}
            data-testid="laboratorio-fabricante"
            placeholder="p. ej. Bausch &amp; Lomb"
            onChange={(e) => setForm((f) => ({ ...f, fabricante: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="laboratorio-email">Email</label>
          <input
            id="laboratorio-email"
            type="email"
            value={form.email}
            data-testid="laboratorio-email"
            placeholder="pedidos@laboratorio.com"
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>
      <div className="fila" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="principal"
          onClick={() => void guardar()}
          disabled={guardando}
          data-testid="guardar-laboratorio"
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
        <button onClick={onVolver} disabled={guardando} data-testid="volver-de-laboratorios">
          Volver
        </button>
      </div>
    </div>
  )
}
