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

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import type {
  Calculadora,
  Caso,
  CeldaComparativa,
  DatoComparativo,
  EstimacionConFilas,
  Laboratorio,
  Lateralidad,
} from '@vilamar/domain'
import {
  aparatosDe,
  COLUMNAS_COMPARATIVA,
  compararOjo,
  criterioEsferaPara,
  ejeCurvoDe,
  estimarConFilas,
  fichaDe,
  nombreLateralidad,
  ojoDe,
  ojosDelCaso,
  resultadoDe,
  textoEstado,
} from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'
import { api } from '../api.js'

/**
 * Un color por calculadora (D129, 20/10/2026): EVO verde azulado, Barrett azul y
 * Kane violeta, los mismos tres tonos de las hojas del PDF. Las variantes
 * (con y sin córnea posterior) comparten el color de su calculadora.
 */
function claseDeCalculadora(c: Calculadora): string {
  if (c.startsWith('EVO')) return 'calc-evo'
  if (c.startsWith('BARRETT')) return 'calc-barrett'
  if (c === 'KANE') return 'calc-kane'
  return 'calc-otra'
}

/**
 * El documento HTML del PDF de esta pantalla: la zona tal como se ve, con todas
 * las reglas de estilo de la aplicación (así conserva los colores) y en apaisado.
 * No lleva ningún script y los botones de la zona no se imprimen.
 */
function htmlDePantalla(zona: HTMLElement, ojo: string, codigo: string): string {
  const reglas: string[] = []
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      for (const regla of Array.from(hoja.cssRules)) reglas.push(regla.cssText)
    } catch {
      // Una hoja de otro origen no se puede leer; las de la aplicación sí.
    }
  }
  const ancho = Math.max(zona.getBoundingClientRect().width, 1)
  const zoom = Math.min(1, 1040 / ancho)
  const clon = zona.cloneNode(true) as HTMLElement
  clon.querySelectorAll('.sin-impresion, script').forEach((e) => e.remove())
  const fecha = new Date().toLocaleDateString('es-ES')
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Resumen de resultados</title><style>' +
    reglas.join(' ') +
    '@page { size: A4 landscape; margin: 0 }' +
    'html, body { height: auto; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }' +
    '.pdf-pantalla { padding: 10mm; }' +
    `.pdf-pantalla .zona { width: ${Math.round(ancho)}px; zoom: ${zoom.toFixed(3)}; }` +
    '.pdf-cabecera { display: flex; justify-content: space-between; margin-bottom: 6mm; font-size: 12px; color: #475569; }' +
    '.pdf-cabecera strong { font-size: 18px; color: #153f74; }' +
    '</style></head><body><div class="pdf-pantalla">' +
    `<div class="pdf-cabecera"><strong>Resultados · ${ojo}</strong><span>Caso ${codigo} · ${fecha}</span></div>` +
    `<div class="zona">${clon.outerHTML}</div></div></body></html>`
  )
}

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
const TITULO_ELEGIDA =
  'La web no marcó ninguna alternativa: este es el valor de la elegida según el criterio propio (estimación orientativa, no vinculante).'

function CeldaVarias({
  dato,
  nombre,
  calc,
}: {
  dato: Extract<DatoComparativo, { estado: 'VARIAS' }>
  nombre: string
  calc: string
}): JSX.Element {
  return (
    <td
      className={`${calc} ${dato.lasNombra ? 'varias nombra' : 'varias'}`}
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
  calc,
  sufijo = '',
  decimales = 2,
  elegida,
}: {
  dato: DatoComparativo
  nombre: string
  calc: string
  sufijo?: string
  decimales?: number
  /** Valor de la alternativa elegida por el criterio propio, si la web no marcó ninguna. */
  elegida?: number | undefined
}): JSX.Element {
  if (dato.estado === 'VARIAS' && elegida !== undefined) {
    return (
      <td className={calc} title={TITULO_ELEGIDA}>
        {elegida.toFixed(decimales)}
        {sufijo}
      </td>
    )
  }
  if (dato.estado === 'VALOR') {
    return (
      <td className={calc}>
        {dato.valor.toFixed(decimales)}
        {sufijo}
      </td>
    )
  }
  if (dato.estado === 'VARIAS') return <CeldaVarias dato={dato} nombre={nombre} calc={calc} />
  return (
    <td className={`${calc} na`} title={`No disponible en el resultado de ${nombre}`}>
      —
    </td>
  )
}

/** Lo mismo, para un texto —el modelo tórico— en vez de un número. */
function CeldaTexto({
  dato,
  nombre,
  calc,
  elegida,
}: {
  dato: DatoComparativo<string>
  nombre: string
  calc: string
  elegida?: string | undefined
}): JSX.Element {
  if (dato.estado === 'VARIAS' && elegida !== undefined) {
    return (
      <td className={calc} title={TITULO_ELEGIDA}>
        {elegida}
      </td>
    )
  }
  if (dato.estado === 'VALOR') return <td className={calc}>{dato.valor}</td>
  if (dato.estado === 'VARIAS') return <CeldaVarias dato={dato} nombre={nombre} calc={calc} />
  return (
    <td className={`${calc} na`} title={`No disponible en el resultado de ${nombre}`}>
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
function OpcionesDevueltas({
  celda,
  estimacion,
}: {
  celda: CeldaComparativa
  estimacion: EstimacionConFilas | undefined
}): JSX.Element | null {
  if (celda.opciones.length <= 1) return null

  const columnas = COLUMNAS_DE_OPCION.filter((col) =>
    celda.opciones.some((o) => o[col.clave] !== undefined),
  )
  if (columnas.length === 0) return null

  // Lo que la propia web marcó y lo que marca el criterio propio (D43/D130) son
  // dos cosas distintas y se enseñan distintas: la fuerte es la elegida por el
  // criterio; la de la web queda visible, pero discreta.
  const senalada = celda.seleccion.clase === 'DESTACADA'
  const hayMarca = senalada || estimacion !== undefined
  // La misma lente (potencia y cilindro) que una fila marcada o elegida y que
  // vuelve a aparecer más abajo en la lista: se marca en tono suave para que se
  // vea que es la misma (D130).
  const claveDeLente = (o: (typeof celda.opciones)[number]): string => `${o.esfera}|${o.cilindro}`
  const lentesMarcadas = new Set(
    celda.opciones
      .filter(
        (o) => o.recomendada || o === estimacion?.filaEsfera || o === estimacion?.filaCilindro,
      )
      .map(claveDeLente),
  )

  return (
    <div className={`opciones-devueltas ${claseDeCalculadora(celda.calculadora)}`}>
      <h3>
        {celda.nombre} · {celda.opciones.length} alternativas devueltas
        {estimacion && (
          <span className="insignia" data-testid="eleccion-propia">
            ★ Elegida: {estimacion.lente.esfera.toFixed(2)} D
            {estimacion.lente.cilindro !== undefined
              ? ` · cil. ${estimacion.lente.cilindro.toFixed(2)} D`
              : ''}
          </span>
        )}
      </h3>
      <p className="sub">
        {senalada
          ? `${celda.nombre} ha señalado una de ellas (marcada con un borde en la tabla).`
          : `${celda.nombre} no ha señalado ninguna opción preferente.`}
        {estimacion
          ? ' En color pleno, la elección según el criterio propio (estimación orientativa, no vinculante).'
          : ''}
      </p>
      <table className="opciones">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col.clave}>{col.titulo}</th>
            ))}
            {hayMarca && <th></th>}
          </tr>
        </thead>
        <tbody>
          {celda.opciones.map((o, i) => {
            const esEsfera = estimacion?.filaEsfera === o
            const esCilindro = estimacion?.filaCilindro === o
            const clases = [
              o.recomendada ? 'destacada' : '',
              esEsfera ? 'elegida-esfera' : '',
              esCilindro ? 'elegida-cilindro' : '',
              !o.recomendada && !esEsfera && !esCilindro && lentesMarcadas.has(claveDeLente(o))
                ? 'misma-lente'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
            // Dos clases de etiqueta, siempre separadas y visibles: la del criterio
            // propio (en color pleno) y la que marcó la propia web, aunque las dos
            // caigan en la misma fila (D130).
            const marcas = (
              <>
                {esEsfera && <span className="etiqueta etiqueta-elegida">★ Esfera elegida</span>}
                {esCilindro && (
                  <span className="etiqueta etiqueta-elegida">★ Cilindro elegido</span>
                )}
                {o.recomendada && (
                  <span className="etiqueta etiqueta-web">◆ Marcada por {celda.nombre}</span>
                )}
              </>
            )
            return (
              <tr key={i} className={clases}>
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
                {hayMarca && <td className="marca">{marcas}</td>}
              </tr>
            )
          })}
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
  const [rutasResumen, setRutasResumen] = useState<readonly { ojo: Lateralidad; ruta: string }[]>(
    [],
  )
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Apagado por defecto (D105, 29/09/2026): petición expresa del dueño del
  // proyecto para dejar de enseñar la estimación propia (D43) bajo cada
  // captura y en su cuadro de tarjetas.
  const [incluirEstimacionCompleta, setIncluirEstimacionCompleta] = useState(false)
  // Apagado por defecto (D120, 06/10/2026): petición expresa del dueño — el
  // PDF normal sale limpio, sin estimación ni tabla, salvo que se marquen.
  const [incluirTablaComparativaDetallada, setIncluirTablaComparativaDetallada] = useState(false)

  // Las cinco casillas de siempre (D45/D48): Predicted y Measured PCA de EVO
  // y de Barrett, más Kane — la que no se haya pedido para este ojo y
  // aparato sale como «no calculada» en su columna, no desaparece. El PDF
  // final (generar()) junta todos los aparatos ACTIVOS del ojo (decisión 3,
  // D47) — uno excluido (D100) no sale ahí, aunque siga eligible aquí para
  // inspeccionarlo o volver a incluirlo. Este detalle en pantalla es solo
  // para inspeccionar un aparato a la vez.
  const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
  for (const c of COLUMNAS_COMPARATIVA) {
    const r = resultadoDe(caso, c, ojoActivo, aparatoActivo)
    if (r) resultados[c] = r
  }
  const comparativa = compararOjo(ojoActivo, resultados as never, COLUMNAS_COMPARATIVA)

  // La elección según el criterio propio (D43/D52), para cada calculadora de este
  // ojo y aparato: se resalta en la comparación y en cada tabla (D130).
  const ejeCurvo = ejeCurvoDe(ojoDe(caso, ojoActivo, aparatoActivo))
  const criterioEsfera = criterioEsferaPara(caso.lente?.modelo)
  const estimaciones = new Map<Calculadora, EstimacionConFilas | undefined>(
    comparativa.celdas.map((c) => [
      c.calculadora,
      estimarConFilas(c.opciones, ejeCurvo, criterioEsfera),
    ]),
  )

  const pantallaRef = useRef<HTMLDivElement | null>(null)
  const [generandoPantalla, setGenerandoPantalla] = useState(false)
  const [rutaPantalla, setRutaPantalla] = useState<string | null>(null)

  /**
   * PDF de ESTA pantalla (D129): la comparación y el detalle de cada calculadora
   * del ojo que se está viendo, tal como se ven, con sus colores. Opcional (solo
   * se crea al pulsar el botón) y se guarda en la carpeta «Resúmenes» de ese ojo.
   */
  async function crearPdfDePantalla(): Promise<void> {
    const zona = pantallaRef.current
    if (!zona) return
    setGenerandoPantalla(true)
    setError(null)
    try {
      const html = htmlDePantalla(zona, nombreLateralidad(ojoActivo), caso.codigo)
      const r = await api().generarPdfPantalla({ ojo: ojoActivo, html })
      setRutaPantalla(r.ruta)
    } catch (e) {
      setError(
        `No se ha podido crear el PDF de esta pantalla. ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setGenerandoPantalla(false)
    }
  }

  // Un PDF suelto por ojo, en el sitio que se elija (cuadro «Guardar como»):
  // para quien solo lo quiere en una carpeta temporal. No toca las carpetas
  // del programa.
  const [guardandoOjo, setGuardandoOjo] = useState<Lateralidad | null>(null)
  const [rutaGuardada, setRutaGuardada] = useState<{ ojo: Lateralidad; ruta: string } | null>(null)
  const ojosConResultado = ojos.filter((o) =>
    COLUMNAS_COMPARATIVA.some((c) => resultadoDe(caso, c, o) !== undefined),
  )
  async function guardarPdfDe(ojo: Lateralidad): Promise<void> {
    setGuardandoOjo(ojo)
    setError(null)
    try {
      const r = await api().guardarPdfDeOjo({
        ojo,
        incluirEstimacionCompleta,
        incluirTablaComparativaDetallada,
      })
      if (r) setRutaGuardada({ ojo, ruta: r.ruta })
    } catch (e) {
      setError(
        `No se ha podido guardar el PDF. ${e instanceof Error ? e.message : String(e)} ` +
          'Tus resultados siguen aquí: puedes intentarlo otra vez.',
      )
    } finally {
      setGuardandoOjo(null)
    }
  }

  async function generar(soloResumen: boolean): Promise<void> {
    setGenerando(true)
    setError(null)
    try {
      const r = await api().generarPdf({
        incluirEstimacionCompleta,
        incluirTablaComparativaDetallada,
        soloResumen,
      })
      if (soloResumen) setRutasResumen(r.rutasResumen)
      else setRutas(r.rutas)
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
            {aparatos.map((a) => {
              // Excluido (D100) sigue eligible para inspeccionarlo o volver
              // a incluirlo desde la pantalla de revisión — solo desaparece
              // del cálculo y del informe, nunca de aquí.
              const excluido = ojoDe(caso, ojoActivo, a).excluido === true
              return (
                <button
                  key={a}
                  className={a === aparatoActivo ? 'activo' : ''}
                  onClick={() => onCambiarAparato(a)}
                  style={excluido ? { opacity: 0.6 } : undefined}
                  title={excluido ? 'Excluido del cálculo y del informe' : undefined}
                >
                  {excluido ? `${a} (excluido)` : a}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div id="pantalla-resultados" ref={pantallaRef}>
        <div className="tarjeta">
          <div className="cabecera-resultados">
            <h2>
              Comparación · {nombreLateralidad(ojoActivo)}
              {aparatos.length > 1 ? ` — ${aparatoActivo}` : ''}
            </h2>
            <span className="sin-impresion">
              <button
                className="claro"
                onClick={() => void crearPdfDePantalla()}
                disabled={generandoPantalla}
                data-testid="pdf-de-esta-pantalla"
                title="Crea un PDF con esta comparación y el detalle de cada calculadora, y lo guarda en la carpeta «Resúmenes» de este ojo"
              >
                {generandoPantalla ? 'Creando PDF…' : 'Crear PDF de esta pantalla'}
              </button>
            </span>
          </div>
          {rutaPantalla && (
            <div className="aviso exito sin-impresion" data-testid="ruta-pdf-pantalla">
              PDF guardado en <code>{rutaPantalla}</code>
            </div>
          )}
          <div className="contenedor-comparativa">
            <table className="comparativa" data-testid="tabla-comparativa">
              <thead>
                <tr>
                  <th></th>
                  {comparativa.celdas.map((c) => (
                    <th key={c.calculadora} className={claseDeCalculadora(c.calculadora)}>
                      {c.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="separador">
                  <th colSpan={comparativa.celdas.length + 1}>
                    Elección propia · estimación orientativa, no vinculante
                  </th>
                </tr>
                <tr className="fila-eleccion" data-testid="fila-esfera-elegida">
                  <th>Esfera elegida</th>
                  {comparativa.celdas.map((c) => {
                    const e = estimaciones.get(c.calculadora)
                    return e ? (
                      <td
                        key={c.calculadora}
                        className={`${claseDeCalculadora(c.calculadora)} eleccion`}
                      >
                        <strong>{e.lente.esfera.toFixed(2)} D</strong>
                        {e.lente.refraccionPrevista !== undefined && (
                          <small>refracción {e.lente.refraccionPrevista.toFixed(2)} D</small>
                        )}
                      </td>
                    ) : (
                      <td key={c.calculadora} className={`${claseDeCalculadora(c.calculadora)} na`}>
                        —
                      </td>
                    )
                  })}
                </tr>
                <tr className="fila-eleccion" data-testid="fila-cilindro-elegido">
                  <th>Cilindro elegido</th>
                  {comparativa.celdas.map((c) => {
                    const e = estimaciones.get(c.calculadora)
                    return e?.lente.cilindro !== undefined ? (
                      <td
                        key={c.calculadora}
                        className={`${claseDeCalculadora(c.calculadora)} eleccion`}
                      >
                        <strong>{e.lente.cilindro.toFixed(2)} D</strong>
                        {e.lente.ejeResidual !== undefined && (
                          <small>
                            residual{' '}
                            {e.lente.cilindroResidual !== undefined
                              ? `${e.lente.cilindroResidual.toFixed(2)} D `
                              : ''}
                            @ {e.lente.ejeResidual.toFixed(0)}°
                          </small>
                        )}
                      </td>
                    ) : (
                      <td key={c.calculadora} className={`${claseDeCalculadora(c.calculadora)} na`}>
                        —
                      </td>
                    )
                  })}
                </tr>
                <tr className="separador">
                  <th colSpan={comparativa.celdas.length + 1}>Lo que respondió cada calculadora</th>
                </tr>
                <tr>
                  <th>Esfera</th>
                  {comparativa.celdas.map((c) => (
                    <CeldaDato
                      key={c.calculadora}
                      dato={c.esfera}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
                      sufijo=" D"
                    />
                  ))}
                </tr>
                <tr>
                  <th>Cilindro</th>
                  {comparativa.celdas.map((c) => (
                    <CeldaDato
                      key={c.calculadora}
                      dato={c.cilindro}
                      elegida={estimaciones.get(c.calculadora)?.filaCilindro?.cilindro}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
                      sufijo=" D"
                    />
                  ))}
                </tr>
                <tr>
                  <th>Eje</th>
                  {comparativa.celdas.map((c) => (
                    <CeldaDato
                      key={c.calculadora}
                      dato={c.eje}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
                      sufijo="°"
                      decimales={0}
                    />
                  ))}
                </tr>
                <tr>
                  <th>Modelo tórico</th>
                  {comparativa.celdas.map((c) => (
                    <CeldaTexto
                      key={c.calculadora}
                      dato={c.designacion}
                      elegida={estimaciones.get(c.calculadora)?.filaCilindro?.designacion}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
                    />
                  ))}
                </tr>
                <tr>
                  <th>Refracción prevista</th>
                  {comparativa.celdas.map((c) => (
                    <CeldaDato
                      key={c.calculadora}
                      dato={c.refraccionPrevista}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
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
                      elegida={estimaciones.get(c.calculadora)?.filaCilindro?.cilindroResidual}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
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
                      elegida={estimaciones.get(c.calculadora)?.filaCilindro?.ejeResidual}
                      nombre={c.nombre}
                      calc={claseDeCalculadora(c.calculadora)}
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
                      <td
                        key={c.calculadora}
                        className={`${claseDeCalculadora(c.calculadora)} estado-calculadora`}
                      >
                        {texto}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="pie-nota" data-testid="criterio-eleccion">
            Elección propia: la primera esfera con refracción prevista negativa (positiva en
            LuxSmart, LuxLife y LuxGood) y el cilindro tórico más alto que sigue compartiendo el
            eje. Es una estimación orientativa y no vinculante; lo que cada calculadora respondió de
            verdad está debajo y en su captura.
          </p>
        </div>

        {/*
        El detalle de las alternativas. Va aquí, debajo de la comparación, porque
        es lo primero que hace falta cuando una columna dice «3 opciones»: verlas.
      */}
        {comparativa.celdas.some((c) => c.opciones.length > 1) && (
          <div className="tarjeta">
            <h2>Opciones devueltas · {nombreLateralidad(ojoActivo)}</h2>
            {comparativa.celdas.map((c) => (
              <OpcionesDevueltas
                key={c.calculadora}
                celda={c}
                estimacion={estimaciones.get(c.calculadora)}
              />
            ))}
          </div>
        )}
      </div>

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
          <button className="claro" onClick={onVolverARevisar}>
            Volver a los datos
          </button>
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
        {rutasResumen.length > 0 && (
          <div className="aviso exito">
            <strong>
              {rutasResumen.length === 1 ? 'Resumen generado.' : 'Resúmenes generados.'}
            </strong>
            {rutasResumen.map((r) => (
              <div key={r.ojo}>
                {nombreLateralidad(r.ojo)}: <code>{r.ruta}</code>
              </div>
            ))}
          </div>
        )}
        <label className="fila" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={incluirEstimacionCompleta}
            onChange={(e) => setIncluirEstimacionCompleta(e.target.checked)}
            data-testid="incluir-estimacion-completa"
          />
          <span>Incluir la estimación propia bajo cada captura y en un cuadro de tarjetas</span>
        </label>
        <label className="fila" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={incluirTablaComparativaDetallada}
            onChange={(e) => setIncluirTablaComparativaDetallada(e.target.checked)}
            data-testid="incluir-tabla-comparativa-detallada"
          />
          <span>
            Incluir la tabla comparativa detallada del final
            <span className="pie-nota" style={{ display: 'block' }}>
              Con las dos casillas apagadas (lo normal), el PDF solo lleva los pantallazos.
            </span>
          </span>
        </label>
        <div className="fila derecha">
          {rutas.length > 0 && (
            <button onClick={() => void api().abrirCarpetaInformes()}>Abrir la carpeta</button>
          )}
          <button
            className="principal grande"
            onClick={() => void generar(false)}
            disabled={generando}
            data-testid="generar-pdf"
          >
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
        {ojosConResultado.length > 0 && (
          <>
            <p className="pie-nota" style={{ marginTop: 14 }}>
              Guardar el PDF de un ojo donde tú elijas (por ejemplo, una carpeta temporal). No se
              guarda en las carpetas del programa.
            </p>
            {rutaGuardada && (
              <div className="aviso exito" data-testid="ruta-pdf-guardado">
                PDF del {nombreLateralidad(rutaGuardada.ojo)} guardado en{' '}
                <code>{rutaGuardada.ruta}</code>
              </div>
            )}
            <div className="fila derecha">
              {ojosConResultado.map((o) => (
                <button
                  key={o}
                  className="claro"
                  onClick={() => void guardarPdfDe(o)}
                  disabled={guardandoOjo !== null || generando}
                  data-testid={`guardar-pdf-${o}`}
                >
                  {guardandoOjo === o
                    ? 'Guardando…'
                    : `Guardar PDF del ${nombreLateralidad(o)} en…`}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="pie-nota" style={{ marginTop: 14 }}>
          PDF resumen: sin capturas, con los datos de entrada, el cuadro de tarjetas y la tabla
          comparativa. Se guarda solo en la carpeta «Resúmenes» del doctor. No depende de las
          casillas de arriba.
        </p>
        <div className="fila derecha">
          <button
            className="claro"
            onClick={() => void generar(true)}
            disabled={generando}
            data-testid="generar-resumen-aparte"
          >
            PDF resumen
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
