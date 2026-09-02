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
  aparatosDe,
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

/**
 * Lo que se enseña de UNA casilla (calculadora × ojo) en el informe.
 *
 * Antes esto solo llevaba la captura de pantalla (`CapturaInforme`), y solo
 * existía una entrada por casilla con éxito. Ahora hay una entrada por cada
 * casilla INTENTADA, tenga o no resultado utilizable: el informe simplificado
 * (`generarHtmlInforme`) necesita poder decir «Barrett no ha podido calcular:
 * falta el WTW» en vez de omitir esa página en silencio.
 */
export interface ResultadoInforme {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  /**
   * De qué biómetro son los datos de este resultado (D47, 27/08/2026). Un
   * caso que solo usa un aparato lleva siempre `APARATO_PRINCIPAL` aquí, así
   * que su informe no cambia nada respecto a antes de D47.
   */
  readonly aparato: string
  /** Ausente si el resultado fue de éxito pero la captura no se pudo guardar o leer. */
  readonly dataUri?: string
  /**
   * La estimación PROPIA de Calculator Vilamar para esta casilla (D43) — no
   * la opción que la calculadora haya destacado. `refraccionPrevista`,
   * `cilindroResidual` y `ejeResidual` viajan con ella desde el 27/08/2026,
   * para la tabla comparativa detallada del informe: son los mismos datos
   * de la fila elegida, no un cálculo nuevo — ver `LenteEstimada` en
   * `comparacion/recomendacion.ts`.
   */
  readonly recomendada?: {
    readonly esfera: number
    readonly cilindro?: number
    readonly eje?: number
    readonly refraccionPrevista?: number
    readonly cilindroResidual?: number
    readonly ejeResidual?: number
  }
  /** Por qué esta casilla no tiene un resultado utilizable, si no lo tiene. */
  readonly fallo?: string
}

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
  /** Lo que se enseña de cada casilla intentada, en el orden en que se enseñan. */
  readonly resultados: readonly ResultadoInforme[]
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

/**
 * El diagrama del eje. **Con los datos que ya había.**
 *
 * Las calculadoras de verdad lo traen —el Pentacam, EVO, Barrett—: un círculo con
 * la escala de grados y el eje al que va la lente. No es adorno: es lo que se mira
 * en quirófano para orientar la lente, y un informe comparativo sin él obliga a
 * volver a las webs.
 *
 * Se dibuja con cuatro cosas que el caso YA tiene, y ninguna hay que inventar:
 *
 *   eje de la LIO          lo devuelve cada calculadora en su resultado
 *   meridiano curvo        el eje de la K mayor (K2 @ 81° en el informe de arriba)
 *   astigmatismo corneal   la diferencia entre las dos K
 *   eje de la incisión     campo del caso, y el SIA con él
 *
 * ⚠️ **Se dibuja UN eje por calculadora, no «el» eje.** Si dos webs proponen ejes
 * distintos, salen las dos líneas con su color y su leyenda. Dibujar una sola
 * obligaría a elegir cuál, que es justo lo que este producto no hace.
 *
 * ⚠️ **El astigmatismo corneal se calcula aquí y NO se guarda como medida.** Es
 * aritmética sobre dos medidas confirmadas y se marca como derivado en su leyenda.
 * Convertirlo en un campo del modelo biométrico sería otra cosa —haría falta
 * decidirlo con perfil de dispositivo, como se hizo con la ACD— y no se hace de
 * tapadillo desde la capa de presentación.
 */

/** Color de cada calculadora en el diagrama y su leyenda. */
const COLOR_CALCULADORA: Readonly<Record<Calculadora, string>> = {
  EVO_TORIC: '#0B5F68',
  EVO_TORIC_SIN_CARA_POSTERIOR: '#0B5F68',
  BARRETT_TORIC: '#1B4C86',
  BARRETT_TORIC_CON_CARA_POSTERIOR: '#1B4C86',
  KANE: '#5B3B8A',
}

/**
 * Los dos extremos de un eje dentro del círculo.
 *
 * Notación oftalmológica, la misma del dibujo de las webs: 0° a la derecha, 90°
 * arriba, y creciendo en sentido antihorario. En SVG la Y crece hacia abajo, así
 * que el seno va restado.
 */
export function extremosDelEje(
  grados: number,
  cx: number,
  cy: number,
  r: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (grados * Math.PI) / 180
  const dx = Math.cos(rad) * r
  const dy = Math.sin(rad) * r
  return { x1: cx + dx, y1: cy - dy, x2: cx - dx, y2: cy + dy }
}

/** La K más curva del ojo, con su eje. Sin suponer que K2 sea siempre la mayor. */
export function meridianoCurvo(
  ojo: OjoBiometrico,
): { readonly poder: number; readonly eje?: number; readonly astigmatismo: number } | undefined {
  const k1 = ojo.medidas.K1
  const k2 = ojo.medidas.K2
  if (!k1 || !k2) return undefined
  // No se da por hecho el convenio K1 plana / K2 curva: se mira cuál es mayor.
  const curva = k2.valor >= k1.valor ? k2 : k1
  const ejeCurva = k2.valor >= k1.valor ? ojo.medidas.K2_EJE : ojo.medidas.K1_EJE
  return {
    poder: curva.valor,
    ...(ejeCurva ? { eje: ejeCurva.valor } : {}),
    astigmatismo: Math.abs(k2.valor - k1.valor),
  }
}

/** Distancia entre dos ejes entendidos como orientación (0–90). */
function separacion(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 180
  return bruta > 90 ? 180 - bruta : bruta
}

export function diagramaDeEje(c: Comparativa, ojo: OjoBiometrico | undefined): string {
  const ejes = c.celdas
    .filter((x) => x.eje.estado === 'VALOR')
    .map((x) => ({
      nombre: x.nombre,
      color: COLOR_CALCULADORA[x.calculadora],
      grados: (x.eje as { estado: 'VALOR'; valor: number }).valor,
      modelo: x.designacion.estado === 'VALOR' ? x.designacion.valor : undefined,
    }))
  const curvo = ojo ? meridianoCurvo(ojo) : undefined
  const incision = ojo?.medidas.EJE_INCISION
  const sia = ojo?.medidas.SIA
  const wtw = ojo?.medidas.WTW

  // Sin ningún eje que dibujar no se pinta un ojo vacío: se dice que no lo hay.
  if (ejes.length === 0 && curvo?.eje === undefined) {
    return `<section class="diagrama">
      <h2>Eje de la lente · ${esc(nombreLateralidad(c.ojo))}</h2>
      <p class="nota">Ninguna calculadora ha devuelto un eje para este ojo, y el informe no trae el eje de las queratometrías. No hay nada que dibujar.</p>
    </section>`
  }

  const iguales = ejes.length >= 2 && ejes.every((e) => separacion(e.grados, ejes[0]!.grados) < 0.5)

  // El número va en el centro SOLO si no hay nada que elegir: una sola calculadora,
  // o varias de acuerdo. Con ejes distintos el centro se queda vacío a propósito.
  const centro =
    ejes.length === 0 ? '' : iguales || ejes.length === 1 ? `${ejes[0]!.grados.toFixed(0)}°` : ''

  const leyenda = [
    ...ejes.map(
      (ej) =>
        `<div><span class="clave" style="background:${ej.color}"></span>Eje LIO ${esc(ej.nombre)} ${ej.grados.toFixed(0)}°${ej.modelo ? ` · ${esc(ej.modelo)}` : ''}</div>`,
    ),
    curvo?.eje === undefined
      ? ''
      : `<div><span class="clave discontinua"></span>Meridiano corneal curvo ${curvo.eje.toFixed(0)}° · ${curvo.poder.toFixed(2)} D</div>`,
    incision === undefined
      ? ''
      : `<div><span class="clave" style="background:#0F1A24"></span>Incisión ${incision.valor.toFixed(0)}°${sia ? ` · SIA ${sia.valor.toFixed(2)} D` : ''}</div>`,
  ]
    .filter(Boolean)
    .join('')

  const apuntes: string[] = []
  if (curvo) {
    apuntes.push(
      `Astigmatismo corneal <strong>${curvo.astigmatismo.toFixed(2)} D</strong> <span class="marca marca-derivado">Derivado</span>, de la diferencia entre las dos queratometrías confirmadas.`,
    )
  }
  if (curvo?.eje !== undefined && ejes.length > 0) {
    const seps = ejes.map((e) => ({
      nombre: e.nombre,
      d: separacion(e.grados, curvo.eje as number),
    }))
    apuntes.push(
      `Separación entre el meridiano curvo y el eje de la lente: ${seps
        .map((s) => `${esc(s.nombre)} ${s.d.toFixed(0)}°`)
        .join(' · ')}.`,
    )
  }
  if (ejes.length >= 2 && !iguales) {
    apuntes.push(
      `<strong>Las calculadoras no proponen el mismo eje.</strong> Se dibujan los ${ejes.length}; elegir uno no le corresponde a este programa.`,
    )
  }
  apuntes.push('Esquema orientativo: las proporciones no son las de este ojo, los números sí.')

  return `<section class="diagrama">
    <h2>La lente en el ojo · ${esc(nombreLateralidad(c.ojo))}</h2>
    <div class="diagrama-caja">
      ${ojoDeFrente(ejes, curvo?.eje, incision?.valor, wtw?.valor, centro)}
      <div class="diagrama-lado">
        <div class="leyenda">${leyenda}</div>
        ${apuntes.length > 0 ? `<div class="apuntes">${apuntes.map((a) => `<div>${a}</div>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>`
}

/**
 * El ojo de frente, con la lente tórica dentro.
 *
 * Sustituye al círculo con rayas: la escala de grados sigue estando, pero ahora
 * sobre un ojo —limbo, iris, pupila— y con la lente dibujada dentro, con sus
 * hápticos y sus marcas de alineación puestas en el eje que devuelve la
 * calculadora. Es lo que se mira para orientar la lente en quirófano.
 *
 * ⚠️ **Es un ESQUEMA: las proporciones no son las del ojo de nadie.** Los números
 * anotados sí son los del caso; el dibujo es la referencia para leerlos. Un dibujo
 * que pareciera a escala invitaría a medir sobre el papel, y eso no se puede hacer.
 */
function ojoDeFrente(
  ejes: readonly { readonly nombre: string; readonly color: string; readonly grados: number }[],
  curvoEje: number | undefined,
  incisionEje: number | undefined,
  wtw: number | undefined,
  centro: string,
): string {
  const cx = 82
  const cy = 82
  const rLimbo = 66
  const rIris = 54
  const rOptica = 34
  const rPupila = 21

  // La escala, cada 15°, con rótulo cada 45°. Fuera del limbo, para no taparlo.
  const marcas: string[] = []
  for (let g = 0; g < 180; g += 15) {
    const largo = g % 45 === 0 ? 7 : 4
    const a = extremosDelEje(g, cx, cy, rLimbo + 8)
    const b = extremosDelEje(g, cx, cy, rLimbo + 8 - largo)
    marcas.push(
      `<line x1="${a.x1.toFixed(1)}" y1="${a.y1.toFixed(1)}" x2="${b.x1.toFixed(1)}" y2="${b.y1.toFixed(1)}" stroke="#C2CBD3" stroke-width="1"></line>`,
      `<line x1="${a.x2.toFixed(1)}" y1="${a.y2.toFixed(1)}" x2="${b.x2.toFixed(1)}" y2="${b.y2.toFixed(1)}" stroke="#C2CBD3" stroke-width="1"></line>`,
    )
  }
  const rotulos = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((g) => {
      const p = extremosDelEje(g, cx, cy, rLimbo + 17)
      return `<text x="${p.x1.toFixed(1)}" y="${(p.y1 + 2.4).toFixed(1)}" text-anchor="middle" font-size="6.2" fill="#8B97A2" font-family="Consolas, ui-monospace, monospace">${g}</text>`
    })
    .join('')

  /**
   * La lente, girada al eje que toca.
   *
   * En notación oftalmológica el ángulo crece en sentido antihorario y en SVG
   * `rotate` gira en el horario, así que se gira por el ángulo NEGADO. Es el mismo
   * cambio de signo que en `extremosDelEje`, y por eso está dicho en los dos.
   */
  const lente = (grados: number, color: string, segunda: boolean): string => {
    const g = (-grados).toFixed(2)
    const guion = segunda ? ' stroke-dasharray="6 5"' : ''
    return `<g transform="rotate(${g} ${cx} ${cy})" fill="none" stroke="${color}">
      <path d="M ${cx - rOptica} ${cy} C ${cx - rOptica - 26} ${cy - 24}, ${cx - rOptica - 34} ${cy + 16}, ${cx - rOptica - 12} ${cy + 21}" stroke-width="2.6" stroke-linecap="round" opacity="0.75"></path>
      <path d="M ${cx + rOptica} ${cy} C ${cx + rOptica + 26} ${cy + 24}, ${cx + rOptica + 34} ${cy - 16}, ${cx + rOptica + 12} ${cy - 21}" stroke-width="2.6" stroke-linecap="round" opacity="0.75"></path>
      <circle cx="${cx}" cy="${cy}" r="${rOptica}" stroke-width="1.8"${guion} opacity="0.95"></circle>
      <line x1="${cx - rOptica + 3}" y1="${cy}" x2="${cx - rOptica + 13}" y2="${cy}" stroke-width="3.4" stroke-linecap="round"></line>
      <line x1="${cx + rOptica - 13}" y1="${cy}" x2="${cx + rOptica - 3}" y2="${cy}" stroke-width="3.4" stroke-linecap="round"></line>
    </g>`
  }

  const lineaCurvo =
    curvoEje === undefined
      ? ''
      : (() => {
          const e = extremosDelEje(curvoEje, cx, cy, rLimbo - 2)
          return `<line x1="${e.x1.toFixed(1)}" y1="${e.y1.toFixed(1)}" x2="${e.x2.toFixed(1)}" y2="${e.y2.toFixed(1)}" stroke="#8B97A2" stroke-width="1.4" stroke-dasharray="5 4"></line>`
        })()

  const marcaIncision =
    incisionEje === undefined
      ? ''
      : (() => {
          const fuera = extremosDelEje(incisionEje, cx, cy, rLimbo + 4)
          const dentro = extremosDelEje(incisionEje, cx, cy, rLimbo - 7)
          return `<line x1="${fuera.x1.toFixed(1)}" y1="${fuera.y1.toFixed(1)}" x2="${dentro.x1.toFixed(1)}" y2="${dentro.y1.toFixed(1)}" stroke="#0F1A24" stroke-width="3.4" stroke-linecap="round"></line>`
        })()

  // El WTW es un diámetro: se acota sobre el limbo, que es lo que mide.
  const acotaWtw =
    wtw === undefined
      ? ''
      : `<g stroke="#B7C4CE" stroke-width="0.9" fill="none">
      <line x1="${cx - rLimbo}" y1="${cy + rLimbo + 22}" x2="${cx + rLimbo}" y2="${cy + rLimbo + 22}"></line>
      <line x1="${cx - rLimbo}" y1="${cy + rLimbo + 18}" x2="${cx - rLimbo}" y2="${cy + rLimbo + 26}"></line>
      <line x1="${cx + rLimbo}" y1="${cy + rLimbo + 18}" x2="${cx + rLimbo}" y2="${cy + rLimbo + 26}"></line>
    </g>
    <text x="${cx}" y="${cy + rLimbo + 34}" text-anchor="middle" font-size="6.6" fill="#5C6B78" font-family="Consolas, ui-monospace, monospace">WTW ${wtw.toFixed(2)} mm</text>`

  return `<svg width="205" height="${wtw === undefined ? 205 : 222}" viewBox="0 0 164 ${wtw === undefined ? 164 : 178}" role="img" aria-label="Esquema del ojo de frente con la lente intraocular orientada">
    <circle cx="${cx}" cy="${cy}" r="${rLimbo}" fill="#F2F7FA" stroke="#C9D3DB" stroke-width="1.2"></circle>
    <circle cx="${cx}" cy="${cy}" r="${rIris}" fill="#E3EDF6" stroke="#B9CFE4" stroke-width="1"></circle>
    <circle cx="${cx}" cy="${cy}" r="${rPupila}" fill="#243642"></circle>
    ${marcas.join('')}
    ${rotulos}
    ${lineaCurvo}
    ${ejes.map((e, i) => lente(e.grados, e.color, i > 0)).join('')}
    ${marcaIncision}
    ${centro === '' ? '' : `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#fff" font-family="Consolas, ui-monospace, monospace">${centro}</text>`}
    ${acotaWtw}
  </svg>`
}

/**
 * El corte del ojo, con la biometría anotada encima.
 *
 * Aquí van los datos que se miden en profundidad —AL, CCT, ACD, LT— cada uno con
 * su cota sobre la parte del ojo que mide. Es la figura que traen los informes de
 * los biómetros, y sirve para lo mismo: leer los números sabiendo a qué se
 * refieren, sin tener que recordar qué era cada sigla.
 *
 * ⚠️ **Es el ojo ANTES de la cirugía**, con su cristalino: el LT es el grosor de
 * ese cristalino, no de la lente que se va a implantar. Dibujar aquí la lente
 * intraocular y a la vez acotar el LT sería contradictorio — la lente sustituye al
 * cristalino—. La lente va en la otra figura, la de frente.
 *
 * ⚠️ **Esquema, no a escala.** Las cotas llevan el número del caso; el dibujo es la
 * referencia. Un ojo a escala con la AL entera dejaría el CCT en medio píxel.
 */
export function corteDelOjo(ojo: OjoBiometrico): string {
  const m = ojo.medidas
  const hay = (c: 'AL' | 'CCT' | 'ACD' | 'LT') => m[c] !== undefined
  if (!hay('AL') && !hay('ACD') && !hay('LT') && !hay('CCT')) return ''

  // Geometría del esquema. Nada de esto depende de los valores: es un dibujo fijo
  // sobre el que se anotan, para que dos ojos se puedan comparar de un vistazo.
  const xCornea = 34
  const xIris = 74
  const xCristalinoIni = 76
  const xCristalinoFin = 116
  const xRetina = 340
  const yc = 96

  const cota = (
    x1: number,
    x2: number,
    y: number,
    etiqueta: string,
    valor: string,
    color: string,
  ): string => `<g stroke="${color}" stroke-width="0.9" fill="none">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>
      <line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"></line>
      <line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"></line>
    </g>
    <text x="${(x1 + x2) / 2}" y="${y - 7}" text-anchor="middle" font-size="7.4" font-weight="600" fill="${color}" font-family="Consolas, ui-monospace, monospace">${etiqueta} ${valor}</text>`

  const cotaFina = (x: number, y: number, etiqueta: string, valor: string): string =>
    `<line x1="${x}" y1="${y}" x2="${x - 16}" y2="${y - 22}" stroke="#8B97A2" stroke-width="0.8"></line>
     <text x="${x - 17}" y="${y - 25}" text-anchor="end" font-size="7.2" fill="#5C6B78" font-family="Consolas, ui-monospace, monospace">${etiqueta} ${valor}</text>`

  return `<svg width="470" height="176" viewBox="0 0 372 140" role="img" aria-label="Esquema del corte del ojo con la biometría anotada">
    <path d="M ${xRetina} ${yc} A 120 74 0 1 1 ${xCornea + 26} ${yc - 40} " fill="#FBFDFE" stroke="#C9D3DB" stroke-width="1.2"></path>
    <path d="M ${xRetina} ${yc} A 120 74 0 1 0 ${xCornea + 26} ${yc + 40}" fill="#FBFDFE" stroke="#C9D3DB" stroke-width="1.2"></path>
    <path d="M ${xCornea + 26} ${yc - 40} C ${xCornea - 6} ${yc - 30}, ${xCornea - 6} ${yc + 30}, ${xCornea + 26} ${yc + 40}" fill="#EAF3F8" stroke="#12506E" stroke-width="1.6"></path>
    <path d="M ${xIris} ${yc - 38} L ${xIris} ${yc - 15}" stroke="#1B4C86" stroke-width="3.2" stroke-linecap="round"></path>
    <path d="M ${xIris} ${yc + 38} L ${xIris} ${yc + 15}" stroke="#1B4C86" stroke-width="3.2" stroke-linecap="round"></path>
    <path d="M ${xCristalinoIni + 20} ${yc - 30} C ${xCristalinoFin + 4} ${yc - 22}, ${xCristalinoFin + 4} ${yc + 22}, ${xCristalinoIni + 20} ${yc + 30} C ${xCristalinoIni - 22} ${yc + 22}, ${xCristalinoIni - 22} ${yc - 22}, ${xCristalinoIni + 20} ${yc - 30} Z" fill="#EDF1F4" stroke="#5C6B78" stroke-width="1.2"></path>
    <line x1="${xCornea + 26}" y1="${yc}" x2="${xRetina}" y2="${yc}" stroke="#C2CBD3" stroke-width="0.8" stroke-dasharray="4 4"></line>
    ${hay('AL') ? cota(xCornea + 26, xRetina, 22, 'AL', `${m.AL!.valor.toFixed(2)} mm`, '#12506E') : ''}
    ${hay('ACD') ? cota(xCornea + 26, xCristalinoIni - 2, 128, 'ACD', `${m.ACD!.valor.toFixed(2)} mm`, '#1B4C86') : ''}
    ${hay('LT') ? cota(xCristalinoIni - 2, xCristalinoFin + 24, 60, 'LT', `${m.LT!.valor.toFixed(2)} mm`, '#5B3B8A') : ''}
    ${hay('CCT') ? cotaFina(xCornea + 6, yc - 30, 'CCT', `${m.CCT!.valor.toFixed(0)} µm`) : ''}
    <text x="${xCornea + 26}" y="${yc + 52}" font-size="6.8" fill="#8B97A2" font-family="Consolas, ui-monospace, monospace">córnea</text>
    <text x="${xCristalinoIni + 2}" y="${yc + 52}" font-size="6.8" fill="#8B97A2" font-family="Consolas, ui-monospace, monospace">cristalino</text>
    <text x="${xRetina - 34}" y="${yc + 52}" font-size="6.8" fill="#8B97A2" font-family="Consolas, ui-monospace, monospace">retina</text>
  </svg>`
}

/** La figura del corte con su rótulo, para la hoja de biometría. */
export function figuraBiometrica(ojo: OjoBiometrico): string {
  const svg = corteDelOjo(ojo)
  if (svg === '') return ''
  return `<div class="figura">
    ${svg}
    <p class="pie-figura">
      Esquema del ojo <strong>antes de la cirugía</strong>, con las medidas de
      profundidad anotadas donde se toman. El LT es el grosor del cristalino, que la
      lente sustituye. Las proporciones del dibujo no son las del ojo: los números
      sí. <span class="marca marca-derivado">Esquema</span>
    </p>
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
  section.diagrama { margin-top: 14px; }
  .diagrama-caja { display: flex; gap: 22px; align-items: center; }
  .diagrama-lado { flex: 1; }
  .leyenda { font-size: 8pt; color: var(--gris); line-height: 1.75; }
  .leyenda .clave {
    display: inline-block; width: 16px; height: 3px; vertical-align: middle;
    margin-right: 6px; border-radius: 2px;
  }
  .leyenda .clave.discontinua {
    height: 0; border-top: 1.5px dashed var(--gris-claro); background: none;
  }
  .apuntes {
    margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--linea-suave);
    font-size: 8pt; color: var(--gris); line-height: 1.5;
  }
  .apuntes > div { margin-top: 3px; }
  .apuntes strong { color: var(--tinta); }

  .figura { margin-top: 6px; text-align: center; }
  .figura svg { max-height: 24mm; }
  /*
   * La tabla de biometria va compacta a proposito: es la unica hoja que puede
   * llegar a 24 filas, y con el interlineado general se pasaba de pagina. Medido
   * con printToPDF, no supuesto.
   */
  table.datos { font-size: 7.8pt; line-height: 1.2; }
  table.datos th,
  table.datos td { padding: 1.6px 6px; }
  table.datos .procedencia, table.datos .evidencia, table.datos .original { font-size: 7pt; }
  .pie-figura {
    font-size: 7pt; color: var(--gris); line-height: 1.45; margin: 2px auto 0;
    max-width: 130mm; text-align: left;
  }
  .pie-figura strong { color: var(--tinta); }

  footer.principal {
    margin-top: 12px; padding-top: 10px; border-top: 2px solid var(--tinta);
    font-size: 7.5pt; color: var(--gris); line-height: 1.5;
  }
  footer.principal p { margin: 0 0 5px; }
  footer.principal strong { color: var(--tinta); }

  code { font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace; font-size: 8pt; }

  /* Capturas de pantalla, tal cual — la imagen manda el tamaño, la hoja se adapta. */
  .captura { display: flex; justify-content: center; align-items: flex-start; margin-top: 10px; }
  .captura img { max-width: 100%; max-height: 250mm; object-fit: contain; border: 1px solid var(--linea); border-radius: 4px; }
  .captura-ausente { color: var(--gris); font-style: italic; margin-top: 10px; }
  .lente-recomendada { margin-top: 16px; font-size: 11pt; text-align: center; }
  .lente-recomendada strong { font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace; }
  .no-vinculante { font-size: 8.5pt; color: var(--gris); font-style: italic; }

  /* El cuadro final — vistoso a propósito, y con el aviso de "no vinculante" imposible de no ver. */
  .aviso-no-vinculante {
    background: #FFF7E6; border: 1px solid #F0C36D; border-radius: 6px;
    padding: 10px 14px; font-size: 9pt; line-height: 1.5; color: #6B4E00; margin-bottom: 16px;
  }
  .aviso-no-vinculante strong { color: #4A3600; }
  .tarjetas-resumen { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .tarjeta-resumen {
    flex: 1 1 0; min-width: 46mm; max-width: 60mm; border-radius: 8px; padding: 12px;
    text-align: center; border: 2px solid transparent; color: #fff;
  }
  .tarjeta-resumen.evo { background: #12506E; }
  .tarjeta-resumen.barrett { background: #7A3E9D; }
  .tarjeta-resumen.kane { background: #1B7F5E; }
  .tarjeta-nombre { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.85; }
  .tarjeta-valor {
    margin-top: 6px; font-size: 12pt; font-weight: 600;
    font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
  }
  .tarjeta-sin-dato { margin-top: 6px; font-size: 9pt; font-style: italic; opacity: 0.85; }

  /*
   * El aparato, EN GRANDE, en cada hoja de un ojo con más de un biómetro
   * (D47, 27/08/2026, petición expresa del dueño) — con un solo aparato no
   * se pinta nunca, para que un caso de siempre no note nada distinto.
   */
  .banda-aparato {
    margin-top: 10px; padding: 7px 14px; border-radius: 8px;
    background: var(--tinta); color: #fff; text-align: center;
    font-size: 12pt; font-weight: 700; letter-spacing: 0.02em;
  }
  .banda-aparato .rot {
    display: block; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; opacity: 0.7; margin-bottom: 1px;
  }

  /* La tabla comparativa detallada — un tono de fondo por aparato, para verlos agrupados de un vistazo. */
  table.tabla-detallada { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
  table.tabla-detallada th {
    text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--tinta);
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gris);
  }
  table.tabla-detallada td { padding: 6px 8px; border-bottom: 1px solid var(--linea); }
  table.tabla-detallada td.num {
    font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace; text-align: right;
  }
  table.tabla-detallada td.aparato-cel { font-weight: 600; }
`

/**
 * Una hoja del informe, antes de saber qué número le toca.
 *
 * El informe se arma en DOS pasos —primero las hojas, después la numeración— y no
 * por gusto: el número total depende de cuántas hojas salgan, y eso depende del
 * caso. Un ojo con tres calculadoras y alternativas saca más hojas que un ojo con
 * una y sin ellas.
 *
 * Antes el total era `3 + ojos`, una cuenta fija, y con dos ojos el PDF traía 8
 * páginas mientras el pie ponía «página 2 de 5». Medido con `printToPDF`, no
 * supuesto.
 */
interface Hoja {
  /** La portada lleva cabecera grande; el resto, la pequeña. */
  readonly portada?: boolean
  readonly titulo?: string
  readonly apunte?: string
  /** Lo que se añade al código en la referencia: « · OD». */
  readonly refExtra?: string
  /**
   * El aparato de esta hoja, EN GRANDE (D47, 27/08/2026) — solo cuando el
   * ojo tiene más de uno: con un solo aparato ninguna hoja lo lleva, para
   * que un caso de siempre no note nada distinto.
   */
  readonly aparatoDestacado?: string
  readonly cuerpo: string
  readonly pie: string
}

/**
 * Numera las hojas y las convierte en el documento HTML final.
 *
 * Común a las dos versiones del informe (`generarHtmlInforme` y
 * `generarHtmlInformeDetallado`): lo único que cambia entre ellas es QUÉ
 * hojas se construyen, no cómo se numeran, se encabezan o se serializan.
 */
function documentoDeHojas(
  caso: Caso,
  version: string,
  generadoEn: string,
  hojas: readonly Hoja[],
): string {
  const total = hojas.length
  const cuerpoDelDocumento = hojas
    .map((h, i) => {
      const n = i + 1
      const ultima = n === total
      const cabecera = h.portada
        ? `<div class="cab">
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
    <div class="cab-meta">
      <div class="codigo">${esc(caso.codigo)}</div>
      <div>${esc(fecha(generadoEn))}</div>
      <div>versión ${esc(version)} · página ${n} de ${total}</div>
    </div>
  </div>`
        : `<div class="cab-menor">
    <div class="titulo">${esc(h.titulo ?? '')}${h.apunte ? `<span class="apunte">${esc(h.apunte)}</span>` : ''}</div>
    <div class="ref">${esc(caso.codigo)}${esc(h.refExtra ?? '')} · página ${n} de ${total}</div>
  </div>`

      const bandaAparato = h.aparatoDestacado
        ? `<div class="banda-aparato"><span class="rot">Aparato</span>${esc(h.aparatoDestacado)}</div>`
        : ''

      return `<section class="hoja">
  ${cabecera}
  ${bandaAparato}
  ${h.cuerpo}
  <div class="pie">${h.pie}</div>
  ${ultima ? PIE_LEGAL : ''}
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Calculator Vilamar · ${esc(caso.codigo)}</title>
<style>${ESTILOS}</style>
</head>
<body>
${cuerpoDelDocumento}
</body>
</html>`
}

/**
 * Una línea con la estimación PROPIA de Calculator Vilamar (D43) — nunca la
 * opción que la calculadora haya destacado, aunque coincidan. Se dice así en
 * el propio texto, para que no se confunda con lo que dice la web: eso sigue
 * siendo, sin interpretar, la captura de pantalla de encima.
 */
function lenteRecomendadaTexto(recomendada: ResultadoInforme['recomendada']): string {
  if (!recomendada) return ''
  const partes = [`${recomendada.esfera.toFixed(2)} D`]
  if (recomendada.cilindro !== undefined) partes.push(`Cilindro ${recomendada.cilindro.toFixed(2)} D`)
  // El eje que se enseña es el RESIDUAL —el que la propia calculadora dice
  // que quedaría con esta opción—, no `recomendada.eje` (el meridiano
  // corneal curvo, fijo, que usa el criterio para ELEGIR la fila, no para
  // mostrarla). Fallo real encontrado el 01/09/2026 con un PDF real: el eje
  // corneal es el mismo para las cinco casillas de un ojo —salía «Eje 0°»
  // repetido cinco veces—, mientras que el que cada calculadora publica
  // varía por calculadora y por córnea posterior sí/no, que es la
  // información que de verdad distingue una casilla de otra.
  if (recomendada.ejeResidual !== undefined) {
    partes.push(`Eje ${recomendada.ejeResidual.toFixed(0)}°`)
  }
  return `<p class="lente-recomendada">Estimación de Calculator Vilamar <span class="no-vinculante">(no vinculante)</span>: <strong>${esc(partes.join(' · '))}</strong></p>`
}

/** Clase CSS de cada calculadora, solo para las tarjetas del cuadro final. */
const CLASE_TARJETA: Record<Calculadora, string> = {
  EVO_TORIC: 'evo',
  EVO_TORIC_SIN_CARA_POSTERIOR: 'evo',
  BARRETT_TORIC: 'barrett',
  BARRETT_TORIC_CON_CARA_POSTERIOR: 'barrett',
  KANE: 'kane',
}

/** Si ese dataset concreto (ojo × aparato) tiene algo de córnea posterior medida. */
function hayCaraPosteriorEn(caso: Caso, ojo: Lateralidad, aparato: string): boolean {
  const medidas = ojoDe(caso, ojo, aparato).medidas
  return medidas.PK1 !== undefined || medidas.PK2 !== undefined
}

/**
 * El título de cada calculadora EN EL INFORME (petición expresa del dueño,
 * 27/08/2026): «estimado» para la variante que no manda córnea posterior
 * medida —EVO sin ella, Barrett en «Predicted PCA»—, «con córnea posterior
 * medida» para la que sí —EVO con ella, Barrett en «Measured PCA»—. Distinto
 * de `fichaDe(...).nombre`, que sigue igual en el resto de la aplicación
 * (botones de «Repetir», cabeceras de la pantalla de resultados…): esto es
 * solo para que, en el PDF, quede clarísimo de un vistazo qué cálculo es
 * cada hoja sin tener que leer el pie de la captura.
 *
 * ⚠️ **`EVO_TORIC` y `BARRETT_TORIC` (las calculadoras BASE) son ambiguas
 * sin mirar el dato de verdad.** `EVO_TORIC` manda la córnea posterior SI el
 * dataset la tiene, así que titularla siempre «con córnea posterior medida»
 * mentiría en el caso normal —sin córnea posterior— donde es la única hoja
 * de EVO que existe. Por eso necesita `hayCaraPosterior`: el sufijo solo
 * aparece cuando de verdad hay una comparación que hacer, es decir, cuando
 * la variante contraria (D45) también se ha calculado.
 */
function tituloCalculadoraInforme(calculadora: Calculadora, hayCaraPosterior: boolean): string {
  if (calculadora === 'EVO_TORIC_SIN_CARA_POSTERIOR') return 'EVO Toric — estimado'
  if (calculadora === 'BARRETT_TORIC_CON_CARA_POSTERIOR') {
    return 'Barrett Toric — con córnea posterior medida'
  }
  if (calculadora === 'EVO_TORIC' && hayCaraPosterior) return 'EVO Toric — con córnea posterior medida'
  if (calculadora === 'BARRETT_TORIC' && hayCaraPosterior) return 'Barrett Toric — estimado'
  return fichaDe(calculadora).nombre
}

/**
 * Los datos de entrada de un aparato, al principio del informe (D47,
 * 27/08/2026, petición expresa del dueño): antes de ver ningún cálculo, qué
 * se ha usado para calcular y de dónde salió cada dato — la misma tabla que
 * ya usa el informe detallado (`seccionEntradas`), y el mismo esquema del
 * ojo con la biometría anotada (`figuraBiometrica`), reutilizados aquí.
 */
function hojaBiometriaAparato(
  caso: Caso,
  lado: Lateralidad,
  aparato: string,
  variosAparatos: boolean,
): Hoja {
  const ojo = ojoDe(caso, lado, aparato)
  return {
    titulo: `Datos de entrada · ${nombreLateralidad(lado)}`,
    apunte: 'Lo que se ha usado para calcular',
    refExtra: ` · ${lado}`,
    ...(variosAparatos ? { aparatoDestacado: aparato } : {}),
    cuerpo: `${seccionEntradas(caso, ojo)}${figuraBiometrica(ojo)}`,
    pie: `Datos de entrada confirmados de ${esc(nombreLateralidad(lado))}${
      variosAparatos ? ` · ${esc(aparato)}` : ''
    }, antes de calcular.`,
  }
}

/**
 * Tonos para distinguir cada aparato de un vistazo en la tabla comparativa
 * detallada (D47) — se reparten por orden de aparición, no por calculadora:
 * es la fila la que dice de qué aparato es, no la columna.
 */
const TONOS_APARATO: readonly { readonly fondo: string; readonly borde: string }[] = [
  { fondo: '#E7F3EC', borde: '#8FC7A6' },
  { fondo: '#EAF3F8', borde: '#8FBBDA' },
  { fondo: '#EFE8F8', borde: '#C3A6E8' },
  { fondo: '#FDF9EF', borde: '#E0C177' },
  { fondo: '#F7FAFC', borde: '#C2CBD3' },
]

/**
 * La tabla comparativa detallada (petición expresa del dueño, 27/08/2026):
 * una fila por casilla intentada, con el aparato, la calculadora, el ojo, la
 * lente de la estimación propia (D43) y sus residuales — para verlo todo
 * junto sin pasar hoja a hoja. Solo se genera si el ojo tiene algo que
 * enseñar; con un caso vacío no aparece.
 *
 * ⚠️ No sustituye a nada: el detalle exacto de cada calculadora sigue en su
 * propia hoja, con su captura sin interpretar. Esto es una lectura rápida
 * ADEMÁS, marcada igual que el resto de estimaciones propias — opcional y
 * no vinculante (D43).
 */
function tablaComparativaDetallada(
  caso: Caso,
  ojo: Lateralidad,
  resultados: readonly ResultadoInforme[],
): Hoja | undefined {
  const deEsteOjo = resultados.filter((r) => r.ojo === ojo)
  if (deEsteOjo.length === 0) return undefined

  // El orden de aparición es el mismo con el que ya salen las hojas
  // (aparato a aparato): así el color de una fila coincide con el bloque de
  // hojas que tiene encima.
  const aparatos = [...new Set(deEsteOjo.map((r) => r.aparato))]
  const tonoDe = (aparato: string): { readonly fondo: string; readonly borde: string } =>
    TONOS_APARATO[aparatos.indexOf(aparato) % TONOS_APARATO.length] ?? TONOS_APARATO[0]!

  const num = (v: number | undefined, sufijo = '', decimales = 2): string =>
    v === undefined ? '<span class="na">—</span>' : `${esc(v.toFixed(decimales))}${sufijo}`

  const filas = deEsteOjo
    .map((r) => {
      const tono = tonoDe(r.aparato)
      const rec = r.recomendada
      const lente = rec
        ? `${esc(rec.esfera.toFixed(2))} D${
            rec.cilindro !== undefined ? ` · Cil. ${esc(rec.cilindro.toFixed(2))} D` : ''
          }`
        : `<span class="na">${r.fallo ? 'Sin resultado' : '—'}</span>`
      const hayCaraPosterior = hayCaraPosteriorEn(caso, r.ojo, r.aparato)
      return `<tr style="background:${tono.fondo}">
        <td class="aparato-cel" style="border-left:4px solid ${tono.borde}">${esc(r.aparato)}</td>
        <td>${esc(tituloCalculadoraInforme(r.calculadora, hayCaraPosterior))}</td>
        <td>${esc(nombreLateralidad(r.ojo))}</td>
        <td>${lente}</td>
        <td class="num">${num(rec?.refraccionPrevista, ' D')}</td>
        <td class="num">${num(rec?.cilindroResidual, ' D')}</td>
        <td class="num">${rec?.ejeResidual !== undefined ? `${esc(rec.ejeResidual.toFixed(0))}°` : '<span class="na">—</span>'}</td>
      </tr>`
    })
    .join('')

  return {
    titulo: `Tabla comparativa detallada · ${nombreLateralidad(ojo)}`,
    apunte: 'No vinculante',
    refExtra: ` · ${ojo}`,
    cuerpo: `<p class="aviso-no-vinculante">
      Un vistazo a todo lo calculado para ${esc(nombreLateralidad(ojo))}: aparato, calculadora, la lente de
      la estimación propia de Calculator Vilamar <strong>(no vinculante)</strong>, y la refracción y el
      astigmatismo que se prevé que queden. No sustituye a ninguna calculadora: el detalle exacto de cada
      una, con su captura sin interpretar, sigue en las hojas de encima.
    </p>
    <table class="tabla-detallada">
      <thead>
        <tr>
          <th>Aparato</th><th>Calculadora</th><th>Ojo</th><th>Lente resultante</th>
          <th>Residual esfera</th><th>Residual cilindro</th><th>Eje</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`,
    pie: `Tabla comparativa detallada de ${esc(nombreLateralidad(ojo))}. No sustituye a ninguna calculadora.`,
  }
}

/**
 * El cuadro final: todas las estimaciones de ese ojo, lado a lado — cada
 * calculadora (y sus variantes de córnea posterior, D45, cuando el ojo las
 * tiene) con la suya, sin señalar ninguna como la más adecuada. Marcado
 * siempre, sin excepción, como opcional y no vinculante (D43). No sustituye
 * a ninguna calculadora ni dice qué implantar; es una lectura rápida de algo
 * que ya está, con más detalle, en las hojas de encima.
 */
function hojaResumenFinal(caso: Caso, ojo: Lateralidad, resultados: readonly ResultadoInforme[]): Hoja {
  const deEsteOjo = resultados.filter((r) => r.ojo === ojo)
  // Con un solo aparato (el caso de antes de D47) el nombre no cambia. Con
  // varios, cada tarjeta dice de cuál es — si no, dos tarjetas de «EVO
  // Toric» de aparatos distintos serían indistinguibles.
  const variosAparatos = new Set(deEsteOjo.map((r) => r.aparato)).size > 1

  const tarjetas = deEsteOjo
    .map((r) => {
      const base = tituloCalculadoraInforme(r.calculadora, hayCaraPosteriorEn(caso, r.ojo, r.aparato))
      const nombre = variosAparatos ? `${base} (${r.aparato})` : base
      const color = CLASE_TARJETA[r.calculadora]
      if (!r.recomendada) {
        return `<div class="tarjeta-resumen ${color}">
      <div class="tarjeta-nombre">${esc(nombre)}</div>
      <div class="tarjeta-sin-dato">Sin estimación para este ojo</div>
    </div>`
      }
      const partes = [`${r.recomendada.esfera.toFixed(2)} D`]
      if (r.recomendada.cilindro !== undefined) {
        partes.push(`Cil. ${r.recomendada.cilindro.toFixed(2)} D`)
      }
      // Eje RESIDUAL, no el corneal fijo — mismo motivo que en `lenteRecomendadaTexto`.
      if (r.recomendada.ejeResidual !== undefined) {
        partes.push(`Eje ${r.recomendada.ejeResidual.toFixed(0)}°`)
      }
      return `<div class="tarjeta-resumen ${color}">
      <div class="tarjeta-nombre">${esc(nombre)}</div>
      <div class="tarjeta-valor">${esc(partes.join(' · '))}</div>
    </div>`
    })
    .join('\n')

  return {
    titulo: `Comparación orientativa · ${nombreLateralidad(ojo)}`,
    apunte: 'No vinculante',
    refExtra: ` · ${ojo}`,
    cuerpo: `<p class="aviso-no-vinculante">
      Esto es una estimación propia de Calculator Vilamar, calculada con un criterio fijo y
      el mismo para todas las calculadoras — no es lo que ninguna de ellas ha destacado, ni
      una recomendación clínica. <strong>Es opcional y no vinculante</strong>: quien opera
      decide con el detalle de cada calculadora, en las hojas de encima.
    </p>
    <div class="tarjetas-resumen">${tarjetas}</div>`,
    pie: `Cuadro comparativo orientativo de ${esc(nombreLateralidad(ojo))}. No sustituye a ninguna calculadora.`,
  }
}

/**
 * El informe simplificado: una hoja por casilla intentada, y nada más.
 *
 * Petición expresa del dueño del proyecto (25/08/2026): antes se enseñaba
 * también la comparación, las alternativas, la biometría y la trazabilidad
 * (ver `generarHtmlInformeDetallado`, que se conserva sin usarse). Ahora el
 * informe que de verdad se genera lleva solo la evidencia sin interpretar
 * —la captura tal cual— y, debajo de cada una, la estimación PROPIA de
 * Calculator Vilamar (D43) — nunca lo que la web destacó, aunque coincidan.
 * Una casilla que no llegó a tener resultado no se omite en silencio: lleva
 * su propio aviso explicando por qué. Si algún ojo tiene más de una
 * estimación, el informe cierra con un cuadro comparativo de ese ojo,
 * siempre marcado como opcional y no vinculante.
 */
export function generarHtmlInforme(datos: DatosInforme): string {
  const { caso } = datos

  // Qué ojo(s) cubre este informe concreto — en el flujo real siempre uno
  // (`generarPdf()` llama a esto una vez por ojo, D47), pero no se supone:
  // se lee de `comparativas`, que ya viene filtrada por `soloOjo` si tocaba.
  const ojosDelInforme = [...new Set(datos.comparativas.map((c) => c.ojo))]

  // Los datos de entrada de cada aparato, al principio del informe (D47,
  // petición expresa del dueño): antes de cualquier cálculo, qué se ha
  // usado. Con un solo aparato por ojo no cambia nada de lo que ya había:
  // una hoja de biometría por ojo, como el informe siempre pudo enseñar.
  const hojasBiometria: Hoja[] = ojosDelInforme.flatMap((lado) => {
    const aparatos = aparatosDe(caso, lado)
    return aparatos.map((aparato) => hojaBiometriaAparato(caso, lado, aparato, aparatos.length > 1))
  })

  const hojasPorCasilla: Hoja[] =
    datos.resultados.length === 0
      ? [
          {
            titulo: 'Sin resultados',
            cuerpo: `<p class="captura-ausente">Este caso no tiene ningún resultado calculado todavía.</p>`,
            pie: 'Genera el informe después de calcular con al menos una calculadora.',
          },
        ]
      : datos.resultados.map((r) => {
          // Aparato a aparato (petición expresa del dueño, 27/08/2026): las
          // hojas ya llegan en ese orden desde `recopilarResultadosParaInforme`
          // — aquí solo se decide si hace falta la banda grande del aparato,
          // que con uno solo no se pinta nunca.
          const variosAparatos = aparatosDe(caso, r.ojo).length > 1
          const nombre = tituloCalculadoraInforme(
            r.calculadora,
            hayCaraPosteriorEn(caso, r.ojo, r.aparato),
          )
          const tituloBase = `${nombre} · ${nombreLateralidad(r.ojo)}`
          const comun = variosAparatos ? { aparatoDestacado: r.aparato } : {}

          if (r.fallo !== undefined) {
            return {
              ...comun,
              titulo: `${tituloBase} · No se pudo calcular`,
              apunte: 'Aviso',
              refExtra: ` · ${r.ojo}`,
              cuerpo: `<p class="captura-ausente">${esc(r.fallo)}</p>`,
              pie: `${esc(nombre)} no ha podido calcular para este ojo. Las demás calculadoras y ojos no se ven afectados.`,
            }
          }

          return {
            ...comun,
            titulo: `${tituloBase} · Captura de pantalla`,
            apunte: 'Tal cual la devolvió la web, sin recortar',
            refExtra: ` · ${r.ojo}`,
            cuerpo: `${
              r.dataUri
                ? `<div class="captura"><img src="${esc(r.dataUri)}" alt="Captura de ${esc(nombre)}, ${esc(r.ojo)}"></div>`
                : `<p class="captura-ausente">No se pudo guardar la captura de pantalla de este resultado.</p>`
            }${lenteRecomendadaTexto(r.recomendada)}`,
            pie: `Captura sin editar de la pantalla de resultado de ${esc(nombre)}.`,
          }
        })

  // El cuadro final enseña todas las casillas del caso — las tres
  // calculadoras y, si el ojo tiene córnea posterior medida (D45), también
  // sus variantes de EVO y Barrett — y solo si ese ojo tiene más de una
  // estimación que poner una al lado de otra.
  const ojosConVariasEstimaciones = ojosDelCaso(caso).filter(
    (ojo) =>
      datos.resultados.filter((r) => r.ojo === ojo && r.recomendada !== undefined).length > 1,
  )

  // La tabla comparativa detallada (petición expresa del dueño, 27/08/2026):
  // solo tiene sentido con al menos un resultado intentado.
  const hojasDetalle = ojosDelInforme
    .map((ojo) => tablaComparativaDetallada(caso, ojo, datos.resultados))
    .filter((h): h is Hoja => h !== undefined)

  const hojas = [
    ...hojasBiometria,
    ...hojasPorCasilla,
    ...ojosConVariasEstimaciones.map((ojo) => hojaResumenFinal(caso, ojo, datos.resultados)),
    ...hojasDetalle,
  ]

  return documentoDeHojas(caso, datos.version, datos.generadoEn, hojas)
}

/**
 * El informe detallado, con comparación, alternativas, biometría y
 * trazabilidad. Una hoja A4 por sección.
 *
 * **No se usa por defecto** (ver `generarHtmlInforme`, la versión que de
 * verdad genera la aplicación) — se conserva porque es una feature ya
 * fusionada a `master` en una sesión anterior y no cuesta nada mantenerla
 * disponible por si se quiere recuperar.
 *
 * El reparto NO es fijo: se construye según lo que tenga el caso, y cada hoja
 * lleva una cosa para que quepa. Con dos ojos y tres calculadoras salen nueve:
 *
 *     1  Portada            lente y constante · un titular por ojo · incidencias
 *     2  OD comparación     el ojo dibujado, la tabla y las observaciones
 *     3  OS comparación
 *     4  OD alternativas    todas las opciones que devolvió cada calculadora
 *     5  OS alternativas
 *     6  OD biometría       el corte del ojo y los datos con su origen
 *     7  OS biometría
 *     8  Trazabilidad       qué dice cada web haber recibido, y los avisos
 *
 * Las hojas de alternativas **solo salen si hay alternativas**, y la de biometría
 * es por ojo: juntar los dos era lo que desbordaba la página.
 */
export function generarHtmlInformeDetallado(datos: DatosInforme): string {
  const { caso } = datos
  const ojos = ojosDelCaso(caso)
  const hojas: Hoja[] = []

  // ── 0 · Las capturas de pantalla, tal cual las devolvió cada web ─────────
  //
  // Van primero porque son la evidencia sin interpretar: antes de que el
  // programa resuma o compare nada, quien lee el informe puede ver la
  // pantalla real de cada calculadora. El resto —portada, comparación,
  // alternativas, biometría, trazabilidad— sigue exactamente igual, después.
  // Solo las casillas con un resultado de verdad: una que ni se intentó no
  // tenía hueco aquí antes de que existiera `fallo`, y no lo gana ahora.
  for (const cap of datos.resultados.filter((r) => r.fallo === undefined)) {
    hojas.push({
      titulo: `${fichaDe(cap.calculadora).nombre} · ${nombreLateralidad(cap.ojo)} · Captura de pantalla`,
      apunte: 'Tal cual la devolvió la web, sin recortar',
      refExtra: ` · ${cap.ojo}`,
      cuerpo: cap.dataUri
        ? `<div class="captura"><img src="${esc(cap.dataUri)}" alt="Captura de ${esc(fichaDe(cap.calculadora).nombre)}, ${esc(cap.ojo)}"></div>`
        : `<p class="captura-ausente">No se pudo guardar la captura de pantalla de este resultado. El resultado en sí se conserva en las páginas siguientes.</p>`,
      pie: `Captura sin editar de la pantalla de resultado de ${esc(fichaDe(cap.calculadora).nombre)}. El resumen comparativo empieza en la página siguiente.`,
    })
  }

  // ── 1 · Portada ──────────────────────────────────────────────────────────
  hojas.push({
    portada: true,
    cuerpo: `${bandaDeLente(datos)}
  <div class="tarjetas">
    ${datos.comparativas.map((c) => tarjetaDeOjo(c)).join('')}
  </div>
  ${bloqueIncidencias(datos)}`,
    pie: `Cada cifra de esta portada es lo que han devuelto las webs: el valor cuando
    coinciden, y el rango cuando no. <strong>Nunca un valor intermedio calculado por
    este programa.</strong> El detalle por calculadora está en las hojas siguientes;
    el aviso legal completo, al final del documento.`,
  })

  // ── 2 · Una hoja de comparación por ojo ──────────────────────────────────
  for (const c of datos.comparativas) {
    hojas.push({
      titulo: `${c.ojo} · ${nombreLateralidad(c.ojo)}`,
      apunte: 'Resultado por calculadora',
      refExtra: ` · ${c.ojo}`,
      cuerpo: `${diagramaDeEje(c, ojoDe(caso, c.ojo))}
  ${tablaComparativa(c)}`,
      pie: `Los valores son los devueltos por cada web, sin transformación. Una casilla
      con «Ver alternativas» significa que la calculadora ha devuelto varias y no ha
      señalado ninguna: están en la hoja de alternativas de este ojo.`,
    })
  }

  // ── 3 · Las alternativas, solo si las hay ────────────────────────────────
  //
  // Iban dentro de la hoja de comparación y era una de las tres que desbordaban:
  // tres calculadoras con ocho opciones cada una no caben debajo de una tabla.
  for (const c of datos.comparativas) {
    const detalle = opcionesDevueltas(c)
    if (detalle === '') continue
    hojas.push({
      titulo: `${c.ojo} · Alternativas devueltas`,
      apunte: 'Todas las opciones, tal y como vinieron de cada web',
      refExtra: ` · ${c.ojo}`,
      cuerpo: detalle,
      pie: `Cuando una calculadora no señala ninguna opción, la elección es de quien
      opera. Calculator Vilamar no elige, ni la de menor cilindro residual.`,
    })
  }

  // ── 4 · Una hoja de biometría por ojo ────────────────────────────────────
  //
  // Los dos ojos en la misma hoja no caben: dos figuras del corte y dos tablas de
  // hasta veinticuatro filas.
  for (const l of ojos) {
    hojas.push({
      titulo: `Biometría confirmada · ${nombreLateralidad(l)}`,
      apunte: 'Cada dato, con su origen',
      refExtra: ` · ${l}`,
      cuerpo: `${figuraBiometrica(ojoDe(caso, l))}
  ${seccionEntradas(caso, ojoDe(caso, l))}`,
      pie: `«Del informe» lo leyó el programa del documento. «Derivado del informe» lo
      calculó a partir de otros datos suyos, y lleva la cuenta escrita. «Aportado» y
      «Corregido» los escribió una persona. Un dato que falta se dice como ausente:
      nunca se rellena con un cero.`,
    })
  }

  // ── 5 · Trazabilidad, y el pie legal del documento ───────────────────────
  hojas.push({
    titulo: 'Trazabilidad',
    apunte: 'Qué dice cada calculadora haber recibido',
    cuerpo: `${seccionAuditoria(caso)}
  ${seccionAusencias(datos)}
  ${seccionAvisos(datos.avisos)}`,
    pie: `Esto no es lo que el programa cree haber enviado: es lo que cada web enseña
    en su pantalla. Es lo que permite auditar entrada → calculadora → salida meses
    después, sin saber de quién es el ojo.`,
    // El aviso legal va en la última hoja, en un <footer> de verdad: la frase que
    // NOMBRA los datos excluidos tiene que quedar fuera del recorrido con el que se
    // comprueba que el cuerpo no lleva ninguno.
  })

  return documentoDeHojas(caso, datos.version, datos.generadoEn, hojas)
}

/**
 * El aviso legal y el de privacidad, al final del documento.
 *
 * Va en un `<footer>` a propósito: la comprobación de que el informe no lleva datos
 * identificativos recorre el cuerpo SIN el pie, y la frase que nombra los datos
 * excluidos tiene que quedar fuera de ese recorrido para no darla por encontrada.
 */
const PIE_LEGAL = `<footer class="principal">
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
  </footer>`
