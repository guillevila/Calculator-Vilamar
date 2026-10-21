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

/** Cuántos casos se enseñan por página (instrucciones del dueño, 21/10/2026). */
export const CASOS_POR_PAGINA = 20

/**
 * Qué casos se enseñan aquí: los calculados y los que se quedaron a medias pero
 * ya tienen los documentos leídos. Un caso que nunca pasó de «Nuevo cálculo» no
 * tiene nada que recuperar y solo estorbaba en la lista.
 */
export function casosParaRevisar(
  casos: readonly ResumenCasoGuardado[],
): readonly ResumenCasoGuardado[] {
  return casos.filter((c) => c.estado !== 'BORRADOR')
}

export function CasosGuardados({ onAbrir, onVolver }: Props): JSX.Element {
  const [todos, setCasos] = useState<readonly ResumenCasoGuardado[] | null>(null)
  const casos = todos === null ? null : casosParaRevisar(todos)
  const [pagina, setPagina] = useState(0)
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
        <p className="sub">Todavía no hay ningún caso calculado ni con documentos leídos.</p>
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
            {casos.slice(pagina * CASOS_POR_PAGINA, (pagina + 1) * CASOS_POR_PAGINA).map((c) => (
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
      {casos !== null && casos.length > CASOS_POR_PAGINA && (
        <div
          className="fila"
          style={{ marginTop: 12, alignItems: 'center', gap: 12 }}
          data-testid="paginacion-casos"
        >
          <button
            className="claro"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            aria-label="Página anterior"
            data-testid="pagina-anterior"
          >
            ◀
          </button>
          <span className="sub">
            Página {pagina + 1} de {Math.ceil(casos.length / CASOS_POR_PAGINA)} · {casos.length}{' '}
            casos
          </span>
          <button
            className="claro"
            onClick={() =>
              setPagina((p) => Math.min(Math.ceil(casos.length / CASOS_POR_PAGINA) - 1, p + 1))
            }
            disabled={(pagina + 1) * CASOS_POR_PAGINA >= casos.length}
            aria-label="Página siguiente"
            data-testid="pagina-siguiente"
          >
            ▶
          </button>
        </div>
      )}
      <div className="fila" style={{ marginTop: 14 }}>
        <button className="claro" onClick={onVolver} disabled={abriendo !== null}>
          Volver
        </button>
      </div>
    </div>
  )
}
