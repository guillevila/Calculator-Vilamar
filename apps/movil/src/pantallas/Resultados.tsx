import { useState } from 'react'
import type { Calculadora, Caso, Lateralidad, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import { CALCULADORAS, claveResultado } from '@vilamar/domain'

import { api, ErrorApi } from '../api.js'

const NOMBRE: Record<Calculadora, string> = {
  EVO_TORIC: 'EVO',
  BARRETT_TORIC: 'Barrett',
  KANE: 'Kane',
  EVO_TORIC_SIN_CARA_POSTERIOR: 'EVO (sin córnea posterior)',
  BARRETT_TORIC_CON_CARA_POSTERIOR: 'Barrett (con córnea posterior medida)',
  BARRETT_TRUE_K_TORIC: 'Barrett True K Toric',
}

// Las tres de siempre, más la variante de Barrett con córnea posterior
// medida (D45/D51) — la única «extra» que se puede pedir desde el móvil
// (ver Calculo.tsx). Comprobar las cuatro siempre es inofensivo: si no se
// pidió esa casilla, `claveResultado` no encuentra nada y no se enseña.
const CALCULADORAS_A_ENSEÑAR: readonly Calculadora[] = [...CALCULADORAS, 'BARRETT_TORIC_CON_CARA_POSTERIOR']

function aparatoDe(caso: Caso, lado: Lateralidad): string {
  return caso.ojos?.[lado]?.[0]?.aparato ?? 'Principal'
}

export function Resultados({
  caso,
  alVolverACalcular,
  alEmpezarOtroCaso,
}: {
  readonly caso: Caso
  readonly alVolverACalcular: () => void
  readonly alEmpezarOtroCaso: () => void
}): React.JSX.Element {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descargas, setDescargas] = useState<readonly { ojo: Lateralidad; descarga: string }[] | null>(null)

  async function generarPdf(): Promise<void> {
    setError(null)
    setGenerando(true)
    try {
      const { rutas } = await api.generarPdf()
      setDescargas(rutas)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido generar el PDF.')
    } finally {
      setGenerando(false)
    }
  }

  const ojos: readonly Lateralidad[] = (['OD', 'OS'] as const).filter((l) => caso.ojos?.[l])

  return (
    <div className="pantalla">
      <h2>Resultados</h2>
      {error && <div className="aviso error">{error}</div>}

      {ojos.map((lado) => (
        <div key={lado} style={{ marginBottom: 20 }}>
          <h3>{lado === 'OD' ? 'Ojo derecho (OD)' : 'Ojo izquierdo (OS)'}</h3>
          <div className="pila">
            {CALCULADORAS_A_ENSEÑAR.map((c) => {
              const resultado = caso.resultados[claveResultado(c, lado, aparatoDe(caso, lado))]
              if (!resultado) return null
              return <TarjetaResultado key={c} resultado={resultado} />
            })}
          </div>
        </div>
      ))}

      <div className="aviso info" style={{ fontSize: 13 }}>
        Lo recomendado aquí es lo que cada calculadora destaca por su cuenta — Calculator Vilamar
        compara, no elige por ti.
      </div>

      {!descargas ? (
        <button className="boton" disabled={generando} onClick={() => void generarPdf()}>
          {generando ? 'Generando el PDF…' : 'Generar PDF'}
        </button>
      ) : (
        <div className="pila">
          {descargas.map((d) => (
            <a key={d.ojo} className="boton" style={{ textAlign: 'center' }} href={d.descarga} download>
              Descargar PDF — {d.ojo}
            </a>
          ))}
        </div>
      )}

      <button className="enlace" onClick={alVolverACalcular}>
        ‹ Volver a calcular
      </button>
      <button className="enlace" onClick={alEmpezarOtroCaso}>
        Empezar otro caso
      </button>
    </div>
  )
}

function TarjetaResultado({ resultado }: { readonly resultado: ResultadoCalculadora }): React.JSX.Element {
  if (resultado.estado !== 'SUCCESS' && resultado.estado !== 'PARTIAL') {
    return (
      <div className={`aviso ${resultado.estado === 'NEEDS_USER_ACTION' ? 'espera' : 'error'}`}>
        <strong>{NOMBRE[resultado.calculadora]}:</strong> {resultado.mensaje ?? 'No se ha podido calcular.'}
      </div>
    )
  }

  return (
    <div className="aviso exito">
      <strong>{NOMBRE[resultado.calculadora]}</strong>
      {resultado.mensaje && <p style={{ margin: '6px 0' }}>{resultado.mensaje}</p>}
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          {resultado.opciones.map((o, i) => (
            <FilaOpcion key={i} opcion={o} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaOpcion({ opcion }: { readonly opcion: OpcionLente }): React.JSX.Element {
  return (
    <tr style={{ fontWeight: opcion.recomendada ? 700 : 400 }}>
      <td>{opcion.esfera ?? '—'} D</td>
      <td>{opcion.cilindro !== undefined ? `${opcion.designacion ?? `${opcion.cilindro} D`} @ ${opcion.eje ?? '—'}°` : ''}</td>
      <td>{opcion.refraccionPrevista !== undefined ? `${opcion.refraccionPrevista} D` : ''}</td>
    </tr>
  )
}
