/**
 * PanelCalculo.tsx — Lo que pasa mientras se habla con las webs externas.
 *
 * El usuario ve, casilla por casilla, en qué punto va cada una. Cuando una
 * pide intervención, no sale un error: sale una instrucción concreta y la
 * fila se pone en ámbar, porque el navegador está abierto esperándole.
 *
 * Antes de calcular, dos cosas más para que la decisión sea informada: un
 * resumen de los parámetros que se han metido (comprobación visual rápida,
 * D48 28/08/2026) y el propio botón de cada una de las cinco casillas.
 *
 * «Volver a los datos» (D54, 01/09/2026) lleva de vuelta a la revisión con
 * el caso tal cual está — nada se borra ni se recalcula solo. Sirve para
 * corregir un dato antes de la primera vez que se calcula, y también para
 * cambiar uno o dos campos después de ya haber calculado, sin tener que
 * volver a escribir todo el formulario para recalcular.
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { CampoBiometrico, Calculadora, Caso, Lateralidad } from '@vilamar/domain'
import {
  aparatosDe,
  camposDeCategoria,
  COLUMNAS_COMPARATIVA,
  definicionDe,
  fichaDe,
  formatearConUnidad,
  nombreCortoLateralidad,
  ojoDe,
  ojosDelCaso,
  resultadoDe,
  textoEstado,
  valorDe,
} from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'

interface Props {
  readonly caso: Caso
  readonly ojo: Lateralidad
  readonly estados: readonly EstadoCalculo[]
  readonly ocupado: boolean
  readonly onCalcular: (
    calculadoras?: readonly Calculadora[],
    filtro?: { readonly ojo?: Lateralidad },
  ) => void
  readonly onCancelar: () => void
  readonly onVerResultados: () => void
  readonly onVolverARevisar: () => void
}

/** Con qué ojos calcular: los dos (de siempre) o solo uno (D66). */
type AlcanceOjos = 'AMBOS' | Lateralidad

// Las cinco casillas de siempre (D45/D48, 28/08/2026): EVO y Barrett, cada
// una con su Predicted y su Measured PCA por separado, y Kane — que se
// queda con una sola, porque su web no tiene ningún campo de córnea
// posterior (comprobado en vivo el 28/08/2026, `pnpm reconocer:kane`).
const ORDEN: readonly Calculadora[] = COLUMNAS_COMPARATIVA

const ETIQUETA: Partial<Record<Calculadora, string>> = {
  EVO_TORIC_SIN_CARA_POSTERIOR: 'EVO Toric — Predicted PCA',
  EVO_TORIC: 'EVO Toric — Measured PCA',
  BARRETT_TORIC: 'Barrett Toric — Predicted PCA',
  BARRETT_TORIC_CON_CARA_POSTERIOR: 'Barrett Toric — Measured PCA',
}

function etiquetaDe(c: Calculadora): string {
  return ETIQUETA[c] ?? fichaDe(c).nombre
}

// Por defecto se seleccionan las tres de siempre (Predicted de EVO y
// Barrett, más Kane) — no las cinco. Las dos «Measured PCA» son un cálculo
// extra contra una web ajena que solo tiene sentido cuando el aparato trajo
// de verdad la córnea posterior medida; pedirlas siempre por defecto
// doblaría el tráfico a EVO y Barrett sin necesidad en el caso más común.
const SELECCION_POR_DEFECTO: readonly Calculadora[] = [
  'EVO_TORIC_SIN_CARA_POSTERIOR',
  'BARRETT_TORIC',
  'KANE',
]

// Los parámetros que tiene sentido enseñar de un vistazo antes de calcular:
// lo que mide el aparato (biometría) y su córnea posterior, si la trae. Lo
// quirúrgico (objetivo, incisión) y lo de la lente van en otra pantalla —
// esto es solo para comprobar de un vistazo que AL, K1, K2, ejes, etc. se
// metieron bien, no para revisar todo el caso otra vez.
const CAMPOS_RESUMEN: readonly CampoBiometrico[] = [
  ...camposDeCategoria('BIOMETRIA'),
  ...camposDeCategoria('CORNEA_POSTERIOR'),
]

/**
 * Tabla de solo lectura con los datos ya metidos, un aparato por columna —
 * petición expresa del dueño del proyecto (28/08/2026): antes de lanzar el
 * cálculo, poder comprobar de un vistazo AL, K1, K2, ejes… sin tener que
 * volver a la pantalla de revisión. Con dos aparatos, ver sus columnas una
 * al lado de la otra es justo lo que hace saltar a la vista una discrepancia
 * — que además tiene su propia alarma explícita en la revisión (D47).
 *
 * Solo enseña los campos que de verdad tiene algún aparato: una fila de
 * guiones para cada dato que nadie metió sería ruido, no comprobación.
 */
function ResumenParametros({ caso, ojo }: { readonly caso: Caso; readonly ojo: Lateralidad }): JSX.Element | null {
  const datasets = aparatosDe(caso, ojo).map((aparato) => ({
    aparato,
    datos: ojoDe(caso, ojo, aparato),
  }))
  const campos = CAMPOS_RESUMEN.filter((campo) =>
    datasets.some(({ datos }) => valorDe(datos, campo) !== undefined),
  )
  if (datasets.length === 0 || campos.length === 0) return null

  return (
    <div className="tarjeta">
      <h2>Parámetros de {ojo === 'OD' ? 'OD' : 'OS'}, antes de calcular</h2>
      <p className="sub">Comprobación visual rápida — no es la pantalla de revisión.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="revision" data-testid="resumen-parametros">
          <thead>
            <tr>
              <th>Dato</th>
              {datasets.map(({ aparato }) => (
                <th key={aparato}>{aparato}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => (
              <tr key={campo}>
                <td className="campo">{definicionDe(campo).etiqueta}</td>
                {datasets.map(({ aparato, datos }) => {
                  const valor = valorDe(datos, campo)
                  return (
                    <td key={aparato}>
                      {valor === undefined ? '—' : formatearConUnidad(campo, valor)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function PanelCalculo({
  caso,
  ojo,
  estados,
  ocupado,
  onCalcular,
  onCancelar,
  onVerResultados,
  onVolverARevisar,
}: Props): JSX.Element {
  const hayAlguno = ORDEN.some((c) => resultadoDe(caso, c, ojo) !== undefined)
  const requiereUsuario = estados.filter((e) => e.requiereUsuario)

  const [seleccionadas, setSeleccionadas] =
    useState<readonly Calculadora[]>(SELECCION_POR_DEFECTO)

  // El selector de ojos solo se enseña si el caso tiene datos de los dos —
  // con uno solo, elegir sería ruido. «Los dos ojos» de partida: es el
  // comportamiento de siempre, nadie pierde nada por no tocarlo (D66).
  const dosOjos = ojosDelCaso(caso).length > 1
  const [alcanceOjos, setAlcanceOjos] = useState<AlcanceOjos>('AMBOS')
  const filtroOjos = alcanceOjos === 'AMBOS' ? undefined : { ojo: alcanceOjos }

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

      <ResumenParametros caso={caso} ojo={ojo} />

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
                <span className="nombre">{etiquetaDe(clave)}</span>
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
          Con cuáles calcular. Predicted PCA de EVO y Barrett, más Kane,
          marcadas por defecto; las «Measured PCA» se añaden a mano cuando
          el aparato trajo de verdad la córnea posterior medida.
        */}
        {!ocupado && (
          <>
            <div className="fila" style={{ gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
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
                  {etiquetaDe(clave)}
                </button>
              ))}
            </div>
            <p className="pie-nota" style={{ marginBottom: dosOjos ? 4 : 10 }}>
              «Measured PCA» solo cambia el resultado en los ojos donde el aparato trajo la córnea
              posterior medida (PK1/PK2). Sin ese dato calcula igual que «Predicted PCA» — no hace
              falta para el uso habitual.
            </p>
            {dosOjos && (
              <div className="fila" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="pie-nota" style={{ marginRight: 2 }}>
                  Ojos a calcular:
                </span>
                {(['AMBOS', 'OD', 'OS'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={alcanceOjos === a ? 'activo' : ''}
                    aria-pressed={alcanceOjos === a}
                    onClick={() => setAlcanceOjos(a)}
                    data-testid={`alcance-ojos-${a}`}
                  >
                    {a === 'AMBOS' ? 'Los dos ojos' : `Solo ${nombreCortoLateralidad(a)}`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="fila derecha">
          {ocupado && <button onClick={onCancelar}>Cancelar</button>}
          {!ocupado && (
            <button onClick={onVolverARevisar} data-testid="volver-a-revisar">
              Volver a los datos
            </button>
          )}
          {!ocupado && (
            <button
              className="principal"
              onClick={() => onCalcular(seleccionadas, filtroOjos)}
              disabled={seleccionadas.length === 0}
              data-testid="lanzar-calculo"
            >
              {`${hayAlguno ? 'Volver a calcular' : 'Calcular'} (${seleccionadas
                .map((c) => etiquetaDe(c))
                .join(', ')}${dosOjos && alcanceOjos !== 'AMBOS' ? ` — solo ${nombreCortoLateralidad(alcanceOjos)}` : ''})`}
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
