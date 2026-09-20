import { useEffect, useMemo, useState } from 'react'
import type { CampoBiometrico, Caso, Lateralidad, Sexo } from '@vilamar/domain'
import { APARATO_PRINCIPAL, REGISTRO_CAMPOS } from '@vilamar/domain'

import { api, ErrorApi } from '../api.js'
// El mismo catálogo de lentes conocidas que ya usa la app de escritorio —
// reutilizado tal cual (no copiado) para no transcribir dos veces una
// constante clínica (D69 ya tuvo un error de transcripción una vez). Datos
// puros, sin React ni nada de Electron (`catalogoLentes.ts`, sacado el
// 20/09/2026 de `SelectorLente.tsx` justo para este reuso).
import { MODELOS_DE_LAS_CALCULADORAS } from '../../../desktop/src/renderer/catalogoLentes.js'

/**
 * Los campos que se enseñan en el móvil — todavía menos que en el ordenador
 * (AQD, TK1/TK2, situaciones especiales de córnea, factor de lente, índice
 * queratométrico… se quedan fuera, son informativos o de uso raro), pero
 * ampliado a petición del dueño (20/09/2026) con LT/CCT/WTW y la córnea
 * posterior medida (PK1/PK2), que sí se piden a menudo. Sin selector de
 * aparato: cada ojo usa aquí uno solo, el que ya tenga (una foto reconocida)
 * o «Principal» si se escribe a mano.
 */
const CAMPOS_BIOMETRIA: readonly CampoBiometrico[] = ['AL', 'K1', 'K1_EJE', 'K2', 'K2_EJE', 'ACD', 'LT', 'CCT', 'WTW']
const CAMPOS_CARA_POSTERIOR: readonly CampoBiometrico[] = ['PK1', 'PK1_EJE', 'PK2', 'PK2_EJE']
const CAMPOS_LENTE: readonly CampoBiometrico[] = ['REFRACCION_OBJETIVO', 'SIA', 'EJE_INCISION', 'CONSTANTE_A']

/** El valor de partida de un campo, cuando todavía no hay medida (D38/D46). */
const VALOR_POR_DEFECTO: Partial<Record<CampoBiometrico, string>> = {
  REFRACCION_OBJETIVO: '0',
  SIA: '0.25',
  EJE_INCISION: '135',
}

function aparatoDe(caso: Caso, lado: Lateralidad): string {
  return caso.ojos?.[lado]?.[0]?.aparato ?? APARATO_PRINCIPAL
}

/**
 * Igual que hace la app de escritorio (`FormularioManual.tsx`, `continuar()`):
 * un dataset que ya tiene ALGÚN dato pero nunca tocó el target, el SIA o su
 * eje —que ya se le enseñan con un valor de partida— se guarda igual con
 * ese valor antes de confirmar. Recorre los dos ojos, no solo el activo.
 */
async function aplicarValoresPorDefecto(inicial: Caso): Promise<Caso> {
  let actual = inicial
  for (const lado of ['OD', 'OS'] as const) {
    const dataset = actual.ojos?.[lado]?.[0]
    if (!dataset || Object.keys(dataset.medidas).length === 0) continue
    const ap = aparatoDe(actual, lado)
    if (dataset.medidas.REFRACCION_OBJETIVO === undefined) {
      actual = await api.editarMedida(lado, 'REFRACCION_OBJETIVO', 0, ap)
    }
    if (actual.ojos?.[lado]?.[0]?.medidas.SIA === undefined) {
      actual = await api.editarMedida(lado, 'SIA', 0.25, ap)
    }
    if (actual.ojos?.[lado]?.[0]?.medidas.EJE_INCISION === undefined) {
      actual = await api.editarMedida(lado, 'EJE_INCISION', 135, ap)
    }
  }
  return actual
}

export function Datos({
  caso,
  alCambiar,
  alConfirmar,
}: {
  readonly caso: Caso
  readonly alCambiar: (caso: Caso) => void
  readonly alConfirmar: (caso: Caso) => void
}): React.JSX.Element {
  const [lado, setLado] = useState<Lateralidad>('OD')
  const [nombrePaciente, setNombrePaciente] = useState(caso.nombrePaciente ?? '')
  const [nombreCirujano, setNombreCirujano] = useState(caso.nombreCirujano ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const aparato = useMemo(() => aparatoDe(caso, lado), [caso, lado])
  const ojo = caso.ojos?.[lado]?.[0]

  async function guardarIdentificacion(): Promise<void> {
    try {
      alCambiar(await api.establecerIdentificacion({ nombrePaciente, nombreCirujano }))
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido guardar.')
    }
  }

  async function cambiarSexo(sexo: Sexo): Promise<void> {
    try {
      alCambiar(await api.elegirSexo(sexo))
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido guardar el sexo.')
    }
  }

  async function guardarCampo(campo: CampoBiometrico, valor: number | null): Promise<void> {
    try {
      alCambiar(await api.editarMedida(lado, campo, valor, aparato))
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido guardar el dato.')
    }
  }

  async function elegirLenteCatalogo(modelo: string): Promise<void> {
    if (!modelo) return
    const encontrada = MODELOS_DE_LAS_CALCULADORAS.find((m) => m.modelo === modelo)
    try {
      alCambiar(
        await api.elegirLente({
          fabricante: encontrada?.fabricante ?? '',
          modelo,
          nombreEnEvo: encontrada?.nombreEnEvo,
          nombreEnKane: encontrada?.nombreEnKane,
          constanteConocida: encontrada?.constanteConocida,
        }),
      )
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido elegir la lente.')
    }
  }

  async function confirmar(): Promise<void> {
    setError(null)
    setConfirmando(true)
    try {
      alCambiar(await aplicarValoresPorDefecto(caso))
      const confirmado = await api.confirmarTodo()
      alConfirmar(confirmado)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido confirmar.')
    } finally {
      setConfirmando(false)
    }
  }

  const faltaIdentificacion = !nombrePaciente.trim() || !nombreCirujano.trim()

  return (
    <div className="pantalla">
      <h2>Datos del caso</h2>
      {error && <div className="aviso error">{error}</div>}

      <div className="campo">
        <label htmlFor="paciente">Paciente</label>
        <input
          id="paciente"
          value={nombrePaciente}
          onChange={(e) => setNombrePaciente(e.target.value)}
          onBlur={() => void guardarIdentificacion()}
        />
      </div>
      <div className="campo">
        <label htmlFor="doctor">Doctor</label>
        <input
          id="doctor"
          value={nombreCirujano}
          onChange={(e) => setNombreCirujano(e.target.value)}
          onBlur={() => void guardarIdentificacion()}
        />
      </div>
      <div className="campo">
        <label htmlFor="sexo">Sexo</label>
        <select
          id="sexo"
          value={caso.sexo?.valor ?? 'HOMBRE'}
          onChange={(e) => void cambiarSexo(e.target.value as Sexo)}
        >
          <option value="HOMBRE">Hombre</option>
          <option value="MUJER">Mujer</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor="lente">Modelo de lente</label>
        <select id="lente" value={caso.lente?.modelo ?? ''} onChange={(e) => void elegirLenteCatalogo(e.target.value)}>
          <option value="">— Elegir de la lista —</option>
          {MODELOS_DE_LAS_CALCULADORAS.map((m) => (
            <option key={m.modelo} value={m.modelo}>
              {m.fabricante} — {m.modelo}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: 'var(--texto-suave)', margin: '4px 0 0' }}>
          EVO y Kane la eligen sola en su propia web. Barrett no tiene desplegable: siempre usa la
          constante A de abajo, se haya elegido una lente o se haya escrito a mano.
        </p>
      </div>

      <div className="fila-pestañas">
        <button className={lado === 'OD' ? 'activa' : ''} onClick={() => setLado('OD')}>
          Ojo derecho (OD)
        </button>
        <button className={lado === 'OS' ? 'activa' : ''} onClick={() => setLado('OS')}>
          Ojo izquierdo (OS)
        </button>
      </div>

      <h3>Biometría</h3>
      <div className="pila">
        {CAMPOS_BIOMETRIA.map((campo) => (
          <CampoNumero
            key={campo}
            campo={campo}
            valor={ojo?.medidas[campo]?.valor}
            pendiente={ojo?.medidas[campo]?.confirmadoPorUsuario === false}
            alGuardar={(v) => void guardarCampo(campo, v)}
          />
        ))}
      </div>

      <h3>Córnea posterior (si se ha medido)</h3>
      <div className="pila">
        {CAMPOS_CARA_POSTERIOR.map((campo) => (
          <CampoNumero
            key={campo}
            campo={campo}
            valor={ojo?.medidas[campo]?.valor}
            pendiente={ojo?.medidas[campo]?.confirmadoPorUsuario === false}
            alGuardar={(v) => void guardarCampo(campo, v)}
          />
        ))}
      </div>

      <h3>Lente e incisión</h3>
      <div className="pila">
        {CAMPOS_LENTE.map((campo) => (
          <CampoNumero
            key={campo}
            campo={campo}
            valor={ojo?.medidas[campo]?.valor}
            valorPorDefecto={VALOR_POR_DEFECTO[campo]}
            pendiente={ojo?.medidas[campo]?.confirmadoPorUsuario === false}
            alGuardar={(v) => void guardarCampo(campo, v)}
          />
        ))}
      </div>

      <div style={{ height: 12 }} />
      <button
        className="boton"
        disabled={confirmando || faltaIdentificacion}
        onClick={() => void confirmar()}
      >
        {confirmando ? 'Confirmando…' : 'Confirmar y elegir calculadoras'}
      </button>
      {faltaIdentificacion && (
        <p style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 8 }}>
          Escribe el paciente y el doctor para poder continuar.
        </p>
      )}
    </div>
  )
}

function CampoNumero({
  campo,
  valor,
  valorPorDefecto,
  pendiente,
  alGuardar,
}: {
  readonly campo: CampoBiometrico
  readonly valor: number | undefined
  readonly valorPorDefecto?: string
  readonly pendiente: boolean
  readonly alGuardar: (valor: number | null) => void
}): React.JSX.Element {
  const definicion = REGISTRO_CAMPOS[campo]
  const [texto, setTexto] = useState(valor !== undefined ? String(valor) : (valorPorDefecto ?? ''))

  // Si el valor cambia por fuera (otra pestaña, otra persona, la propia
  // confirmación), el campo lo refleja — pero no mientras se está escribiendo
  // en él, para no pelearse con el dedo de quien teclea. Sin valor de verdad
  // todavía, se enseña el de partida (D38/D46) — se guarda de verdad al
  // confirmar (`aplicarValoresPorDefecto`), no solo por enseñarse aquí.
  useEffect(() => {
    setTexto(valor !== undefined ? String(valor) : (valorPorDefecto ?? ''))
  }, [valor, valorPorDefecto])

  function guardar(): void {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      if (valor !== undefined) alGuardar(null)
      return
    }
    const numero = Number(limpio)
    if (Number.isFinite(numero) && numero !== valor) alGuardar(numero)
  }

  return (
    <div className="campo">
      <label htmlFor={campo}>
        {definicion.etiqueta} {definicion.unidad !== 'ninguna' && `(${definicion.unidad})`}{' '}
        {pendiente && <span className="badge pendiente">revisar</span>}
      </label>
      <input
        id={campo}
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
      />
    </div>
  )
}
