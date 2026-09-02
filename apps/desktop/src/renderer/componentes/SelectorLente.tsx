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
 * Modelos que EVO, Kane o Barrett tienen en su desplegable propio.
 *
 * No es un catálogo clínico: es lo que ofrecen esas webs, comprobado al leer
 * sus formularios. Añadir uno aquí solo tiene sentido si aparece con ese
 * nombre exacto en alguna de ellas.
 *
 * **Estos NO traen constante.** La constante sale del informe o la escribes tú.
 *
 * `nombreEnEvo`/`nombreEnKane` existen porque el MISMO modelo físico se llama
 * distinto en cada desplegable (petición expresa del dueño, 27/08/2026):
 * «B&L LuxSmart» en EVO es «B+L LuxSmart Toric» en Kane. Sin ellos, cada
 * adaptador busca `modelo` tal cual — sigue así para los modelos de esta
 * lista que ya se llaman igual en las dos webs. Barrett no tiene desplegable
 * de lentes (D33): sigue con la constante del caso, sin cambios.
 */
const MODELOS: readonly {
  fabricante: string
  modelo: string
  nombreEnEvo?: string
  nombreEnKane?: string
}[] = [
  { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon SA6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon Vivity' },
  { fabricante: 'Alcon', modelo: 'Alcon Panoptix' },
  { fabricante: 'Johnson & Johnson', modelo: 'Tecnis' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60T' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60ET/PT' },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L Aspire',
    nombreEnEvo: 'B&L Aspire',
    nombreEnKane: 'B+L enVista Aspire Toric',
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L Envy',
    nombreEnEvo: 'B&L Envy',
    nombreEnKane: 'B+L enVista Envy Toric',
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxGood',
    nombreEnEvo: 'B&L LuxGood',
    nombreEnKane: 'B+L LuxGood Toric',
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxSmart',
    nombreEnEvo: 'B&L LuxSmart',
    nombreEnKane: 'B+L LuxSmart Toric',
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxLife',
    nombreEnEvo: 'B&L LuxLife',
    nombreEnKane: 'B+L LuxLife Toric',
  },
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

  async function elegir(
    fabricante: string,
    modelo: string,
    nombreEnEvo?: string,
    nombreEnKane?: string,
  ): Promise<void> {
    const r = await api().elegirLente(fabricante, modelo, nombreEnEvo, nombreEnKane)
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
    await elegir(encontrado?.fabricante ?? '', modelo, encontrado?.nombreEnEvo, encontrado?.nombreEnKane)
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

      <SelectorLenteSecundaria caso={caso} onCambio={onCambio} />
    </div>
  )
}

/**
 * Una segunda lente candidata, para comparar con la misma biometría sin
 * volver a escribir ningún dato (D55, 01/09/2026: petición expresa del
 * dueño del proyecto).
 *
 * Deliberadamente más simple que el selector de arriba: mientras está
 * aparcada, esta lente no calcula nada ni tiene constante propia todavía
 * —no hace falta buscarla en la tabla del informe—, así que no necesita su
 * lista de «modelos del informe». Eso solo pasa al pulsar «Calcular con
 * esta lente», que la activa con las mismas cuatro reglas de constante A
 * que usa la lente principal (`intercambiarLentes`, en el dominio).
 */
function SelectorLenteSecundaria({ caso, onCambio }: Props): JSX.Element {
  const [otro, setOtro] = useState(false)
  const [modeloLibre, setModeloLibre] = useState(caso.lenteSecundaria?.modelo ?? '')
  const [fabricanteLibre, setFabricanteLibre] = useState(caso.lenteSecundaria?.fabricante ?? '')
  const [avisos, setAvisos] = useState<readonly string[]>([])
  const [intercambiando, setIntercambiando] = useState(false)

  const actual = caso.lenteSecundaria?.modelo ?? ''
  const enLista = MODELOS.some((m) => m.modelo === actual)

  async function elegir(
    fabricante: string,
    modelo: string,
    nombreEnEvo?: string,
    nombreEnKane?: string,
  ): Promise<void> {
    await api().elegirLenteSecundaria({ fabricante, modelo, nombreEnEvo, nombreEnKane })
    await onCambio()
  }

  async function elegirDelDesplegable(modelo: string): Promise<void> {
    if (modelo === '') {
      setOtro(false)
      await api().elegirLenteSecundaria(undefined)
      await onCambio()
      return
    }
    if (modelo === '__otro__') {
      setOtro(true)
      return
    }
    setOtro(false)
    const encontrado = MODELOS.find((m) => m.modelo === modelo)
    await elegir(encontrado?.fabricante ?? '', modelo, encontrado?.nombreEnEvo, encontrado?.nombreEnKane)
  }

  async function guardarLibre(): Promise<void> {
    if (modeloLibre.trim() === '') return
    await elegir(fabricanteLibre.trim(), modeloLibre.trim())
  }

  async function intercambiar(): Promise<void> {
    setIntercambiando(true)
    try {
      const r = await api().intercambiarLentes()
      setAvisos(r?.avisos ?? [])
      await onCambio()
    } finally {
      setIntercambiando(false)
    }
  }

  return (
    <>
      <div className="separador" />
      <h2>Lente alternativa (opcional)</h2>
      <p className="sub">
        Para comparar otra lente con la misma biometría, sin volver a escribir ningún dato. Se
        elige aquí y se activa cuando quieras, con «Calcular con esta lente» — lo que ya hayas
        calculado con la de ahora no se pierde: ya tienes su PDF generado.
      </p>
      <div className="fila">
        <label htmlFor="modelo-lente-secundaria">Modelo</label>
        <select
          id="modelo-lente-secundaria"
          data-testid="selector-lente-secundaria"
          value={otro || (actual !== '' && !enLista) ? '__otro__' : actual}
          onChange={(e) => void elegirDelDesplegable(e.target.value)}
        >
          <option value="">(ninguna)</option>
          {MODELOS.map((m) => (
            <option key={m.modelo} value={m.modelo}>
              {m.modelo}
            </option>
          ))}
          <option value="__otro__">Otro (escribirlo)</option>
        </select>

        {(otro || (actual !== '' && !enLista)) && (
          <>
            <input
              placeholder="Fabricante"
              value={fabricanteLibre}
              aria-label="Fabricante de la lente alternativa"
              onChange={(e) => setFabricanteLibre(e.target.value)}
            />
            <input
              placeholder="Modelo"
              value={modeloLibre}
              aria-label="Modelo de la lente alternativa"
              data-testid="modelo-libre-secundaria"
              onChange={(e) => setModeloLibre(e.target.value)}
              onBlur={() => void guardarLibre()}
            />
          </>
        )}
      </div>

      {avisos.map((a, i) => (
        <div key={i} className="aviso atencion" data-testid="aviso-lente-secundaria">
          {a}
        </div>
      ))}

      {caso.lenteSecundaria?.modelo && (
        <p className="pie-nota fila" style={{ alignItems: 'center', gap: 10 }}>
          <span data-testid="lente-secundaria-elegida">
            Aparcada: <strong>{caso.lenteSecundaria.modelo}</strong>
          </span>
          <button
            type="button"
            onClick={() => void intercambiar()}
            disabled={intercambiando}
            data-testid="intercambiar-lentes"
          >
            {intercambiando ? 'Cambiando…' : `Calcular con «${caso.lenteSecundaria.modelo}»`}
          </button>
        </p>
      )}
    </>
  )
}

/** Se exporta para que los tests puedan comprobar que la lista no se toca sola. */
export const MODELOS_DE_LAS_CALCULADORAS = MODELOS
