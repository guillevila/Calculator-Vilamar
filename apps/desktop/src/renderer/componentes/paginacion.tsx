/**
 * paginacion.tsx — Listados largos de 15 en 15 (petición del dueño, 28/10/2026).
 *
 * Lo usan el Dashboard y «Análisis de resultados»: se enseñan las 15 primeras filas y
 * unos botones ◀ ▶ llevan a las siguientes 15, y así sucesivamente.
 */

import type { JSX } from 'react'

export const FILAS_POR_PAGINA = 15

interface Props {
  readonly pagina: number
  readonly total: number
  readonly unidad: string
  readonly onCambiar: (pagina: number) => void
  readonly testId: string
}

/** Botones ◀ Página X de Y ▶. No pinta nada si todo cabe en una página. */
export function Paginador({ pagina, total, unidad, onCambiar, testId }: Props): JSX.Element | null {
  if (total <= FILAS_POR_PAGINA) return null
  const paginas = Math.ceil(total / FILAS_POR_PAGINA)
  return (
    <div
      className="fila"
      style={{ marginTop: 10, alignItems: 'center', gap: 12 }}
      data-testid={testId}
    >
      <button
        className="claro"
        onClick={() => onCambiar(Math.max(0, pagina - 1))}
        disabled={pagina === 0}
        aria-label="Página anterior"
        data-testid={`${testId}-anterior`}
      >
        ◀
      </button>
      <span className="sub">
        Página {pagina + 1} de {paginas} · {total} {unidad}
      </span>
      <button
        className="claro"
        onClick={() => onCambiar(Math.min(paginas - 1, pagina + 1))}
        disabled={pagina + 1 >= paginas}
        aria-label="Página siguiente"
        data-testid={`${testId}-siguiente`}
      >
        ▶
      </button>
    </div>
  )
}
