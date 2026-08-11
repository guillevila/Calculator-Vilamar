/**
 * Avisos.tsx — Qué se ha encontrado en cada documento.
 *
 * Es lo primero que ve el usuario tras subir un informe: qué aparato se ha
 * reconocido, cómo se han separado los ojos y qué no ha salido bien. Que la
 * separación de ojos se explique por escrito no es un adorno: es la parte donde
 * más caro sale equivocarse.
 */

import type { JSX } from 'react'

import type { ResumenExtraccion } from '../../compartido/ipc.js'

interface Props {
  readonly resumenes: readonly ResumenExtraccion[]
}

export function Avisos({ resumenes }: Props): JSX.Element | null {
  if (resumenes.length === 0) return null

  return (
    <div className="tarjeta">
      <h2>Lo que se ha leído</h2>
      {resumenes.map((r, i) => (
        <div key={`${r.documentoId}-${i}`} style={{ marginBottom: 14 }}>
          <div className="fila">
            <strong>{r.nombreArchivo}</strong>
            <span className="origen extraido">{r.nombreDispositivo}</span>
            {r.confianzaDispositivo > 0 && (
              <span className="caso" style={{ color: 'var(--gris)', fontSize: 12.5 }}>
                encaje {Math.round(r.confianzaDispositivo * 100)} %
              </span>
            )}
          </div>

          {r.ojosEncontrados.length > 0 ? (
            <div className="pie-nota">
              Datos encontrados de: <strong>{r.ojosEncontrados.join(' y ')}</strong>.{' '}
              {r.explicacionOjos}
            </div>
          ) : (
            <div className="pie-nota">No se han encontrado datos biométricos en este archivo.</div>
          )}

          {r.avisos.map((a, j) => (
            <div key={j} className="aviso atencion" style={{ marginTop: 8, marginBottom: 0 }}>
              {a}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
