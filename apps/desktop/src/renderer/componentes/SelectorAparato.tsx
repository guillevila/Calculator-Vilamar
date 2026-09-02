/**
 * SelectorAparato.tsx — De qué biómetro son estos datos (D47, 27/08/2026).
 *
 * Compartido entre `FormularioManual.tsx` (datos escritos a mano) y
 * `PanelRevision.tsx` (datos leídos de un documento) — un caso cargado
 * desde una foto puede necesitar exactamente lo mismo que uno escrito a
 * mano: añadir un segundo biómetro, o decir con qué aparato se midió la
 * córnea posterior si fue distinto del general (02/09/2026, petición
 * expresa del dueño del proyecto: la pantalla de revisión no tenía forma
 * de añadir un segundo aparato, y el orden de los campos no coincidía con
 * el del formulario manual — las dos vías de entrada tienen que llevar a
 * la misma experiencia).
 */

import { useState } from 'react'
import type { JSX } from 'react'

import type { Caso, Lateralidad, SituacionCornealEspecial } from '@vilamar/domain'
import { aparatosDe, NOMBRE_DISPOSITIVO, ojoDe } from '@vilamar/domain'

import { api } from '../api.js'

/**
 * Los aparatos que ofrece el desplegable al añadir un biómetro nuevo (D47,
 * 27/08/2026) — los mismos que ya reconoce el programa al leer un documento
 * (`NOMBRE_DISPOSITIVO`), menos «Informe no reconocido», que no tiene
 * sentido elegir a mano. «Otro» se añade aparte, con texto libre.
 */
const APARATOS_CONOCIDOS = Object.entries(NOMBRE_DISPOSITIVO)
  .filter(([clave]) => clave !== 'DESCONOCIDO')
  .map(([, nombre]) => nombre)

/**
 * Con qué aparato/biómetro es este conjunto de datos (D47, 27/08/2026).
 *
 * Con un solo aparato —el caso de siempre— se puede elegir o escribir de
 * qué biómetro es, sin necesitar añadir un segundo (petición expresa del
 * dueño, 27/08/2026): el desplegable de «Principal» es el mismo que el de
 * añadir uno nuevo, solo que RENOMBRA el que ya hay en vez de crear otro
 * vacío al lado. En cuanto hay dos o más aparatos, se enseñan como
 * pestañas, igual que el selector de ojo de arriba.
 */
export function SelectorAparato({
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
export function SelectorAparatoCaraPosterior({
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

/** Las cuatro situaciones especiales, con su texto en pantalla (D67, 02/09/2026). */
const SITUACIONES_CORNEALES: readonly { readonly valor: SituacionCornealEspecial; readonly etiqueta: string }[] = [
  { valor: 'LASIK_MIOPE', etiqueta: 'LASIK/PRK miópico previo' },
  { valor: 'LASIK_HIPERMETROPE', etiqueta: 'LASIK/PRK hipermetrópico previo' },
  { valor: 'QUERATOTOMIA_RADIAL', etiqueta: 'Queratotomía radial previa' },
  { valor: 'QUERATOCONO', etiqueta: 'Queratocono' },
]

/**
 * Si este ojo tiene una córnea alterada por cirugía refractiva previa o
 * queratocono (D67, 02/09/2026, petición expresa del dueño del proyecto).
 *
 * Por defecto, «Ninguna»: la inmensa mayoría de los ojos no la necesitan, y
 * no cambia nada en pantalla ni en el cálculo para quien no la toca. En
 * cuanto se marca una, EVO y Kane la usan en su MISMO formulario (un campo
 * más, D67), y Barrett pasa a calcularse en Barrett True K Toric — una
 * calculadora aparte, no una casilla más a elegir — en vez de Barrett
 * Toric, que daría un resultado erróneo en un ojo así.
 */
export function SelectorSituacionCorneal({
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
  const actual = ojo.situacionCorneal

  async function elegir(valor: string): Promise<void> {
    const situacion = valor === '' ? undefined : (valor as SituacionCornealEspecial)
    await api().editarSituacionCorneal(lado, aparatoActivo, situacion)
    await onCambio()
  }

  return (
    <div className="fila" style={{ gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <span className="pie-nota" style={{ marginRight: 2 }}>
        Córnea especial:
      </span>
      <select
        value={actual ?? ''}
        onChange={(e) => void elegir(e.target.value)}
        data-testid="situacion-corneal-select"
      >
        <option value="">Ninguna (córnea normal)</option>
        {SITUACIONES_CORNEALES.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.etiqueta}
          </option>
        ))}
      </select>
      {actual !== undefined && (
        <span className="pie-nota" data-testid="situacion-corneal-aviso">
          Barrett se calculará con True K Toric en vez de Barrett Toric para este ojo.
        </span>
      )}
    </div>
  )
}
