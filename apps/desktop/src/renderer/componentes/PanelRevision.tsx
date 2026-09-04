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
 *  - El origen sale del VALOR, no del tipo de campo: «Del informe», «Derivado
 *    del informe», «Aportado» o «Corregido». Sin valor, el texto depende de
 *    quién lo aporta —«No consta en el informe» si lo mide el aparato,
 *    «Pendiente de aportar» si lo pone el cirujano—.
 *  - Un dato derivado enseña la cuenta con la que se obtuvo, para poder
 *    contrastarla con el informe.
 *  - Corregir NO borra lo que ponía: se enseña «Leído originalmente: …».
 *  - Todos los campos se pueden escribir a mano, tengan valor o no.
 *  - Un dato imposible se marca en rojo y bloquea; uno raro avisa y deja pasar.
 *  - Borrar un dato es una acción normal y visible: es la forma de decir
 *    «esto no lo sabemos», y es preferible a dejar un número dudoso.
 */

import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'

import type { Aviso, Calculadora, CampoBiometrico, Caso, Lateralidad, LenteDeCatalogo, Medida } from '@vilamar/domain'
import {
  CALCULADORAS,
  camposDeCategoria,
  exigenciaDe,
  fichaDe,
  quienNoPuedeCalcular,
  textoDeExigencia,
  definicionDe,
  formatearConUnidad,
  loAportaElCirujano,
  origenDe,
  textoDeOrigen,
  esLecturaAutomatica,
  necesitaComprobacionHumana,
  nivelDeCampo,
  nombreLateralidad,
  ojoDe,
  ojosDelCaso,
  tieneConstanteFueraDelOjo,
} from '@vilamar/domain'

import { api } from '../api.js'
import { BloqueCirugiaRefractiva } from './BloqueCirugiaRefractiva.js'
import { BloqueSexo } from './BloqueSexo.js'
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

  const [catalogo, setCatalogo] = useState<readonly LenteDeCatalogo[]>([])
  useEffect(() => {
    void api()
      .catalogoLentes()
      .then(setCatalogo)
  }, [])

  /**
   * Calculadoras que, con lo que hay escrito, no van a poder calcular.
   *
   * Se mira del ojo que se está revisando: los dos ojos pueden tener datos
   * distintos, y avisar del otro sería confundir.
   */
  const sinDatos = useMemo(() => {
    // La constante A puede venir de fuera del ojo: EVO y Kane la rellenan
    // solos al reconocer el modelo, y Barrett la lee del catálogo. Sin esto,
    // el aviso pedía escribir a mano una constante que ya se sabe de otro
    // sitio (ver D38 y `tieneConstanteFueraDelOjo`).
    const constantePorCalculadora = Object.fromEntries(
      CALCULADORAS.map((c) => [c, tieneConstanteFueraDelOjo(caso, c, catalogo)]),
    ) as Readonly<Record<Calculadora, boolean>>
    // El sexo entra en la cuenta: lo pide Kane y no es un campo del ojo. Sin
    // pasarlo, este aviso decía que Kane podía calcular y después salía «falta el
    // sexo» tras esperar el recorrido entero de las tres webs.
    const hayCirugiaRefractivaAportada =
      ojo.cirugiaRefractivaPrevia !== undefined && ojo.cirugiaRefractivaPrevia.valor !== 'NINGUNA'
    return quienNoPuedeCalcular(
      ojo.medidas,
      caso.sexo?.confirmadoPorUsuario === true,
      constantePorCalculadora,
      hayCirugiaRefractivaAportada,
    )
  }, [ojo, caso, catalogo])

  /**
   * Datos que nadie ha mirado todavía. Bloquean la confirmación.
   *
   * Son de dos clases y conviene contarlas por separado, porque el motivo por el
   * que hay que mirarlos NO es el mismo y el aviso tiene que decir el que toca:
   *
   *  - **Leídos por una máquina**: pueden estar mal y el programa no lo sabe.
   *  - **Calculados por el programa**: la cuenta es exacta, pero nadie ha visto
   *    el resultado y va a las tres calculadoras.
   */
  const porComprobar = useMemo(
    () =>
      ojos.flatMap((l) => {
        const datos = ojoDe(caso, l)
        return (Object.keys(datos.medidas) as CampoBiometrico[])
          .map((c) => datos.medidas[c])
          .filter((m): m is Medida => m !== undefined)
          .filter((m) => necesitaComprobacionHumana(m.procedencia) && !m.confirmadoPorUsuario)
      }),
    [caso, ojos],
  )
  const leidosPorMaquina = porComprobar.filter((m) => esLecturaAutomatica(m.procedencia))
  const calculados = porComprobar.filter((m) => !esLecturaAutomatica(m.procedencia))

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
            Hay {porComprobar.length} {porComprobar.length === 1 ? 'dato' : 'datos'} que{' '}
            {porComprobar.length === 1 ? 'tiene' : 'tienen'} que comprobarse uno a uno.
          </strong>{' '}
          {/*
            Cada motivo se dice solo cuando toca. Enseñar la frase del OCR cuando
            lo único pendiente es una ACD calculada sería decirle al usuario que
            algo se leyó de una imagen cuando no se ha leído de ninguna parte.
          */}
          {leidosPorMaquina.length > 0 && (
            <>
              El reconocimiento de texto se equivoca con números que parecen correctos: en una
              prueba leyó <strong>24.81</strong> donde ponía <strong>24.01</strong>.{' '}
            </>
          )}
          {calculados.length > 0 && (
            <>
              {calculados.length === 1 ? 'Hay un dato' : `Hay ${calculados.length} datos`} que ha
              calculado el programa a partir de otros del informe: la cuenta es exacta, pero nadie
              ha visto todavía el resultado.{' '}
            </>
          )}
          Compara cada uno con tu informe y pulsa «Está bien», o corrígelo escribiéndolo.
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

      <BloqueCirugiaRefractiva caso={caso} ojoActivo={ojoActivo} onCambio={onCambio} />

      <BloqueSexo caso={caso} onCambio={onCambio} />

      <SelectorLente caso={caso} onCambio={onCambio} />

      <div className="tarjeta">
        <h2>Confirmar y calcular</h2>
        <p className="sub">
          Al confirmar, estos datos —y solo estos— se enviarán a las calculadoras. Nada sin revisar
          sale de aquí.
        </p>
        {/*
          Se avisa AQUÍ, antes de pulsar. Hasta ahora esto solo se sabía después:
          el navegador recorría las tres webs y una decía «faltan datos» — 47
          segundos para enterarse de algo que se podía haber escrito antes.

          No bloquea. Calcular con dos de tres es un resultado legítimo, y quizá
          el dato que falta no lo tienes. Pero se dice, y se dice qué falta.
        */}
        {sinDatos.length > 0 && (
          <div className="aviso atencion" data-testid="aviso-faltan-requeridos">
            <strong>
              Con los datos de {nombreLateralidad(ojoActivo)},{' '}
              {sinDatos.length === 1 ? 'una' : sinDatos.length}{' '}
              {sinDatos.length === 1 ? 'calculadora' : 'calculadoras'} no{' '}
              {sinDatos.length === 1 ? 'va' : 'van'} a poder calcular.
            </strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {sinDatos.map((x) => (
                <li key={x.calculadora}>
                  <strong>{fichaDe(x.calculadora).nombre}</strong>: falta{' '}
                  {[
                    ...x.faltan.map((c) => definicionDe(c).etiqueta),
                    // Se nombra como lo que es, y se dice qué hacer: si está
                    // deducido pero sin comprobar, el hueco no es «ponlo» sino
                    // «míralo».
                    ...(x.faltaElSexo
                      ? [
                          caso.sexo === undefined
                            ? 'el sexo del paciente'
                            : 'comprobar el sexo del paciente',
                        ]
                      : []),
                  ].join(', ')}
                </li>
              ))}
            </ul>
            Puedes escribir esos datos arriba, o continuar: las demás calculan igual y el informe
            dirá cuál se quedó sin resultado.
          </div>
        )}
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
  const exigencia = exigenciaDe(campo)
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
   * Un dato que nadie ha mirado todavía: leído por una máquina o calculado.
   *
   * Se marca aunque el valor esté dentro de rango, porque estar dentro de rango
   * no significa nada: 24.81 es un valor perfectamente normal, y era 24.01.
   */
  const porComprobar =
    medida !== undefined &&
    necesitaComprobacionHumana(medida.procedencia) &&
    !medida.confirmadoPorUsuario

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
          {/*
            «Obligatorio» a secas sería mentira: depende de qué calculadora
            quieras. Sin SIA, Barrett no calcula y EVO sí. Cuando solo hace falta
            para algunas, se nombran — es lo que hace la frase accionable.
          */}
          <span
            className={`exigencia ${exigencia.nivel.toLowerCase()}`}
            data-testid={`exigencia-${campo}`}
          >
            {textoDeExigencia(exigencia)}
          </span>
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
          {/*
            Un dato derivado enseña LA CUENTA, no la palabra «derivado».
            «Derivado, no medido» no dejaba comprobar nada; «AQD 2.65 mm + CCT
            530 µm (0.530 mm)» se puede contrastar con el informe en dos
            segundos, que es justamente lo que hay que hacer con él.
          */}
          {medida?.procedencia.derivacion && (
            <div className="origen-original" data-testid={`derivacion-${campo}`}>
              {medida.procedencia.derivacion.explicacion}
            </div>
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
