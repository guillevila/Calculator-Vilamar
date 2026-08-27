/**
 * PanelCalculo.tsx — Lo que pasa mientras se habla con las tres webs.
 *
 * El usuario ve, calculadora por calculadora, en qué punto va cada una. Cuando
 * una pide intervención, no sale un error: sale una instrucción concreta y la
 * fila se pone en ámbar, porque el navegador está abierto esperándole.
 */

import { useState } from 'react'
import type { JSX } from 'react'

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

  // Con cuáles calcular. Las tres por defecto; si hay prisa, se puede lanzar
  // solo una o dos, sin esperar a las demás.
  const [seleccionadas, setSeleccionadas] = useState<readonly Calculadora[]>(ORDEN)

  function alternar(clave: Calculadora): void {
    setSeleccionadas((previas) =>
      previas.includes(clave) ? previas.filter((c) => c !== clave) : [...previas, clave],
    )
  }

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

        {/*
          Con cuáles calcular. Las tres marcadas por defecto — si hay prisa,
          se desmarcan las que no hacen falta y el botón lanza solo esas.
        */}
        {!ocupado && (
          <div className="fila" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className="pie-nota" style={{ marginRight: 2 }}>
              Calcular con:
            </span>
            {ORDEN.map((clave) => (
              <button
                key={clave}
                type="button"
                className={seleccionadas.includes(clave) ? 'activo' : ''}
                aria-pressed={seleccionadas.includes(clave)}
                onClick={() => alternar(clave)}
                data-testid={`seleccion-${clave}`}
              >
                {fichaDe(clave).nombre}
              </button>
            ))}
          </div>
        )}

        <div className="fila derecha">
          {ocupado && <button onClick={onCancelar}>Cancelar</button>}
          {!ocupado && (
            <button
              className="principal"
              onClick={() => onCalcular(seleccionadas)}
              disabled={seleccionadas.length === 0}
              data-testid="lanzar-calculo"
            >
              {seleccionadas.length === ORDEN.length
                ? hayAlguno
                  ? 'Volver a calcular todas'
                  : 'Calcular en las tres'
                : `${hayAlguno ? 'Volver a calcular' : 'Calcular'} (${seleccionadas
                    .map((c) => fichaDe(c).nombre)
                    .join(', ')})`}
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

        {seleccionadas.length === 0 && !ocupado && (
          <p className="pie-nota">Elige al menos una calculadora para poder calcular.</p>
        )}

        <p className="pie-nota">
          Si una calculadora falla, las demás siguen. Los resultados que ya tengas no se pierden y
          puedes reintentar solo la que falló. No hace falta esperar a que terminen todas para
          verlos.
        </p>
      </div>
    </>
  )
}
