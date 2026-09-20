/**
 * PanelResultados.tsx — Los resultados, juntos.
 *
 * La tabla comparativa y las observaciones. Las columnas son las cinco
 * casillas de siempre — EVO y Barrett, cada una con su Predicted y su
 * Measured PCA (D45/D48), y Kane — ver `COLUMNAS_COMPARATIVA`. La que no se
 * haya pedido para este ojo sale como «no calculada», no desaparece.
 *
 * Las observaciones son descriptivas: dicen en qué coinciden y en qué no. No
 * dicen qué implantar, y no lo dirán.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import type {
  Calculadora,
  Caso,
  CeldaComparativa,
  DatoComparativo,
  Laboratorio,
  Lateralidad,
} from '@vilamar/domain'
import {
  aparatosDe,
  COLUMNAS_COMPARATIVA,
  compararOjo,
  fichaDe,
  nombreLateralidad,
  ojosDelCaso,
  resultadoDe,
  textoEstado,
} from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly onCambiarOjo: (ojo: Lateralidad) => void
  /** Con qué aparato/biómetro de `ojoActivo` se inspecciona el detalle (D47). */
  readonly aparatoActivo: string
  readonly onCambiarAparato: (aparato: string) => void
  readonly onReintentar: (calculadora: Calculadora) => void
  readonly onVolverARevisar: () => void
  /** Lo que está pasando ahora mismo, para no decir «no se ha lanzado» de algo que sí. */
  readonly estados?: readonly EstadoCalculo[]
}

/**
 * Cuando hay varias alternativas y la web no señala ninguna.
 *
 * Una fila las NOMBRA y las demás remiten a ella:
 *
 *     Cilindro             Ver alternativas
 *     Modelo tórico        3 alternativas tóricas     ← la que las nombra
 *     Cilindro residual    Ver alternativas
 *     Eje residual         Ver alternativas
 *
 * El texto lo trae el propio dato: lo decide el dominio, así que esta pantalla y
 * el PDF no pueden decir cosas distintas de lo mismo.
 */
function CeldaVarias({
  dato,
  nombre,
}: {
  dato: Extract<DatoComparativo, { estado: 'VARIAS' }>
  nombre: string
}): JSX.Element {
  return (
    <td
      className={dato.lasNombra ? 'varias nombra' : 'varias'}
      title={`${nombre} ha devuelto ${dato.cuantas} alternativas y no ha señalado ninguna. Las tienes todas debajo, en «Opciones devueltas».`}
    >
      {dato.etiqueta}
    </td>
  )
}

/**
 * Una casilla de la tabla comparativa.
 *
 * Los tres estados de `DatoComparativo` se pintan distintos a propósito, porque
 * significan cosas distintas:
 *
 *     22.50 D                  la web señaló esta opción (o solo devolvió una)
 *     3 alternativas tóricas   hay alternativas y la web no señala ninguna
 *     —                        esa calculadora no da este dato
 *
 * Antes los dos últimos casos eran el mismo «N/A», y eso hacía que una columna
 * perfectamente correcta pareciera rota.
 */
function CeldaDato({
  dato,
  nombre,
  sufijo = '',
  decimales = 2,
}: {
  dato: DatoComparativo
  nombre: string
  sufijo?: string
  decimales?: number
}): JSX.Element {
  if (dato.estado === 'VALOR') {
    return (
      <td>
        {dato.valor.toFixed(decimales)}
        {sufijo}
      </td>
    )
  }
  if (dato.estado === 'VARIAS') return <CeldaVarias dato={dato} nombre={nombre} />
  return (
    <td className="na" title={`No disponible en el resultado de ${nombre}`}>
      —
    </td>
  )
}

/** Lo mismo, para un texto —el modelo tórico— en vez de un número. */
function CeldaTexto({
  dato,
  nombre,
}: {
  dato: DatoComparativo<string>
  nombre: string
}): JSX.Element {
  if (dato.estado === 'VALOR') return <td>{dato.valor}</td>
  if (dato.estado === 'VARIAS') return <CeldaVarias dato={dato} nombre={nombre} />
  return (
    <td className="na" title={`No disponible en el resultado de ${nombre}`}>
      —
    </td>
  )
}

/** Las columnas del detalle. Solo se enseña la que alguna opción trae de verdad. */
const COLUMNAS_DE_OPCION = [
  { clave: 'esfera', titulo: 'Potencia LIO', sufijo: ' D', decimales: 2 },
  { clave: 'cilindro', titulo: 'Cilindro', sufijo: ' D', decimales: 2 },
  { clave: 'eje', titulo: 'Eje', sufijo: '°', decimales: 0 },
  { clave: 'designacion', titulo: 'Modelo tórico', sufijo: '', decimales: 0 },
  { clave: 'refraccionPrevista', titulo: 'Refracción prevista', sufijo: ' D', decimales: 2 },
  { clave: 'cilindroResidual', titulo: 'Cilindro residual', sufijo: ' D', decimales: 2 },
  { clave: 'ejeResidual', titulo: 'Eje residual', sufijo: '°', decimales: 0 },
] as const

/**
 * Todas las alternativas que devolvió una calculadora, tal cual vinieron.
 *
 * Se enseña cuando hay más de una. No añade ninguna columna que la web no haya
 * dado: si Kane solo devuelve potencia y refracción, la tabla tiene dos columnas.
 */
function OpcionesDevueltas({ celda }: { celda: CeldaComparativa }): JSX.Element | null {
  if (celda.opciones.length <= 1) return null

  const columnas = COLUMNAS_DE_OPCION.filter((col) =>
    celda.opciones.some((o) => o[col.clave] !== undefined),
  )
  if (columnas.length === 0) return null

  const senalada = celda.seleccion.clase === 'DESTACADA'

  return (
    <div className="opciones-devueltas">
      <h3>
        {celda.nombre} · {celda.opciones.length} alternativas devueltas
      </h3>
      <p className="sub">
        {senalada
          ? `${celda.nombre} ha señalado una de ellas; va marcada en la tabla y es la que aparece arriba.`
          : `${celda.nombre} no ha señalado ninguna opción preferente. La elección no la hace Calculator Vilamar.`}
      </p>
      <table className="opciones">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col.clave}>{col.titulo}</th>
            ))}
            {senalada && <th></th>}
          </tr>
        </thead>
        <tbody>
          {celda.opciones.map((o, i) => (
            <tr key={i} className={o.recomendada ? 'destacada' : ''}>
              {columnas.map((col) => {
                const v = o[col.clave]
                return (
                  <td key={col.clave}>
                    {v === undefined ? (
                      <span className="na">—</span>
                    ) : typeof v === 'number' ? (
                      `${v.toFixed(col.decimales)}${col.sufijo}`
                    ) : (
                      v
                    )}
                  </td>
                )
              })}
              {senalada && (
                <td className="marca">{o.recomendada ? `Destacada por ${celda.nombre}` : ''}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface FormularioPedido {
  readonly fabricante: string
  readonly modelo: string
  readonly esfera: string
  readonly cilindro: string
  readonly eje: string
}

function formularioDesdeCaso(caso: Caso, ojo: Lateralidad): FormularioPedido {
  const pedido = caso.pedidosLente?.[ojo]
  return {
    fabricante: pedido?.fabricante ?? '',
    modelo: pedido?.modelo ?? '',
    esfera: pedido?.esfera !== undefined ? String(pedido.esfera) : '',
    cilindro: pedido?.cilindro !== undefined ? String(pedido.cilindro) : '',
    eje: pedido?.eje !== undefined ? String(pedido.eje) : '',
  }
}

/**
 * La lente que el cirujano decide pedir de verdad, una vez visto el informe
 * (D93, 20/09/2026) — funciona igual reabriendo un caso terminado días
 * después que justo tras calcular. `key={ojoActivo}`, en el sitio donde se
 * usa este componente, fuerza que se reinicie al cambiar de ojo — mismo
 * motivo que ya explica `SelectorAparatoPrincipal` (D47): sin ella, React
 * conserva el formulario del ojo anterior en pantalla.
 */
function TarjetaPedidoLente({
  caso,
  ojoActivo,
}: {
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
}): JSX.Element {
  const [laboratorios, setLaboratorios] = useState<readonly Laboratorio[] | null>(null)
  const [form, setForm] = useState<FormularioPedido>(() => formularioDesdeCaso(caso, ojoActivo))
  const [guardando, setGuardando] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api()
      .listarLaboratorios()
      .then(setLaboratorios)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const pedidoGuardado = caso.pedidosLente?.[ojoActivo]

  async function guardar(): Promise<void> {
    setError(null)
    const esfera = Number(form.esfera.replace(',', '.'))
    if (form.fabricante.trim() === '') {
      setError('Elige el fabricante.')
      return
    }
    if (form.modelo.trim() === '') {
      setError('Escribe el modelo de la lente.')
      return
    }
    if (!Number.isFinite(esfera)) {
      setError('La potencia esférica no es un número válido.')
      return
    }
    const cilindro =
      form.cilindro.trim() === '' ? undefined : Number(form.cilindro.replace(',', '.'))
    const eje = form.eje.trim() === '' ? undefined : Number(form.eje.replace(',', '.'))
    if (cilindro !== undefined && !Number.isFinite(cilindro)) {
      setError('La potencia cilíndrica no es un número válido.')
      return
    }
    if (eje !== undefined && !Number.isFinite(eje)) {
      setError('El eje no es un número válido.')
      return
    }
    setGuardando(true)
    try {
      await api().guardarPedidoLente(ojoActivo, {
        fabricante: form.fabricante.trim(),
        modelo: form.modelo.trim(),
        esfera,
        cilindro,
        eje,
      })
      // `caso` se actualiza solo: `guardarPedidoLente()` emite el caso
      // nuevo por el mismo canal que ya escucha App.tsx (`alCambiarCaso`),
      // igual que cualquier otro cambio del caso en curso.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  async function pedir(): Promise<void> {
    setError(null)
    setPidiendo(true)
    try {
      await api().pedirAlLaboratorio(ojoActivo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Lente a pedir · {nombreLateralidad(ojoActivo)}</h2>
      <p className="sub">
        Una vez visto el informe, escribe aquí la lente que vas a pedir de verdad — no tiene que
        coincidir exactamente con ninguna casilla calculada. Se guarda con el caso, así que puedes
        decidirlo con calma, incluso días después, reabriendo el caso desde «Casos guardados».
      </p>

      {error && <div className="aviso error">{error}</div>}

      {laboratorios !== null && laboratorios.length === 0 && (
        <p className="pie-nota">
          Todavía no has guardado ningún laboratorio — hazlo desde el botón «Laboratorios» de arriba
          para poder pedir por correo.
        </p>
      )}

      <div className="fila" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <label htmlFor={`pedido-fabricante-${ojoActivo}`}>Fabricante</label>
          <select
            id={`pedido-fabricante-${ojoActivo}`}
            value={form.fabricante}
            data-testid="pedido-fabricante"
            onChange={(e) => setForm((f) => ({ ...f, fabricante: e.target.value }))}
          >
            <option value="">(elige uno)</option>
            {(laboratorios ?? []).map((l) => (
              <option key={l.id} value={l.fabricante}>
                {l.fabricante}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`pedido-modelo-${ojoActivo}`}>Modelo de la lente</label>
          <input
            id={`pedido-modelo-${ojoActivo}`}
            value={form.modelo}
            data-testid="pedido-modelo"
            onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor={`pedido-esfera-${ojoActivo}`}>Potencia esférica (D)</label>
          <input
            id={`pedido-esfera-${ojoActivo}`}
            type="number"
            step="0.25"
            value={form.esfera}
            data-testid="pedido-esfera"
            onChange={(e) => setForm((f) => ({ ...f, esfera: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor={`pedido-cilindro-${ojoActivo}`}>Potencia cilíndrica (D)</label>
          <input
            id={`pedido-cilindro-${ojoActivo}`}
            type="number"
            step="0.25"
            value={form.cilindro}
            data-testid="pedido-cilindro"
            onChange={(e) => setForm((f) => ({ ...f, cilindro: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor={`pedido-eje-${ojoActivo}`}>Eje (°)</label>
          <input
            id={`pedido-eje-${ojoActivo}`}
            type="number"
            step="1"
            value={form.eje}
            data-testid="pedido-eje"
            onChange={(e) => setForm((f) => ({ ...f, eje: e.target.value }))}
          />
        </div>
      </div>

      <div className="fila" style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
        <button
          className="principal"
          onClick={() => void guardar()}
          disabled={guardando}
          data-testid="guardar-pedido-lente"
        >
          {guardando ? 'Guardando…' : 'Guardar la lente a pedir'}
        </button>
        {pedidoGuardado && (
          <button
            onClick={() => void pedir()}
            disabled={pidiendo}
            data-testid="pedir-al-laboratorio"
          >
            {pidiendo ? 'Abriendo el correo…' : 'Pedir al laboratorio'}
          </button>
        )}
      </div>

      {pedidoGuardado && (
        <p className="pie-nota" data-testid="pedido-guardado-texto">
          Guardado: <strong>{pedidoGuardado.fabricante}</strong> {pedidoGuardado.modelo} ·{' '}
          {pedidoGuardado.esfera.toFixed(2)} D
          {pedidoGuardado.cilindro !== undefined
            ? ` · Cil. ${pedidoGuardado.cilindro.toFixed(2)} D`
            : ''}
          {pedidoGuardado.eje !== undefined ? ` · Eje ${pedidoGuardado.eje.toFixed(0)}°` : ''}
        </p>
      )}
    </div>
  )
}

export function PanelResultados({
  caso,
  ojoActivo,
  onCambiarOjo,
  aparatoActivo,
  onCambiarAparato,
  onReintentar,
  onVolverARevisar,
  estados = [],
}: Props): JSX.Element {
  const ojos = ojosDelCaso(caso)
  const aparatos = aparatosDe(caso, ojoActivo)
  // Un PDF por ojo (D47, 27/08/2026) — antes era uno solo por caso.
  const [rutas, setRutas] = useState<readonly { ojo: Lateralidad; ruta: string }[]>([])
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las cinco casillas de siempre (D45/D48): Predicted y Measured PCA de EVO
  // y de Barrett, más Kane — la que no se haya pedido para este ojo y
  // aparato sale como «no calculada» en su columna, no desaparece. El PDF
  // final (generar()) siempre junta TODOS los aparatos del ojo (decisión 3,
  // D47) — este detalle en pantalla es solo para inspeccionar uno a la vez.
  const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
  for (const c of COLUMNAS_COMPARATIVA) {
    const r = resultadoDe(caso, c, ojoActivo, aparatoActivo)
    if (r) resultados[c] = r
  }
  const comparativa = compararOjo(ojoActivo, resultados as never, COLUMNAS_COMPARATIVA)

  async function generar(): Promise<void> {
    setGenerando(true)
    setError(null)
    try {
      const r = await api().generarPdf()
      setRutas(r.rutas)
    } catch (e) {
      setError(
        `No se ha podido generar el PDF. ${e instanceof Error ? e.message : String(e)} ` +
          'Tus resultados siguen aquí: puedes intentarlo otra vez.',
      )
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      {ojos.length > 1 && (
        <div className="fila" style={{ marginBottom: 14 }}>
          <div className="selector-ojo">
            {ojos.map((l) => (
              <button
                key={l}
                className={l === ojoActivo ? 'activo' : ''}
                onClick={() => onCambiarOjo(l)}
              >
                {nombreLateralidad(l)}
              </button>
            ))}
          </div>
        </div>
      )}

      {aparatos.length > 1 && (
        <div className="fila" style={{ marginBottom: 14 }}>
          <div className="selector-ojo">
            {aparatos.map((a) => (
              <button
                key={a}
                className={a === aparatoActivo ? 'activo' : ''}
                onClick={() => onCambiarAparato(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tarjeta">
        <h2>
          Comparación · {nombreLateralidad(ojoActivo)}
          {aparatos.length > 1 ? ` — ${aparatoActivo}` : ''}
        </h2>
        <table className="comparativa" data-testid="tabla-comparativa">
          <thead>
            <tr>
              <th></th>
              {comparativa.celdas.map((c) => (
                <th key={c.calculadora}>{c.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Esfera</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato key={c.calculadora} dato={c.esfera} nombre={c.nombre} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Cilindro</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato key={c.calculadora} dato={c.cilindro} nombre={c.nombre} sufijo=" D" />
              ))}
            </tr>
            <tr>
              <th>Eje</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato
                  key={c.calculadora}
                  dato={c.eje}
                  nombre={c.nombre}
                  sufijo="°"
                  decimales={0}
                />
              ))}
            </tr>
            <tr>
              <th>Modelo tórico</th>
              {comparativa.celdas.map((c) => (
                <CeldaTexto key={c.calculadora} dato={c.designacion} nombre={c.nombre} />
              ))}
            </tr>
            <tr>
              <th>Refracción prevista</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato
                  key={c.calculadora}
                  dato={c.refraccionPrevista}
                  nombre={c.nombre}
                  sufijo=" D"
                />
              ))}
            </tr>
            <tr>
              <th>Cilindro residual</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato
                  key={c.calculadora}
                  dato={c.cilindroResidual}
                  nombre={c.nombre}
                  sufijo=" D"
                />
              ))}
            </tr>
            <tr>
              <th>Eje residual</th>
              {comparativa.celdas.map((c) => (
                <CeldaDato
                  key={c.calculadora}
                  dato={c.ejeResidual}
                  nombre={c.nombre}
                  sufijo="°"
                  decimales={0}
                />
              ))}
            </tr>
            <tr>
              <th>Estado</th>
              {comparativa.celdas.map((c) => {
                // Una calculadora sin resultado pero con actividad NO está «sin
                // lanzar»: está esperando, a menudo a que el usuario haga algo.
                const enCurso = estados.find(
                  (e) => e.calculadora === c.calculadora && e.ojo === ojoActivo,
                )
                const texto =
                  c.estado === 'NO_EJECUTADA' && enCurso
                    ? enCurso.requiereUsuario
                      ? 'Esperando a que hagas algo en el navegador'
                      : 'En curso…'
                    : textoEstado(c.estado)
                return (
                  <td key={c.calculadora} style={{ fontSize: 12.5, color: 'var(--gris)' }}>
                    {texto}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/*
        El detalle de las alternativas. Va aquí, debajo de la comparación, porque
        es lo primero que hace falta cuando una columna dice «3 opciones»: verlas.
      */}
      {comparativa.celdas.some((c) => c.opciones.length > 1) && (
        <div className="tarjeta">
          <h2>Opciones devueltas · {nombreLateralidad(ojoActivo)}</h2>
          {comparativa.celdas.map((c) => (
            <OpcionesDevueltas key={c.calculadora} celda={c} />
          ))}
        </div>
      )}

      <div className="tarjeta">
        <h2>Qué dicen estos resultados</h2>
        {comparativa.observaciones.length === 0 && (
          <p className="sub">Todavía no hay nada que comparar.</p>
        )}
        {comparativa.observaciones.map((o, i) => (
          <div key={i} className={`observacion ${o.tipo}`}>
            {o.texto}
          </div>
        ))}
        <p className="pie-nota">
          Esto describe en qué coinciden y en qué no las calculadoras. Calculator Vilamar no
          recomienda ninguna lente.
        </p>
      </div>

      <div className="tarjeta">
        <h2>Reintentar una sola</h2>
        <p className="sub">Si alguna falló, puedes lanzarla otra vez sin perder las demás.</p>
        <div className="fila">
          {COLUMNAS_COMPARATIVA.map((c) => {
            const r = resultadoDe(caso, c, ojoActivo)
            const fallo = !r || (r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL')
            return (
              <button key={c} onClick={() => onReintentar(c)} disabled={!fallo && r !== undefined}>
                {fallo ? 'Reintentar' : 'Repetir'} {fichaDe(c).nombre}
              </button>
            )
          })}
          <button onClick={onVolverARevisar}>Volver a los datos</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Informe</h2>
        <p className="sub">
          Un PDF por ojo, con los datos confirmados, de dónde salió cada uno, los resultados de cada
          calculadora (y de cada aparato, si el ojo tiene más de uno) y las diferencias entre ellos.
        </p>
        {error && <div className="aviso error">{error}</div>}
        {rutas.length > 0 && (
          <div className="aviso exito">
            <strong>{rutas.length === 1 ? 'Informe generado.' : 'Informes generados.'}</strong>
            {rutas.map((r) => (
              <div key={r.ojo}>
                {nombreLateralidad(r.ojo)}: <code>{r.ruta}</code>
              </div>
            ))}
          </div>
        )}
        <div className="fila derecha">
          {rutas.length > 0 && (
            <button onClick={() => void api().abrirCarpetaInformes()}>Abrir la carpeta</button>
          )}
          <button
            className="principal grande"
            onClick={() => void generar()}
            disabled={generando}
            data-testid="generar-pdf"
          >
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>

      {/*
        `key={ojoActivo}`: al cambiar de ojo, es un formulario distinto —sin
        la clave, React conserva lo que se estuviera escribiendo del ojo
        anterior en pantalla (mismo motivo que ya explica `SelectorAparato`,
        D47).
      */}
      <TarjetaPedidoLente key={ojoActivo} caso={caso} ojoActivo={ojoActivo} />
    </>
  )
}
