/**
 * AnalisisScreen.tsx — «Análisis de resultados» (instrucciones del dueño,
 * 21/10/2026).
 *
 * Buscar casos ya hechos —entre fechas, por lente, por doctor, y también por
 * ojo, calculadora usada, texto (código o paciente) y si se incluyen los que
 * quedaron a medias— y verlos resumidos: cuántos casos y ojos, quién y con qué
 * lente, qué calculadoras, mes a mes. Al lado de cada caso encontrado hay un
 * botón para ir directamente a su resultado. La búsqueda se puede guardar en un
 * CSV para Excel (sin el nombre del paciente).
 *
 * Como el dashboard, no guarda nada: es una vista sobre los casos que ya hay.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import { COLUMNAS_COMPARATIVA, NOMBRE_ESTADO, fichaDe } from '@vilamar/domain'
import type { Calculadora, FiltroAnalisis, Lateralidad, ResultadoAnalisis } from '@vilamar/domain'

import { api } from '../api.js'
import { CASOS_POR_PAGINA } from './CasosGuardados.js'
import { GraficoBarras } from './DashboardScreen.js'

interface Props {
  readonly onAbrirResultado: (codigo: string) => Promise<void>
  readonly onVolver: () => void
}

function fecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function Dato({ titulo, valor }: { readonly titulo: string; readonly valor: string | number }) {
  return (
    <div className="tarjeta-seccion" style={{ minWidth: 130, textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{valor}</div>
      <div className="sub">{titulo}</div>
    </div>
  )
}

export function AnalisisScreen({ onAbrirResultado, onVolver }: Props): JSX.Element {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [doctor, setDoctor] = useState('')
  const [lente, setLente] = useState('')
  const [ojo, setOjo] = useState<'' | Lateralidad>('')
  const [calculadora, setCalculadora] = useState<'' | Calculadora>('')
  const [texto, setTexto] = useState('')
  const [incluirAMedias, setIncluirAMedias] = useState(false)

  const [resultado, setResultado] = useState<ResultadoAnalisis | null>(null)
  const [pagina, setPagina] = useState(0)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [creandoExcel, setCreandoExcel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtro: FiltroAnalisis = {
    ...(desde !== '' || hasta !== ''
      ? { rango: { ...(desde !== '' ? { desde } : {}), ...(hasta !== '' ? { hasta } : {}) } }
      : {}),
    ...(doctor !== '' ? { doctor } : {}),
    ...(lente !== '' ? { lente } : {}),
    ...(ojo !== '' ? { ojo } : {}),
    ...(calculadora !== '' ? { calculadora } : {}),
    ...(texto.trim() !== '' ? { texto: texto.trim() } : {}),
    ...(incluirAMedias ? { incluirAMedias } : {}),
  }
  const clave = JSON.stringify(filtro)

  // La búsqueda se repite sola al cambiar cualquier filtro.
  useEffect(() => {
    let vigente = true
    setPagina(0)
    void api()
      .analizarCasos(JSON.parse(clave) as FiltroAnalisis)
      .then((r) => {
        if (vigente) setResultado(r)
      })
      .catch((e) => {
        if (vigente) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      vigente = false
    }
  }, [clave])

  function limpiar(): void {
    setDesde('')
    setHasta('')
    setDoctor('')
    setLente('')
    setOjo('')
    setCalculadora('')
    setTexto('')
    setIncluirAMedias(false)
  }

  async function abrir(codigo: string): Promise<void> {
    setError(null)
    setAbriendo(codigo)
    try {
      await onAbrirResultado(codigo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAbriendo(null)
    }
  }

  async function crearExcelDeEstudio(): Promise<void> {
    setError(null)
    setAviso(null)
    setCreandoExcel(true)
    try {
      const r = await api().exportarEstudioExcel(filtro)
      if (r) setAviso(`Excel de estudio guardado (${r.filas} filas) en ${r.ruta}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreandoExcel(false)
    }
  }

  async function exportar(): Promise<void> {
    setError(null)
    setAviso(null)
    try {
      const r = await api().exportarAnalisis(filtro)
      if (r) setAviso(`Análisis guardado en ${r.ruta}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const filas = resultado?.filas ?? []
  const paginas = Math.max(1, Math.ceil(filas.length / CASOS_POR_PAGINA))

  return (
    <div className="tarjeta" data-testid="pantalla-analisis">
      <h2>Análisis de resultados</h2>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        Busca casos ya hechos y míralos resumidos. Se cuenta por ojo calculado. Cada caso encontrado
        tiene su botón para ir directamente al resultado.
      </p>

      <div className="fila" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="analisis-desde">Desde</label>
          <input
            id="analisis-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            data-testid="analisis-desde"
          />
        </div>
        <div>
          <label htmlFor="analisis-hasta">Hasta</label>
          <input
            id="analisis-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            data-testid="analisis-hasta"
          />
        </div>
        <div>
          <label htmlFor="analisis-doctor">Doctor</label>
          <select
            id="analisis-doctor"
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            data-testid="analisis-doctor"
          >
            <option value="">Todos</option>
            {(resultado?.opciones.doctores ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="analisis-lente">Lente</label>
          <select
            id="analisis-lente"
            value={lente}
            onChange={(e) => setLente(e.target.value)}
            data-testid="analisis-lente"
          >
            <option value="">Todas</option>
            {(resultado?.opciones.lentes ?? []).map((l) => (
              <option key={l.clave} value={l.clave}>
                {l.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="fila"
        style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}
      >
        <div>
          <label htmlFor="analisis-ojo">Ojo</label>
          <select
            id="analisis-ojo"
            value={ojo}
            onChange={(e) => setOjo(e.target.value as '' | Lateralidad)}
            data-testid="analisis-ojo"
          >
            <option value="">Los dos</option>
            <option value="OD">Ojo derecho (OD)</option>
            <option value="OS">Ojo izquierdo (OS)</option>
          </select>
        </div>
        <div>
          <label htmlFor="analisis-calculadora">Calculadora usada</label>
          <select
            id="analisis-calculadora"
            value={calculadora}
            onChange={(e) => setCalculadora(e.target.value as '' | Calculadora)}
            data-testid="analisis-calculadora"
          >
            <option value="">Cualquiera</option>
            {COLUMNAS_COMPARATIVA.map((c) => (
              <option key={c} value={c}>
                {fichaDe(c).nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="analisis-texto">Código o paciente</label>
          <input
            id="analisis-texto"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="CV-2026-… o nombre"
            data-testid="analisis-texto"
          />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={incluirAMedias}
            onChange={(e) => setIncluirAMedias(e.target.checked)}
            data-testid="analisis-a-medias"
          />
          Incluir los que quedaron a medias
        </label>
        <button onClick={limpiar} data-testid="analisis-limpiar">
          Quitar filtros
        </button>
      </div>

      {error && (
        <div className="aviso error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      {aviso && (
        <div className="aviso exito" style={{ marginTop: 12 }} data-testid="analisis-aviso">
          {aviso}
        </div>
      )}

      {resultado === null && !error && <p className="sub">Buscando…</p>}

      {resultado !== null && (
        <>
          <div
            className="fila"
            style={{ gap: 12, flexWrap: 'wrap', margin: '16px 0' }}
            data-testid="analisis-resumen"
          >
            <Dato titulo="casos" valor={resultado.totalCasos} />
            <Dato titulo="ojos calculados" valor={resultado.totalOjos} />
            <Dato titulo="ojo derecho" valor={resultado.ojosOD} />
            <Dato titulo="ojo izquierdo" valor={resultado.ojosOS} />
            <Dato titulo="casos con algún fallo" valor={resultado.casosConFallos} />
          </div>

          {resultado.totalCasos > 0 && (
            <div className="fila" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <GraficoBarras
                  titulo="Por doctor (ojos)"
                  datos={resultado.porDoctor}
                  color="var(--azul)"
                  testId="analisis-por-doctor"
                />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <GraficoBarras
                  titulo="Por lente (ojos)"
                  datos={resultado.porLente}
                  color="var(--verde)"
                  testId="analisis-por-lente"
                />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <GraficoBarras
                  titulo="Calculadoras usadas"
                  datos={resultado.porCalculadora.map((c) => ({
                    etiqueta: fichaDe(c.etiqueta as Calculadora).nombre,
                    cantidad: c.cantidad,
                  }))}
                  color="var(--calc-kane, #7c3aed)"
                  testId="analisis-por-calculadora"
                />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <GraficoBarras
                  titulo="Mes a mes (ojos)"
                  datos={resultado.porMes}
                  color="var(--calc-evo, #0f766e)"
                  testId="analisis-por-mes"
                />
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 18 }}>Casos encontrados</h3>
          {filas.length === 0 && (
            <p className="sub" data-testid="analisis-vacio">
              Ningún caso cumple esos filtros.
            </p>
          )}
          {filas.length > 0 && (
            <table className="revision" data-testid="tabla-analisis">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Fecha</th>
                  <th>Doctor</th>
                  <th>Lente</th>
                  <th>Ojos</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas
                  .slice(pagina * CASOS_POR_PAGINA, (pagina + 1) * CASOS_POR_PAGINA)
                  .map((f) => (
                    <tr key={f.codigo}>
                      <td>
                        {f.codigo}
                        {f.nombrePaciente ? (
                          <span className="sub" style={{ display: 'block' }}>
                            {f.nombrePaciente}
                          </span>
                        ) : null}
                      </td>
                      <td>{fecha(f.actualizadoEn)}</td>
                      <td>{f.doctor}</td>
                      <td>{f.lente}</td>
                      <td>{f.ojos.join(' + ') || '—'}</td>
                      <td>
                        {NOMBRE_ESTADO[f.estado]}
                        {f.fallos > 0 ? ` · ${f.fallos} con fallo` : ''}
                      </td>
                      <td>
                        <button
                          className="principal"
                          onClick={() => void abrir(f.codigo)}
                          disabled={abriendo !== null}
                          data-testid={`analisis-abrir-${f.codigo}`}
                        >
                          {abriendo === f.codigo
                            ? 'Abriendo…'
                            : f.estado === 'COMPLETADO'
                              ? 'Ver resultado'
                              : 'Abrir caso'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {filas.length > CASOS_POR_PAGINA && (
            <div
              className="fila"
              style={{ marginTop: 12, alignItems: 'center', gap: 12 }}
              data-testid="analisis-paginacion"
            >
              <button
                className="claro"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
                aria-label="Página anterior"
              >
                ◀
              </button>
              <span className="sub">
                Página {pagina + 1} de {paginas} · {filas.length} casos
              </span>
              <button
                className="claro"
                onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
                disabled={pagina + 1 >= paginas}
                aria-label="Página siguiente"
              >
                ▶
              </button>
            </div>
          )}
        </>
      )}

      <div className="fila" style={{ marginTop: 14, gap: 10 }}>
        <button className="claro" onClick={onVolver} disabled={abriendo !== null}>
          Volver
        </button>
        <button
          className="principal"
          onClick={() => void crearExcelDeEstudio()}
          disabled={filas.length === 0 || creandoExcel}
          data-testid="analisis-excel-estudio"
          title="Crea un Excel con los casos de esta búsqueda: paciente, nº de caso, fecha, biometría preoperatoria de cada aparato y la lente de cada calculadora"
        >
          {creandoExcel ? 'Creando Excel…' : 'Crear Excel de estudio'}
        </button>
        <button
          onClick={() => void exportar()}
          disabled={filas.length === 0}
          data-testid="analisis-exportar"
          title="Guarda esta lista en un fichero CSV que se abre con Excel (sin el nombre del paciente)"
        >
          Guardar en Excel (CSV)
        </button>
      </div>
    </div>
  )
}
