/**
 * ZonaSoltar.tsx — Arrastrar el informe, o elegirlo.
 */

import { useCallback, useState } from 'react'

import type { ArchivoEntrante } from '../../compartido/ipc.js'
import { api } from '../api.js'
import type { JSX } from 'react'

interface Props {
  readonly onArchivos: (archivos: readonly ArchivoEntrante[]) => void
  readonly onElegir: () => void
  readonly onAMano: () => void
  readonly onAbrirGuardados: () => void
  readonly ocupado: boolean
}

const ADMITIDOS = ['pdf', 'jpg', 'jpeg', 'png']

export function ZonaSoltar({
  onArchivos,
  onElegir,
  onAMano,
  onAbrirGuardados,
  ocupado,
}: Props): JSX.Element {
  const [encima, setEncima] = useState(false)
  const [rechazados, setRechazados] = useState<readonly string[]>([])

  /**
   * De cada fichero arrastrado se manda su RUTA si Electron la da, y su
   * CONTENIDO si no.
   *
   * La ruta es mejor —no copia nada— pero `getPathForFile` devuelve a veces una
   * cadena vacía, y entonces rechazar el fichero sería absurdo cuando el
   * contenido está aquí mismo. Se comprobó que un `Uint8Array` sobrevive íntegro
   * al IPC, así que el segundo camino es igual de válido.
   */
  const procesar = useCallback(
    async (lista: FileList) => {
      const archivos: ArchivoEntrante[] = []
      const malos: string[] = []
      for (const fichero of Array.from(lista)) {
        const extension = fichero.name.toLowerCase().split('.').pop() ?? ''
        if (!ADMITIDOS.includes(extension)) {
          malos.push(fichero.name)
          continue
        }
        let ruta = ''
        try {
          ruta = api().rutaDeArchivo(fichero)
        } catch {
          ruta = ''
        }
        if (ruta) {
          archivos.push({ nombre: fichero.name, ruta })
        } else {
          archivos.push({
            nombre: fichero.name,
            datos: new Uint8Array(await fichero.arrayBuffer()),
          })
        }
      }
      setRechazados(malos)
      if (archivos.length > 0) onArchivos(archivos)
    },
    [onArchivos],
  )

  return (
    <>
      <div className="opciones-inicio">
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
          </div>
          <div className="formatos">
            Admite PDF, JPG y PNG. Puedes subir varios archivos: cada uno se lee por separado.
          </div>
        </div>

        <div className="soltar" data-testid="tarjeta-manual">
          <h2>Escribe los datos a mano</h2>
          <p>Sin documento: un cuestionario con solo lo que hace falta para calcular</p>
          <div className="fila" style={{ justifyContent: 'center' }}>
            <button className="principal grande" onClick={onAMano} disabled={ocupado}>
              Escribir los datos a mano
            </button>
          </div>
        </div>

        <div className="soltar" data-testid="tarjeta-casos-guardados">
          <h2>Abre un caso guardado</h2>
          <p>Vuelve a uno que ya empezaste, tal y como lo dejaste</p>
          <div className="fila" style={{ justifyContent: 'center' }}>
            <button className="principal grande" onClick={onAbrirGuardados} disabled={ocupado}>
              Ver casos guardados
            </button>
          </div>
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
          webs. Ningún dato se envía a ningún sitio salvo a las propias calculadoras — y a esas sí
          les llega tu nombre y el del paciente, si su formulario lo pide.
        </p>
      </div>
    </>
  )
}
