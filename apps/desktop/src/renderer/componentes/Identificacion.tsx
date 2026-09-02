/**
 * Identificacion.tsx — Quién es el cirujano y quién el paciente.
 *
 * Va en su propio componente compartido, no repetido en cada pantalla, porque
 * las dos vías de entrada —cargar un documento o el cuestionario manual—
 * aterrizan en la misma revisión final (D42) y las dos necesitan poder
 * escribir estos dos datos: un documento cargado casi nunca los trae impresos.
 *
 * **Los dos viajan a EVO, Barrett y Kane** si su formulario los pide (D41,
 * D44) — ninguno de los dos sale en el PDF ni en el informe local. Antes de
 * D44 el nombre del paciente no se mandaba nunca; ahora sí, así que el aviso
 * en pantalla tiene que decirlo bien.
 *
 * Los dos son obligatorios para confirmar (02/09/2026, petición expresa del
 * dueño): las tres calculadoras piden un nombre en su formulario, y sin uno
 * de verdad se manda el código local del caso en su lugar — que funciona,
 * pero no es lo que se quiere de verdad en cada informe.
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { Caso } from '@vilamar/domain'

import { api } from '../api.js'

interface PropsCampo {
  readonly etiqueta: string
  readonly valorInicial: string
  readonly onGuardar: (valor: string) => Promise<unknown>
  readonly onCambio: () => Promise<void>
  readonly testId: string
}

function CampoIdentificacion({
  etiqueta,
  valorInicial,
  onGuardar,
  onCambio,
  testId,
}: PropsCampo): JSX.Element {
  const [valor, setValor] = useState(valorInicial)

  async function guardar(): Promise<void> {
    await onGuardar(valor.trim())
    await onCambio()
  }

  return (
    <div>
      <label>{etiqueta}</label>
      <input
        value={valor}
        aria-label={etiqueta}
        data-testid={testId}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void guardar()
        }}
      />
    </div>
  )
}

/** ¿Faltan el nombre del cirujano o el del paciente? Los dos son obligatorios. */
export function faltaIdentificacion(caso: Caso): boolean {
  return (caso.nombreCirujano ?? '').trim() === '' || (caso.nombrePaciente ?? '').trim() === ''
}

export function IdentificacionCaso({
  caso,
  onCambio,
}: {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  return (
    <div className="tarjeta tarjeta-destacada">
      <h2>Quién es</h2>
      <p className="sub">
        Ninguno de los dos sale en el PDF ni en el informe local, pero los dos son
        obligatorios: EVO, Barrett y Kane piden un nombre en su formulario, y las tres
        calculadoras lo reciben si su formulario lo pide.
      </p>
      <div className="fila">
        <CampoIdentificacion
          etiqueta="Nombre del doctor"
          valorInicial={caso.nombreCirujano ?? ''}
          onGuardar={(v) => api().establecerIdentificacion({ nombreCirujano: v })}
          onCambio={onCambio}
          testId="identificacion-cirujano"
        />
        <CampoIdentificacion
          etiqueta="Nombre del paciente"
          valorInicial={caso.nombrePaciente ?? ''}
          onGuardar={(v) => api().establecerIdentificacion({ nombrePaciente: v })}
          onCambio={onCambio}
          testId="identificacion-paciente"
        />
      </div>
    </div>
  )
}
