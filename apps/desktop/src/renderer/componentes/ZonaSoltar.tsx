/**
 * ZonaSoltar.tsx — Arrastrar el informe, o elegirlo.
 */

import { useCallback, useState } from 'react'
import type { JSX } from 'react'

export interface ArchivoParaSubir {
  readonly nombre: string
  readonly tamanoBytes: number
  readonly datos: Uint8Array
}

interface Props {
  readonly onArchivos: (archivos: readonly ArchivoParaSubir[]) => void
  readonly onElegir: () => void
  readonly onAMano: () => void
  readonly ocupado: boolean
}

const ADMITIDOS = ['pdf', 'jpg', 'jpeg', 'png']

export function ZonaSoltar({ onArchivos, onElegir, onAMano, ocupado }: Props): JSX.Element {
  const [encima, setEncima] = useState(false)
  const [rechazados, setRechazados] = useState<readonly string[]>([])

  const procesar = useCallback(
    async (lista: FileList) => {
      const validos: ArchivoParaSubir[] = []
      const malos: string[] = []
      for (const fichero of Array.from(lista)) {
        const extension = fichero.name.toLowerCase().split('.').pop() ?? ''
        if (!ADMITIDOS.includes(extension)) {
          malos.push(fichero.name)
          continue
        }
        validos.push({
          nombre: fichero.name,
          tamanoBytes: fichero.size,
          datos: new Uint8Array(await fichero.arrayBuffer()),
        })
      }
      setRechazados(malos)
      if (validos.length > 0) onArchivos(validos)
    },
    [onArchivos],
  )

  return (
    <>
      <div
        className={`soltar ${encima ? 'encima' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          void procesar(e.dataTransfer.files)
        }}
        data-testid="zona-soltar"
      >
        <h2>Arrastra tu informe de biometría</h2>
        <p>o elígelo desde tu ordenador</p>
        <div className="fila" style={{ justifyContent: 'center' }}>
          <button className="principal grande" onClick={onElegir} disabled={ocupado}>
            Elegir archivo
          </button>
          <button onClick={onAMano} disabled={ocupado}>
            Escribir los datos a mano
          </button>
        </div>
        <div className="formatos">
          Admite PDF, JPG y PNG. Puedes subir varios archivos: cada uno se lee por separado.
        </div>
      </div>

      {rechazados.length > 0 && (
        <div className="aviso atencion" style={{ marginTop: 16 }}>
          <strong>No se han podido leer estos archivos:</strong> {rechazados.join(', ')}. Solo se
          admiten PDF, JPG y PNG.
        </div>
      )}

      <div className="tarjeta" style={{ marginTop: 22 }}>
        <h2>Qué hace este programa</h2>
        <p className="sub">
          Lee tu informe una sola vez, te enseña lo que ha encontrado para que lo revises y, cuando
          tú lo confirmas, rellena por ti las calculadoras de Kane, EVO Toric y Barrett Toric.
          Después pone los tres resultados juntos y genera un PDF.
        </p>
        <p className="pie-nota">
          No calcula nada por su cuenta y no recomienda ninguna lente: los números son de esas tres
          webs. Ningún dato se envía a ningún sitio salvo a las propias calculadoras, y sin tu
          nombre ni el del paciente.
        </p>
      </div>
    </>
  )
}
