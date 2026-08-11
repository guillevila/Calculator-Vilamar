/**
 * SelectorLente.tsx — Elegir la lente antes de calcular.
 *
 * El modelo de lente no sale del informe de biometría: lo decide el cirujano.
 * Va aquí, junto al resto de decisiones suyas, y se marca como escrito a mano
 * igual que el objetivo refractivo o el SIA.
 *
 * Los nombres de la lista son **los que usan las propias calculadoras** en sus
 * desplegables. Se guardan tal cual para poder elegirlos allí sin traducciones
 * a mano, que es donde se cuelan los errores. Si un modelo no está en la lista,
 * se puede escribir: el adaptador lo buscará y, si esa web no lo tiene, seguirá
 * con la constante A y lo dirá.
 */

import type { JSX } from 'react'
import { useState } from 'react'

import type { Caso } from '@vilamar/domain'

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

  const actual = caso.lente?.modelo ?? ''
  const enLista = MODELOS.some((m) => m.modelo === actual)

  async function elegir(modelo: string): Promise<void> {
    if (modelo === '__otro__') {
      setOtro(true)
      return
    }
    setOtro(false)
    const encontrado = MODELOS.find((m) => m.modelo === modelo)
    await api().elegirLente(encontrado?.fabricante ?? '', modelo)
    await onCambio()
  }

  async function guardarLibre(): Promise<void> {
    if (modeloLibre.trim() === '') return
    await api().elegirLente(fabricanteLibre.trim(), modeloLibre.trim())
    await onCambio()
  }

  return (
    <div className="tarjeta">
      <h2>Lente</h2>
      <p className="sub">
        La eliges tú: no viene en el informe. Se enviará a las calculadoras que tengan ese modelo en
        su lista.
      </p>

      <div className="fila">
        <label htmlFor="modelo-lente">Modelo</label>
        <select
          id="modelo-lente"
          data-testid="selector-lente"
          value={otro || (actual !== '' && !enLista) ? '__otro__' : actual}
          onChange={(e) => void elegir(e.target.value)}
        >
          <option value="">(sin elegir)</option>
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

      {caso.lente?.modelo && (
        <p className="pie-nota">
          Elegida: <strong>{caso.lente.modelo}</strong>
          {caso.lente.fabricante ? ` (${caso.lente.fabricante})` : ''}. Si una calculadora no tiene
          ese modelo, usará la constante A que hayas puesto y lo indicará.
        </p>
      )}
      {!caso.lente?.modelo && (
        <p className="pie-nota">
          Sin modelo elegido, las calculadoras usarán solo la constante A. Es válido, pero pierdes
          los ajustes propios de cada lente.
        </p>
      )}
    </div>
  )
}
