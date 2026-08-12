/**
 * SelectorLente.tsx — Elegir la lente, y con ella su constante.
 *
 * Durante un tiempo esta pantalla decía «el modelo de lente no sale del informe
 * de biometría». **Era falso para algunos aparatos.** Un ANTERION imprime una
 * lista de modelos y, bajo cada uno, la constante que usa cada fórmula. Mientras
 * no se leía, la constante A salía como «Pendiente de aportar» teniéndola el
 * informe delante.
 *
 * La regla que gobierna esta pantalla:
 *
 *   **La constante A pertenece al MODELO, no al informe.** Cuatro lentes en el
 *   papel son cuatro constantes posibles y ninguna es la del caso hasta que se
 *   elige una.
 *
 * Por eso los modelos del informe se enseñan **con su constante al lado y sin
 * ninguno preseleccionado**. Marcar el primero por comodidad sería elegir por el
 * cirujano la lente que se va a implantar.
 */

import type { JSX } from 'react'
import { useState } from 'react'

import type { Caso } from '@vilamar/domain'
import { claveLente } from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly onCambio: () => Promise<void>
}

/**
 * Modelos que EVO y Barrett tienen en común en sus desplegables.
 *
 * No es un catálogo clínico: es la intersección de lo que ofrecen esas dos
 * webs, comprobada al leer sus formularios. Añadir uno aquí solo tiene sentido
 * si aparece con ese nombre exacto en alguna de ellas.
 *
 * **Estos NO traen constante.** La constante sale del informe o la escribes tú.
 */
const MODELOS: readonly { fabricante: string; modelo: string }[] = [
  { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon SA6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon Vivity' },
  { fabricante: 'Alcon', modelo: 'Alcon Panoptix' },
  { fabricante: 'Johnson & Johnson', modelo: 'Tecnis' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60T' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60ET/PT' },
  { fabricante: 'Rayner', modelo: 'Rayner EMV' },
  { fabricante: 'ZEISS', modelo: 'Zeiss 709M/MP' },
]

export function SelectorLente({ caso, onCambio }: Props): JSX.Element {
  const [otro, setOtro] = useState(false)
  const [modeloLibre, setModeloLibre] = useState(caso.lente?.modelo ?? '')
  const [fabricanteLibre, setFabricanteLibre] = useState(caso.lente?.fabricante ?? '')
  /**
   * Lo que hubo que explicar en la última elección.
   *
   * Vive aquí y no en el caso a propósito: describe la ACCIÓN («esa lente no está
   * en el informe»), no el estado. Guardado en el caso seguiría ahí después de
   * dejar de ser verdad.
   */
  const [avisos, setAvisos] = useState<readonly string[]>([])

  const delInforme = caso.lentesDelInforme ?? []
  const actual = caso.lente?.modelo ?? ''
  const claveActual =
    actual === '' ? '' : claveLente({ fabricante: caso.lente?.fabricante, modelo: actual })
  const enLista = MODELOS.some((m) => m.modelo === actual)
  const enElInforme = delInforme.some((l) => claveLente(l) === claveActual)

  async function elegir(fabricante: string, modelo: string): Promise<void> {
    const r = await api().elegirLente(fabricante, modelo)
    setAvisos(r?.avisos ?? [])
    await onCambio()
  }

  async function elegirDelDesplegable(modelo: string): Promise<void> {
    if (modelo === '__otro__') {
      setOtro(true)
      return
    }
    setOtro(false)
    const encontrado = MODELOS.find((m) => m.modelo === modelo)
    await elegir(encontrado?.fabricante ?? '', modelo)
  }

  async function guardarLibre(): Promise<void> {
    if (modeloLibre.trim() === '') return
    await elegir(fabricanteLibre.trim(), modeloLibre.trim())
  }

  return (
    <div className="tarjeta">
      <h2>Lente</h2>

      {delInforme.length > 0 ? (
        <>
          <p className="sub">
            Este informe propone {delInforme.length}{' '}
            {delInforme.length === 1 ? 'modelo' : 'modelos'} con su constante A. Elige el que vayas
            a implantar: <strong>la constante depende de cuál sea</strong>.
          </p>
          <ul className="lentes-informe" data-testid="lentes-del-informe">
            {delInforme.map((l) => {
              const clave = claveLente(l)
              return (
                <li key={`${clave}-${l.constanteA ?? ''}`}>
                  <button
                    className={clave === claveActual ? 'lente elegida' : 'lente'}
                    data-testid={`lente-informe-${clave.replace(/\s+/g, '-')}`}
                    onClick={() => void elegir(l.fabricante ?? '', l.modelo)}
                  >
                    <span className="lente-modelo">{l.modelo}</span>
                    <span className="lente-constante">
                      {l.constanteA === undefined
                        ? 'sin constante en el informe'
                        : `A ${l.constanteA.toFixed(2)}${l.etiquetaConstante ? ` · ${l.etiquetaConstante}` : ''}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="pie-nota">
            {/*
              Ninguna viene marcada. Preseleccionar la primera sería elegir por el
              cirujano qué lente se implanta, que es justo lo que este programa no
              hace.
            */}
            No hay ninguna elegida de partida: la lente la decides tú. Si vas a poner otra que no
            está en esta lista, elígela abajo y escribe su constante a mano.
          </p>
        </>
      ) : (
        <p className="sub">
          La eliges tú. Este informe no trae ninguna lista de modelos con su constante, así que
          tendrás que escribir la constante A en «Lente y constantes».
        </p>
      )}

      <div className="fila">
        <label htmlFor="modelo-lente">{delInforme.length > 0 ? 'Otro modelo' : 'Modelo'}</label>
        <select
          id="modelo-lente"
          data-testid="selector-lente"
          value={otro || (actual !== '' && !enLista) ? '__otro__' : actual}
          onChange={(e) => void elegirDelDesplegable(e.target.value)}
        >
          <option value="">(sin elegir)</option>
          {MODELOS.map((m) => (
            <option key={m.modelo} value={m.modelo}>
              {m.modelo}
            </option>
          ))}
          <option value="__otro__">Otro (escribirlo)</option>
        </select>

        {(otro || (actual !== '' && !enLista && !enElInforme)) && (
          <>
            <input
              placeholder="Fabricante"
              value={fabricanteLibre}
              aria-label="Fabricante de la lente"
              onChange={(e) => setFabricanteLibre(e.target.value)}
            />
            <input
              placeholder="Modelo"
              value={modeloLibre}
              aria-label="Modelo de la lente"
              data-testid="modelo-libre"
              onChange={(e) => setModeloLibre(e.target.value)}
              onBlur={() => void guardarLibre()}
            />
          </>
        )}
      </div>

      {/*
        Los avisos de la elección son la parte que evita que un hueco parezca un
        fallo: dicen POR QUÉ no hay constante, o por qué se ha quitado la que había.
      */}
      {avisos.map((a, i) => (
        <div key={i} className="aviso atencion" data-testid="aviso-lente">
          {a}
        </div>
      ))}

      {caso.lente?.modelo && (
        <p className="pie-nota" data-testid="lente-elegida">
          Elegida: <strong>{caso.lente.modelo}</strong>
          {caso.lente.fabricante && !caso.lente.modelo.startsWith(caso.lente.fabricante)
            ? ` (${caso.lente.fabricante})`
            : ''}
          {caso.lente.constanteDeLaTabla ? (
            <>
              . Constante A <strong>{caso.lente.constanteDeLaTabla.valor.toFixed(2)}</strong>, del
              informe.
            </>
          ) : (
            '. Si una calculadora no tiene ese modelo, usará la constante A que hayas puesto y lo indicará.'
          )}
        </p>
      )}
      {!caso.lente?.modelo && delInforme.length === 0 && (
        <p className="pie-nota">
          Sin modelo elegido, las calculadoras usarán solo la constante A. Es válido, pero pierdes
          los ajustes propios de cada lente.
        </p>
      )}
    </div>
  )
}

/** Se exporta para que los tests puedan comprobar que la lista no se toca sola. */
export const MODELOS_DE_LAS_CALCULADORAS = MODELOS
