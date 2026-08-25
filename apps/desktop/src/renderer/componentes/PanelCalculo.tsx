/**
 * PanelCalculo.tsx — Lo que pasa mientras se habla con las tres webs.
 *
 * El usuario ve, calculadora por calculadora, en qué punto va cada una. Cuando
 * una pide intervención, no sale un error: sale una instrucción concreta y la
 * fila se pone en ámbar, porque el navegador está abierto esperándole.
 */

import { useState, type JSX } from 'react'

import type { Calculadora, Caso, Lateralidad } from '@vilamar/domain'
import { CALCULADORAS, fichaDe, resultadoDe, textoEstado } from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'

interface Props {
  readonly caso: Caso
  readonly ojo: Lateralidad
  readonly estados: readonly EstadoCalculo[]
  readonly ocupado: boolean
  readonly onCalcular: (calculadoras?: readonly Calculadora[]) => void
  readonly onCancelar: () => void
  readonly onVerResultados: () => void
}

const ORDEN: readonly Calculadora[] = ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

export function PanelCalculo({
  caso,
  ojo,
  estados,
  ocupado,
  onCalcular,
  onCancelar,
  onVerResultados,
}: Props): JSX.Element {
  const hayAlguno = CALCULADORAS.some((c) => resultadoDe(caso, c, ojo) !== undefined)
  const requiereUsuario = estados.filter((e) => e.requiereUsuario)

  /**
   * Con cuáles calcular. Empieza con las tres marcadas — «calcula en todas» es
   * lo habitual — y se puede desmarcar la que no interese ANTES de pulsar
   * «Calcular». No afecta a «Reintentar» de una fila, que ya elige su propia
   * calculadora sin mirar esto.
   */
  const [seleccion, setSeleccion] = useState<ReadonlySet<Calculadora>>(new Set(ORDEN))

  function alternar(clave: Calculadora): void {
    setSeleccion((previa) => {
      const siguiente = new Set(previa)
      if (siguiente.has(clave)) siguiente.delete(clave)
      else siguiente.add(clave)
      return siguiente
    })
  }

  const elegidas = ORDEN.filter((c) => seleccion.has(c))

  return (
    <>
      {requiereUsuario.map((e) => (
        <div className="aviso atencion" key={e.calculadora} role="alert">
          <strong>{fichaDe(e.calculadora).nombre.toUpperCase()} REQUIERE TU INTERVENCIÓN.</strong>{' '}
          {e.mensaje}
        </div>
      ))}

      <div className="tarjeta">
        <h2>Calculando</h2>
        <p className="sub">
          Se abrirá un navegador y verás cómo se rellenan las calculadoras. Si alguna te pide algo,
          hazlo en esa ventana: el programa continúa solo cuando termines.
        </p>

        <div className="calculadoras">
          {ORDEN.map((clave) => {
            const ficha = fichaDe(clave)
            const resultado = resultadoDe(caso, clave, ojo)
            const estado = estados.find((e) => e.calculadora === clave && e.ojo === ojo)

            let clase = ''
            let marca = '·'
            let detalle = 'Pendiente'

            if (resultado) {
              if (resultado.estado === 'SUCCESS') {
                clase = 'exito'
                marca = '✓'
                detalle = 'Resultado obtenido'
              } else if (resultado.estado === 'PARTIAL') {
                clase = 'exito'
                marca = '~'
                detalle = resultado.mensaje ?? 'Resultado incompleto'
              } else if (resultado.estado === 'NEEDS_USER_ACTION') {
                clase = 'requiere-usuario'
                marca = '!'
                detalle = resultado.mensaje ?? textoEstado(resultado.estado)
              } else {
                clase = 'fallo'
                marca = '✕'
                detalle = resultado.mensaje ?? textoEstado(resultado.estado)
              }
            } else if (estado) {
              clase = estado.requiereUsuario ? 'requiere-usuario' : ''
              marca = estado.requiereUsuario ? '!' : '…'
              detalle = estado.mensaje
            }

            return (
              <div className={`calc ${clase}`} key={clave} data-testid={`calc-${clave}`}>
                <label className="marca-seleccion">
                  <input
                    type="checkbox"
                    checked={seleccion.has(clave)}
                    disabled={ocupado}
                    onChange={() => alternar(clave)}
                    aria-label={`Calcular en ${ficha.nombre}`}
                    data-testid={`seleccion-${clave}`}
                  />
                </label>
                <span className="marca">{marca}</span>
                <span className="nombre">{ficha.nombre}</span>
                <span className="detalle">
                  {detalle}
                  {ficha.intervencionHumana.length > 0 && !resultado && (
                    <div style={{ marginTop: 3, fontSize: 12 }}>
                      Puede pedirte: {ficha.intervencionHumana[0]}
                    </div>
                  )}
                </span>
                {resultado && resultado.estado !== 'SUCCESS' && (
                  <button onClick={() => onCalcular([clave])} disabled={ocupado}>
                    Reintentar
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="separador" />

        <div className="fila derecha">
          {ocupado && <button onClick={onCancelar}>Cancelar</button>}
          {!ocupado && (
            <button
              className="principal"
              onClick={() => onCalcular(elegidas)}
              disabled={elegidas.length === 0}
              data-testid="lanzar-calculo"
            >
              {textoBoton(hayAlguno, elegidas)}
            </button>
          )}
          {/*
            A propósito NO se deshabilita mientras se calcula. Kane puede tener
            al usuario esperando varios minutos a que acepte sus condiciones, y
            durante ese rato los resultados de EVO y Barrett ya están ahí. Que
            una calculadora que espera impida ver las que ya terminaron es justo
            lo contrario de lo que promete el producto.
          */}
          {hayAlguno && (
            <button onClick={onVerResultados} data-testid="ver-resultados">
              Ver los resultados que ya hay
            </button>
          )}
        </div>

        <p className="pie-nota">
          Marca o desmarca una calculadora antes de pulsar «Calcular» para elegir con cuáles
          quieres trabajar. Si una calculadora falla, las demás siguen. Los resultados que ya
          tengas no se pierden y puedes reintentar solo la que falló. No hace falta esperar a que
          terminen todas para verlos.
        </p>
      </div>
    </>
  )
}

function textoBoton(hayAlguno: boolean, elegidas: readonly Calculadora[]): string {
  if (elegidas.length === 0) return 'Elige al menos una calculadora'
  const nombres = elegidas.map((c) => fichaDe(c).nombre)
  const lista =
    elegidas.length === ORDEN.length
      ? 'todas'
      : elegidas.length === 1
        ? nombres[0]
        : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return hayAlguno ? `Volver a calcular en ${lista}` : `Calcular en ${lista}`
}
