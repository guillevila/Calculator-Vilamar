import { useEffect, useState } from 'react'
import type { Calculadora, Caso, Lateralidad } from '@vilamar/domain'
import { CALCULADORAS } from '@vilamar/domain'
import type { EstadoCalculo } from '@vilamar/casos'

import { api, ErrorApi } from '../api.js'

const NOMBRE: Record<Calculadora, string> = {
  EVO_TORIC: 'EVO',
  BARRETT_TORIC: 'Barrett',
  KANE: 'Kane',
  EVO_TORIC_SIN_CARA_POSTERIOR: 'EVO (sin córnea posterior)',
  BARRETT_TORIC_CON_CARA_POSTERIOR: 'Barrett (con córnea posterior medida)',
  BARRETT_TRUE_K_TORIC: 'Barrett True K Toric',
}

/**
 * Si el caso trae PK1 o PK2 en algún ojo. EVO ya los usa sola, dentro de
 * `EVO_TORIC` (su ficha los lleva como opcionales, D45) — no hace falta
 * pedir nada aparte. Barrett es distinto: su calculadora normal (`BARRETT_TORIC`)
 * SIEMPRE usa un modelo teórico («Predicted PCA») y nunca mira estos datos;
 * la que sí los usa es una calculadora aparte, `BARRETT_TORIC_CON_CARA_POSTERIOR`
 * (D45/D51) — por eso solo esta se ofrece como casilla extra, y solo cuando
 * hay algo que medirle. Kane no tiene ningún campo de córnea posterior
 * (D51, comprobado en vivo): no se ofrece nunca.
 */
function tieneCaraPosterior(caso: Caso): boolean {
  return (['OD', 'OS'] as const).some((l) => {
    const medidas = caso.ojos?.[l]?.[0]?.medidas
    return medidas?.PK1 !== undefined || medidas?.PK2 !== undefined
  })
}

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
  const conCaraPosterior = tieneCaraPosterior(caso)
  const opciones: readonly Calculadora[] = conCaraPosterior
    ? [...CALCULADORAS, 'BARRETT_TORIC_CON_CARA_POSTERIOR']
    : CALCULADORAS
  const [elegidas, setElegidas] = useState<readonly Calculadora[]>(CALCULADORAS)
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
        {opciones.map((c) => (
          <label key={c} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={elegidas.includes(c)} onChange={() => alternar(c)} disabled={calculando} />
            {NOMBRE[c]}
          </label>
        ))}
      </div>

      {conCaraPosterior && (
        <div className="aviso info">
          Este caso tiene córnea posterior medida. EVO ya la usa sola, dentro de «EVO» — no hace
          falta marcar nada aparte. Barrett solo la usa si marcas «Barrett (con córnea posterior
          medida)»; sin marcarla, Barrett calcula con su modelo teórico de siempre.
        </div>
      )}

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
