/**
 * BloqueSexo.tsx — El sexo del paciente, que no es una medida de un ojo.
 *
 * Va en su propia tarjeta y no en la tabla de campos por lo que es: un dato de
 * la PERSONA. La tabla de arriba es del ojo que se está revisando, y meter aquí
 * algo que no cambia entre ojos habría hecho creer que sí cambia.
 *
 * Lo pide Kane. EVO no —comprobado abriendo su formulario: 36 campos, ninguno—
 * y Barrett tampoco, así que se dice **para quién** hace falta en vez de un
 * «obligatorio» a secas que sería mentira para dos de las tres.
 *
 * Y si se ha deducido del nombre, sale **sin confirmar y diciéndolo**. Un
 * nombre no determina el sexo, y el error de esa deducción no avisa: produce una
 * potencia de lente perfectamente creíble.
 */

import type { JSX } from 'react'

import type { Caso, Sexo } from '@vilamar/domain'
import {
  esDerivado,
  FICHAS,
  necesitaComprobacionHumana,
  origenDe,
  SEXOS,
  TEXTO_ORIGEN,
  TEXTO_SEXO,
} from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
}

/** Quién lo pide de verdad, sacado de las fichas y no de una lista a mano. */
const QUIEN_LO_PIDE = Object.values(FICHAS)
  .filter((f) => f.exigeSexo === true)
  .map((f) => f.nombre)

export function BloqueSexo({ caso, onCambio }: Props): JSX.Element {
  const sexo = caso.sexo
  const origen = origenDe(sexo)
  const porComprobar =
    sexo !== undefined && necesitaComprobacionHumana(sexo.procedencia) && !sexo.confirmadoPorUsuario

  async function elegir(valor: Sexo): Promise<void> {
    await api().elegirSexo(valor)
    await onCambio()
  }

  async function comprobar(): Promise<void> {
    await api().confirmarSexo()
    await onCambio()
  }

  return (
    <div className="tarjeta">
      <h2>Paciente</h2>
      <p className="sub">
        El sexo no es un dato del ojo: es de la persona, y es el mismo para los dos.
      </p>

      <table className="revision">
        <tbody>
          <tr className={porComprobar ? 'warning' : ''}>
            <td className="campo">
              Sexo
              <span className="exigencia segun_calculadora" data-testid="exigencia-sexo">
                {QUIEN_LO_PIDE.length === 0
                  ? 'No se envía a ninguna calculadora'
                  : `Obligatorio para ${QUIEN_LO_PIDE.join(' y ')}`}
              </span>
            </td>
            <td className="valor">
              <div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
                {SEXOS.map((s) => (
                  <button
                    key={s}
                    className={sexo?.valor === s ? 'principal' : ''}
                    data-testid={`sexo-${s.toLowerCase()}`}
                    onClick={() => void elegir(s)}
                  >
                    {TEXTO_SEXO[s]}
                  </button>
                ))}
              </div>
            </td>
            <td>
              <span className={`origen ${origen.toLowerCase()}`} data-testid="origen-sexo">
                {origen === 'NO_CONSTA' ? 'Pendiente de aportar' : TEXTO_ORIGEN[origen]}
              </span>
              {/*
                Una deducción enseña de dónde salió, no la palabra «deducido».
                «Deducido del nombre «maría»» se puede juzgar; «deducido» no.
              */}
              {sexo && esDerivado(sexo.procedencia) && sexo.procedencia.derivacion && (
                <div className="origen-original" data-testid="derivacion-sexo">
                  {sexo.procedencia.derivacion.explicacion}
                </div>
              )}
              {sexo?.original && (
                <div className="origen-original">
                  Antes decía: {TEXTO_SEXO[sexo.original.valor as Sexo]}
                </div>
              )}
            </td>
            <td>
              {!sexo ? (
                <span className="estado-campo vacio">—</span>
              ) : porComprobar ? (
                <span className="estado-campo warning">⚠ compruébalo</span>
              ) : origen === 'POR_DEFECTO' ? (
                <span className="estado-campo defecto">○ por defecto</span>
              ) : (
                <span className="estado-campo valid">✓ correcto</span>
              )}
            </td>
            <td>
              {porComprobar && (
                <button
                  className="principal"
                  title="He comprobado que este es el sexo del paciente"
                  data-testid="comprobar-sexo"
                  onClick={() => void comprobar()}
                >
                  Está bien
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {sexo?.procedencia.evidencia && (
        <p className="pie-nota">Leído de: «{sexo.procedencia.evidencia.texto}»</p>
      )}
      {porComprobar && (
        <p className="pie-nota">
          Esto lo ha deducido el programa, no lo dice el informe. Un nombre no siempre determina el
          sexo, y si se equivoca el resultado sale creíble igualmente:{' '}
          <strong>compruébalo antes de calcular</strong>.
        </p>
      )}
      {origen === 'POR_DEFECTO' && (
        <p className="pie-nota">
          No lo dice el informe ni se ha podido deducir del nombre: se ha puesto «Hombre» por
          defecto para no bloquear el cálculo si se olvida marcarlo — cámbialo si el paciente es
          mujer.
        </p>
      )}
    </div>
  )
}
