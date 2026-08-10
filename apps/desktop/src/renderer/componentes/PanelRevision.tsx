/**
 * PanelRevision.tsx — La pantalla de revisión obligatoria.
 *
 * Es el corazón del producto. Aquí el usuario ve TODO lo que se ha leído, con
 * su procedencia, y decide. Nada pasa de esta pantalla sin que lo confirme.
 *
 * Reglas que se ven en el diseño:
 *
 *  - Un dato que no está pone «NO ENCONTRADO», en ámbar. No pone 0 ni «—».
 *  - Se distingue lo leído del informe de lo escrito a mano.
 *  - Un dato imposible se marca en rojo y bloquea; uno raro avisa y deja pasar.
 *  - Borrar un dato es una acción normal y visible: es la forma de decir
 *    «esto no lo sabemos», y es preferible a dejar un número dudoso.
 */

import { useMemo, useState } from 'react'
import type { JSX } from 'react'

import type { Aviso, CampoBiometrico, Caso, Lateralidad } from '@vilamar/domain'
import {
  camposDeCategoria,
  definicionDe,
  esDerivado,
  esManual,
  nivelDeCampo,
  nombreLateralidad,
  ojoDe,
  ojosDelCaso,
  TEXTO_AUSENTE,
} from '@vilamar/domain'

import { api } from '../api.js'

interface Props {
  readonly caso: Caso
  readonly avisos: readonly Aviso[]
  readonly ojoActivo: Lateralidad
  readonly onCambiarOjo: (ojo: Lateralidad) => void
  readonly onCambio: () => Promise<void>
  readonly onConfirmar: () => void
  readonly ocupado: boolean
}

const GRUPOS: { titulo: string; categoria: Parameters<typeof camposDeCategoria>[0] }[] = [
  { titulo: 'Biometría', categoria: 'BIOMETRIA' },
  { titulo: 'Córnea posterior', categoria: 'CORNEA_POSTERIOR' },
  { titulo: 'Decisiones del cirujano', categoria: 'QUIRURGICO' },
  { titulo: 'Lente y constantes', categoria: 'LENTE' },
]

export function PanelRevision({
  caso,
  avisos,
  ojoActivo,
  onCambiarOjo,
  onCambio,
  onConfirmar,
  ocupado,
}: Props): JSX.Element {
  const ojos = ojosDelCaso(caso)
  const ojo = ojoDe(caso, ojoActivo)

  const invalidos = useMemo(() => avisos.filter((a) => a.nivel === 'INVALID'), [avisos])
  const advertencias = useMemo(() => avisos.filter((a) => a.nivel === 'WARNING'), [avisos])

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

      {invalidos.length > 0 && (
        <div className="aviso error">
          <strong>
            Hay {invalidos.length} {invalidos.length === 1 ? 'dato' : 'datos'} que no{' '}
            {invalidos.length === 1 ? 'puede' : 'pueden'} ser correcto
            {invalidos.length === 1 ? '' : 's'}.
          </strong>{' '}
          Corrígelo{invalidos.length === 1 ? '' : 's'} o bórralo
          {invalidos.length === 1 ? '' : 's'} antes de continuar. El programa no cambia datos por su
          cuenta.
        </div>
      )}
      {advertencias.length > 0 && invalidos.length === 0 && (
        <div className="aviso atencion">
          Hay {advertencias.length} {advertencias.length === 1 ? 'valor poco' : 'valores poco'}{' '}
          frecuente{advertencias.length === 1 ? '' : 's'}. Puede ser correcto: revísalo
          {advertencias.length === 1 ? '' : 's'} y continúa si es lo que pone el informe.
        </div>
      )}

      {GRUPOS.map((grupo) => (
        <GrupoCampos
          key={grupo.categoria}
          titulo={grupo.titulo}
          campos={camposDeCategoria(grupo.categoria)}
          caso={caso}
          ojoActivo={ojoActivo}
          avisos={avisos}
          onCambio={onCambio}
        />
      ))}

      <div className="tarjeta">
        <h2>Confirmar y calcular</h2>
        <p className="sub">
          Al confirmar, estos datos —y solo estos— se enviarán a las calculadoras. Nada sin revisar
          sale de aquí.
        </p>
        <div className="fila derecha">
          <button
            className="principal grande"
            onClick={onConfirmar}
            disabled={ocupado || invalidos.length > 0 || Object.keys(ojo.medidas).length === 0}
            data-testid="confirmar"
          >
            Confirmar datos
          </button>
        </div>
        {invalidos.length > 0 && (
          <p className="pie-nota">
            No se puede confirmar mientras haya datos imposibles. Están marcados en rojo.
          </p>
        )}
      </div>
    </>
  )
}

interface PropsGrupo {
  readonly titulo: string
  readonly campos: readonly CampoBiometrico[]
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly avisos: readonly Aviso[]
  readonly onCambio: () => Promise<void>
}

function GrupoCampos({
  titulo,
  campos,
  caso,
  ojoActivo,
  avisos,
  onCambio,
}: PropsGrupo): JSX.Element {
  const ojo = ojoDe(caso, ojoActivo)

  return (
    <div className="tarjeta">
      <h2>{titulo}</h2>
      <table className="revision">
        <thead>
          <tr>
            <th>Dato</th>
            <th>Valor</th>
            <th></th>
            <th>Origen</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campos.map((campo) => (
            <FilaCampo
              key={campo}
              campo={campo}
              caso={caso}
              ojoActivo={ojoActivo}
              avisos={avisos}
              onCambio={onCambio}
            />
          ))}
        </tbody>
      </table>
      <p className="pie-nota">
        Deja un campo vacío para decir que ese dato no se conoce. No lo pongas a cero: para el
        cálculo no es lo mismo.
      </p>
      {campos.length === 0 && <p className="pie-nota">Nada que revisar en este grupo.</p>}
      <input type="hidden" value={ojo.lateralidad} readOnly />
    </div>
  )
}

interface PropsFila {
  readonly campo: CampoBiometrico
  readonly caso: Caso
  readonly ojoActivo: Lateralidad
  readonly avisos: readonly Aviso[]
  readonly onCambio: () => Promise<void>
}

function FilaCampo({ campo, caso, ojoActivo, avisos, onCambio }: PropsFila): JSX.Element {
  const ojo = ojoDe(caso, ojoActivo)
  const def = definicionDe(campo)
  const medida = ojo.medidas[campo]
  const nivel = nivelDeCampo(avisos, ojo, campo)
  const propios = avisos.filter((a) => a.ojo === ojoActivo && a.campo === campo)

  const [borrador, setBorrador] = useState<string | null>(null)
  const mostrado = borrador ?? (medida ? String(medida.valor) : '')

  async function guardar(texto: string): Promise<void> {
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') {
      await api().editarMedida(ojoActivo, campo, null)
    } else {
      const n = Number(limpio)
      // Si no es un número, no se guarda nada: se deja el borrador para que el
      // usuario vea lo que ha escrito y lo corrija. No se convierte en 0.
      if (!Number.isFinite(n)) return
      await api().editarMedida(ojoActivo, campo, n)
    }
    setBorrador(null)
    await onCambio()
  }

  const claseFila = nivel === 'INVALID' ? 'invalid' : nivel === 'WARNING' ? 'warning' : ''

  return (
    <>
      <tr className={claseFila}>
        <td className="campo" title={def.descripcion}>
          {def.etiqueta}
        </td>
        <td className="valor">
          <input
            value={mostrado}
            placeholder={TEXTO_AUSENTE}
            inputMode="decimal"
            aria-label={def.etiqueta}
            data-testid={`campo-${campo}`}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={(e) => void guardar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardar((e.target as HTMLInputElement).value)
            }}
          />
        </td>
        <td className="unidad">{def.unidad === 'ninguna' ? '' : def.unidad}</td>
        <td>
          {!medida && <span className="origen ausente">no encontrado</span>}
          {medida && esManual(medida.procedencia) && <span className="origen manual">a mano</span>}
          {medida && esDerivado(medida.procedencia) && (
            <span className="origen derivado">derivado</span>
          )}
          {medida && !esManual(medida.procedencia) && !esDerivado(medida.procedencia) && (
            <span className="origen extraido">del informe</span>
          )}
        </td>
        <td>
          <span className={`estado-campo ${nivel.toLowerCase()}`}>
            {nivel === 'VALID' && '✓ correcto'}
            {nivel === 'WARNING' && '⚠ poco frecuente'}
            {nivel === 'INVALID' && '✕ imposible'}
            {nivel === 'MISSING' && `⚠ ${TEXTO_AUSENTE}`}
          </span>
        </td>
        <td>
          {medida && (
            <button
              title="Borrar este dato"
              onClick={() => void guardar('')}
              data-testid={`borrar-${campo}`}
            >
              Borrar
            </button>
          )}
        </td>
      </tr>
      {propios.map((a, i) => (
        <tr key={i} className={claseFila}>
          <td colSpan={6}>
            <div className={`mensaje-campo ${a.nivel.toLowerCase()}`}>
              {a.mensaje} {a.sugerencia && <em>{a.sugerencia}</em>}
            </div>
          </td>
        </tr>
      ))}
      {medida?.procedencia.evidencia && (
        <tr>
          <td colSpan={6}>
            <div className="pie-nota" style={{ marginTop: 0 }}>
              Leído de: «{medida.procedencia.evidencia.texto}»
              {medida.procedencia.confianza !== undefined &&
                ` · fiabilidad ${Math.round(medida.procedencia.confianza * 100)} %`}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
