/**
 * App.tsx — El flujo entero, en una pantalla por paso.
 *
 *   NUEVO CÁLCULO → ARRASTRA TU INFORME → REVISIÓN → CONFIRMAR
 *                 → CALCULANDO → RESULTADOS → GENERAR PDF
 *
 * No hay menús ni pestañas: hay un camino. Cada paso enseña lo que hace falta
 * para dar el siguiente y nada más.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'

import type { Calculadora, Caso, Lateralidad, Aviso } from '@vilamar/domain'
import { ojosDelCaso } from '@vilamar/domain'

import { api, hayApi } from './api.js'
import type { EstadoCalculo, ResumenExtraccion } from '../compartido/ipc.js'
import { ZonaSoltar } from './componentes/ZonaSoltar.js'
import { PanelRevision } from './componentes/PanelRevision.js'
import { PanelCalculo } from './componentes/PanelCalculo.js'
import { PanelResultados } from './componentes/PanelResultados.js'
import { Avisos } from './componentes/Avisos.js'

type Paso = 'INICIO' | 'CARGANDO' | 'REVISION' | 'CALCULANDO' | 'RESULTADOS'

export function App(): JSX.Element {
  const [version, setVersion] = useState('')
  const [caso, setCaso] = useState<Caso | null>(null)
  const [paso, setPaso] = useState<Paso>('INICIO')
  const [resumenes, setResumenes] = useState<readonly ResumenExtraccion[]>([])
  const [avisos, setAvisos] = useState<readonly Aviso[]>([])
  const [estados, setEstados] = useState<readonly EstadoCalculo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ojoActivo, setOjoActivo] = useState<Lateralidad>('OD')
  const [ocupado, setOcupado] = useState(false)

  const disponible = hayApi()

  useEffect(() => {
    if (!disponible) return
    void api().version().then(setVersion)
    void api()
      .casoActual()
      .then((c) => {
        if (c) {
          setCaso(c)
          setPaso(c.estado === 'COMPLETADO' ? 'RESULTADOS' : 'REVISION')
        }
      })
    const bajaCaso = api().alCambiarCaso(setCaso)
    const bajaProgreso = api().alProgresar((estado) => {
      setEstados((previos) => {
        const otros = previos.filter(
          (p) => !(p.calculadora === estado.calculadora && p.ojo === estado.ojo),
        )
        return [...otros, estado]
      })
    })
    return () => {
      bajaCaso()
      bajaProgreso()
    }
  }, [disponible])

  const ojos = useMemo(() => (caso ? ojosDelCaso(caso) : []), [caso])

  useEffect(() => {
    if (ojos.length > 0 && !ojos.includes(ojoActivo)) {
      const primero = ojos[0]
      if (primero) setOjoActivo(primero)
    }
  }, [ojos, ojoActivo])

  const refrescarAvisos = useCallback(async () => {
    setAvisos(await api().validar())
  }, [])

  const nuevoCalculo = useCallback(async () => {
    setError(null)
    setResumenes([])
    setEstados([])
    setAvisos([])
    const c = await api().casoNuevo()
    setCaso(c)
    setPaso('INICIO')
  }, [])

  const cargar = useCallback(
    async (archivos: readonly { nombre: string; tamanoBytes: number; datos: Uint8Array }[]) => {
      if (archivos.length === 0) return
      setError(null)
      setPaso('CARGANDO')
      setOcupado(true)
      try {
        const r = await api().cargarDocumentos(archivos)
        setCaso(r.caso)
        setResumenes(r.resumenes)
        await refrescarAvisos()
        setPaso('REVISION')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setPaso('INICIO')
      } finally {
        setOcupado(false)
      }
    },
    [refrescarAvisos],
  )

  const elegirYcargar = useCallback(async () => {
    const archivos = await api().elegirArchivos()
    await cargar(archivos)
  }, [cargar])

  /** Empezar sin documento: todo a mano. Es un caso de uso legítimo. */
  const empezarAMano = useCallback(async () => {
    setError(null)
    const c = caso ?? (await api().casoNuevo())
    // Se crea el ojo derecho vacío escribiendo y borrando un dato: así el caso
    // pasa a tener ese ojo y la pantalla de revisión puede enseñarlo.
    const conOjo = await api().editarMedida('OD', 'AL', 24)
    const limpio = await api().editarMedida('OD', 'AL', null)
    setCaso(limpio ?? conOjo ?? c)
    await refrescarAvisos()
    setPaso('REVISION')
  }, [caso, refrescarAvisos])

  const confirmar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      const c = await api().confirmarTodo()
      setCaso(c)
      setPaso('CALCULANDO')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }, [])

  const calcular = useCallback(
    async (calculadoras?: readonly Calculadora[]) => {
      setError(null)
      setOcupado(true)
      setEstados((p) =>
        calculadoras ? p.filter((e) => !calculadoras.includes(e.calculadora)) : [],
      )
      try {
        await api().calcular(ojoActivo, calculadoras)
        setPaso('RESULTADOS')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setOcupado(false)
      }
    },
    [ojoActivo],
  )

  if (!disponible) {
    return (
      <div className="app">
        <main className="contenido">
          <div className="centrado">
            <div className="aviso error">
              Esta pantalla se está viendo fuera de la aplicación de Calculator Vilamar. Ábrela con{' '}
              <code>pnpm dev</code>.
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="barra">
        <div className="fila">
          <h1>Calculator Vilamar</h1>
          {version && <span className="caso">v{version}</span>}
        </div>
        <div className="fila">
          {caso && <span className="caso">Caso {caso.codigo}</span>}
          <button onClick={() => void nuevoCalculo()} disabled={ocupado}>
            Nuevo cálculo
          </button>
        </div>
      </header>

      <nav className="pasos" aria-label="Progreso">
        {(
          [
            ['INICIO', 'Cargar informe'],
            ['REVISION', 'Revisar datos'],
            ['CALCULANDO', 'Calcular'],
            ['RESULTADOS', 'Resultados'],
          ] as const
        ).map(([clave, texto], i, todos) => {
          const posicionActual = todos.findIndex(
            ([c]) => c === (paso === 'CARGANDO' ? 'INICIO' : paso),
          )
          const clase = i === posicionActual ? 'activo' : i < posicionActual ? 'hecho' : ''
          return (
            <span key={clave} className={`paso ${clase}`}>
              {i + 1}. {texto}
            </span>
          )
        })}
      </nav>

      <main className="contenido">
        <div className="centrado">
          {error && (
            <div className="aviso error" role="alert">
              <strong>No se ha podido continuar.</strong> {error}
            </div>
          )}

          {paso === 'INICIO' && (
            <ZonaSoltar
              onArchivos={(a) => void cargar(a)}
              onElegir={() => void elegirYcargar()}
              onAMano={() => void empezarAMano()}
              ocupado={ocupado}
            />
          )}

          {paso === 'CARGANDO' && (
            <div className="tarjeta">
              <div className="cargando">
                Leyendo el informe…
                <div className="pie-nota">
                  Si es un documento escaneado hay que reconocer el texto, y eso tarda unos
                  segundos.
                </div>
              </div>
            </div>
          )}

          {paso === 'REVISION' && caso && (
            <>
              <Avisos resumenes={resumenes} />
              <PanelRevision
                caso={caso}
                avisos={avisos}
                ojoActivo={ojoActivo}
                onCambiarOjo={setOjoActivo}
                onCambio={async () => {
                  await refrescarAvisos()
                }}
                onConfirmar={() => void confirmar()}
                ocupado={ocupado}
              />
            </>
          )}

          {paso === 'CALCULANDO' && caso && (
            <PanelCalculo
              caso={caso}
              ojo={ojoActivo}
              estados={estados}
              ocupado={ocupado}
              onCalcular={(c) => void calcular(c)}
              onCancelar={() => void api().cancelarCalculo()}
              onVerResultados={() => setPaso('RESULTADOS')}
            />
          )}

          {paso === 'RESULTADOS' && caso && (
            <PanelResultados
              caso={caso}
              ojoActivo={ojoActivo}
              onCambiarOjo={setOjoActivo}
              onReintentar={(c) => {
                setPaso('CALCULANDO')
                void calcular([c])
              }}
              onVolverARevisar={() => setPaso('REVISION')}
            />
          )}
        </div>
      </main>
    </div>
  )
}
