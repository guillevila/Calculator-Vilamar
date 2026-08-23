/**
 * Ajustes.tsx — El catálogo de lentes propio.
 *
 * No pertenece al flujo de un caso: se gestiona aparte, desde el botón
 * «Ajustes» de la cabecera, y sigue existiendo aunque no haya ningún cálculo
 * abierto. Por eso no es un paso más del asistente — es una pantalla que se
 * abre encima.
 *
 * Lo que se guarda aquí no elige nada por el usuario: es un inventario. La
 * pantalla de Resultados lo cruza contra la potencia calculada para decir
 * «estas lentes tuyas cubren esto», nunca «implanta esta» — ver `comparar.ts`.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import type { LenteDeCatalogo, LenteDeCatalogoEntrada } from '@vilamar/domain'
import { describirLenteDeCatalogo, erroresDeLenteCatalogo } from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly onCerrar: () => void
}

/** Una calculadora, su etiqueta en el formulario y el campo del formulario que le corresponde. */
const CALCULADORAS_FORM = [
  { clave: 'EVO_TORIC', etiqueta: 'Constante A · EVO' },
  { clave: 'BARRETT_TORIC', etiqueta: 'Constante A · Barrett' },
  { clave: 'KANE', etiqueta: 'Constante A · Kane' },
] as const

const VACIO = {
  modelo: '',
  fabricante: '',
  constanteEvo: '',
  constanteBarrett: '',
  constanteKane: '',
  torica: false,
  esferaMin: '',
  esferaMax: '',
  cilindroMin: '',
  cilindroMax: '',
  notas: '',
}

type Formulario = typeof VACIO

const CAMPO_CONSTANTE = {
  EVO_TORIC: 'constanteEvo',
  BARRETT_TORIC: 'constanteBarrett',
  KANE: 'constanteKane',
} as const

function aEntrada(f: Formulario): LenteDeCatalogoEntrada | null {
  const esferaMin = Number(f.esferaMin)
  const esferaMax = Number(f.esferaMax)
  if (f.esferaMin.trim() === '' || f.esferaMax.trim() === '') return null

  const constantesA: Record<string, number> = {}
  for (const { clave } of CALCULADORAS_FORM) {
    const texto = f[CAMPO_CONSTANTE[clave]]
    if (texto.trim() !== '') constantesA[clave] = Number(texto)
  }

  return {
    modelo: f.modelo.trim(),
    ...(f.fabricante.trim() !== '' ? { fabricante: f.fabricante.trim() } : {}),
    constantesA,
    torica: f.torica,
    rangoEsfera: { min: esferaMin, max: esferaMax },
    ...(f.torica && f.cilindroMin.trim() !== '' && f.cilindroMax.trim() !== ''
      ? { rangoCilindro: { min: Number(f.cilindroMin), max: Number(f.cilindroMax) } }
      : {}),
    ...(f.notas.trim() !== '' ? { notas: f.notas.trim() } : {}),
  }
}

function deLente(l: LenteDeCatalogo): Formulario {
  return {
    modelo: l.modelo,
    fabricante: l.fabricante ?? '',
    constanteEvo: l.constantesA.EVO_TORIC !== undefined ? String(l.constantesA.EVO_TORIC) : '',
    constanteBarrett:
      l.constantesA.BARRETT_TORIC !== undefined ? String(l.constantesA.BARRETT_TORIC) : '',
    constanteKane: l.constantesA.KANE !== undefined ? String(l.constantesA.KANE) : '',
    torica: l.torica,
    esferaMin: String(l.rangoEsfera.min),
    esferaMax: String(l.rangoEsfera.max),
    cilindroMin: l.rangoCilindro ? String(l.rangoCilindro.min) : '',
    cilindroMax: l.rangoCilindro ? String(l.rangoCilindro.max) : '',
    notas: l.notas ?? '',
  }
}

export function Ajustes({ onCerrar }: Props): JSX.Element {
  const [catalogo, setCatalogo] = useState<readonly LenteDeCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [errores, setErrores] = useState<readonly string[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    void api()
      .catalogoLentes()
      .then((c) => {
        setCatalogo(c)
        setCargando(false)
      })
  }, [])

  function empezarNueva(): void {
    setEditando('__nueva__')
    setForm(VACIO)
    setErrores([])
  }

  function empezarEdicion(l: LenteDeCatalogo): void {
    setEditando(l.id)
    setForm(deLente(l))
    setErrores([])
  }

  function cancelar(): void {
    setEditando(null)
    setForm(VACIO)
    setErrores([])
  }

  async function guardar(): Promise<void> {
    const entrada = aEntrada(form)
    if (!entrada) {
      setErrores(['Falta el rango de esfera: mínimo y máximo son obligatorios.'])
      return
    }
    const propios = erroresDeLenteCatalogo(entrada)
    if (propios.length > 0) {
      setErrores(propios)
      return
    }
    setGuardando(true)
    setErrores([])
    try {
      const id = editando === '__nueva__' ? undefined : (editando ?? undefined)
      const actualizado = await api().guardarLenteEnCatalogo(id, entrada)
      setCatalogo(actualizado)
      cancelar()
    } catch (e) {
      setErrores([e instanceof Error ? e.message : String(e)])
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(l: LenteDeCatalogo): Promise<void> {
    const actualizado = await api().borrarLenteDelCatalogo(l.id)
    setCatalogo(actualizado)
    if (editando === l.id) cancelar()
  }

  return (
    <div className="tarjeta" data-testid="ajustes-catalogo">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h2>Tu catálogo de lentes</h2>
        <button onClick={onCerrar}>Cerrar</button>
      </div>
      <p className="sub">
        Las lentes que tienes, con su constante A y el rango de potencias que cubren. Al ver los
        resultados de un cálculo, Calculator Vilamar te dirá qué lentes de esta lista cubren la
        potencia obtenida — no elige ninguna por ti, igual que no elige entre Kane, EVO y Barrett.
      </p>

      {cargando ? (
        <p className="sub">Cargando…</p>
      ) : (
        <>
          {catalogo.length === 0 && editando === null && (
            <p className="pie-nota">Todavía no has añadido ninguna lente.</p>
          )}

          {catalogo.length > 0 && (
            <table className="comparativa" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>Modelo y constantes</th>
                  <th>Tipo</th>
                  <th>Rango esfera</th>
                  <th>Rango cilindro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {catalogo.map((l) => (
                  <tr key={l.id}>
                    <td>{describirLenteDeCatalogo(l)}</td>
                    <td>{l.torica ? 'Tórica' : 'Esférica'}</td>
                    <td>
                      {l.rangoEsfera.min.toFixed(2)} – {l.rangoEsfera.max.toFixed(2)} D
                    </td>
                    <td>
                      {l.rangoCilindro
                        ? `${l.rangoCilindro.min.toFixed(2)} – ${l.rangoCilindro.max.toFixed(2)} D`
                        : '—'}
                    </td>
                    <td className="fila">
                      <button onClick={() => empezarEdicion(l)}>Editar</button>
                      <button onClick={() => void borrar(l)}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {editando === null ? (
            <button className="principal" onClick={empezarNueva}>
              Añadir lente
            </button>
          ) : (
            <div className="tarjeta" style={{ background: 'var(--fondo-suave, #F5F7FA)' }}>
              <h3>{editando === '__nueva__' ? 'Nueva lente' : 'Editar lente'}</h3>

              <div className="fila">
                <label htmlFor="al-modelo">Modelo</label>
                <input
                  id="al-modelo"
                  value={form.modelo}
                  onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                />
                <label htmlFor="al-fabricante">Fabricante</label>
                <input
                  id="al-fabricante"
                  value={form.fabricante}
                  onChange={(e) => setForm({ ...form, fabricante: e.target.value })}
                />
              </div>

              <p className="pie-nota">
                La constante A no es un número universal: cada calculadora la usa con su propia
                fórmula. Rellena la que tengas de cada una — no hace falta que estén las tres.
              </p>
              <div className="fila">
                {CALCULADORAS_FORM.map(({ clave, etiqueta }) => (
                  <div key={clave}>
                    <label htmlFor={`al-constante-${clave}`}>{etiqueta}</label>
                    <input
                      id={`al-constante-${clave}`}
                      type="number"
                      step="0.01"
                      value={form[CAMPO_CONSTANTE[clave]]}
                      onChange={(e) => setForm({ ...form, [CAMPO_CONSTANTE[clave]]: e.target.value })}
                    />
                  </div>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={form.torica}
                    onChange={(e) => setForm({ ...form, torica: e.target.checked })}
                  />{' '}
                  Es tórica
                </label>
              </div>

              <div className="fila">
                <label htmlFor="al-esfera-min">Esfera mínima</label>
                <input
                  id="al-esfera-min"
                  type="number"
                  step="0.01"
                  value={form.esferaMin}
                  onChange={(e) => setForm({ ...form, esferaMin: e.target.value })}
                />
                <label htmlFor="al-esfera-max">Esfera máxima</label>
                <input
                  id="al-esfera-max"
                  type="number"
                  step="0.01"
                  value={form.esferaMax}
                  onChange={(e) => setForm({ ...form, esferaMax: e.target.value })}
                />
              </div>

              {form.torica && (
                <div className="fila">
                  <label htmlFor="al-cilindro-min">Cilindro mínimo</label>
                  <input
                    id="al-cilindro-min"
                    type="number"
                    step="0.01"
                    value={form.cilindroMin}
                    onChange={(e) => setForm({ ...form, cilindroMin: e.target.value })}
                  />
                  <label htmlFor="al-cilindro-max">Cilindro máximo</label>
                  <input
                    id="al-cilindro-max"
                    type="number"
                    step="0.01"
                    value={form.cilindroMax}
                    onChange={(e) => setForm({ ...form, cilindroMax: e.target.value })}
                  />
                </div>
              )}

              <div className="fila">
                <label htmlFor="al-notas">Notas</label>
                <input
                  id="al-notas"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>

              {errores.map((e, i) => (
                <div key={i} className="aviso error">
                  {e}
                </div>
              ))}

              <div className="fila">
                <button className="principal" onClick={() => void guardar()} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                <button onClick={cancelar} disabled={guardando}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
