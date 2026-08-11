/**
 * PanelResultados.tsx — Los tres resultados, juntos.
 *
 * La tabla comparativa y las observaciones. Las observaciones son descriptivas:
 * dicen en qué coinciden y en qué no. No dicen qué implantar, y no lo dirán.
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { Calculadora, Caso, Lateralidad } from '@vilamar/domain'
import {
  CALCULADORAS,
  compararOjo,
  nombreLateralidad,
  ojosDelCaso,
  resultadoDe,
  textoEstado,
} from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly onCambiarOjo: (ojo: Lateralidad) => void
  readonly onReintentar: (calculadora: Calculadora) => void
  readonly onVolverARevisar: () => void
  /** Lo que está pasando ahora mismo, para no decir «no se ha lanzado» de algo que sí. */
  readonly estados?: readonly EstadoCalculo[]
}

function celda(valor: number | undefined, sufijo = ''): JSX.Element {
  if (valor === undefined) return <td className="na">N/A</td>
  return (
    <td>
      {valor.toFixed(2)}
      {sufijo}
    </td>
  )
}

function celdaEje(valor: number | undefined): JSX.Element {
  if (valor === undefined) return <td className="na">N/A</td>
  return <td>{valor.toFixed(0)}°</td>
}

export function PanelResultados({
  caso,
  ojoActivo,
  onCambiarOjo,
  onReintentar,
  onVolverARevisar,
  estados = [],
}: Props): JSX.Element {
  const ojos = ojosDelCaso(caso)
  const [pdf, setPdf] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
  for (const c of CALCULADORAS) {
    const r = resultadoDe(caso, c, ojoActivo)
    if (r) resultados[c] = r
  }
  const comparativa = compararOjo(ojoActivo, resultados as never, [
    'KANE',
    'EVO_TORIC',
    'BARRETT_TORIC',
  ])

  async function generar(): Promise<void> {
    setGenerando(true)
    setError(null)
    try {
      const r = await api().generarPdf()
      setPdf(r.ruta)
    } catch (e) {
      setError(
        `No se ha podido generar el PDF. ${e instanceof Error ? e.message : String(e)} ` +
          'Tus resultados siguen aquí: puedes intentarlo otra vez.',
      )
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      {ojos.length > 1 && (
        <div className="fila" style={{ marginBottom: 14 }}>
          <div className="selector-ojo">
            {ojos.map((l) => (
              <button
                key={l}
                className={l === ojoActivo ? 'activo' : ''}
                onClick={() => onCambiarOjo(l)}
              >
                {nombreLateralidad(l)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tarjeta">
        <h2>Comparación · {nombreLateralidad(ojoActivo)}</h2>
        <table className="comparativa" data-testid="tabla-comparativa">
          <thead>
            <tr>
              <th></th>
              {comparativa.celdas.map((c) => (
                <th key={c.calculadora}>{c.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Esfera</th>
              {comparativa.celdas.map((c) => (
                <Celda key={c.calculadora} valor={c.esfera} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Cilindro</th>
              {comparativa.celdas.map((c) => (
                <Celda key={c.calculadora} valor={c.cilindro} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Eje</th>
              {comparativa.celdas.map((c) => (
                <CeldaEje key={c.calculadora} valor={c.eje} />
              ))}
            </tr>
            <tr>
              <th>Modelo tórico</th>
              {comparativa.celdas.map((c) =>
                c.designacion ? (
                  <td key={c.calculadora}>{c.designacion}</td>
                ) : (
                  <td key={c.calculadora} className="na">
                    N/A
                  </td>
                ),
              )}
            </tr>
            <tr>
              <th>Refracción prevista</th>
              {comparativa.celdas.map((c) => (
                <Celda key={c.calculadora} valor={c.refraccionPrevista} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Cilindro residual</th>
              {comparativa.celdas.map((c) => (
                <Celda key={c.calculadora} valor={c.cilindroResidual} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Eje residual</th>
              {comparativa.celdas.map((c) => (
                <CeldaEje key={c.calculadora} valor={c.ejeResidual} />
              ))}
            </tr>
            <tr>
              <th>Estado</th>
              {comparativa.celdas.map((c) => {
                // Una calculadora sin resultado pero con actividad NO está «sin
                // lanzar»: está esperando, a menudo a que el usuario haga algo.
                const enCurso = estados.find(
                  (e) => e.calculadora === c.calculadora && e.ojo === ojoActivo,
                )
                const texto =
                  c.estado === 'NO_EJECUTADA' && enCurso
                    ? enCurso.requiereUsuario
                      ? 'Esperando a que hagas algo en el navegador'
                      : 'En curso…'
                    : textoEstado(c.estado)
                return (
                  <td key={c.calculadora} style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                    {texto}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="tarjeta">
        <h2>Qué dicen estos resultados</h2>
        {comparativa.observaciones.length === 0 && (
          <p className="sub">Todavía no hay nada que comparar.</p>
        )}
        {comparativa.observaciones.map((o, i) => (
          <div key={i} className={`observacion ${o.tipo}`}>
            {o.texto}
          </div>
        ))}
        <p className="pie-nota">
          Esto describe en qué coinciden y en qué no las calculadoras. Calculator Vilamar no
          recomienda ninguna lente.
        </p>
      </div>

      <div className="tarjeta">
        <h2>Reintentar una sola</h2>
        <p className="sub">Si alguna falló, puedes lanzarla otra vez sin perder las demás.</p>
        <div className="fila">
          {CALCULADORAS.map((c) => {
            const r = resultadoDe(caso, c, ojoActivo)
            const fallo = !r || (r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL')
            return (
              <button key={c} onClick={() => onReintentar(c)} disabled={!fallo && r !== undefined}>
                {fallo ? 'Reintentar' : 'Repetir'}{' '}
                {c === 'EVO_TORIC' ? 'EVO' : c === 'BARRETT_TORIC' ? 'Barrett' : 'Kane'}
              </button>
            )
          })}
          <button onClick={onVolverARevisar}>Volver a los datos</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Informe</h2>
        <p className="sub">
          Un PDF con los datos confirmados, de dónde salió cada uno, los tres resultados y las
          diferencias entre ellos.
        </p>
        {error && <div className="aviso error">{error}</div>}
        {pdf && (
          <div className="aviso exito">
            <strong>Informe generado.</strong> Está en <code>{pdf}</code>
          </div>
        )}
        <div className="fila derecha">
          {pdf && (
            <button onClick={() => void api().abrirCarpetaInformes()}>Abrir la carpeta</button>
          )}
          <button
            className="principal grande"
            onClick={() => void generar()}
            disabled={generando}
            data-testid="generar-pdf"
          >
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </>
  )
}

function Celda({ valor, sufijo }: { valor: number | undefined; sufijo?: string }): JSX.Element {
  return celda(valor, sufijo)
}

function CeldaEje({ valor }: { valor: number | undefined }): JSX.Element {
  return celdaEje(valor)
}
