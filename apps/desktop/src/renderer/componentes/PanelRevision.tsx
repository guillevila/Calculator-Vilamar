/**
 * PanelRevision.tsx — La pantalla de revisión obligatoria.
 *
 * Es el corazón del producto. Aquí el usuario ve TODO lo que se ha leído, con
 * su procedencia, y decide. Nada pasa de esta pantalla sin que lo confirme.
 *
 * Reglas que se ven en el diseño:
 *
 *  - ORIGEN Y ESTADO VAN EN COLUMNAS DISTINTAS. De dónde salió un número y si
 *    alguien lo ha revisado son dos preguntas, y mezclarlas fue el error que
 *    había: un campo que el informe no trae parecía un fallo de lectura.
 *  - El origen sale del VALOR, no del tipo de campo: «Del informe», «Aportado»
 *    o «Corregido». Sin valor, el texto depende de quién lo aporta —«No consta
 *    en el informe» si lo mide el aparato, «Pendiente de aportar» si lo pone el
 *    cirujano—.
 *  - Corregir NO borra lo que ponía: se enseña «Leído originalmente: …».
 *  - Todos los campos se pueden escribir a mano, tengan valor o no.
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
  formatearConUnidad,
  loAportaElCirujano,
  origenDe,
  textoDeOrigen,
  esLecturaAutomatica,
  nivelDeCampo,
  nombreLateralidad,
  ojoDe,
  ojosDelCaso,
} from '@vilamar/domain'

import { api } from '../api.js'
import { SelectorLente } from './SelectorLente.js'

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

  /**
   * Datos leídos por una máquina que la persona todavía no ha comprobado.
   *
   * Bloquean la confirmación, y a propósito: el reconocimiento de texto produce
   * números equivocados con aspecto de correctos, así que aceptarlos todos de un
   * clic convertiría la revisión obligatoria en un trámite.
   */
  const porComprobar = useMemo(
    () =>
      ojos.flatMap((l) => {
        const datos = ojoDe(caso, l)
        return (Object.keys(datos.medidas) as CampoBiometrico[]).filter((c) => {
          const m = datos.medidas[c]
          return m !== undefined && esLecturaAutomatica(m.procedencia) && !m.confirmadoPorUsuario
        })
      }),
    [caso, ojos],
  )

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
      {porComprobar.length > 0 && invalidos.length === 0 && (
        <div className="aviso atencion">
          <strong>
            Hay {porComprobar.length} {porComprobar.length === 1 ? 'dato' : 'datos'} leído
            {porComprobar.length === 1 ? '' : 's'} de la imagen que{' '}
            {porComprobar.length === 1 ? 'tiene' : 'tienen'} que comprobar
            {porComprobar.length === 1 ? 'se' : 'se'} uno a uno.
          </strong>{' '}
          El reconocimiento de texto se equivoca con números que parecen correctos: en una prueba
          leyó <strong>24.81</strong> donde ponía <strong>24.01</strong>. Compara cada uno con tu
          informe y pulsa «Está bien», o corrígelo escribiéndolo.
        </div>
      )}
      {advertencias.length > 0 && invalidos.length === 0 && porComprobar.length === 0 && (
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

      <SelectorLente caso={caso} onCambio={onCambio} />

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
            disabled={
              ocupado ||
              invalidos.length > 0 ||
              porComprobar.length > 0 ||
              Object.keys(ojo.medidas).length === 0
            }
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
        {porComprobar.length > 0 && invalidos.length === 0 && (
          <p className="pie-nota">
            Faltan {porComprobar.length} {porComprobar.length === 1 ? 'dato' : 'datos'} por
            comprobar. Los datos que has escrito tú y los que vienen del texto de un PDF no hace
            falta comprobarlos: son exactos.
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
  /**
   * De dónde salió ESTE valor. Se deduce del dato, no se guarda aparte: un
   * origen guardado por su cuenta acabaría desincronizado del dato que describe.
   */
  const origen = origenDe(medida)
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

  /**
   * Un dato leído por una máquina y todavía no comprobado por la persona.
   *
   * Se marca aunque el valor esté dentro de rango, porque estar dentro de rango
   * no significa nada: 24.81 es un valor perfectamente normal, y era 24.01.
   */
  const porComprobar =
    medida !== undefined && esLecturaAutomatica(medida.procedencia) && !medida.confirmadoPorUsuario

  async function comprobar(): Promise<void> {
    await api().confirmarCampo(ojoActivo, campo)
    await onCambio()
  }

  const claseFila =
    nivel === 'INVALID' ? 'invalid' : nivel === 'WARNING' || porComprobar ? 'warning' : ''

  return (
    <>
      <tr className={claseFila}>
        <td className="campo" title={def.descripcion}>
          {def.etiqueta}
        </td>
        <td className="valor">
          <input
            value={mostrado}
            placeholder={textoDeOrigen('NO_CONSTA', loAportaElCirujano(campo))}
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
          {/*
            EL ORIGEN SALE DEL VALOR, no del tipo de campo. El mismo campo puede
            venir del informe en un caso y escribirse a mano en otro — una
            refracción objetivo impresa en el informe es «Del informe» aunque sea
            conceptualmente una decisión del cirujano.

            Cuando NO hay valor, el texto depende de quién se espera que lo
            aporte: «No consta en el informe» para lo que mide el aparato,
            «Pendiente de aportar» para lo que pone el cirujano. Antes los dos
            decían «NO ENCONTRADO», y eso hacía parecer que la lectura había
            fallado cuando muchas veces el dato sencillamente no venía.
          */}
          <span className={`origen ${origen.toLowerCase()}`} data-testid={`origen-${campo}`}>
            {textoDeOrigen(origen, loAportaElCirujano(campo))}
          </span>
          {/*
            Corregir no borra lo que ponía. Se enseña aquí mismo, porque es el
            sitio donde alguien se pregunta «¿frente a qué se corrigió esto?».
          */}
          {medida?.original && (
            <div className="origen-original" data-testid={`original-${campo}`}>
              Leído originalmente: {formatearConUnidad(campo, medida.original.valor)}
            </div>
          )}
          {medida && esDerivado(medida.procedencia) && (
            <div className="origen-original">Derivado, no medido</div>
          )}
        </td>
        <td>
          {/*
            ESTADO ES OTRA COSA QUE ORIGEN. De dónde salió un número y si alguien
            lo ha revisado son dos preguntas distintas, y se responden en columnas
            distintas. Aquí solo va la segunda.

            Un dato leído por una máquina NUNCA sale como «correcto», aunque esté
            dentro de rango. Está medido: el reconocimiento leyó 24.81 donde ponía
            24.01 con un 93 % de fiabilidad. Como el programa no puede
            distinguirlo, la pantalla no puede decir que está bien.
          */}
          {!medida ? (
            <span className="estado-campo vacio">—</span>
          ) : porComprobar ? (
            <span className="estado-campo warning">⚠ compruébalo</span>
          ) : (
            <span className={`estado-campo ${nivel.toLowerCase()}`}>
              {nivel === 'VALID' && '✓ correcto'}
              {nivel === 'WARNING' && '⚠ poco frecuente'}
              {nivel === 'INVALID' && '✕ imposible'}
              {/*
                MISSING con medida presente es un aviso de validación sobre otra
                cosa (por ejemplo, falta el eje que acompaña a esta K). El hueco
                del propio campo ya lo dice la columna de origen.
              */}
              {nivel === 'MISSING' && '⚠ falta un dato relacionado'}
            </span>
          )}
        </td>
        <td>
          <div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
            {porComprobar && (
              <button
                className="principal"
                title="He comparado este dato con el informe y es correcto"
                onClick={() => void comprobar()}
                data-testid={`comprobar-${campo}`}
              >
                Está bien
              </button>
            )}
            {medida && (
              <button
                title="Borrar este dato"
                onClick={() => void guardar('')}
                data-testid={`borrar-${campo}`}
              >
                Borrar
              </button>
            )}
          </div>
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
