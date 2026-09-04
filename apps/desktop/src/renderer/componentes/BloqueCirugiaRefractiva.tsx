/**
 * BloqueCirugiaRefractiva.tsx — Si ESTE ojo ha tenido cirugía refractiva
 * antes, y de qué tipo.
 *
 * A diferencia del sexo (`BloqueSexo.tsx`), esto sí puede cambiar de un ojo a
 * otro: una persona puede haberse operado de miopía en uno y no en el otro.
 * Por eso vive dentro de la revisión de CADA ojo, no en una tarjeta aparte
 * para el caso entero.
 *
 * Solo lo pide EVO (su desplegable «Post LASIK/PRK/RK»), así que se dice para
 * quién hace falta en vez de un «obligatorio» que sería mentira para las otras
 * dos. Y no bloquea nada si no se aporta: «no se sabe» se trata igual que
 * «ninguna» — es la inmensa mayoría de los ojos.
 */

import type { JSX } from 'react'

import type { CirugiaRefractivaPrevia, Lateralidad } from '@vilamar/domain'
import { CIRUGIAS_REFRACTIVAS, FICHAS, ojoDe, TEXTO_CIRUGIA_REFRACTIVA } from '@vilamar/domain'
import type { Caso } from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly onCambio: () => Promise<void>
}

/** Quién lo pide de verdad, sacado de las fichas y no de una lista a mano. */
const QUIEN_LO_PIDE = Object.values(FICHAS)
  .filter((f) => f.clave === 'EVO_TORIC')
  .map((f) => f.nombre)

export function BloqueCirugiaRefractiva({ caso, ojoActivo, onCambio }: Props): JSX.Element {
  const dato = ojoDe(caso, ojoActivo).cirugiaRefractivaPrevia

  async function elegir(valor: CirugiaRefractivaPrevia): Promise<void> {
    await api().elegirCirugiaRefractiva(ojoActivo, valor)
    await onCambio()
  }

  return (
    <div className="tarjeta">
      <h2>Cirugía refractiva previa</h2>
      <p className="sub">
        Si este ojo se operó de miopía, hipermetropía o queratotomía radial ANTES de la cirugía de
        catarata. Es del ojo, no de la persona: puede ser distinto entre el derecho y el izquierdo.
      </p>

      <table className="revision">
        <tbody>
          <tr>
            <td className="campo">
              Cirugía refractiva
              <span className="exigencia opcional" data-testid="exigencia-cirugia-refractiva">
                {QUIEN_LO_PIDE.length === 0
                  ? 'No se envía a ninguna calculadora'
                  : `Solo lo usa ${QUIEN_LO_PIDE.join(' y ')}, si se aporta`}
              </span>
            </td>
            <td className="valor">
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                {CIRUGIAS_REFRACTIVAS.map((c) => (
                  <button
                    key={c}
                    className={dato?.valor === c ? 'principal' : ''}
                    data-testid={`cirugia-refractiva-${c.toLowerCase()}`}
                    onClick={() => void elegir(c)}
                  >
                    {TEXTO_CIRUGIA_REFRACTIVA[c]}
                  </button>
                ))}
              </div>
            </td>
            <td>
              {!dato ? (
                <span className="estado-campo vacio" data-testid="estado-cirugia-refractiva">
                  Ninguna (por defecto)
                </span>
              ) : (
                <span className="estado-campo valid" data-testid="estado-cirugia-refractiva">
                  ✓ {TEXTO_CIRUGIA_REFRACTIVA[dato.valor]}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
