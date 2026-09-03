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
import { APARATO_PRINCIPAL, aparatosDe, ojosDelCaso } from '@vilamar/domain'

import { api, hayApi } from './api.js'
import type { ArchivoEntrante, EstadoCalculo, ResumenExtraccion } from '../compartido/ipc.js'
import { CasosGuardados } from './componentes/CasosGuardados.js'
import { ZonaSoltar } from './componentes/ZonaSoltar.js'
import { FormularioManual } from './componentes/FormularioManual.js'
import { PanelRevision } from './componentes/PanelRevision.js'
import { PanelCalculo } from './componentes/PanelCalculo.js'
import { PanelResultados } from './componentes/PanelResultados.js'
import { Avisos } from './componentes/Avisos.js'

type Paso =
  | 'INICIO'
  | 'CASOS_GUARDADOS'
  | 'CARGANDO'
  | 'MANUAL'
  | 'REVISION'
  | 'CALCULANDO'
  | 'RESULTADOS'

/** A qué pantalla lleva un caso, según cómo se haya quedado. */
function pasoDeCaso(c: Caso): Paso {
  return c.estado === 'COMPLETADO' ? 'RESULTADOS' : 'REVISION'
}

export function App(): JSX.Element {
  const [version, setVersion] = useState('')
  const [caso, setCaso] = useState<Caso | null>(null)
  const [paso, setPaso] = useState<Paso>('INICIO')
  const [resumenes, setResumenes] = useState<readonly ResumenExtraccion[]>([])
  const [avisos, setAvisos] = useState<readonly Aviso[]>([])
  const [estados, setEstados] = useState<readonly EstadoCalculo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ojoActivo, setOjoActivo] = useState<Lateralidad>('OD')
  // Con qué aparato/biómetro se trabaja en el ojo activo (D47, 27/08/2026).
  // Con un solo aparato —el caso de siempre— esto es invisible: vale
  // `APARATO_PRINCIPAL` y ningún selector se enseña.
  const [aparatoActivo, setAparatoActivo] = useState<string>(APARATO_PRINCIPAL)
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
          setPaso(pasoDeCaso(c))
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

  // Igual que con el ojo: si el aparato activo deja de existir para el ojo
  // activo (p. ej. al cambiar de ojo), se cae al primero que ese ojo tenga.
  //
  // EXCEPTO en revisión (02/09/2026): ahí, «Añadir otro biómetro» elige a
  // propósito un aparato que TODAVÍA no existe como dataset —se crea solo
  // en cuanto se escribe el primer campo, igual que en el cuestionario
  // manual—. Sin esta excepción, esta misma corrección deshacía la
  // elección antes de que diera tiempo a escribir nada: `aparatoActivo`
  // volvía al aparato original en el mismo instante en que se elegía el
  // nuevo, porque `aparatosDelOjo` (los que el caso ya tiene de verdad)
  // no lo conocía todavía.
  const aparatosDelOjo = useMemo(() => (caso ? aparatosDe(caso, ojoActivo) : []), [caso, ojoActivo])
  useEffect(() => {
    if (paso === 'REVISION') return
    if (aparatosDelOjo.length > 0 && !aparatosDelOjo.includes(aparatoActivo)) {
      const primero = aparatosDelOjo[0]
      if (primero) setAparatoActivo(primero)
    }
  }, [aparatosDelOjo, aparatoActivo, paso])

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

  /** Vuelve a abrir un caso guardado, tal y como se dejó. */
  const abrirCasoGuardado = useCallback(async (codigo: string) => {
    setError(null)
    setResumenes([])
    setEstados([])
    setAvisos([])
    const c = await api().abrirCaso(codigo)
    setCaso(c)
    setPaso(pasoDeCaso(c))
  }, [])

  /** Aplica el resultado de una carga, venga del diálogo o de arrastrar. */
  const aplicarCarga = useCallback(
    async (r: { caso: Caso; resumenes: readonly ResumenExtraccion[] } | null) => {
      if (!r) {
        setPaso('INICIO')
        return
      }
      setCaso(r.caso)
      setResumenes(r.resumenes)
      await refrescarAvisos()
      setPaso('REVISION')
    },
    [refrescarAvisos],
  )

  const cargarArchivos = useCallback(
    async (archivos: readonly ArchivoEntrante[]) => {
      if (archivos.length === 0) return
      setError(null)
      setPaso('CARGANDO')
      setOcupado(true)
      try {
        await aplicarCarga(await api().cargarDocumentos(archivos))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setPaso('INICIO')
      } finally {
        setOcupado(false)
      }
    },
    [aplicarCarga],
  )

  const elegirYcargar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      // El diálogo, la lectura y el análisis pasan enteros en el proceso
      // principal. Aquí solo llega el resultado.
      const r = await api().elegirYCargarDocumentos()
      if (r) setPaso('CARGANDO')
      await aplicarCarga(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPaso('INICIO')
    } finally {
      setOcupado(false)
    }
  }, [aplicarCarga])

  /**
   * Empezar sin documento: todo a mano. Es un caso de uso legítimo.
   *
   * Va al cuestionario simplificado (`FormularioManual`, paso `MANUAL`), no
   * directo a la revisión: ahí es donde se escriben los datos, campo a
   * campo, cada uno ya guardado en cuanto se pierde el foco.
   */
  const empezarAMano = useCallback(async () => {
    setError(null)
    const c = caso ?? (await api().casoNuevo())
    setCaso(c)
    setPaso('MANUAL')
  }, [caso])

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
    async (
      calculadoras?: readonly Calculadora[],
      filtro?: { readonly ojo?: Lateralidad; readonly aparato?: string },
    ) => {
      setError(null)
      setOcupado(true)
      setEstados((p) =>
        calculadoras ? p.filter((e) => !calculadoras.includes(e.calculadora)) : [],
      )
      try {
        await api().calcular(calculadoras, filtro)
        setPaso('RESULTADOS')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setOcupado(false)
      }
    },
    [],
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
            ([c]) =>
              c ===
              (paso === 'CARGANDO' || paso === 'MANUAL' || paso === 'CASOS_GUARDADOS'
                ? 'INICIO'
                : paso),
          )
          // Un paso ya alcanzado por el CASO —no por dónde se esté mirando
          // ahora mismo— se puede volver a pulsar para corregir algo; nunca
          // uno futuro, que saltaría por delante de lo que falta. Se mira el
          // estado del caso, no la posición actual en esta barra: si se
          // mirara la posición, volver a «Revisar datos» habría «olvidado»
          // que ya se había llegado a «Calcular», y no dejaría volver.
          // Petición expresa del dueño del proyecto (02/09/2026): antes esta
          // barra era solo un indicador, sin ningún sitio que llevara de
          // vuelta a los datos salvo un botón escondido más abajo en la
          // pantalla de resultados.
          const alcanzadoPorElCaso =
            clave === 'REVISION'
              ? true
              : clave === 'CALCULANDO'
                ? caso?.estado === 'CONFIRMADO' ||
                  caso?.estado === 'CALCULANDO' ||
                  caso?.estado === 'COMPLETADO'
                : clave === 'RESULTADOS'
                  ? caso?.estado === 'CALCULANDO' || caso?.estado === 'COMPLETADO'
                  : false
          const alcanzable = caso !== null && alcanzadoPorElCaso
          const clase = i === posicionActual ? 'activo' : alcanzable ? 'hecho' : ''
          return (
            <button
              key={clave}
              type="button"
              className={`paso ${clase}`}
              disabled={!alcanzable}
              onClick={alcanzable ? () => setPaso(clave) : undefined}
              data-testid={`paso-${clave}`}
            >
              {i + 1}. {texto}
            </button>
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
              onArchivos={(a) => void cargarArchivos(a)}
              onElegir={() => void elegirYcargar()}
              onAMano={() => void empezarAMano()}
              onAbrirGuardados={() => setPaso('CASOS_GUARDADOS')}
              ocupado={ocupado}
            />
          )}

          {paso === 'CASOS_GUARDADOS' && (
            <CasosGuardados onAbrir={abrirCasoGuardado} onVolver={() => setPaso('INICIO')} />
          )}

          {paso === 'MANUAL' && caso && (
            <FormularioManual
              caso={caso}
              onCambio={async () => {
                await refrescarAvisos()
              }}
              onContinuar={() => {
                void refrescarAvisos()
                setPaso('REVISION')
              }}
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
                aparatoActivo={aparatoActivo}
                onCambiarAparato={setAparatoActivo}
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
              // Por defecto, sin filtro: calcula TODO el caso (los dos
              // ojos, todos los aparatos que ya estén confirmados) — igual
              // que siempre. El filtro por ojo aquí es una ELECCIÓN
              // explícita de la persona (D66, el selector «Ojos a
              // calcular»), no un valor automático — eso sí reintroduciría
              // el fallo ya corregido de «solo calcula la pestaña que se
              // ve» sin que nadie lo pidiera.
              onCalcular={(c, filtro) => void calcular(c, filtro)}
              onCancelar={() => void api().cancelarCalculo()}
              onVerResultados={() => setPaso('RESULTADOS')}
              onVolverARevisar={() => setPaso('REVISION')}
            />
          )}

          {paso === 'RESULTADOS' && caso && (
            <PanelResultados
              caso={caso}
              ojoActivo={ojoActivo}
              onCambiarOjo={setOjoActivo}
              aparatoActivo={aparatoActivo}
              onCambiarAparato={setAparatoActivo}
              onReintentar={(c) => {
                // Va por `calcular()`, no por el `reintentar()` del IPC: ese
                // asume el aparato «Principal» a falta de otro dato, y un caso
                // que nombra su biómetro real (p. ej. «ZEISS IOLMaster 700»,
                // en vez del literal por defecto) no tiene NINGÚN dataset con
                // ese nombre — la casilla se recalcula sobre un ojo vacío y
                // falla por falta de datos, aunque estén todos ahí. `calcular()`
                // resuelve el aparato de verdad a través de `planificarCaso()`,
                // igual que el botón de la pantalla «Calcular» — por eso volver
                // atrás y usar ESE botón sí funcionaba.
                setPaso('CALCULANDO')
                void calcular([c], { ojo: ojoActivo, aparato: aparatoActivo })
              }}
              onVolverARevisar={() => setPaso('REVISION')}
              estados={estados}
            />
          )}
        </div>
      </main>
    </div>
  )
}
