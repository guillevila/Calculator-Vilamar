/**
 * PanelResultados.tsx — Los tres resultados, juntos.
 *
 * La tabla comparativa y las observaciones. Las observaciones son descriptivas:
 * dicen en qué coinciden y en qué no. No dicen qué implantar, y no lo dirán.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import type {
  Calculadora,
  Caso,
  CeldaComparativa,
  DatoComparativo,
  FamiliaDeLente,
  Lateralidad,
  LenteDeCatalogo,
} from '@vilamar/domain'
import {
  CALCULADORAS,
  compararOjo,
  describirLenteDeCatalogo,
  familiaDeLente,
  lentesQueCubren,
  nombreLateralidad,
  ojosDelCaso,
  resultadoDe,
  sugerirOpcion,
  textoEstado,
} from '@vilamar/domain'

import type { EstadoCalculo } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly onCambiarOjo: (ojo: Lateralidad) => void
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

/**
 * Qué lentes del catálogo propio cubren la potencia de esta columna.
 *
 * Es un cruce contra inventario, no una elección: si varias cubren la misma
 * potencia, se enseñan todas juntas y sin distinguir ninguna — la misma regla
 * que ya rige el resto de esta tabla (`comparar.ts`, D14).
 */
function CeldaCatalogo({
  celda,
  catalogo,
}: {
  celda: CeldaComparativa
  catalogo: readonly LenteDeCatalogo[]
}): JSX.Element {
  if (catalogo.length === 0) {
    return (
      <td className="na" title="Todavía no has añadido ninguna lente en Ajustes">
        —
      </td>
    )
  }
  if (celda.esfera.estado !== 'VALOR') {
    return (
      <td className="na" title={`No hay una potencia de ${celda.nombre} con la que cruzar el catálogo`}>
        —
      </td>
    )
  }
  const cilindro = celda.cilindro.estado === 'VALOR' ? celda.cilindro.valor : undefined
  const coinciden = lentesQueCubren(catalogo, celda.esfera.valor, cilindro)
  if (coinciden.length === 0) {
    return (
      <td className="na" title="Ninguna lente de tu catálogo cubre esta potencia">
        Ninguna
      </td>
    )
  }
  return (
    <td title="Lentes de tu catálogo que cubren esta potencia. No se elige ninguna por ti.">
      {coinciden.map(describirLenteDeCatalogo).join(' · ')}
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
 *
 * `sugerencia` es distinta de `recomendada`, y se pinta distinta a propósito
 * (D14, y la cicatriz que documenta `comparar.ts`): `recomendada` es lo que
 * DESTACA LA WEB; `sugerencia` es una guía externa al programa —la del
 * fabricante para Envista/Lux, o el criterio clínico de sobrecorrección para
 * el cilindro tórico (ver `sugerencia-cirujano.ts`)— aplicada a esta tabla,
 * nunca un criterio inventado por Calculator Vilamar. Ninguna de las dos se
 * envía a ningún sitio ni sustituye la decisión de quien opera.
 */
function OpcionesDevueltas({
  celda,
  familia,
}: {
  celda: CeldaComparativa
  familia: FamiliaDeLente | undefined
}): JSX.Element | null {
  if (celda.opciones.length <= 1) return null

  const columnas = COLUMNAS_DE_OPCION.filter((col) =>
    celda.opciones.some((o) => o[col.clave] !== undefined),
  )
  if (columnas.length === 0) return null

  const senalada = celda.seleccion.clase === 'DESTACADA'
  const sugerencia = sugerirOpcion(celda.opciones, familia)

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
      {sugerencia && (
        <p className="sub sugerencia-criterio">
          <strong>Sugerencia:</strong> {sugerencia.motivo} Calculator Vilamar no la envía a
          ningún sitio ni la marca como confirmada.
        </p>
      )}
      <table className="opciones">
        <thead>
          <tr>
            {columnas.map((col) => (
              <th key={col.clave}>{col.titulo}</th>
            ))}
            {(senalada || sugerencia) && <th></th>}
          </tr>
        </thead>
        <tbody>
          {celda.opciones.map((o, i) => {
            const esLaSugerida = sugerencia?.opcion === o
            return (
              <tr
                key={i}
                className={`${o.recomendada ? 'destacada' : ''} ${esLaSugerida ? 'sugerida' : ''}`.trim()}
              >
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
                {(senalada || sugerencia) && (
                  <td className="marca">
                    {[
                      o.recomendada ? `Destacada por ${celda.nombre}` : '',
                      esLaSugerida ? 'Sugerencia' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PanelResultados({
  caso,
  ojoActivo,
  onCambiarOjo,
  onReintentar,
  onVolverARevisar,
  estados = [],
}: Props): JSX.Element {
  const ojos = ojosDelCaso(caso)
  const [pdf, setPdf] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState<readonly LenteDeCatalogo[]>([])

  useEffect(() => {
    void api()
      .catalogoLentes()
      .then(setCatalogo)
  }, [])

  const resultados: Partial<Record<Calculadora, ReturnType<typeof resultadoDe>>> = {}
  for (const c of CALCULADORAS) {
    const r = resultadoDe(caso, c, ojoActivo)
    if (r) resultados[c] = r
  }
  const comparativa = compararOjo(ojoActivo, resultados as never, [
    'KANE',
    'EVO_TORIC',
    'BARRETT_TORIC',
  ])
  const familia = familiaDeLente(caso.lente?.modelo)

  async function generar(): Promise<void> {
    setGenerando(true)
    setError(null)
    try {
      const r = await api().generarPdf()
      setPdf(r.ruta)
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

      <div className="tarjeta">
        <h2>Comparación · {nombreLateralidad(ojoActivo)}</h2>
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
              <th>De tu catálogo</th>
              {comparativa.celdas.map((c) => (
                <CeldaCatalogo key={c.calculadora} celda={c} catalogo={catalogo} />
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
            <OpcionesDevueltas key={c.calculadora} celda={c} familia={familia} />
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
          {CALCULADORAS.map((c) => {
            const r = resultadoDe(caso, c, ojoActivo)
            const fallo = !r || (r.estado !== 'SUCCESS' && r.estado !== 'PARTIAL')
            return (
              <button key={c} onClick={() => onReintentar(c)} disabled={!fallo && r !== undefined}>
                {fallo ? 'Reintentar' : 'Repetir'}{' '}
                {c === 'EVO_TORIC' ? 'EVO' : c === 'BARRETT_TORIC' ? 'Barrett' : 'Kane'}
              </button>
            )
          })}
          <button onClick={onVolverARevisar}>Volver a los datos</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Informe</h2>
        <p className="sub">
          Una carpeta con el informe comparativo —los datos confirmados, de dónde salió cada uno,
          los tres resultados y las diferencias entre ellos— y, junto a él, un PDF de una hoja por
          cada calculadora: la captura de su propia pantalla de resultados.
        </p>
        {error && <div className="aviso error">{error}</div>}
        {pdf && (
          <div className="aviso exito">
            <strong>Informes generados.</strong> Carpeta: <code>{pdf}</code>
          </div>
        )}
        <div className="fila derecha">
          {pdf && (
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
    </>
  )
}
