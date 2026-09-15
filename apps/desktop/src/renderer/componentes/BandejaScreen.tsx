/**
 * BandejaScreen.tsx — La cola de avisos de los delegados (D81, 15/09/2026;
 * carpeta de entrada por prioridad D84, 16/09/2026).
 *
 * Petición expresa del dueño del proyecto: recibe casos por WhatsApp de
 * varios delegados y necesita un sitio único, ordenado por prioridad, desde
 * el que ir trabajándolos. Solo se automatiza LA ORGANIZACIÓN —la lista se
 * ordena sola (`ordenarBandeja`) y el estado de cada entrada se lee del
 * caso real una vez enganchada, sin que nadie tenga que actualizarlo a
 * mano—; recibir el aviso y reenviar el PDF sigue siendo cosa de la
 * persona, por WhatsApp, fuera de esta pantalla.
 *
 * **La carpeta de entrada** (D84) automatiza solo el primer paso —apuntar
 * el aviso—: el dueño guarda las fotos en una carpeta de OneDrive
 * compartida con el móvil, clasificadas a mano en tres subcarpetas
 * (Alta/Normal/Baja); «Buscar fotos nuevas» las detecta y crea un aviso
 * por cada una, ya enganchado a su foto (`rutaFoto`) — «Empezar» la carga
 * y la lee sola, en `onEmpezarCaso`.
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import { NOMBRE_ESTADO, NOMBRE_PRIORIDAD } from '@vilamar/domain'
import type { EntradaBandeja, PrioridadBandeja } from '@vilamar/domain'

import type { ResumenCasoGuardado } from '../../compartido/ipc.js'
import { api } from '../api.js'

interface Props {
  /** Sin caso vinculado todavía: crea uno y engancha esta entrada. */
  readonly onEmpezarCaso: (entrada: EntradaBandeja) => Promise<void>
  /** Ya vinculada: abre el caso que ya existe. */
  readonly onAbrirCasoVinculado: (codigo: string) => Promise<void>
  readonly onVolver: () => void
}

interface FormularioEntrada {
  readonly id: string | null
  readonly delegado: string
  readonly descripcion: string
  readonly prioridad: PrioridadBandeja
  readonly notas: string
}

const FORMULARIO_VACIO: FormularioEntrada = {
  id: null,
  delegado: '',
  descripcion: '',
  prioridad: 'NORMAL',
  notas: '',
}

// Petición expresa del dueño (16/09/2026): un color por prioridad, para
// verla de un vistazo — Baja en verde, Normal en azul, Urgente en rojo.
// `CLASE_FILA_PRIORIDAD` tiñe la fila entera; esto, además, el texto de
// la propia palabra, para que se lea igual de claro sobre el fondo.
const COLOR_PRIORIDAD: Readonly<Record<PrioridadBandeja, string>> = {
  URGENTE: 'var(--rojo)',
  NORMAL: 'var(--azul)',
  BAJA: 'var(--verde)',
}

const CLASE_FILA_PRIORIDAD: Readonly<Record<PrioridadBandeja, string>> = {
  URGENTE: 'bandeja-urgente',
  NORMAL: 'bandeja-normal',
  BAJA: 'bandeja-baja',
}

function fecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** El estado que se enseña: el del caso vinculado, no uno propio inventado. */
function estadoDe(entrada: EntradaBandeja, casos: readonly ResumenCasoGuardado[] | null): string {
  if (entrada.enviado) return 'Enviado'
  if (entrada.casoCodigo === null) return 'Sin empezar'
  const caso = casos?.find((c) => c.codigo === entrada.casoCodigo)
  if (!caso) return 'Sin empezar'
  return NOMBRE_ESTADO[caso.estado]
}

export function BandejaScreen({
  onEmpezarCaso,
  onAbrirCasoVinculado,
  onVolver,
}: Props): JSX.Element {
  const [entradas, setEntradas] = useState<readonly EntradaBandeja[] | null>(null)
  const [casos, setCasos] = useState<readonly ResumenCasoGuardado[] | null>(null)
  const [form, setForm] = useState<FormularioEntrada>(FORMULARIO_VACIO)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carpetaEntrada, setCarpetaEntrada] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [avisoBusqueda, setAvisoBusqueda] = useState<string | null>(null)

  function cargar(): void {
    void api()
      .listarBandeja()
      .then(setEntradas)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    void api().listarCasosGuardados().then(setCasos)
  }

  useEffect(cargar, [])
  useEffect(() => {
    void api().obtenerCarpetaEntrada().then(setCarpetaEntrada)
  }, [])

  async function elegirCarpeta(): Promise<void> {
    setError(null)
    setAvisoBusqueda(null)
    try {
      const ruta = await api().elegirYConfigurarCarpetaEntrada()
      if (ruta) setCarpetaEntrada(ruta)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function buscarFotos(): Promise<void> {
    setError(null)
    setAvisoBusqueda(null)
    setBuscando(true)
    try {
      const antes = entradas?.length ?? 0
      const siguientes = await api().buscarFotosNuevasEnCarpeta()
      setEntradas(siguientes)
      const nuevas = siguientes.length - antes
      setAvisoBusqueda(
        nuevas > 0
          ? `Se ${nuevas === 1 ? 'ha' : 'han'} añadido ${nuevas} aviso${nuevas === 1 ? '' : 's'} nuevo${nuevas === 1 ? '' : 's'}.`
          : 'No hay fotos nuevas en la carpeta de entrada.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBuscando(false)
    }
  }

  function editar(e: EntradaBandeja): void {
    setError(null)
    setForm({
      id: e.id,
      delegado: e.delegado,
      descripcion: e.descripcion,
      prioridad: e.prioridad,
      notas: e.notas,
    })
  }

  async function guardar(): Promise<void> {
    setError(null)
    if (form.delegado.trim() === '') {
      setError('Falta decir de qué delegado viene el aviso.')
      return
    }
    setOcupado(true)
    try {
      const datos = {
        delegado: form.delegado.trim(),
        descripcion: form.descripcion.trim(),
        prioridad: form.prioridad,
        notas: form.notas.trim(),
      }
      setEntradas(
        form.id === null
          ? await api().crearEntradaBandeja(datos)
          : await api().editarEntradaBandeja(form.id, datos),
      )
      setForm(FORMULARIO_VACIO)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar(id: string): Promise<void> {
    setError(null)
    setOcupado(true)
    try {
      setEntradas(await api().eliminarEntradaBandeja(id))
      if (form.id === id) setForm(FORMULARIO_VACIO)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function marcarEnviado(id: string, enviado: boolean): Promise<void> {
    setError(null)
    setOcupado(true)
    try {
      setEntradas(await api().marcarEntradaBandejaEnviada(id, enviado))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function empezarOAbrir(entrada: EntradaBandeja): Promise<void> {
    setError(null)
    setOcupado(true)
    try {
      if (entrada.casoCodigo === null) {
        await onEmpezarCaso(entrada)
      } else {
        await onAbrirCasoVinculado(entrada.casoCodigo)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Bandeja de casos</h2>
      <p className="pie-nota" style={{ marginTop: -6, marginBottom: 12 }}>
        Apunta aquí cada aviso que te llega de un delegado, con su prioridad — la lista se ordena
        sola. Recibir el mensaje y reenviar el PDF sigue siendo por WhatsApp, fuera de la
        aplicación; el estado de cada entrada se lee del caso en cuanto la empiezas a trabajar, sin
        que tengas que actualizarlo a mano.
      </p>

      <div className="tarjeta-seccion" style={{ marginBottom: 16 }}>
        <h3>Carpeta de entrada</h3>
        <p className="pie-nota" style={{ marginTop: -4, marginBottom: 8 }}>
          Fotos de biometría que llegan por WhatsApp, guardadas en OneDrive en las subcarpetas
          Alta/Normal/Baja. Una foto suelta fuera de esas tres cuenta como prioridad Normal.
        </p>
        <div className="fila" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="sub" data-testid="carpeta-entrada-ruta">
            {carpetaEntrada ?? 'Todavía no has elegido ninguna carpeta.'}
          </span>
          <button onClick={() => void elegirCarpeta()} data-testid="elegir-carpeta-entrada">
            {carpetaEntrada ? 'Cambiar carpeta…' : 'Elegir carpeta…'}
          </button>
          <button
            className="principal"
            onClick={() => void buscarFotos()}
            disabled={!carpetaEntrada || buscando}
            data-testid="buscar-fotos-nuevas"
          >
            {buscando ? 'Buscando…' : 'Buscar fotos nuevas'}
          </button>
        </div>
        {avisoBusqueda && (
          <p className="sub" style={{ marginTop: 8 }} data-testid="aviso-busqueda-fotos">
            {avisoBusqueda}
          </p>
        )}
      </div>

      {error && (
        <div className="aviso error" role="alert">
          {error}
        </div>
      )}

      {entradas === null && <p className="sub">Buscando…</p>}
      {entradas !== null && entradas.length === 0 && (
        <p className="sub">Todavía no has apuntado ningún aviso.</p>
      )}
      {entradas !== null && entradas.length > 0 && (
        <table className="revision" data-testid="tabla-bandeja">
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Delegado</th>
              <th>Descripción</th>
              <th>Notas</th>
              <th>Llegó</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr
                key={e.id}
                className={CLASE_FILA_PRIORIDAD[e.prioridad]}
                data-testid={`fila-bandeja-${e.id}`}
              >
                <td style={{ color: COLOR_PRIORIDAD[e.prioridad], fontWeight: 600 }}>
                  {NOMBRE_PRIORIDAD[e.prioridad]}
                </td>
                <td>{e.delegado}</td>
                <td>{e.descripcion || '—'}</td>
                <td>{e.notas || '—'}</td>
                <td>{fecha(e.creadoEn)}</td>
                <td data-testid={`estado-bandeja-${e.id}`}>{estadoDe(e, casos)}</td>
                <td>
                  <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="principal"
                      onClick={() => void empezarOAbrir(e)}
                      disabled={ocupado}
                      data-testid={`empezar-bandeja-${e.id}`}
                    >
                      {e.casoCodigo === null ? 'Empezar' : 'Abrir caso'}
                    </button>
                    {e.casoCodigo !== null && (
                      <button
                        onClick={() => void marcarEnviado(e.id, !e.enviado)}
                        disabled={ocupado}
                        data-testid={`marcar-enviado-bandeja-${e.id}`}
                      >
                        {e.enviado ? 'Marcar pendiente' : 'Marcar enviado'}
                      </button>
                    )}
                    <button onClick={() => editar(e)} disabled={ocupado}>
                      Editar
                    </button>
                    <button onClick={() => void eliminar(e.id)} disabled={ocupado}>
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="separador" />

      <h3>{form.id === null ? 'Nuevo aviso' : `Editando el aviso de ${form.delegado}`}</h3>
      <div className="fila" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <label htmlFor="bandeja-delegado">Delegado</label>
          <input
            id="bandeja-delegado"
            value={form.delegado}
            data-testid="bandeja-delegado"
            onChange={(ev) => setForm((f) => ({ ...f, delegado: ev.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="bandeja-descripcion">Descripción (paciente, referencia…)</label>
          <input
            id="bandeja-descripcion"
            value={form.descripcion}
            data-testid="bandeja-descripcion"
            onChange={(ev) => setForm((f) => ({ ...f, descripcion: ev.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="bandeja-prioridad">Prioridad</label>
          <select
            id="bandeja-prioridad"
            value={form.prioridad}
            data-testid="bandeja-prioridad"
            onChange={(ev) =>
              setForm((f) => ({ ...f, prioridad: ev.target.value as PrioridadBandeja }))
            }
          >
            <option value="URGENTE">Urgente</option>
            <option value="NORMAL">Normal</option>
            <option value="BAJA">Baja</option>
          </select>
        </div>
        <div>
          <label htmlFor="bandeja-notas">Notas</label>
          <input
            id="bandeja-notas"
            value={form.notas}
            data-testid="bandeja-notas"
            onChange={(ev) => setForm((f) => ({ ...f, notas: ev.target.value }))}
          />
        </div>
      </div>
      <div className="fila" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="principal"
          onClick={() => void guardar()}
          disabled={ocupado}
          data-testid="guardar-bandeja"
        >
          {form.id === null ? 'Añadir a la bandeja' : 'Guardar cambios'}
        </button>
        {form.id !== null && (
          <button onClick={() => setForm(FORMULARIO_VACIO)} disabled={ocupado}>
            Cancelar edición
          </button>
        )}
      </div>

      <div className="separador" />

      <div className="fila">
        <button onClick={onVolver} disabled={ocupado} data-testid="volver-de-bandeja">
          Volver
        </button>
      </div>
    </div>
  )
}
