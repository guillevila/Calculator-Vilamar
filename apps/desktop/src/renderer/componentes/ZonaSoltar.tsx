/**
 * ZonaSoltar.tsx — Arrastrar el informe, o elegirlo.
 */

import { useCallback, useState } from 'react'

import { api } from '../api.js'
import type { JSX } from 'react'

interface Props {
  /** Se le pasan las RUTAS de los ficheros, no su contenido. */
  readonly onRutas: (rutas: readonly string[]) => void
  readonly onElegir: () => void
  readonly onAMano: () => void
  readonly ocupado: boolean
}

const ADMITIDOS = ['pdf', 'jpg', 'jpeg', 'png']

export function ZonaSoltar({ onRutas, onElegir, onAMano, ocupado }: Props): JSX.Element {
  const [encima, setEncima] = useState(false)
  const [rechazados, setRechazados] = useState<readonly string[]>([])

  /**
   * De los ficheros arrastrados solo se saca su RUTA, y se manda esa.
   *
   * El contenido lo lee el proceso principal, que es quien tiene acceso al
   * disco. Antes se leía aquí y se enviaba por IPC, y en ese viaje se perdía:
   * llegaba un fichero de 0 bytes.
   */
  const procesar = useCallback(
    (lista: FileList) => {
      const rutas: string[] = []
      const malos: string[] = []
      for (const fichero of Array.from(lista)) {
        const extension = fichero.name.toLowerCase().split('.').pop() ?? ''
        if (!ADMITIDOS.includes(extension)) {
          malos.push(fichero.name)
          continue
        }
        const ruta = api().rutaDeArchivo(fichero)
        if (ruta) rutas.push(ruta)
        else malos.push(fichero.name)
      }
      setRechazados(malos)
      if (rutas.length > 0) onRutas(rutas)
    },
    [onRutas],
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
          procesar(e.dataTransfer.files)
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
