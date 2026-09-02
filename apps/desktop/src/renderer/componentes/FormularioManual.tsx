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
import {
  APARATO_PRINCIPAL,
  aparatosDe,
  definicionDe,
  NOMBRE_DISPOSITIVO,
  nombreLateralidad,
  ojoDe,
} from '@vilamar/domain'

import { api } from '../api.js'
import { IdentificacionCaso } from './Identificacion.js'
import { SelectorLente } from './SelectorLente.js'

/**
 * Los aparatos que ofrece el desplegable al añadir un biómetro nuevo (D47,
 * 27/08/2026) — los mismos que ya reconoce el programa al leer un documento
 * (`NOMBRE_DISPOSITIVO`), menos «Informe no reconocido», que no tiene
 * sentido elegir a mano. «Otro» se añade aparte, con texto libre.
 */
const APARATOS_CONOCIDOS = Object.entries(NOMBRE_DISPOSITIVO)
  .filter(([clave]) => clave !== 'DESCONOCIDO')
  .map(([, nombre]) => nombre)

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

  return (
    <>
      <IdentificacionCaso caso={caso} onCambio={onCambio} />

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

        <SelectorAparato
          caso={caso}
          lado={ladoActivo}
          aparatoActivo={aparatoActivo}
          onElegir={(aparato) => setAparatoPorOjo((previo) => ({ ...previo, [ladoActivo]: aparato }))}
          onCambio={onCambio}
        />

        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className={`grupo-manual ${grupo.clase}`}>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>{grupo.titulo}</h3>
            {grupo.titulo === 'Córnea posterior' && (
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
            <div className="rejilla-manual">
              {grupo.campos.map(([campo, campoEje]) => (
                <CampoManual
                  // El «borrador» de cada casilla es estado local del
                  // componente (D47): sin `ojo`/`aparato` en la clave, React
                  // reutiliza la MISMA instancia al cambiar de aparato y el
                  // texto del biómetro anterior se queda pegado en pantalla,
                  // aunque el dato de verdad ya sea de otro dataset vacío.
                  key={`${ladoActivo}-${aparatoActivo}-${campo}`}
                  caso={caso}
                  ojo={ladoActivo}
                  aparato={aparatoActivo}
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

/**
 * Con qué aparato/biómetro se está rellenando este ojo (D47, 27/08/2026).
 *
 * Con un solo aparato —el caso de siempre— se puede elegir o escribir de
 * qué biómetro es, sin necesitar añadir un segundo (petición expresa del
 * dueño, 27/08/2026): el desplegable de «Principal» es el mismo que el de
 * añadir uno nuevo, solo que RENOMBRA el que ya hay en vez de crear otro
 * vacío al lado. En cuanto hay dos o más aparatos, se enseñan como
 * pestañas, igual que el selector de ojo de arriba.
 */
function SelectorAparato({
  caso,
  lado,
  aparatoActivo,
  onElegir,
  onCambio,
}: {
  readonly caso: Caso
  readonly lado: Lateralidad
  readonly aparatoActivo: string
  readonly onElegir: (aparato: string) => void
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  const [anadiendo, setAnadiendo] = useState(false)
  const [elegido, setElegido] = useState(APARATOS_CONOCIDOS[0] ?? '')
  const [otro, setOtro] = useState('')
  const aparatos = aparatosDe(caso, lado)

  function confirmarNuevo(): void {
    const nombre = elegido === 'Otro' ? otro.trim() : elegido
    if (nombre === '') return
    onElegir(nombre)
    setAnadiendo(false)
    setOtro('')
  }

  async function renombrar(nombreNuevo: string): Promise<void> {
    const limpio = nombreNuevo.trim()
    if (limpio === '' || limpio === aparatoActivo) return
    await api().renombrarAparato(lado, aparatoActivo, limpio)
    onElegir(limpio)
    await onCambio()
  }

  return (
    <div className="fila" style={{ marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {aparatos.length > 1 && (
        <div className="selector-ojo">
          {aparatos.map((a) => (
            <button
              key={a}
              type="button"
              className={a === aparatoActivo ? 'activo' : ''}
              onClick={() => onElegir(a)}
              data-testid={`manual-aparato-${a}`}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      {aparatos.length <= 1 && (
        // `key={lado}` a propósito: el mismo fallo que ya costó un fallo real
        // esta noche (D47) — sin ella, React conserva el campo de texto
        // «Otro» del ojo anterior al cambiar de OD a OS.
        <SelectorAparatoPrincipal key={lado} aparatoActivo={aparatoActivo} onRenombrar={renombrar} />
      )}
      {!anadiendo && (
        <button type="button" onClick={() => setAnadiendo(true)} data-testid="manual-anadir-aparato">
          + Añadir otro biómetro
        </button>
      )}
      {anadiendo && (
        <div className="fila" style={{ gap: 6, alignItems: 'center' }}>
          <select
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            data-testid="manual-anadir-aparato-select"
          >
            {APARATOS_CONOCIDOS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="Otro">Otro…</option>
          </select>
          {elegido === 'Otro' && (
            <input
              value={otro}
              placeholder="Nombre del aparato"
              onChange={(e) => setOtro(e.target.value)}
              style={{ width: 160 }}
            />
          )}
          <button
            type="button"
            className="principal"
            onClick={confirmarNuevo}
            data-testid="manual-anadir-aparato-confirmar"
          >
            Añadir
          </button>
          <button type="button" onClick={() => setAnadiendo(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * El desplegable del ÚNICO aparato que hay hasta ahora — «Principal» por
 * defecto, editable desde el principio, sin esperar a que se añada un
 * segundo (petición expresa del dueño, 27/08/2026).
 *
 * Mismo desplegable que «Añadir otro biómetro» (aparatos conocidos + «Otro»
 * con texto libre), pero esto RENOMBRA el aparato que ya existe: no crea
 * un dataset nuevo al lado.
 */
function SelectorAparatoPrincipal({
  aparatoActivo,
  onRenombrar,
}: {
  readonly aparatoActivo: string
  readonly onRenombrar: (nombreNuevo: string) => Promise<void>
}): JSX.Element {
  // El modo «Otro» es estado de PANTALLA, separado de `aparatoActivo` (lo
  // ya guardado) — si se leyera directo de `aparatoActivo`, elegir «Otro…»
  // en el desplegable no tendría ningún efecto que enseñar (nada cambia
  // hasta que se escribe y se confirma un nombre) y el `<select>` volvería
  // a saltar solo al valor anterior en el siguiente render.
  const [modoOtro, setModoOtro] = useState(() => !APARATOS_CONOCIDOS.includes(aparatoActivo))
  const [otro, setOtro] = useState(() => (APARATOS_CONOCIDOS.includes(aparatoActivo) ? '' : aparatoActivo))

  return (
    <div className="fila" style={{ gap: 6, alignItems: 'center' }}>
      <span className="pie-nota" style={{ marginRight: 2 }}>
        Aparato:
      </span>
      <select
        value={modoOtro ? 'Otro' : aparatoActivo}
        onChange={(e) => {
          if (e.target.value === 'Otro') {
            setModoOtro(true)
            setOtro('')
            return
          }
          setModoOtro(false)
          void onRenombrar(e.target.value)
        }}
        data-testid="manual-aparato-principal-select"
      >
        {APARATOS_CONOCIDOS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="Otro">Otro…</option>
      </select>
      {modoOtro && (
        <input
          value={otro}
          placeholder="Nombre del aparato"
          onChange={(e) => setOtro(e.target.value)}
          onBlur={() => void onRenombrar(otro)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onRenombrar(otro)
          }}
          style={{ width: 180 }}
          data-testid="manual-aparato-principal-nombre"
        />
      )}
    </div>
  )
}

/**
 * El aparato que midió la córnea posterior, cuando es DISTINTO del aparato
 * general de arriba (02/09/2026, corrige D58).
 *
 * Es un campo aparte, no el mismo `SelectorAparato` de arriba: EVO y Barrett
 * enseñan un desplegable propio para esto, separado del resto del
 * formulario, precisamente porque a veces la córnea posterior se mide con
 * otro instrumento que el resto de la biometría. Por defecto no hay
 * elección propia —«Igual que arriba»— y `dispositivoCaraPosteriorPara()`
 * usa el aparato general, como si este campo no existiera.
 */
function SelectorAparatoCaraPosterior({
  caso,
  lado,
  aparatoActivo,
  onCambio,
}: {
  readonly caso: Caso
  readonly lado: Lateralidad
  readonly aparatoActivo: string
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  const ojo = ojoDe(caso, lado, aparatoActivo)
  const actual = ojo.aparatoCaraPosterior
  const [modoOtro, setModoOtro] = useState(
    () => actual !== undefined && !APARATOS_CONOCIDOS.includes(actual),
  )
  const [otro, setOtro] = useState(() =>
    actual !== undefined && !APARATOS_CONOCIDOS.includes(actual) ? actual : '',
  )

  async function elegir(aparatoCaraPosterior: string | undefined): Promise<void> {
    await api().editarAparatoCaraPosterior(lado, aparatoActivo, aparatoCaraPosterior)
    await onCambio()
  }

  return (
    <div className="fila" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
      <span className="pie-nota" style={{ marginRight: 2 }}>
        Aparato de la córnea posterior:
      </span>
      <select
        value={modoOtro ? 'Otro' : (actual ?? 'IGUAL')}
        onChange={(e) => {
          if (e.target.value === 'IGUAL') {
            setModoOtro(false)
            void elegir(undefined)
            return
          }
          if (e.target.value === 'Otro') {
            setModoOtro(true)
            setOtro('')
            return
          }
          setModoOtro(false)
          void elegir(e.target.value)
        }}
        data-testid="manual-aparato-cara-posterior-select"
      >
        <option value="IGUAL">Igual que arriba ({aparatoActivo})</option>
        {APARATOS_CONOCIDOS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="Otro">Otro…</option>
      </select>
      {modoOtro && (
        <input
          value={otro}
          placeholder="Nombre del aparato"
          onChange={(e) => setOtro(e.target.value)}
          onBlur={() => void elegir(otro.trim() === '' ? undefined : otro)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void elegir(otro.trim() === '' ? undefined : otro)
          }}
          style={{ width: 180 }}
          data-testid="manual-aparato-cara-posterior-nombre"
        />
      )}
    </div>
  )
}

interface PropsCampoManual {
  readonly caso: Caso
  readonly ojo: Lateralidad
  /** De qué biómetro es este campo (D47). */
  readonly aparato: string
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
function CampoManual({ caso, ojo, aparato, campo, campoEje, onCambio }: PropsCampoManual): JSX.Element {
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
        {campoEje && (
          <CampoEje caso={caso} ojo={ojo} aparato={aparato} campo={campoEje} onCambio={onCambio} />
        )}
      </div>
    </div>
  )
}

/** El eje que acompaña a una K: mismo mecanismo, sin valor por defecto. */
function CampoEje({
  caso,
  ojo,
  aparato,
  campo,
  onCambio,
}: {
  readonly caso: Caso
  readonly ojo: Lateralidad
  readonly aparato: string
  readonly campo: CampoBiometrico
  readonly onCambio: () => Promise<void>
}): JSX.Element {
  const datosOjo = ojoDe(caso, ojo, aparato)
  const medida = datosOjo.medidas[campo]
  const [borrador, setBorrador] = useState<string | null>(null)
  const mostrado = borrador ?? (medida ? String(medida.valor) : '')

  async function guardar(texto: string): Promise<void> {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      await api().editarMedida(ojo, campo, null, aparato)
    } else {
      const n = Number(limpio)
      if (!Number.isFinite(n)) return
      await api().editarMedida(ojo, campo, n, aparato)
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
