/**
 * FormularioManual.tsx — El cuestionario simplificado, para cuando no hay documento.
 *
 * La pantalla de revisión (`PanelRevision.tsx`) enseña Origen/Estado/Evidencia
 * porque tiene que dejar comprobar lo que ha leído un documento. Aquí no hay
 * nada que revisar de ese tipo — todo lo escribe el cirujano mirando— así que
 * el formulario es solo etiqueta + casilla, con los campos que de verdad usan
 * las tres calculadoras. Nada más.
 *
 * Al pulsar «Continuar» se aterriza en la MISMA `PanelRevision` de siempre:
 * el sexo (que pide Kane) y el resto de la confirmación ya viven ahí, y no
 * hace falta duplicarlos.
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { CampoBiometrico, Caso, Lateralidad } from '@vilamar/domain'
import { definicionDe, nombreLateralidad, ojoDe } from '@vilamar/domain'

import { api } from '../api.js'
import { SelectorLente } from './SelectorLente.js'

interface Props {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
  readonly onContinuar: () => void
}

/** Un grupo de campos, en el orden en que se pidieron. */
interface GrupoDeCampos {
  readonly titulo: string
  /** Qué azul le toca — ver `.grupo-manual` en estilos.css. */
  readonly clase: 'biometria' | 'lente' | 'cornea'
  readonly campos: readonly (readonly [CampoBiometrico, CampoBiometrico | null])[]
}

const GRUPOS: readonly GrupoDeCampos[] = [
  {
    titulo: 'Biometría',
    clase: 'biometria',
    campos: [
      ['AL', null],
      ['K1', 'K1_EJE'],
      ['K2', 'K2_EJE'],
      ['ACD', null],
      ['LT', null],
      ['CCT', null],
      ['WTW', null],
      ['REFRACCION_OBJETIVO', null],
    ],
  },
  {
    titulo: 'Lente e incisión',
    clase: 'lente',
    campos: [
      ['CONSTANTE_A', null],
      ['SIA', null],
      ['EJE_INCISION', null],
    ],
  },
  {
    titulo: 'Córnea posterior',
    clase: 'cornea',
    campos: [
      ['PK1', 'PK1_EJE'],
      ['PK2', 'PK2_EJE'],
    ],
  },
]

export function FormularioManual({ caso, onCambio, onContinuar }: Props): JSX.Element {
  const [ladoActivo, setLadoActivo] = useState<Lateralidad>('OD')

  async function continuar(): Promise<void> {
    // Red de seguridad de los valores por defecto (D38, ampliada): si el
    // doctor ha escrito algo de este ojo pero no ha tocado el target, el
    // SIA o su eje —que ya se le enseñan con un valor de partida—, se
    // guardan igualmente. Un valor manual ya sale confirmado sin más.
    for (const lado of ['OD', 'OS'] as const) {
      const ojo = ojoDe(caso, lado)
      if (Object.keys(ojo.medidas).length === 0) continue
      if (ojo.medidas.REFRACCION_OBJETIVO === undefined) {
        await api().editarMedida(lado, 'REFRACCION_OBJETIVO', 0)
      }
      if (ojo.medidas.SIA === undefined) await api().editarMedida(lado, 'SIA', 0.25)
      if (ojo.medidas.EJE_INCISION === undefined) await api().editarMedida(lado, 'EJE_INCISION', 135)
    }
    onContinuar()
  }

  return (
    <>
      <div className="tarjeta tarjeta-destacada">
        <h2>Quién es</h2>
        <p className="sub">
          Ninguno de los dos sale en el PDF. El del cirujano sí se manda a EVO, Barrett y Kane si
          su formulario lo pide; el del paciente no se manda nunca a ningún sitio.
        </p>
        <div className="fila">
          <CampoTexto
            etiqueta="Nombre del doctor"
            valorInicial={caso.nombreCirujano ?? ''}
            onGuardar={(v) => api().establecerIdentificacion({ nombreCirujano: v })}
            onCambio={onCambio}
          />
          <CampoTexto
            etiqueta="Nombre del paciente"
            valorInicial={caso.nombrePaciente ?? ''}
            onGuardar={(v) => api().establecerIdentificacion({ nombrePaciente: v })}
            onCambio={onCambio}
          />
        </div>
      </div>

      <SelectorLente caso={caso} onCambio={onCambio} />

      <div className="tarjeta">
        <h2>Datos del ojo</h2>
        <div className="fila" style={{ marginBottom: 14, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--azul)' }}>Editando:</span>
          <div className="selector-ojo grande">
            {(['OD', 'OS'] as const).map((l) => (
              <button
                key={l}
                className={l === ladoActivo ? 'activo' : ''}
                onClick={() => setLadoActivo(l)}
                data-testid={`manual-ojo-${l}`}
              >
                {nombreLateralidad(l)}
              </button>
            ))}
          </div>
        </div>

        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className={`grupo-manual ${grupo.clase}`}>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>{grupo.titulo}</h3>
            <div className="rejilla-manual">
              {grupo.campos.map(([campo, campoEje]) => (
                <CampoManual
                  key={campo}
                  caso={caso}
                  ojo={ladoActivo}
                  campo={campo}
                  campoEje={campoEje}
                  onCambio={onCambio}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <div className="fila derecha">
          <button className="principal grande" onClick={() => void continuar()} data-testid="manual-continuar">
            Continuar
          </button>
        </div>
        <p className="pie-nota">
          En la siguiente pantalla ves todo lo escrito, con el sexo del paciente si Kane lo
          necesita, y confirmas antes de calcular — igual que si vinieras de un documento.
        </p>
      </div>
    </>
  )
}

interface PropsCampoTexto {
  readonly etiqueta: string
  readonly valorInicial: string
  readonly onGuardar: (valor: string) => Promise<Caso>
  readonly onCambio: () => Promise<void>
}

function CampoTexto({ etiqueta, valorInicial, onGuardar, onCambio }: PropsCampoTexto): JSX.Element {
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
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void guardar()
        }}
      />
    </div>
  )
}

interface PropsCampoManual {
  readonly caso: Caso
  readonly ojo: Lateralidad
  readonly campo: CampoBiometrico
  /** Si este campo lleva un eje asociado, se pinta al lado. */
  readonly campoEje: CampoBiometrico | null
  readonly onCambio: () => Promise<void>
}

/** El valor de partida de un campo, cuando todavía no hay medida — ver D38. */
const VALOR_POR_DEFECTO: Partial<Record<CampoBiometrico, string>> = {
  REFRACCION_OBJETIVO: '0',
  SIA: '0.25',
  EJE_INCISION: '135',
}

/**
 * Una casilla del cuestionario: etiqueta + número, sin origen ni estado.
 *
 * El objetivo de refracción, el SIA y su eje de incisión son los únicos que
 * muestran un valor de partida en vez de vacío cuando todavía no hay
 * medida — el resto de campos ausentes se enseñan vacíos, como en
 * cualquier otro sitio del programa: un hueco no se rellena solo (D3),
 * salvo estas excepciones ya decididas (D38).
 */
function CampoManual({ caso, ojo, campo, campoEje, onCambio }: PropsCampoManual): JSX.Element {
  const datosOjo = ojoDe(caso, ojo)
  const def = definicionDe(campo)
  const medida = datosOjo.medidas[campo]
  const porDefecto = VALOR_POR_DEFECTO[campo] ?? ''

  const [borrador, setBorrador] = useState<string | null>(null)
  const mostrado = borrador ?? (medida ? String(medida.valor) : porDefecto)

  async function guardar(texto: string): Promise<void> {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      await api().editarMedida(ojo, campo, null)
    } else {
      const n = Number(limpio)
      // Si no es un número, se deja el borrador tal cual para que se vea y se
      // corrija. No se convierte en 0 ni se descarta en silencio.
      if (!Number.isFinite(n)) return
      await api().editarMedida(ojo, campo, n)
    }
    setBorrador(null)
    await onCambio()
  }

  return (
    <div className="campo-manual">
      <label>
        {def.etiqueta}
        {def.unidad !== 'ninguna' ? ` (${def.unidad})` : ''}
      </label>
      <div className="fila" style={{ gap: 6 }}>
        <input
          value={mostrado}
          inputMode="decimal"
          aria-label={def.etiqueta}
          data-testid={`manual-campo-${campo}`}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={(e) => void guardar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void guardar((e.target as HTMLInputElement).value)
          }}
        />
        {campoEje && <CampoEje caso={caso} ojo={ojo} campo={campoEje} onCambio={onCambio} />}
      </div>
    </div>
  )
}

/** El eje que acompaña a una K: mismo mecanismo, sin valor por defecto. */
function CampoEje({
  caso,
  ojo,
  campo,
  onCambio,
}: {
  readonly caso: Caso
  readonly ojo: Lateralidad
  readonly campo: CampoBiometrico
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  const datosOjo = ojoDe(caso, ojo)
  const medida = datosOjo.medidas[campo]
  const [borrador, setBorrador] = useState<string | null>(null)
  const mostrado = borrador ?? (medida ? String(medida.valor) : '')

  async function guardar(texto: string): Promise<void> {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      await api().editarMedida(ojo, campo, null)
    } else {
      const n = Number(limpio)
      if (!Number.isFinite(n)) return
      await api().editarMedida(ojo, campo, n)
    }
    setBorrador(null)
    await onCambio()
  }

  return (
    <input
      value={mostrado}
      inputMode="decimal"
      placeholder="eje °"
      aria-label={definicionDe(campo).etiqueta}
      data-testid={`manual-campo-${campo}`}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={(e) => void guardar(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void guardar((e.target as HTMLInputElement).value)
      }}
    />
  )
}
