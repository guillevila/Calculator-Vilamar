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

import { Fragment, useState } from 'react'
import type { JSX } from 'react'

import type { CampoBiometrico, Caso, Lateralidad } from '@vilamar/domain'
import { APARATO_PRINCIPAL, aparatosDe, definicionDe, nombreLateralidad, ojoDe } from '@vilamar/domain'

import { api } from '../api.js'
import { IdentificacionCaso } from './Identificacion.js'
import { SelectorAparato, SelectorAparatoCaraPosterior, SelectorSituacionCorneal } from './SelectorAparato.js'
import { SelectorLente } from './SelectorLente.js'

interface Props {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
  readonly onContinuar: () => void
}

/** Un grupo de campos, en el orden en que se pidieron. */
interface GrupoDeCampos {
  readonly numero: string
  readonly titulo: string
  readonly subtitulo: string
  /** Qué franja de color le toca — ver `.tarjeta-seccion` en estilos.css. */
  readonly clase: 'biometria' | 'lente' | 'posterior'
  /** «Obligatorios» en rojo, «Opcional» en ámbar, o nada. */
  readonly etiqueta?: { readonly texto: string; readonly clase: 'obligatorios' | 'opcional' }
  readonly campos: readonly (readonly [CampoBiometrico, CampoBiometrico | null])[]
}

/**
 * Los seis datos que EVO, Barrett y Kane piden siempre para poder calcular
 * algo — se destacan en rojo, con asterisco, en el rediseño del
 * 02/09/2026 (sobre una maqueta que trajo el dueño del proyecto). No
 * sustituye la exigencia real de cada campo —que depende de la
 * calculadora, y ya se explica en la pantalla de revisión—: es solo el
 * núcleo mínimo, destacado para que no se olvide al escribir a mano.
 */
const CAMPOS_DESTACADOS: readonly CampoBiometrico[] = ['AL', 'K1', 'K1_EJE', 'K2', 'K2_EJE', 'ACD']

const GRUPOS: readonly GrupoDeCampos[] = [
  {
    numero: '02',
    titulo: 'Biometría y queratometría',
    subtitulo: 'Parámetros principales del ojo',
    clase: 'biometria',
    etiqueta: { texto: '* Obligatorios', clase: 'obligatorios' },
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
    numero: '03',
    titulo: 'Lente e incisión',
    subtitulo: 'Constante de cálculo y decisiones quirúrgicas',
    clase: 'lente',
    campos: [
      ['CONSTANTE_A', null],
      ['SIA', null],
      ['EJE_INCISION', null],
    ],
  },
  {
    numero: '04',
    titulo: 'Mediciones de cara posterior',
    subtitulo: 'Información complementaria',
    clase: 'posterior',
    etiqueta: { texto: 'Opcional', clase: 'opcional' },
    campos: [
      ['PK1', 'PK1_EJE'],
      ['PK2', 'PK2_EJE'],
    ],
  },
]

export function FormularioManual({ caso, onCambio, onContinuar }: Props): JSX.Element {
  const [ladoActivo, setLadoActivo] = useState<Lateralidad>('OD')
  // El aparato activo es por ojo: cambiar de OD a OS no tiene por qué
  // conservar el mismo biómetro seleccionado en el otro.
  const [aparatoPorOjo, setAparatoPorOjo] = useState<Partial<Record<Lateralidad, string>>>({})
  const aparatoActivo = aparatoPorOjo[ladoActivo] ?? APARATO_PRINCIPAL

  async function continuar(): Promise<void> {
    // Red de seguridad de los valores por defecto (D38, ampliada): si el
    // doctor ha escrito algo de este dataset pero no ha tocado el target, el
    // SIA o su eje —que ya se le enseñan con un valor de partida—, se
    // guardan igualmente. Un valor manual ya sale confirmado sin más.
    // Recorre TODOS los aparatos de cada ojo (D47), no solo el activo: uno
    // que ya se rellenó y se dejó de mirar no puede quedarse sin el valor
    // de partida.
    for (const lado of ['OD', 'OS'] as const) {
      for (const aparato of aparatosDe(caso, lado)) {
        const ojo = ojoDe(caso, lado, aparato)
        if (Object.keys(ojo.medidas).length === 0) continue
        if (ojo.medidas.REFRACCION_OBJETIVO === undefined) {
          await api().editarMedida(lado, 'REFRACCION_OBJETIVO', 0, aparato)
        }
        if (ojo.medidas.SIA === undefined) await api().editarMedida(lado, 'SIA', 0.25, aparato)
        if (ojo.medidas.EJE_INCISION === undefined) {
          await api().editarMedida(lado, 'EJE_INCISION', 135, aparato)
        }
      }
    }
    onContinuar()
  }

  const ojoActivoDatos = ojoDe(caso, ladoActivo, aparatoActivo)
  const camposNucleo: readonly CampoBiometrico[] = [...CAMPOS_DESTACADOS, 'CONSTANTE_A']
  const hechos = camposNucleo.filter((c) => ojoActivoDatos.medidas[c] !== undefined).length
  const porcentaje = Math.round((hechos / camposNucleo.length) * 100)

  return (
    <>
      <div className="cabecera-bio">
        <div className="distintivo">
          <span className="insignia">BIO</span>
          <div>
            <h2>Formulario de biometría ocular</h2>
            <p>Registro de mediciones y lente intraocular</p>
          </div>
        </div>
        <div className="progreso">
          <span>{porcentaje}% completo — {nombreLateralidad(ladoActivo)}</span>
          <div className="progreso-barra">
            <div className="progreso-relleno" style={{ width: `${porcentaje}%` }} />
          </div>
        </div>
      </div>

      <IdentificacionCaso caso={caso} onCambio={onCambio} />

      <SelectorLente caso={caso} onCambio={onCambio} />

      <div className="tarjeta">
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
        <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
          Vista individual — los datos del otro ojo se quedan guardados tal cual, sin tocarlos.
        </p>

        <SelectorAparato
          caso={caso}
          lado={ladoActivo}
          aparatoActivo={aparatoActivo}
          onElegir={(aparato) => setAparatoPorOjo((previo) => ({ ...previo, [ladoActivo]: aparato }))}
          onCambio={onCambio}
        />
      </div>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className={`tarjeta-seccion ${grupo.clase}`}>
          <div className="seccion-cabecera">
            <span className="seccion-numero">{grupo.numero}</span>
            <div className="seccion-titulo">
              <h3>{grupo.titulo}</h3>
              <p>{grupo.subtitulo}</p>
            </div>
            {grupo.etiqueta && (
              <span className={`seccion-etiqueta ${grupo.etiqueta.clase}`}>{grupo.etiqueta.texto}</span>
            )}
          </div>
          {grupo.titulo === 'Mediciones de cara posterior' && (
            <>
              <p className="pie-nota" style={{ marginTop: -4, marginBottom: 8 }}>
                Por defecto es el mismo aparato de arriba. Cámbialo aquí SOLO si la córnea
                posterior se midió con otro instrumento — EVO y Barrett enseñan su propio
                desplegable «Biometer»/«Device» para esto, aparte del resto del formulario.
              </p>
              <SelectorAparatoCaraPosterior
                caso={caso}
                lado={ladoActivo}
                aparatoActivo={aparatoActivo}
                onCambio={onCambio}
              />
            </>
          )}
          {grupo.titulo === 'Lente e incisión' && (
            <SelectorSituacionCorneal
              caso={caso}
              lado={ladoActivo}
              aparatoActivo={aparatoActivo}
              onCambio={onCambio}
            />
          )}
          <div className="rejilla-manual">
            {grupo.campos.map(([campo, campoEje]) => (
              // El «borrador» de cada casilla es estado local del componente
              // (D47): sin `ojo`/`aparato` en la clave, React reutiliza la
              // MISMA instancia al cambiar de aparato y el texto del
              // biómetro anterior se queda pegado en pantalla, aunque el
              // dato de verdad ya sea de otro dataset vacío.
              <Fragment key={`${ladoActivo}-${aparatoActivo}-${campo}`}>
                <CampoManual
                  caso={caso}
                  ojo={ladoActivo}
                  aparato={aparatoActivo}
                  campo={campo}
                  destacado={CAMPOS_DESTACADOS.includes(campo)}
                  onCambio={onCambio}
                />
                {campoEje && (
                  <CampoManual
                    caso={caso}
                    ojo={ladoActivo}
                    aparato={aparatoActivo}
                    campo={campoEje}
                    destacado={CAMPOS_DESTACADOS.includes(campoEje)}
                    onCambio={onCambio}
                  />
                )}
              </Fragment>
            ))}
            {grupo.titulo === 'Lente e incisión' &&
              ojoDe(caso, ladoActivo, aparatoActivo).situacionCorneal !== undefined && (
                <>
                  <CampoManual
                    key={`${ladoActivo}-${aparatoActivo}-REFRACCION_PRE_LASIK`}
                    caso={caso}
                    ojo={ladoActivo}
                    aparato={aparatoActivo}
                    campo="REFRACCION_PRE_LASIK"
                    destacado={false}
                    onCambio={onCambio}
                  />
                  <CampoManual
                    key={`${ladoActivo}-${aparatoActivo}-REFRACCION_POST_LASIK`}
                    caso={caso}
                    ojo={ladoActivo}
                    aparato={aparatoActivo}
                    campo="REFRACCION_POST_LASIK"
                    destacado={false}
                    onCambio={onCambio}
                  />
                </>
              )}
          </div>
        </div>
      ))}

      <div className="tarjeta">
        <div className="fila derecha">
          <button className="principal grande" onClick={() => void continuar()} data-testid="manual-continuar">
            Continuar
          </button>
        </div>
        <p className="pie-nota">
          * Campo obligatorio. En la siguiente pantalla ves todo lo escrito, con el sexo del
          paciente si Kane lo necesita, y confirmas antes de calcular — igual que si vinieras de
          un documento.
        </p>
      </div>
    </>
  )
}

interface PropsCampoManual {
  readonly caso: Caso
  readonly ojo: Lateralidad
  /** De qué biómetro es este campo (D47). */
  readonly aparato: string
  readonly campo: CampoBiometrico
  /**
   * Si es uno de los seis datos que EVO, Barrett y Kane piden siempre
   * (rediseño 02/09/2026): fondo rojo, borde rojo y asterisco.
   */
  readonly destacado: boolean
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
function CampoManual({ caso, ojo, aparato, campo, destacado, onCambio }: PropsCampoManual): JSX.Element {
  const datosOjo = ojoDe(caso, ojo, aparato)
  const def = definicionDe(campo)
  const medida = datosOjo.medidas[campo]
  const porDefecto = VALOR_POR_DEFECTO[campo] ?? ''

  const [borrador, setBorrador] = useState<string | null>(null)
  const mostrado = borrador ?? (medida ? String(medida.valor) : porDefecto)

  async function guardar(texto: string): Promise<void> {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      await api().editarMedida(ojo, campo, null, aparato)
    } else {
      const n = Number(limpio)
      // Si no es un número, se deja el borrador tal cual para que se vea y se
      // corrija. No se convierte en 0 ni se descarta en silencio.
      if (!Number.isFinite(n)) return
      await api().editarMedida(ojo, campo, n, aparato)
    }
    setBorrador(null)
    await onCambio()
  }

  return (
    <div className={`campo-manual${destacado ? ' obligatorio' : ''}`}>
      <label>
        {def.etiqueta}
        {def.unidad !== 'ninguna' ? ` (${def.unidad})` : ''}
      </label>
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
    </div>
  )
}
