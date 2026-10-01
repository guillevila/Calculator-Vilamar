import { useRef, useState } from 'react'

import type { ResumenExtraccion } from '@vilamar/casos'
import type { Caso } from '@vilamar/domain'

import { api, ErrorApi } from '../api.js'

export function Inicio({
  alTenerCaso,
}: {
  readonly alTenerCaso: (caso: Caso, pantallaSiguiente: 'DATOS' | 'CALCULO') => void
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState<'FOTO' | 'MANUAL' | null>(null)
  // Lo que se ha leído se enseña antes de pasar a Datos — nunca se entra
  // directo con datos que puedan estar mal separados o mal leídos sin que
  // nadie los haya visto (CLAUDE.md: «avisa y bloquea; corrige la persona»).
  const [pendiente, setPendiente] = useState<{
    caso: Caso
    resumenes: readonly ResumenExtraccion[]
  } | null>(null)
  const entradaFoto = useRef<HTMLInputElement>(null)

  async function empezarManual(): Promise<void> {
    setError(null)
    setCargando('MANUAL')
    try {
      const caso = await api.nuevoCaso()
      alTenerCaso(caso, 'DATOS')
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido crear el caso.')
    } finally {
      setCargando(null)
    }
  }

  async function archivosElegidos(archivos: FileList | null): Promise<void> {
    if (!archivos || archivos.length === 0) return
    setError(null)
    setCargando('FOTO')
    try {
      await api.nuevoCaso()
      const { caso, resumenes } = await api.cargarDocumentos(Array.from(archivos))
      setPendiente({ caso, resumenes })
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido leer la foto.')
    } finally {
      setCargando(null)
      if (entradaFoto.current) entradaFoto.current.value = ''
    }
  }

  if (pendiente) {
    return (
      <div className="pantalla">
        <h2>Lo que se ha leído</h2>
        <div className="pila">
          {pendiente.resumenes.map((r, i) => (
            <div key={`${r.documentoId}-${i}`} className="aviso info">
              <strong>{r.nombreArchivo}</strong> — {r.nombreDispositivo}
              <div style={{ marginTop: 4 }}>
                {r.ojosEncontrados.length > 0
                  ? `Datos encontrados de: ${r.ojosEncontrados.join(' y ')}. ${r.explicacionOjos}`
                  : 'No se han encontrado datos biométricos en este archivo.'}
              </div>
              {r.avisos.map((a, j) => (
                <div key={j} style={{ marginTop: 6, fontWeight: 600 }}>
                  ⚠️ {a}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ height: 8 }} />
        <button className="boton" onClick={() => alTenerCaso(pendiente.caso, 'DATOS')}>
          Revisar los datos
        </button>
      </div>
    )
  }

  return (
    <div className="pantalla">
      <h2>Nuevo caso</h2>
      {error && <div className="aviso error">{error}</div>}
      <div className="pila">
        <button
          className="boton grande"
          onClick={() => entradaFoto.current?.click()}
          disabled={cargando !== null}
        >
          📷 {cargando === 'FOTO' ? 'Leyendo la foto…' : 'Hacer foto o subir imagen'}
        </button>
        <input
          ref={entradaFoto}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void archivosElegidos(e.target.files)}
        />

        <button className="boton grande secundario" onClick={() => void empezarManual()} disabled={cargando !== null}>
          ✏️ {cargando === 'MANUAL' ? 'Creando el caso…' : 'Escribir a mano'}
        </button>
      </div>
    </div>
  )
}
