/**
 * plantilla.ts — El informe, como HTML.
 *
 * Se genera HTML y lo imprime a PDF el propio Electron (`printToPDF`). Es la
 * decisión más simple que cumple todo: no añade ninguna dependencia, no compila
 * nada nativo —la lección más caneada de este proyecto— y permite maquetar con
 * CSS normal.
 *
 * Esta función es PURA: recibe datos y devuelve una cadena. Por eso se puede
 * probar sin abrir Electron ni generar un PDF.
 *
 * Qué NO sale nunca en este informe: el nombre del paciente, su fecha de
 * nacimiento ni su número de historia. El informe se identifica por el código
 * local del caso. Se puede auditar entrada → calculadora → salida sin saber de
 * quién es el ojo.
 */

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Comparativa,
  DatoComparativo,
  Lateralidad,
  Medida,
  OjoBiometrico,
  Aviso,
} from '@vilamar/domain'
import {
  camposPresentes,
  definicionDe,
  describirProcedencia,
  fichaDe,
  formatearConUnidad,
  NOMBRE_DISPOSITIVO,
  nombreLateralidad,
  TEXTO_ORIGEN,
  textoDeOrigen,
  loAportaElCirujano,
  ojoDe,
  ojosDelCaso,
  origenDe,
  describirDiscrepancia,
  discrepanciasDeConstante,
  textoEstado,
} from '@vilamar/domain'

export interface DatosInforme {
  readonly caso: Caso
  readonly version: string
  readonly generadoEn: string
  readonly comparativas: readonly Comparativa[]
  readonly avisos: readonly Aviso[]
  /** Campos que cada calculadora necesitaba y no había. */
  readonly ausenciasRelevantes: readonly {
    readonly calculadora: Calculadora
    readonly ojo: Lateralidad
    readonly campos: readonly CampoBiometrico[]
  }[]
}

/** Escapa el texto para que nada de lo que venga de fuera pueda inyectar HTML. */
export function esc(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}

/**
 * De dónde salió el dato, con el mismo vocabulario que la pantalla de revisión.
 *
 * Que el informe y la pantalla digan lo mismo no es cosmética: quien lee el PDF
 * meses después tiene que poder reconocer lo que vio al revisar. Tres palabras
 * distintas para lo mismo obligan a traducir mentalmente, y ahí es donde se
 * cuelan los malentendidos.
 */
function etiquetaOrigen(medida: Medida): string {
  const origen = origenDe(medida)
  const clase =
    origen === 'CORREGIDO'
      ? 'marca-corregido'
      : origen === 'APORTADO'
        ? 'marca-manual'
        : // Un dato derivado NO se pinta como uno leído. Meses después, quien
          // audite este PDF tiene que poder distinguir de un vistazo lo que
          // ponía el informe de lo que calculó el programa.
          origen === 'DERIVADO_DEL_INFORME'
          ? 'marca-derivado'
          : 'marca-extraido'
  return `<span class="marca ${clase}">${esc(TEXTO_ORIGEN[origen as Exclude<typeof origen, 'NO_CONSTA'>])}</span>`
}

function filaMedida(ojo: OjoBiometrico, campo: CampoBiometrico): string {
  const def = definicionDe(campo)
  const medida = ojo.medidas[campo]
  if (!medida) {
    // Sin valor, el texto dice de quién se esperaba el dato. «NO ENCONTRADO» a
    // secas hacía parecer un fallo de lectura un campo que el informe
    // sencillamente no trae, o que decide el cirujano.
    return `<tr class="ausente">
      <td>${esc(def.etiqueta)}</td>
      <td class="valor">${esc(textoDeOrigen('NO_CONSTA', loAportaElCirujano(campo)))}</td>
      <td>—</td>
      <td>—</td>
    </tr>`
  }
  // Un dato corregido enseña las dos cosas: lo que se usó y lo que ponía. Sin
  // eso, el informe diría «escrito a mano» sin poder explicar frente a qué, y no
  // se podría auditar si la corrección fue un arreglo o un desliz.
  const original = medida.original
    ? `<br><span class="original">Leído originalmente: ${esc(
        formatearConUnidad(campo, medida.original.valor),
      )}</span>${
        medida.original.procedencia.evidencia
          ? `<br><span class="evidencia">«${esc(medida.original.procedencia.evidencia.texto)}»</span>`
          : ''
      }`
    : ''
  return `<tr>
    <td>${esc(def.etiqueta)}</td>
    <td class="valor">${esc(formatearConUnidad(campo, medida.valor))}</td>
    <td>${etiquetaOrigen(medida)}</td>
    <td class="procedencia">${esc(describirProcedencia(medida.procedencia))}${
      medida.procedencia.evidencia
        ? `<br><span class="evidencia">«${esc(medida.procedencia.evidencia.texto)}»</span>`
        : ''
    }${original}</td>
  </tr>`
}

function seccionEntradas(caso: Caso, ojo: OjoBiometrico): string {
  const presentes = camposPresentes(ojo)
  // Se enseñan los campos que hay, agrupados, y no todo el catálogo: un informe
  // con 24 filas de «NO ENCONTRADO» no ayuda a nadie.
  const orden: CampoBiometrico[] = [
    'AL',
    'K1',
    'K1_EJE',
    'K2',
    'K2_EJE',
    'TK1',
    'TK1_EJE',
    'TK2',
    'TK2_EJE',
    'ACD',
    'AQD',
    'LT',
    'CCT',
    'WTW',
    'PK1',
    'PK1_EJE',
    'PK2',
    'PK2_EJE',
    'REFRACCION_OBJETIVO',
    'SIA',
    'EJE_INCISION',
    'CONSTANTE_A',
    'FACTOR_LENTE',
    'INDICE_QUERATOMETRICO',
  ]
  const aEnseñar = orden.filter((c) => presentes.includes(c))

  const documento = caso.documentos.find(
    (d) => d.id === ojo.medidas[aEnseñar[0] as CampoBiometrico]?.procedencia.documentoId,
  )
  const dispositivo = documento?.dispositivoDetectado?.dispositivo

  return `<section class="ojo">
    <h2>${esc(nombreLateralidad(ojo.lateralidad))}</h2>
    <p class="fuente">
      ${dispositivo ? `Informe detectado: <strong>${esc(NOMBRE_DISPOSITIVO[dispositivo])}</strong>` : 'Aparato no reconocido'}
      ${documento ? ` · fichero <code>${esc(documento.nombre)}</code>` : ''}
    </p>
    <table class="datos">
      <thead>
        <tr><th>Dato</th><th>Valor confirmado</th><th>Origen</th><th>Detalle</th></tr>
      </thead>
      <tbody>
        ${aEnseñar.map((c) => filaMedida(ojo, c)).join('\n')}
      </tbody>
    </table>
  </section>`
}

/**
 * Una casilla del informe. **La misma regla que en pantalla.**
 *
 * El informe es la parte que sale del programa y acaba en una historia clínica,
 * así que es donde menos se puede confundir «lo dice la calculadora» con «lo ha
 * elegido el programa». Los tres estados se escriben distintos:
 *
 *     22.50 D                  la web señaló esta opción
 *     3 alternativas tóricas   hay alternativas y ninguna señalada — están debajo
 *     Ver alternativas         el valor depende de cuál de ellas se consulte
 *     —                        esa calculadora no publica este dato
 */
function celdaVarias(dato: Extract<DatoComparativo, { estado: 'VARIAS' }>): string {
  // La que las nombra va en negrita: es la que responde «¿alternativas de qué?».
  const clase = dato.lasNombra ? 'varias nombra' : 'varias'
  return `<td class="${clase}">${esc(dato.etiqueta)}</td>`
}

function celda(dato: DatoComparativo, sufijo = '', decimales = 2): string {
  if (dato.estado === 'VALOR') return `<td>${esc(dato.valor.toFixed(decimales))}${sufijo}</td>`
  if (dato.estado === 'VARIAS') return celdaVarias(dato)
  return '<td class="na">—</td>'
}

function celdaTexto(dato: DatoComparativo<string>): string {
  if (dato.estado === 'VALOR') return `<td>${esc(dato.valor)}</td>`
  if (dato.estado === 'VARIAS') return celdaVarias(dato)
  return '<td class="na">—</td>'
}

/** Las columnas del detalle: solo las que alguna opción trae de verdad. */
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
 * Las alternativas que devolvió cada calculadora, tal cual vinieron.
 *
 * Sin esto, el informe de una calculadora que devuelve varias sin señalar ninguna
 * sería una tabla con huecos. Con esto, quien lo lea ve exactamente lo mismo que
 * había en la pantalla de la web.
 */
function opcionesDevueltas(c: Comparativa): string {
  const conVarias = c.celdas.filter((x) => x.opciones.length > 1)
  if (conVarias.length === 0) return ''

  const bloques = conVarias.map((celdaComp) => {
    const columnas = COLUMNAS_DE_OPCION.filter((col) =>
      celdaComp.opciones.some((o) => o[col.clave] !== undefined),
    )
    if (columnas.length === 0) return ''

    const senalada = celdaComp.seleccion.clase === 'DESTACADA'
    const filas = celdaComp.opciones
      .map((o) => {
        const celdas = columnas
          .map((col) => {
            const v = o[col.clave]
            if (v === undefined) return '<td class="na">—</td>'
            return typeof v === 'number'
              ? `<td>${esc(v.toFixed(col.decimales))}${col.sufijo}</td>`
              : `<td>${esc(v)}</td>`
          })
          .join('')
        const marca = senalada
          ? `<td class="marca">${o.recomendada ? `Destacada por ${esc(celdaComp.nombre)}` : ''}</td>`
          : ''
        return `<tr class="${o.recomendada ? 'destacada' : ''}">${celdas}${marca}</tr>`
      })
      .join('')

    const nota = senalada
      ? `${esc(celdaComp.nombre)} ha señalado una de ellas; es la que aparece en la comparación.`
      : `${esc(celdaComp.nombre)} no ha señalado ninguna opción preferente. La elección no la hace Calculator Vilamar.`

    return `<div class="bloque-opciones">
      <h3>${esc(celdaComp.nombre)} · ${celdaComp.opciones.length} alternativas devueltas</h3>
      <p class="nota">${nota}</p>
      <table class="tabla-opciones">
        <thead><tr>${columnas.map((col) => `<th>${esc(col.titulo)}</th>`).join('')}${
          senalada ? '<th></th>' : ''
        }</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`
  })

  return `<section class="opciones-devueltas">
    <h2>Opciones devueltas · ${esc(nombreLateralidad(c.ojo))}</h2>
    ${bloques.join('')}
  </section>`
}

function tablaComparativa(c: Comparativa): string {
  const cols = c.celdas
  return `<section class="comparativa">
    <h2>Comparación · ${esc(nombreLateralidad(c.ojo))}</h2>
    <table class="tabla-comparativa">
      <thead>
        <tr><th></th>${cols.map((x) => `<th>${esc(x.nombre)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        <tr><th>Esfera de la lente</th>${cols.map((x) => celda(x.esfera, ' D')).join('')}</tr>
        <tr><th>Cilindro</th>${cols.map((x) => celda(x.cilindro, ' D')).join('')}</tr>
        <tr><th>Eje de la lente</th>${cols.map((x) => celda(x.eje, '°', 0)).join('')}</tr>
        <tr><th>Modelo tórico</th>${cols.map((x) => celdaTexto(x.designacion)).join('')}</tr>
        <tr><th>Refracción prevista</th>${cols.map((x) => celda(x.refraccionPrevista, ' D')).join('')}</tr>
        <tr><th>Cilindro residual</th>${cols.map((x) => celda(x.cilindroResidual, ' D')).join('')}</tr>
        <tr><th>Eje residual</th>${cols.map((x) => celda(x.ejeResidual, '°', 0)).join('')}</tr>
        <tr class="fila-estado"><th>Estado</th>${cols
          .map((x) => `<td>${esc(textoEstado(x.estado))}</td>`)
          .join('')}</tr>
      </tbody>
    </table>

    ${opcionesDevueltas(c)}
    ${observaciones(c)}
  </section>`
}

function observaciones(c: Comparativa): string {
  const grupos: { titulo: string; tipos: Comparativa['observaciones'][number]['tipo'][] }[] = [
    { titulo: 'Concordancias', tipos: ['CONCORDANCIA'] },
    { titulo: 'Discrepancias', tipos: ['DISCREPANCIA'] },
    { titulo: 'Avisos y lo que no se pudo ejecutar', tipos: ['AVISO', 'FALLO'] },
  ]
  return grupos
    .map((g) => {
      const items = c.observaciones.filter((o) => g.tipos.includes(o.tipo))
      if (items.length === 0) return ''
      return `<div class="observaciones obs-${esc(g.tipos[0]?.toLowerCase())}">
        <h3>${esc(g.titulo)}</h3>
        <ul>${items.map((o) => `<li>${esc(o.texto)}</li>`).join('')}</ul>
      </div>`
    })
    .join('')
}

function seccionAuditoria(caso: Caso): string {
  const filas: string[] = []
  for (const [clave, r] of Object.entries(caso.resultados)) {
    const eco = r.entradasSegunLaWeb
    if (!eco || Object.keys(eco).length === 0) continue
    filas.push(`<tr>
      <td>${esc(fichaDe(r.calculadora).nombre)}</td>
      <td>${esc(r.ojo)}</td>
      <td class="eco">${Object.entries(eco)
        .map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`)
        .join('<br>')}</td>
    </tr>`)
    void clave
  }
  // La constante A es el único dato que una web puede CAMBIAR por su cuenta:
  // elegir el modelo de lente en su formulario rellena la suya. Si lo ha hecho,
  // el resultado es el de SU constante, y eso hay que decirlo aquí mismo — un
  // informe que lo callara daría por enviado un número que no se usó.
  const discrepancias = discrepanciasDeConstante(caso)
  const aviso =
    discrepancias.length === 0
      ? ''
      : `<div class="discrepancia">
      <strong>La constante A usada no es la que se envió.</strong>
      <ul>${discrepancias.map((d) => `<li>${esc(describirDiscrepancia(d))}</li>`).join('')}</ul>
      <p class="nota">
        No se ha corregido nada: se deja constancia de las dos cifras para que
        quien lea este informe sepa con cuál se calculó de verdad.
      </p>
    </div>`

  if (filas.length === 0 && aviso === '') return ''
  return `<section class="auditoria">
    <h2>Qué dice cada calculadora haber recibido</h2>
    <p class="nota">
      Esto no es lo que Calculator Vilamar cree haber enviado: es lo que cada web
      ha mostrado en su propia pantalla como datos de entrada. Permite comprobar
      que entrada y resultado se corresponden.
    </p>
    ${aviso}
    ${
      filas.length === 0
        ? ''
        : `<table class="datos"><thead><tr><th>Calculadora</th><th>Ojo</th><th>Entradas según la web</th></tr></thead>
    <tbody>${filas.join('')}</tbody></table>`
    }
  </section>`
}

function seccionAusencias(datos: DatosInforme): string {
  if (datos.ausenciasRelevantes.length === 0) return ''
  return `<section class="ausencias">
    <h2>Datos que faltaban</h2>
    <ul>
      ${datos.ausenciasRelevantes
        .map(
          (a) =>
            `<li><strong>${esc(fichaDe(a.calculadora).nombre)}</strong> (${esc(a.ojo)}): ${a.campos
              .map((c) => esc(definicionDe(c).etiqueta))
              .join(', ')}</li>`,
        )
        .join('')}
    </ul>
  </section>`
}

function seccionAvisos(avisos: readonly Aviso[]): string {
  const relevantes = avisos.filter((a) => a.nivel === 'INVALID' || a.nivel === 'WARNING')
  if (relevantes.length === 0) return ''
  return `<section class="avisos">
    <h2>Advertencias sobre los datos</h2>
    <ul>
      ${relevantes
        .map(
          (a) =>
            `<li class="nivel-${esc(a.nivel.toLowerCase())}"><strong>${esc(a.ojo)}</strong> · ${esc(a.mensaje)}</li>`,
        )
        .join('')}
    </ul>
  </section>`
}

/**
 * Resumen de un ojo para la portada, **sin elegir nada**.
 *
 * La portada necesita un titular por ojo. El diseño original ponía ahí la
 * «mediana de las calculadoras» —+22.25 D cuando una dijo 22.50 y otra 22.00—, y
 * eso es un número que **no devolvió ninguna calculadora**: lo calcularía este
 * programa. Sería la misma selección implícita que se quitó de `comparar.ts`, y
 * más fuerte, porque además se inventa un valor que no está en ningún sitio.
 *
 * Así que el titular es el VALOR cuando todas coinciden, y el RANGO cuando no:
 *
 *     coinciden        +21.50            ESFERA · D
 *     no coinciden     22.00 – 22.50     ESFERA · RANGO 0.50
 *
 * El rango describe lo que hay. La mediana lo sustituye por algo nuevo.
 */
interface ResumenDeOjo {
  readonly cuantas: number
  readonly deAcuerdo: boolean
  readonly esfera?: { readonly min: number; readonly max: number }
  readonly cilindro?: { readonly min: number; readonly max: number }
  readonly eje?: { readonly min: number; readonly max: number }
  readonly modelos: readonly string[]
}

function extremos(
  celdas: readonly Comparativa['celdas'][number][],
  campo: 'esfera' | 'cilindro' | 'eje',
): { readonly min: number; readonly max: number } | undefined {
  const vs = celdas
    .map((c) => c[campo])
    .filter((d): d is { estado: 'VALOR'; valor: number } => d.estado === 'VALOR')
    .map((d) => d.valor)
  if (vs.length === 0) return undefined
  return { min: Math.min(...vs), max: Math.max(...vs) }
}

function resumenDeOjo(c: Comparativa): ResumenDeOjo {
  const conValor = c.celdas.filter((x) => x.esfera.estado === 'VALOR')
  const esfera = extremos(c.celdas, 'esfera')
  const modelos = [
    ...new Set(
      c.celdas
        .map((x) => x.designacion)
        .filter((d): d is { estado: 'VALOR'; valor: string } => d.estado === 'VALOR')
        .map((d) => d.valor),
    ),
  ]
  return {
    cuantas: conValor.length,
    // «De acuerdo» es un hecho comprobable: el rango de esferas es cero. No es
    // una valoración nuestra de si la diferencia importa clínicamente.
    deAcuerdo: esfera !== undefined && esfera.max - esfera.min < 0.005 && conValor.length >= 2,
    ...(esfera ? { esfera } : {}),
    ...((): object => {
      const cil = extremos(c.celdas, 'cilindro')
      return cil ? { cilindro: cil } : {}
    })(),
    ...((): object => {
      const eje = extremos(c.celdas, 'eje')
      return eje ? { eje } : {}
    })(),
    modelos,
  }
}

/** Un valor, o el rango si las calculadoras no dicen lo mismo. */
function valorORango(
  r: { readonly min: number; readonly max: number } | undefined,
  decimales: number,
  conSigno = false,
): string {
  if (!r) return '—'
  const f = (v: number): string =>
    `${conSigno && v > 0 ? '+' : ''}${v.toFixed(decimales)}`.replace('-', '−')
  return r.max - r.min < 0.005 ? f(r.min) : `${f(r.min)} – ${f(r.max)}`
}

function subEtiqueta(
  base: string,
  r: { readonly min: number; readonly max: number } | undefined,
  decimales: number,
): string {
  if (!r || r.max - r.min < 0.005) return base
  return `${base} · RANGO ${(r.max - r.min).toFixed(decimales)}`
}

/**
 * La tarjeta de un ojo en la portada.
 *
 * Verde cuando las calculadoras coinciden, ámbar cuando no. El color describe el
 * acuerdo entre webs, no una valoración clínica del caso.
 */
function tarjetaDeOjo(c: Comparativa): string {
  const r = resumenDeOjo(c)
  const acento = r.deAcuerdo ? 'var(--verde)' : 'var(--ambar)'
  const rotulo = r.deAcuerdo
    ? 'Coinciden'
    : r.cuantas >= 2
      ? 'No coinciden'
      : r.cuantas === 1
        ? 'Sin comparación'
        : 'Sin resultado'
  const cabecera =
    r.cuantas >= 2
      ? `Lo que devuelven las calculadoras · ${r.cuantas} de ${c.celdas.length}`
      : r.cuantas === 1
        ? `Solo una calculadora ha dado resultado · 1 de ${c.celdas.length}`
        : 'Ninguna calculadora ha dado resultado'

  const cifra = (valor: string, sub: string, resaltado: boolean): string =>
    `<div>
      <div class="cifra" ${resaltado ? 'style="color:var(--ambar)"' : ''}>${esc(valor)}</div>
      <div class="cifra-pie" ${resaltado ? 'style="color:var(--ambar)"' : ''}>${esc(sub)}</div>
    </div>`

  const hayRango = (x: { min: number; max: number } | undefined): boolean =>
    x !== undefined && x.max - x.min >= 0.005

  return `<div class="tarjeta-ojo">
    <div class="tarjeta-ojo-cab">
      <div class="tarjeta-ojo-tit">
        <span class="lat">${esc(c.ojo)}</span>
        <span class="lat-nombre">${esc(nombreLateralidad(c.ojo))}</span>
      </div>
      <span class="pastilla" style="background:${acento}">${esc(rotulo)}</span>
    </div>
    <div class="tarjeta-ojo-cuerpo">
      <div class="rotulo">${esc(cabecera)}</div>
      <div class="cifras">
        ${cifra(valorORango(r.esfera, 2, true), subEtiqueta('ESFERA · D', r.esfera, 2), hayRango(r.esfera))}
        ${cifra(valorORango(r.cilindro, 2), subEtiqueta('CILINDRO · D', r.cilindro, 2), hayRango(r.cilindro))}
        ${cifra(
          r.eje ? `${valorORango(r.eje, 0)}°` : '—',
          r.modelos.length > 0 ? `EJE · ${r.modelos.join(' / ')}` : 'EJE',
          hayRango(r.eje),
        )}
      </div>
      <div class="pastillas-calc">
        ${c.celdas
          .map((x) => {
            const bien = x.esfera.estado !== 'NO_DISPONIBLE'
            return `<span class="pastilla-calc ${bien ? 'ok' : 'no'}">${esc(x.nombre)}${
              bien ? ' ✓' : ` · ${esc(textoEstado(x.estado).toLowerCase())}`
            }</span>`
          })
          .join('')}
      </div>
    </div>
  </div>`
}

/** Las incidencias que afectan al informe, en la portada. */
function bloqueIncidencias(datos: DatosInforme): string {
  const fallos = datos.comparativas.flatMap((c) =>
    c.celdas
      .filter((x) => x.seleccion.clase === 'SIN_RESULTADO' && x.estado !== 'NO_EJECUTADA')
      .map(
        (x) =>
          `<strong>${esc(x.nombre)} (${esc(c.ojo)}): ${esc(textoEstado(x.estado).toLowerCase())}.</strong> ${esc(x.motivo ?? '')}`,
      ),
  )
  if (fallos.length === 0) return ''
  return `<div class="incidencias">
    <div class="incidencias-tit">Incidencias que afectan a este informe · ${fallos.length}</div>
    ${fallos.map((f) => `<div class="incidencias-txt">${f}</div>`).join('')}
  </div>`
}

/** La banda de la lente elegida, su constante y la refracción objetivo. */
function bandaDeLente(datos: DatosInforme): string {
  const { caso } = datos
  const lente = caso.lente
  const primerOjo = ojosDelCaso(caso)[0]
  const ojo = primerOjo ? ojoDe(caso, primerOjo) : undefined
  const constante = ojo?.medidas.CONSTANTE_A
  const objetivo = ojo?.medidas.REFRACCION_OBJETIVO

  const dato = (rotulo: string, valor: string, extra = ''): string =>
    `<div><div class="banda-rot">${esc(rotulo)}</div><div class="banda-val">${esc(valor)}${extra}</div></div>`

  return `<div class="banda">
    <div class="banda-datos">
      ${dato('Lente seleccionada', lente ? `${lente.fabricante ? `${lente.fabricante} · ` : ''}${lente.modelo}` : 'Sin seleccionar')}
      <div class="banda-sep"></div>
      ${dato('Constante A', constante ? constante.valor.toFixed(2) : '—')}
      ${dato('Refracción objetivo', objetivo ? `${objetivo.valor.toFixed(2)} D` : '—')}
    </div>
  </div>`
}

const ESTILOS = `
  /*
   * El sistema visual del informe, traído del rediseño hecho en Claude Design
   * («Rediseño informe Calculator Vilamar», 5 hojas A4).
   *
   * ⚠️ **Las fuentes NO se piden a la red.** El diseño usa IBM Plex Sans y Mono
   * desde Google Fonts; aquí no se puede, y no por comodidad: este programa es
   * local y el PDF se imprime sin conexión garantizada. Una hoja de estilos
   * remota se quedaría colgada o caería en silencio, y el informe saldría con
   * otra tipografía sin que nadie se enterase. Se usa la pila del sistema, que
   * respeta las métricas del diseño (humanista + monoespaciada tabular).
   */
  :root {
    --tinta: #0F1A24;
    --azul: #12506E;
    --azul-medio: #1B4C86;
    --verde: #17694A;
    --ambar: #8A6100;
    --teal: #0B5F68;
    --gris: #5C6B78;
    --gris-claro: #8B97A2;
    --linea: #DDE4EA;
    --linea-suave: #EDF1F4;
    --fondo-suave: #F7FAFC;
    --verde-fondo: #E7F3EC;
    --ambar-fondo: #FDF9EF;
    --ambar-linea: #E7D9B4;
  }

  /*
   * El contrato de página, copiado del componente <doc-page> del lienzo donde se
   * maquetó: A4 a sangre, márgenes CERO en @page y los márgenes de verdad dentro
   * de cada hoja. «printToPDF» se llama con margins 0 para que coincida.
   */
  @page { size: A4; margin: 0; }

  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }

  body {
    margin: 0;
    font-family: 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
    color: var(--tinta);
    background: #fff;
    font-size: 9pt;
    line-height: 1.45;
  }

  .mono, .cifra, .banda-val, .num {
    font-family: 'Cascadia Mono', Consolas, 'SF Mono', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }

  /* Una hoja = una página A4 completa. Nada se reparte entre dos. */
  section.hoja {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 13mm 10mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  section.hoja:last-of-type { break-after: auto; page-break-after: auto; }

  .cab {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 20px; border-bottom: 2px solid var(--tinta); padding-bottom: 10px;
  }
  .cab-marca { display: flex; align-items: center; gap: 11px; }
  .cab h1 { font-size: 15pt; font-weight: 700; letter-spacing: -0.2px; margin: 0; line-height: 1.05; }
  .cab .sub {
    font-size: 8pt; color: var(--gris); letter-spacing: 0.06em;
    text-transform: uppercase; font-weight: 600; margin-top: 2px;
  }
  .cab-meta {
    text-align: right; font-size: 8pt; color: var(--gris); line-height: 1.6;
    font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
  }
  .cab-meta .codigo { font-size: 10pt; font-weight: 600; color: var(--tinta); }

  /* Cabecera menor, de las hojas 2 a 5. */
  .cab-menor {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--linea); padding-bottom: 8px;
  }
  .cab-menor .titulo { font-size: 13pt; font-weight: 700; }
  .cab-menor .apunte { font-size: 9pt; color: var(--gris); margin-left: 8px; font-weight: 400; }
  .cab-menor .ref {
    font-size: 8pt; color: var(--gris);
    font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
  }

  .pie {
    margin-top: auto; padding-top: 12px; border-top: 1px solid var(--linea);
    font-size: 7.5pt; color: var(--gris); line-height: 1.5;
  }
  .pie strong { color: var(--tinta); }

  /* Banda de la lente */
  .banda {
    border: 1px solid var(--linea); border-left: 4px solid var(--azul); border-radius: 10px;
    padding: 12px 16px; margin-top: 14px; background: var(--fondo-suave);
  }
  .banda-datos { display: flex; gap: 26px; align-items: center; }
  .banda-sep { width: 1px; height: 34px; background: var(--linea); }
  .banda-rot {
    font-size: 7.5pt; font-weight: 600; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--gris);
  }
  .banda-val { font-size: 12pt; font-weight: 600; margin-top: 3px; }

  /* Tarjetas de ojo de la portada */
  .tarjetas { display: flex; gap: 14px; margin-top: 14px; align-items: stretch; }
  .tarjeta-ojo {
    flex: 1; border: 1px solid var(--linea); border-radius: 10px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .tarjeta-ojo-cab {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; background: var(--tinta); color: #fff;
  }
  .tarjeta-ojo-tit { display: flex; align-items: baseline; gap: 9px; }
  .tarjeta-ojo-tit .lat { font-size: 12pt; font-weight: 700; letter-spacing: 0.04em; }
  .tarjeta-ojo-tit .lat-nombre { font-size: 8pt; opacity: 0.7; }
  .pastilla {
    font-size: 7pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 12px; color: #fff;
  }
  .tarjeta-ojo-cuerpo { padding: 14px; }
  .rotulo {
    font-size: 7.5pt; font-weight: 600; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--gris);
  }
  .cifras { display: flex; gap: 16px; align-items: baseline; margin-top: 6px; }
  .cifra { font-size: 20pt; font-weight: 600; line-height: 1; letter-spacing: -0.5px; }
  .cifra-pie { font-size: 7pt; color: var(--gris); font-weight: 600; margin-top: 3px; }
  .pastillas-calc { display: flex; gap: 6px; margin-top: 14px; }
  .pastilla-calc {
    flex: 1; text-align: center; font-size: 7pt; font-weight: 600;
    padding: 5px 4px; border-radius: 6px; line-height: 1.3;
  }
  .pastilla-calc.ok { background: #E6EEF8; color: var(--azul-medio); }
  .pastilla-calc.no { background: #FAF3E2; color: var(--ambar); }

  /* Incidencias */
  .incidencias {
    border: 1px solid var(--ambar-linea); background: var(--ambar-fondo);
    border-radius: 10px; padding: 10px 14px; margin-top: 14px;
  }
  .incidencias-tit { font-size: 8.5pt; font-weight: 700; color: var(--ambar); }
  .incidencias-txt { font-size: 8.5pt; color: #4A3A18; margin-top: 5px; line-height: 1.5; }

  /* Secciones y tablas */
  section.comparativa, section.opciones-devueltas, section.ojo,
  section.auditoria, section.ausencias, section.avisos { margin-top: 14px; }
  h2 {
    font-size: 7.5pt; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
    color: var(--gris); margin: 0 0 7px;
  }
  h3 { font-size: 10pt; margin: 0 0 2px; color: var(--azul-medio); }
  .nota, .sub { font-size: 8pt; color: var(--gris); margin: 0 0 6px; line-height: 1.5; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid var(--linea); padding: 4px 7px; text-align: left; vertical-align: top; }
  thead th {
    background: var(--linea-suave); font-weight: 600; font-size: 7.5pt;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--gris);
  }
  tbody th { background: #FBFDFE; font-weight: 600; width: 26%; color: #243642; }

  table.tabla-comparativa td, table.tabla-opciones td { text-align: center; }
  table.tabla-comparativa .fila-estado td { font-size: 7.5pt; color: var(--gris); }
  td.na { color: var(--gris-claro); }
  td.varias { color: var(--gris); font-style: italic; font-size: 8pt; }
  td.varias.nombra { color: var(--azul-medio); font-style: normal; font-weight: 600; }

  .bloque-opciones { margin-top: 8px; break-inside: avoid; }
  .bloque-opciones .nota { margin-bottom: 4px; }
  table.tabla-opciones thead th { text-align: center; }
  table.tabla-opciones tr.destacada td { font-weight: 700; background: var(--linea-suave); }
  table.tabla-opciones td.marca { font-size: 7.5pt; color: var(--gris); font-style: italic; }

  /* Origen del dato */
  .marca {
    display: inline-block; font-size: 7pt; font-weight: 600; padding: 1px 6px;
    border-radius: 9px; letter-spacing: 0.03em; white-space: nowrap;
  }
  .marca-extraido { background: #E3EDF6; color: var(--azul-medio); }
  .marca-derivado { background: #EFE8F8; color: #5B3B8A; }
  .marca-manual { background: var(--verde-fondo); color: var(--verde); }
  .marca-corregido { background: #FAF3E2; color: var(--ambar); }
  tr.ausente td { color: var(--gris-claro); }
  .valor { font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace; font-weight: 600; }
  .procedencia, .evidencia, .original { font-size: 7.5pt; color: var(--gris); }
  .evidencia { font-style: italic; }

  .observacion { padding: 4px 0; font-size: 8.5pt; border-bottom: 1px solid var(--linea-suave); }
  .observacion:last-child { border-bottom: 0; }
  .grupo-obs { margin-top: 8px; }
  .grupo-obs > .titulo {
    font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 3px;
  }
  .fuente { font-size: 8pt; color: var(--gris); margin: 0 0 6px; }
  footer.principal {
    margin-top: 12px; padding-top: 10px; border-top: 2px solid var(--tinta);
    font-size: 7.5pt; color: var(--gris); line-height: 1.5;
  }
  footer.principal p { margin: 0 0 5px; }
  footer.principal strong { color: var(--tinta); }

  code { font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace; font-size: 8pt; }
`

/**
 * El informe completo, en cinco hojas A4.
 *
 * La paginación es EXPLÍCITA —una hoja por sección, no un flujo que el motor
 * reparta—, igual que en el diseño. El reparto:
 *
 *     1  Portada      lente y constante · un titular por ojo · incidencias
 *     2  OD           qué devolvió cada calculadora, y sus alternativas
 *     3  OS           lo mismo del otro ojo
 *     4  Biometría    los datos confirmados, cada uno con su origen
 *     5  Trazabilidad qué dice cada web haber recibido, y los avisos
 *
 * Un caso de un solo ojo produce cuatro hojas, no cinco con una vacía.
 */
export function generarHtmlInforme(datos: DatosInforme): string {
  const { caso } = datos
  const ojos = ojosDelCaso(caso)
  const hojasDeOjo = datos.comparativas.length
  const total = 3 + hojasDeOjo
  let n = 0
  const meta = (): string => {
    n += 1
    return `<div class="cab-meta">
      <div class="codigo">${esc(caso.codigo)}</div>
      <div>${esc(fecha(datos.generadoEn))}</div>
      <div>versión ${esc(datos.version)} · página ${n} de ${total}</div>
    </div>`
  }
  const ref = (extra: string): string => {
    n += 1
    return `<div class="ref">${esc(caso.codigo)}${extra} · página ${n} de ${total}</div>`
  }

  const portada = `<section class="hoja">
  <div class="cab">
    <div class="cab-marca">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="14" fill="none" stroke="#12506E" stroke-width="1.6"></circle>
        <circle cx="15" cy="15" r="5.4" fill="#12506E"></circle>
        <path d="M3.4 15 A 13 9 0 0 1 26.6 15" fill="none" stroke="#12506E" stroke-width="1.6"></path>
        <path d="M3.4 15 A 13 9 0 0 0 26.6 15" fill="none" stroke="#12506E" stroke-width="1.6" opacity="0.35"></path>
      </svg>
      <div>
        <h1>Calculator Vilamar</h1>
        <div class="sub">Informe comparativo de cálculo de LIO</div>
      </div>
    </div>
    ${meta()}
  </div>
  ${bandaDeLente(datos)}
  <div class="tarjetas">
    ${datos.comparativas.map((c) => tarjetaDeOjo(c)).join('')}
  </div>
  ${bloqueIncidencias(datos)}
  <div class="pie">
    Cada cifra de esta portada es lo que han devuelto las webs: el valor cuando
    coinciden, y el rango cuando no. <strong>Nunca un valor intermedio calculado por
    este programa.</strong> El detalle por calculadora está en las hojas siguientes;
    el aviso legal completo, al final del documento.
  </div>
</section>`

  const hojasPorOjo = datos.comparativas
    .map(
      (c) => `<section class="hoja">
  <div class="cab-menor">
    <div class="titulo">${esc(c.ojo)} · ${esc(nombreLateralidad(c.ojo))}<span class="apunte">Resultado por calculadora</span></div>
    ${ref(` · ${c.ojo}`)}
  </div>
  ${tablaComparativa(c)}
  <div class="pie">
    Los valores son los devueltos por cada web, sin transformación. Una casilla con
    «Ver alternativas» significa que la calculadora ha devuelto varias y no ha
    señalado ninguna: están todas en el detalle.
  </div>
</section>`,
    )
    .join('')

  const hojaBiometria = `<section class="hoja">
  <div class="cab-menor">
    <div class="titulo">Biometría confirmada<span class="apunte">Cada dato, con su origen</span></div>
    ${ref('')}
  </div>
  <p class="nota">
    Cada valor lleva de dónde salió y, si se corrigió a mano, lo que ponía el
    informe. Un dato que falta se dice como ausente: nunca se rellena con un cero.
  </p>
  ${ojos.map((l) => seccionEntradas(caso, ojoDe(caso, l))).join('')}
  <div class="pie">
    «Del informe» lo leyó el programa del documento. «Derivado del informe» lo
    calculó a partir de otros datos suyos, y lleva la cuenta escrita. «Aportado» y
    «Corregido» los escribió una persona.
  </div>
</section>`

  const hojaTrazabilidad = `<section class="hoja">
  <div class="cab-menor">
    <div class="titulo">Trazabilidad<span class="apunte">Qué dice cada calculadora haber recibido</span></div>
    ${ref('')}
  </div>
  ${seccionAuditoria(caso)}
  ${seccionAusencias(datos)}
  ${seccionAvisos(datos.avisos)}
  <div class="pie">
    Esto no es lo que el programa cree haber enviado: es lo que cada web enseña en
    su pantalla. Es lo que permite auditar entrada → calculadora → salida meses
    después, sin saber de quién es el ojo.
  </div>
  <footer class="principal">
    <p>
      Los resultados de este informe <strong>proceden de las calculadoras externas</strong>
      Kane (iolformula.com), EVO Toric (evoiolcalculator.com) y Barrett Toric
      (ASCRS/APACRS). <strong>Calculator Vilamar no calcula potencias de lente</strong>
      por su cuenta y <strong>no emite ninguna recomendación clínica</strong>: recoge lo
      que devuelve cada web y lo presenta junto. Cuando las calculadoras no coinciden se
      enseña el rango de lo que han devuelto, nunca un valor intermedio calculado por
      este programa. La decisión de qué lente implantar es del cirujano.
    </p>
    <p>
      Este documento <strong>no contiene el nombre, la fecha de nacimiento ni el número
      de historia</strong> del paciente: el caso se identifica solo por su código local.
      Se ha generado en este ordenador, sin enviar nada a ningún servidor.
    </p>
  </footer>
</section>`

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Calculator Vilamar · ${esc(caso.codigo)}</title>
<style>${ESTILOS}</style>
</head>
<body>
${portada}
${hojasPorOjo}
${hojaBiometria}
${hojaTrazabilidad}
</body>
</html>`
}
