/**
 * AvisoFaltan.tsx — «No se puede calcular: faltan datos necesarios» (27/10/2026,
 * petición del dueño): en rojo y con el pulso de los datos que faltan, listando qué
 * falta del caso y de cada ojo y aparato. Lo usan el paso de revisión (que no deja
 * confirmar) y el de cálculo (que no lanza nada).
 */

import type { JSX, ReactNode } from 'react'

import { nombreLateralidad } from '@vilamar/domain'
import type { FaltanParaCalcular } from '@vilamar/domain'

interface Props {
  readonly faltan: FaltanParaCalcular
  readonly testId: string
  readonly children?: ReactNode
}

export function AvisoFaltan({ faltan, testId, children }: Props): JSX.Element {
  return (
    <div className="aviso error faltan-para-calcular" role="alert" data-testid={testId}>
      <strong>No se puede calcular: faltan datos necesarios.</strong>
      <ul>
        {faltan.generales.length > 0 && <li>Del caso: {faltan.generales.join(', ')}.</li>}
        {faltan.porAparato.map((a) => (
          <li key={`${a.ojo}-${a.aparato}`}>
            {nombreLateralidad(a.ojo)}
            {a.aparato !== 'Principal' ? `, aparato «${a.aparato}»` : ''}: {a.faltan.join(', ')}.
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}
