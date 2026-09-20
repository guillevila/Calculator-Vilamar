import { useRef, useState } from 'react'

import { api, ErrorApi } from '../api.js'
import type { Caso } from '@vilamar/domain'

export function Inicio({
  alTenerCaso,
}: {
  readonly alTenerCaso: (caso: Caso, pantallaSiguiente: 'DATOS' | 'CALCULO') => void
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState<'FOTO' | 'MANUAL' | null>(null)
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
      await api.cargarDocumentos(Array.from(archivos))
      const caso = await api.casoActual()
      if (caso) alTenerCaso(caso, 'DATOS')
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido leer la foto.')
    } finally {
      setCargando(null)
      if (entradaFoto.current) entradaFoto.current.value = ''
    }
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
