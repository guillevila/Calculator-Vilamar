/**
 * CasosGuardados.tsx — Volver a abrir un caso que ya se empezó.
 *
 * Antes de esto (02/09/2026, petición expresa del dueño del proyecto) no
 * había ninguna forma de recuperar un caso una vez cerrada la aplicación:
 * solo existía «el que está abierto ahora mismo», que vive en memoria y se
 * pierde al reiniciar. El fichero de cada caso ya se guardaba en disco
 * desde el principio — lo que faltaba era una pantalla para elegir cuál
 * volver a abrir.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import { NOMBRE_ESTADO } from '@vilamar/domain'

import type { ResumenCasoGuardado } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly onAbrir: (codigo: string) => Promise<void>
  readonly onVolver: () => void
}

function fecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function CasosGuardados({ onAbrir, onVolver }: Props): JSX.Element {
  const [casos, setCasos] = useState<readonly ResumenCasoGuardado[] | null>(null)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api()
      .listarCasosGuardados()
      .then(setCasos)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function abrir(codigo: string): Promise<void> {
    setError(null)
    setAbriendo(codigo)
    try {
      await onAbrir(codigo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAbriendo(null)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Casos guardados</h2>
      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}
      {casos === null && <p className="sub">Buscando…</p>}
      {casos !== null && casos.length === 0 && (
        <p className="sub">Todavía no has guardado ningún caso.</p>
      )}
      {casos !== null && casos.length > 0 && (
        <table className="revision" data-testid="tabla-casos-guardados">
          <thead>
            <tr>
              <th>Código</th>
              <th>Paciente</th>
              <th>Estado</th>
              <th>Última vez tocado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.codigo}>
                <td>{c.codigo}</td>
                <td>{c.nombrePaciente ?? '—'}</td>
                <td>{NOMBRE_ESTADO[c.estado]}</td>
                <td>{fecha(c.actualizadoEn)}</td>
                <td>
                  <button
                    className="principal"
                    onClick={() => void abrir(c.codigo)}
                    disabled={abriendo !== null}
                    data-testid={`abrir-caso-${c.codigo}`}
                  >
                    {abriendo === c.codigo ? 'Abriendo…' : 'Abrir'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="fila" style={{ marginTop: 14 }}>
        <button onClick={onVolver} disabled={abriendo !== null}>
          Volver
        </button>
      </div>
    </div>
  )
}
