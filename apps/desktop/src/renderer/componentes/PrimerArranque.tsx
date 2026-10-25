/**
 * PrimerArranque.tsx — El asistente de la primera vez (26/10/2026, petición del
 * dueño: que quien reciba la aplicación pueda dejarla lista sin tocar ficheros).
 *
 * Dos pasos, los dos opcionales: pegar su clave de API de Anthropic (para que la
 * lectura de fotos use IA) y elegir la carpeta donde se guardan sus informes.
 * La clave solo entra: se guarda en este ordenador y la pantalla nunca la vuelve
 * a mostrar. Los dos cambios se aplican al reiniciar, y se dice.
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { EstadoPrimerArranque } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly estado: EstadoPrimerArranque
  readonly onTerminar: () => void
}

export function PrimerArranque({ estado, onTerminar }: Props): JSX.Element {
  const [clave, setClave] = useState('')
  const [claveGuardada, setClaveGuardada] = useState(false)
  const [errorClave, setErrorClave] = useState<string | null>(null)
  const [carpeta, setCarpeta] = useState<string | null>(null)

  async function guardarClave(): Promise<void> {
    setErrorClave(null)
    const bien = await api().guardarClaveApi(clave)
    if (bien) {
      setClaveGuardada(true)
      setClave('')
    } else {
      setErrorClave(
        'Eso no parece una clave de Anthropic. Empieza por «sk-ant-» y va en una sola pieza, sin espacios.',
      )
    }
  }

  async function elegirCarpeta(): Promise<void> {
    const ruta = await api().elegirCarpetaInformes()
    if (ruta) setCarpeta(ruta)
  }

  async function terminar(reiniciar: boolean): Promise<void> {
    await api().terminarPrimerArranque()
    if (reiniciar) await api().reiniciarAplicacion()
    else onTerminar()
  }

  const hayCambios = claveGuardada || carpeta !== null

  return (
    <main className="contenido" data-testid="primer-arranque">
      <div className="centrado">
        <section className="tarjeta">
          <h2>Bienvenido</h2>
          <p className="sub">
            Dos ajustes para dejar la aplicación lista. Los dos son opcionales y se pueden hacer más
            tarde.
          </p>

          <h3>1. Tu clave de Anthropic</h3>
          <p className="sub">
            Sirve para que la lectura de fotos de los informes use inteligencia artificial, que
            acierta mucho más. Se guarda solo en este ordenador y no se vuelve a mostrar. Sin ella,
            la aplicación funciona con la lectura local, que se equivoca más.
          </p>
          {estado.hayClave && !claveGuardada && (
            <p className="sub">Ya hay una clave guardada en este ordenador.</p>
          )}
          {claveGuardada ? (
            <div className="aviso" data-testid="clave-guardada">
              Clave guardada. Se activará al reiniciar la aplicación.
            </div>
          ) : (
            <div className="fila" style={{ gap: 8 }}>
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                style={{ flex: 1 }}
                data-testid="campo-clave-api"
              />
              <button
                className="principal"
                onClick={() => void guardarClave()}
                disabled={clave.trim() === ''}
                data-testid="guardar-clave-api"
              >
                Guardar clave
              </button>
            </div>
          )}
          {errorClave && <div className="aviso aviso-error">{errorClave}</div>}

          <h3 style={{ marginTop: 24 }}>2. Carpeta de tus informes</h3>
          <p className="sub">
            Aquí se guardarán los PDF que generes. Ahora:{' '}
            <strong>{carpeta ?? estado.carpetaInformes}</strong>
          </p>
          <p className="sub">
            Ojo: los informes llevan el nombre del paciente. Si eliges una carpeta sincronizada con
            la nube (OneDrive, Dropbox…), se subirán allí.
          </p>
          <button onClick={() => void elegirCarpeta()} data-testid="elegir-carpeta-informes">
            Elegir otra carpeta…
          </button>

          <div className="fila" style={{ marginTop: 24, gap: 8 }}>
            {hayCambios ? (
              <button
                className="principal"
                onClick={() => void terminar(true)}
                data-testid="primer-arranque-reiniciar"
              >
                Terminar y reiniciar
              </button>
            ) : (
              <button
                className="principal"
                onClick={() => void terminar(false)}
                data-testid="primer-arranque-omitir"
              >
                Ahora no
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
