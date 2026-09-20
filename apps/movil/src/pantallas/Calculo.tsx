import { useEffect, useState } from 'react'
import type { Calculadora, Caso, Lateralidad } from '@vilamar/domain'
import type { EstadoCalculo } from '@vilamar/casos'

import { api, ErrorApi } from '../api.js'

const NOMBRE: Record<Calculadora, string> = {
  EVO_TORIC: 'EVO (con córnea posterior, si la hay)',
  BARRETT_TORIC: 'Barrett',
  KANE: 'Kane',
  EVO_TORIC_SIN_CARA_POSTERIOR: 'EVO (sin córnea posterior)',
  BARRETT_TORIC_CON_CARA_POSTERIOR: 'Barrett (con córnea posterior medida)',
  BARRETT_TRUE_K_TORIC: 'Barrett True K Toric',
}

/**
 * Las cinco casillas de siempre en el ordenador (D51, `PanelCalculo.tsx`):
 * cada una se pide por su cuenta, ninguna se añade sola. `EVO_TORIC` ya usa
 * PK1/PK2 en cuanto el ojo los tiene (D45, su ficha los lleva como
 * opcionales) — `EVO_TORIC_SIN_CARA_POSTERIOR` es la misma EVO, pero SIN
 * mandárselos, para poder comparar el efecto. Con Barrett es al revés:
 * `BARRETT_TORIC` nunca los mira (usa siempre un modelo teórico), y
 * `BARRETT_TORIC_CON_CARA_POSTERIOR` es la que sí. Kane no tiene ningún
 * campo de córnea posterior (D51, comprobado en vivo): no tiene variante.
 */
const OPCIONES_CALCULO: readonly Calculadora[] = [
  'EVO_TORIC',
  'EVO_TORIC_SIN_CARA_POSTERIOR',
  'BARRETT_TORIC',
  'BARRETT_TORIC_CON_CARA_POSTERIOR',
  'KANE',
]
const ELEGIDAS_DE_PARTIDA: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

export function Calculo({
  caso,
  alVolverADatos,
  alTerminar,
}: {
  readonly caso: Caso
  readonly alVolverADatos: () => void
  readonly alTerminar: (caso: Caso) => void
}): React.JSX.Element {
  const dosOjos = Boolean(caso.ojos?.OD && caso.ojos?.OS)
  const [elegidas, setElegidas] = useState<readonly Calculadora[]>(ELEGIDAS_DE_PARTIDA)
  const [ojoFiltro, setOjoFiltro] = useState<Lateralidad | 'TODOS'>('TODOS')
  const [calculando, setCalculando] = useState(false)
  const [progreso, setProgreso] = useState<EstadoCalculo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!calculando) return
    const fuente = new EventSource('/eventos')
    fuente.addEventListener('progreso', (e) => {
      setProgreso(JSON.parse((e as MessageEvent).data) as EstadoCalculo)
    })
    return () => fuente.close()
  }, [calculando])

  function alternar(c: Calculadora): void {
    setElegidas((actual) => (actual.includes(c) ? actual.filter((x) => x !== c) : [...actual, c]))
  }

  async function calcular(): Promise<void> {
    setError(null)
    setCalculando(true)
    setProgreso(null)
    try {
      await api.calcular(elegidas, ojoFiltro === 'TODOS' ? undefined : { ojo: ojoFiltro })
      const actualizado = await api.casoActual()
      if (actualizado) alTerminar(actualizado)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido calcular.')
    } finally {
      setCalculando(false)
    }
  }

  return (
    <div className="pantalla">
      <h2>Calcular</h2>
      {error && <div className="aviso error">{error}</div>}

      <h3>Calculadoras</h3>
      <div className="pila">
        {OPCIONES_CALCULO.map((c) => (
          <label key={c} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={elegidas.includes(c)} onChange={() => alternar(c)} disabled={calculando} />
            {NOMBRE[c]}
          </label>
        ))}
      </div>

      {elegidas.includes('KANE') && (
        <div className="aviso info">
          Kane, la primera vez, pide aceptar sus condiciones de uso en una ventana del propio
          servidor — lo tiene que hacer alguien delante de ESE ordenador, no se puede hacer desde
          el móvil. Si ya se aceptó antes, esto no vuelve a salir.
        </div>
      )}

      {dosOjos && (
        <>
          <h3>Ojos a calcular</h3>
          <div className="fila-pestañas">
            <button className={ojoFiltro === 'TODOS' ? 'activa' : ''} onClick={() => setOjoFiltro('TODOS')}>
              Los dos
            </button>
            <button className={ojoFiltro === 'OD' ? 'activa' : ''} onClick={() => setOjoFiltro('OD')}>
              Solo OD
            </button>
            <button className={ojoFiltro === 'OS' ? 'activa' : ''} onClick={() => setOjoFiltro('OS')}>
              Solo OS
            </button>
          </div>
        </>
      )}

      {calculando && (
        <div className="aviso espera">
          {progreso
            ? `${NOMBRE[progreso.calculadora]} (${progreso.ojo}) — ${progreso.mensaje}`
            : 'Empezando a calcular…'}
        </div>
      )}

      <div style={{ height: 12 }} />
      <button className="boton" disabled={calculando || elegidas.length === 0} onClick={() => void calcular()}>
        {calculando ? 'Calculando…' : 'Calcular'}
      </button>
      <button className="enlace" onClick={alVolverADatos} disabled={calculando}>
        ‹ Volver a los datos
      </button>
    </div>
  )
}
