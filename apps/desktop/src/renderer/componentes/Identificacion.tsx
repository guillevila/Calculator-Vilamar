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
 *
 * **El desplegable de doctor guardado** (D80, 15/09/2026) vive aquí también:
 * junto al nombre del cirujano, porque es el mismo dato — solo que, al
 * elegir uno de la agenda en vez de escribirlo, de paso rellena su SIA y su
 * eje de incisión si ese doctor los tiene guardados (`aplicarDoctor`). La
 * agenda en sí —añadir, editar, borrar un doctor— vive en su propia
 * pantalla («Doctores», `DoctoresScreen.tsx`): aquí solo se elige.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import { aparatosDe, nombreLateralidad, ojoDe, ojosDelCaso, valorDe } from '@vilamar/domain'
import type { Caso, Doctor, Lateralidad } from '@vilamar/domain'

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

  // Se resincroniza cuando el valor cambia desde FUERA de esta casilla —
  // por ejemplo, al elegir un doctor guardado en el desplegable de al lado
  // (D80), que escribe `nombreCirujano` sin pasar por aquí. Sin esto, la
  // casilla se quedaba enseñando el nombre viejo hasta que alguien la
  // tocara a mano, aunque el caso ya tuviera el nuevo.
  useEffect(() => {
    setValor(valorInicial)
  }, [valorInicial])

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

/**
 * Desplegable con los doctores ya guardados (D80). Elegir uno pone su
 * nombre en el caso y, si tiene SIA/eje guardados, también los aplica
 * (`aplicarDoctor`, en el proceso principal). No sustituye a la casilla de
 * texto: sigue pudiéndose escribir un nombre suelto, de alguien que no está
 * en la agenda — este desplegable es solo un atajo.
 */
function SelectorDoctorGuardado({
  onElegido,
}: {
  readonly onElegido: () => Promise<void>
}): JSX.Element | null {
  const [doctores, setDoctores] = useState<readonly Doctor[] | null>(null)

  useEffect(() => {
    void api()
      .listarDoctores()
      .then(setDoctores)
      .catch(() => setDoctores([]))
  }, [])

  if (doctores === null || doctores.length === 0) return null

  return (
    <div>
      <label htmlFor="identificacion-doctor-guardado">Doctor guardado</label>
      <select
        id="identificacion-doctor-guardado"
        value=""
        data-testid="identificacion-doctor-guardado"
        onChange={(e) => {
          const id = e.target.value
          if (id === '') return
          void api().aplicarDoctor(id).then(onElegido)
        }}
      >
        <option value="">— Elegir de la agenda —</option>
        {doctores.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * La SIA (potencia) y el eje de la incisión de UN ojo, junto al nombre del doctor
 * (petición del dueño, 30/10/2026). Enseña lo que el caso ya tiene grabado; al
 * cambiarlo se cambia en TODOS los aparatos de ese ojo a la vez, para no tener que
 * corregirlo en cada uno. Si los aparatos no coinciden entre sí, la casilla sale
 * vacía con «varios» hasta que se escriba un valor.
 */
function SiaDelOjo({
  caso,
  lado,
  onCambio,
}: {
  readonly caso: Caso
  readonly lado: Lateralidad
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  const aparatos = aparatosDe(caso, lado)
  const comun = (campo: 'SIA' | 'EJE_INCISION'): string => {
    const valores = new Set(aparatos.map((a) => valorDe(ojoDe(caso, lado, a), campo)))
    if (valores.size !== 1) return ''
    const v = [...valores][0]
    return v === undefined ? '' : String(v)
  }
  const hayVarios = (campo: 'SIA' | 'EJE_INCISION'): boolean =>
    new Set(aparatos.map((a) => valorDe(ojoDe(caso, lado, a), campo))).size > 1

  const [sia, setSia] = useState(comun('SIA'))
  const [eje, setEje] = useState(comun('EJE_INCISION'))
  const siaGuardada = comun('SIA')
  const ejeGuardado = comun('EJE_INCISION')
  useEffect(() => setSia(siaGuardada), [siaGuardada])
  useEffect(() => setEje(ejeGuardado), [ejeGuardado])

  async function guardar(campo: 'SIA' | 'EJE_INCISION', texto: string): Promise<void> {
    const valor = Number(texto.replace(',', '.'))
    const actual = campo === 'SIA' ? siaGuardada : ejeGuardado
    // Vacío o ilegible: no se inventa nada, se vuelve a lo que había.
    if (texto.trim() === '' || !Number.isFinite(valor)) {
      if (campo === 'SIA') setSia(actual)
      else setEje(actual)
      return
    }
    if (String(valor) === actual) return
    for (const aparato of aparatos) {
      await api().editarMedida(lado, campo, valor, aparato)
    }
    await onCambio()
  }

  const clave = lado.toLowerCase()
  return (
    <div>
      <label>SIA · {nombreLateralidad(lado)}</label>
      <div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input
          value={sia}
          inputMode="decimal"
          style={{ width: 78 }}
          placeholder={hayVarios('SIA') ? 'varios' : 'D'}
          aria-label={`SIA ${lado}`}
          title="Potencia de la SIA (D). Al cambiarla se cambia en todos los aparatos de este ojo."
          data-testid={`identificacion-sia-${clave}`}
          onChange={(e) => setSia(e.target.value)}
          onBlur={() => void guardar('SIA', sia)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void guardar('SIA', sia)
          }}
        />
        <input
          value={eje}
          inputMode="decimal"
          style={{ width: 78 }}
          placeholder={hayVarios('EJE_INCISION') ? 'varios' : '°'}
          aria-label={`Eje de la incisión ${lado}`}
          title="Eje de la incisión (°). Al cambiarlo se cambia en todos los aparatos de este ojo."
          data-testid={`identificacion-eje-incision-${clave}`}
          onChange={(e) => setEje(e.target.value)}
          onBlur={() => void guardar('EJE_INCISION', eje)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void guardar('EJE_INCISION', eje)
          }}
        />
      </div>
    </div>
  )
}

export function IdentificacionCaso({
  caso,
  onCambio,
}: {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  return (
    <div className="tarjeta-seccion identificacion">
      <div className="seccion-cabecera">
        <span className="seccion-numero">01</span>
        <div className="seccion-titulo">
          <h3>Identificación</h3>
          <p>Datos generales del estudio</p>
        </div>
      </div>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        Ninguno de los dos sale en el PDF ni en el informe local, pero los dos son obligatorios:
        EVO, Barrett y Kane piden un nombre en su formulario, y las tres calculadoras lo reciben si
        su formulario lo pide.
      </p>
      <div className="fila">
        <CampoIdentificacion
          etiqueta="Nombre del doctor"
          valorInicial={caso.nombreCirujano ?? ''}
          onGuardar={(v) => api().establecerIdentificacion({ nombreCirujano: v })}
          onCambio={onCambio}
          testId="identificacion-cirujano"
        />
        <SelectorDoctorGuardado onElegido={onCambio} />
        {ojosDelCaso(caso).map((lado) => (
          <SiaDelOjo key={lado} caso={caso} lado={lado} onCambio={onCambio} />
        ))}
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
