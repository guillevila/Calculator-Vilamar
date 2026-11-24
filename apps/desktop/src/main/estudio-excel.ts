/**
 * estudio-excel.ts — El Excel de «estudio» con el formato del «LuxLife Experience Tracker»
 * (plantilla del dueño, 24/11/2026): una fila por paciente Y aparato, con el ojo derecho y
 * el izquierdo uno al lado del otro. Si un caso tiene dos aparatos (IOLMaster y Pentacam,
 * por ejemplo) salen dos filas; un tercero no cabe y no sale.
 *
 *   IDENTIFICACIÓN   paciente · código · doctor · aparato · edad · sexo · …
 *   PREOPERATORIO    por ojo y aparato: K plana y curva con sus ejes · diferencia ·
 *                    longitud axial · ACD · LT · CCT · WTW · córnea posterior
 *   OPERATORIO       por ojo: lente elegida (nombre, esfera, cilindro, eje) · objetivo
 *   REVISIONES       semana 1, mes 1, mes 3 y mes 6: vacías, se rellenan a mano
 *
 * NO lleva las lentes de las calculadoras ni la estimación propia: solo lo medido y lo
 * elegido. Un dato que falta se deja vacío —nunca se rellena con un cero—.
 *
 * Cabeceras y colores, como la plantilla (en inglés, para poder compartirlo). Lo que se
 * ha añadido a la plantilla: doctor, aparato, y CCT, WTW y córnea posterior por ojo; la
 * lente elegida lleva además cilindro y eje.
 */

import { fichaDe } from '@vilamar/domain'
import type {
  BiometriaTracker,
  FiltroAnalisis,
  FilaTracker,
  LenteElegidaTracker,
  OpcionesAnalisis,
  ResultadoTracker,
} from '@vilamar/domain'

import { crearXlsx, letraDeColumna } from './xlsx.js'
import type { Celda, EstiloCelda, Hoja } from './xlsx.js'

const AZUL_PLANTILLA = '00557F'
const CELESTE_PLANTILLA = '00CCFF'
const LINEA = 'C9D3DC'

/** Las líneas «Qué: valor» que dicen qué búsqueda se exportó, para la hoja de notas. */
export function descripcionDeFiltro(
  filtro: FiltroAnalisis,
  opciones: OpcionesAnalisis,
): readonly string[] {
  const lineas: string[] = []
  if (filtro.rango?.desde || filtro.rango?.hasta) {
    lineas.push(
      `Fechas: ${filtro.rango.desde ? `desde ${filtro.rango.desde}` : 'sin principio'} ${
        filtro.rango.hasta ? `hasta ${filtro.rango.hasta}` : 'sin final'
      }`,
    )
  }
  if (filtro.doctor) lineas.push(`Doctor: ${filtro.doctor}`)
  if (filtro.lente) {
    lineas.push(
      `Lente: ${opciones.lentes.find((l) => l.clave === filtro.lente)?.etiqueta ?? filtro.lente}`,
    )
  }
  if (filtro.ojo) lineas.push(`Ojo: ${filtro.ojo}`)
  if (filtro.calculadora) lineas.push(`Calculadora: ${fichaDe(filtro.calculadora).nombre}`)
  if (filtro.texto) lineas.push(`Texto: ${filtro.texto}`)
  lineas.push(
    `Casos a medias: ${filtro.incluirAMedias ? 'incluidos' : 'no incluidos (solo los terminados)'}`,
  )
  if (lineas.length === 1) lineas.unshift('Filtros: ninguno — todos los casos')
  return lineas
}

function celda(v: Celda['v'], e?: EstiloCelda, f?: string): Celda {
  return { v, ...(e ? { e } : {}), ...(f !== undefined ? { f } : {}) }
}

type Seccion = 'DEMOGRAFIA' | 'PREOP' | 'OPERATIVO' | 'SEM1' | 'MES1' | 'MES3' | 'MES6' | 'FINAL'

/** Los colores de la plantilla: el de la banda y el de las celdas de datos. */
const SECCIONES: Readonly<Record<Seccion, { nombre: string; fondo: string; datos?: string }>> = {
  DEMOGRAFIA: { nombre: 'Demographics', fondo: 'BFBFBF' },
  PREOP: { nombre: 'Preoperative data', fondo: '00CCFF', datos: 'BDD7EE' },
  OPERATIVO: { nombre: 'Operative data', fondo: 'F4B183', datos: 'BDD7EE' },
  SEM1: { nombre: 'Postoperative week 1', fondo: '00FF99' },
  MES1: { nombre: 'Postoperative Month 1', fondo: 'FFD966' },
  MES3: { nombre: 'Postoperative Month 3', fondo: 'CCCCFF' },
  MES6: { nombre: 'Postoperative Month 6', fondo: 'C5E0B3' },
  FINAL: { nombre: '', fondo: 'FFFFFF' },
}

const CABECERA_FONDO = '1F4E78'

interface Columna {
  readonly titulo: string
  readonly seccion: Seccion
  readonly ancho: number
  readonly formato?: string
  /** Qué escribe en cada fila; sin esto, la columna se rellena a mano. */
  readonly dato?: (f: FilaTracker) => number | string | undefined
  /** Para localizar la columna al escribir fórmulas. */
  readonly clave?: string
}

type Ojo = 'OD' | 'OS'

function columnasDeOjo(ojo: Ojo): readonly Columna[] {
  const bio = (f: FilaTracker): BiometriaTracker | undefined => (ojo === 'OD' ? f.od : f.os)
  const lente = (f: FilaTracker): LenteElegidaTracker | undefined =>
    ojo === 'OD' ? f.lenteOd : f.lenteOs
  const o = `${ojo} eye`
  const de = (campo: keyof BiometriaTracker) => (f: FilaTracker) => bio(f)?.[campo]
  const preop = (
    titulo: string,
    ancho: number,
    formato: string,
    campo?: keyof BiometriaTracker,
    clave?: string,
  ): Columna => ({
    titulo: `${titulo}\n${o}`,
    seccion: 'PREOP',
    ancho,
    formato,
    ...(campo ? { dato: de(campo) } : {}),
    ...(clave ? { clave: `${clave}${ojo}` } : {}),
  })
  const operativo = (
    titulo: string,
    ancho: number,
    formato?: string,
    dato?: Columna['dato'],
  ): Columna => ({
    titulo: `${titulo}\n${o}`,
    seccion: 'OPERATIVO',
    ancho,
    ...(formato ? { formato } : {}),
    ...(dato ? { dato } : {}),
  })
  return [
    preop('Pre-Op Flat K', 10.5, '0.00', 'kPlana', 'kPlana'),
    preop('Pre-Op Flat K axis', 10.5, '0', 'ejeKPlana'),
    preop('Pre-Op Steep K', 10.5, '0.00', 'kCurva', 'kCurva'),
    preop('Pre-Op Steep K axis', 10.5, '0', 'ejeKCurva'),
    preop('Flat and Steep K Difference', 11.5, '0.00', undefined, 'dif'),
    preop('Pre-Op ALX', 10.5, '0.00', 'longitudAxial'),
    preop('Pre-Op ACD', 10.5, '0.00', 'acd'),
    preop('Pre-op LT', 10.5, '0.00', 'lt'),
    preop('Pre-Op CCT (µm)', 10.5, '0', 'cct'),
    preop('Pre-Op WTW (mm)', 10.5, '0.0', 'wtw'),
    preop('Pre-Op Posterior Flat K', 11.5, '0.00', 'pkPlana'),
    preop('Pre-Op Posterior Flat K axis', 11.5, '0', 'ejePkPlana'),
    preop('Pre-Op Posterior Steep K', 11.5, '0.00', 'pkCurva'),
    preop('Pre-Op Posterior Steep K axis', 11.5, '0', 'ejePkCurva'),
    operativo('Date of operative visit', 14),
    operativo('IOL name', 18, undefined, (f) => lente(f)?.nombre),
    operativo('IOL spherical power (D)', 12, '0.00', (f) => lente(f)?.esfera),
    operativo('IOL cylinder power (D)', 12, '0.00', (f) => lente(f)?.cilindro),
    operativo('IOL axis (°)', 10.5, '0', (f) => lente(f)?.eje),
    operativo('SEQ target', 10.5, '0.00', de('objetivo')),
  ]
}

/** Una revisión postoperatoria: las mismas 24 columnas de la plantilla, todas a mano. */
function columnasDeRevision(seccion: Seccion, visita: string): readonly Columna[] {
  const cols: Columna[] = []
  const nueva = (titulo: string, ancho = 12): void => {
    cols.push({ titulo, seccion, ancho })
  }
  nueva(`Date of postop ${visita} visit`, 14)
  for (const sigla of ['UDVA', 'CDVA', 'UIVA']) {
    for (const ojo of ['OD eye', 'OS eye', 'Binocular']) {
      nueva(`${sigla}\n20/denominator\n${ojo}\n\n(please enter denominator only)`, 14)
    }
  }
  for (const ojo of ['OD eye', 'OS eye', 'Binocular']) nueva(`UNVA\n${ojo}`)
  for (const ojo of ['OD eye', 'OS eye']) {
    nueva(`Manifest refraction sphere\n${ojo}`)
    nueva(`Manifest refraction cylinder\n${ojo}`)
    nueva(
      `Manifest refraction cylinder axis\n${ojo}\n\n(Please enter numbers from 0 to 180 without a degree º sign)`,
      14,
    )
    nueva(`Manifest refraction spherical equivalent\n${ojo}`)
  }
  nueva('Adverse events\n(if yes, please list and mention the eye involved)', 18)
  nueva('PCO\n(If yes, mention the eye and grade of PCO from 0-4)', 18)
  nueva(
    'Glistenings\n(If yes, mention the eye in which it occurred and the grade of glistenings from 1-4)',
    18,
  )
  return cols
}

function columnasDelTracker(): readonly Columna[] {
  const ident = (titulo: string, ancho: number, dato?: Columna['dato']): Columna => ({
    titulo,
    seccion: 'DEMOGRAFIA',
    ancho,
    ...(dato ? { dato } : {}),
  })
  return [
    ident('Patient ID\n(Not to be shared)', 24, (f) => f.nombrePaciente),
    ident('De-identified patient ID', 15, (f) => f.codigo),
    ident('Surgeon', 22, (f) => f.doctor),
    ident('Instrument', 22, (f) => f.aparato),
    ident('Age (years)', 9),
    ident('Gender', 9, (f) => f.sexo),
    ident('Race and ethnicity', 13),
    ident('Concomitant Systemic disease', 16),
    ident('Concomitant Ocular disease/Prior ocular surgery (If any)\nOD eye', 18),
    ident('Concomitant Ocular disease/Prior ocular surgery (If any)\nOS eye', 18),
    ...columnasDeOjo('OD'),
    ...columnasDeOjo('OS'),
    {
      titulo:
        'Intra-operative complications\n(If yes, please explain and mention the eye involved is OD/OS/both eyes)',
      seccion: 'OPERATIVO',
      ancho: 20,
    },
    {
      titulo:
        'Additional surgical procedures\n(If yes, please explain and mention if the procedure was done in OD/OS/both eyes)',
      seccion: 'OPERATIVO',
      ancho: 20,
    },
    ...columnasDeRevision('SEM1', 'Week 1'),
    ...columnasDeRevision('MES1', 'Month 1'),
    ...columnasDeRevision('MES3', 'Month 3'),
    ...columnasDeRevision('MES6', 'Month 6'),
    {
      titulo:
        'Include Y/N\n\nThis provides opportunity to remove outliers that would affect results, i.e. post refractive, corneal/retinal pathology or questionable outcomes noted when reviewing data',
      seccion: 'FINAL',
      ancho: 24,
    },
  ]
}

/**
 * El libro de estudio. `descripcionFiltro` son las líneas que dicen qué búsqueda se
 * exportó (fechas, doctor, lente…), para que el Excel se explique solo.
 */
export function libroDeEstudio(
  resultado: ResultadoTracker,
  descripcionFiltro: readonly string[],
  generadoEn: string,
): Uint8Array {
  const filas = resultado.filas
  const columnas = columnasDelTracker()
  const total = columnas.length
  const PRIMERA_FILA_DATOS = 7

  const base: EstiloCelda = { tamano: 10, alinV: 'center', borde: LINEA }
  const hoja: (Celda | null)[][] = []
  const combinadas: string[] = []
  const nueva = (): (Celda | null)[] => new Array<Celda | null>(total).fill(null)

  // 1–4 · la leyenda de colores, como en la plantilla
  const leyenda = (fila: (Celda | null)[], col: number, texto: string, fondo: string): void => {
    fila[col] = celda(texto, { fondo, tamano: 10, negrita: true, alinV: 'center' })
  }
  const l1 = nueva()
  leyenda(l1, 0, 'Demographics', SECCIONES.DEMOGRAFIA.fondo)
  leyenda(l1, 2, 'Postop week 1', SECCIONES.SEM1.fondo)
  const l2 = nueva()
  leyenda(l2, 0, 'Preoperative', SECCIONES.PREOP.fondo)
  leyenda(l2, 2, 'Postop Month 1', SECCIONES.MES1.fondo)
  const l3 = nueva()
  leyenda(l3, 0, 'Operative', SECCIONES.OPERATIVO.fondo)
  leyenda(l3, 2, 'Postop Month 3', SECCIONES.MES3.fondo)
  const l4 = nueva()
  leyenda(l4, 2, 'Postop Month 6', SECCIONES.MES6.fondo)
  hoja.push(l1, l2, l3, l4)

  // 5 · las bandas de cada sección (una por tramo seguido de columnas de la misma sección)
  const bandas = nueva()
  let c = 0
  while (c < total) {
    const seccion = columnas[c]!.seccion
    let fin = c
    while (fin + 1 < total && columnas[fin + 1]!.seccion === seccion) fin += 1
    const estilo: EstiloCelda = {
      fondo: SECCIONES[seccion].fondo,
      color: '000000',
      negrita: true,
      tamano: 11,
      alinH: 'center',
      alinV: 'center',
    }
    bandas[c] = celda(SECCIONES[seccion].nombre, estilo)
    for (let k = c + 1; k <= fin; k += 1) bandas[k] = celda(null, estilo)
    if (fin > c && SECCIONES[seccion].nombre) {
      combinadas.push(`${letraDeColumna(c)}5:${letraDeColumna(fin)}5`)
    }
    c = fin + 1
  }
  hoja.push(bandas)

  // 6 · cabeceras de columna
  const cabecera = nueva()
  columnas.forEach((col, i) => {
    cabecera[i] = celda(col.titulo, {
      ...base,
      fondo: CABECERA_FONDO,
      color: 'FFFFFF',
      negrita: true,
      alinH: 'center',
      ajustar: true,
    })
  })
  hoja.push(cabecera)

  // 7… · datos
  const posicion = new Map<string, number>()
  columnas.forEach((col, i) => {
    if (col.clave) posicion.set(col.clave, i)
  })
  filas.forEach((f, n) => {
    const fila = nueva()
    const numeroFila = PRIMERA_FILA_DATOS + n
    columnas.forEach((col, i) => {
      const fondo = SECCIONES[col.seccion].datos
      const estilo: EstiloCelda = {
        ...base,
        ...(fondo ? { fondo } : {}),
        ...(col.formato ? { formato: col.formato, alinH: 'center' as const } : {}),
        ...(i === 0 ? { negrita: true } : {}),
      }
      fila[i] = celda(col.dato?.(f) ?? null, estilo)
    })
    // La diferencia entre K plana y curva es una fórmula, como en la plantilla: si se
    // corrige una K a mano en Excel, la diferencia se actualiza sola.
    for (const ojo of ['OD', 'OS'] as const) {
      const pl = posicion.get(`kPlana${ojo}`)!
      const cu = posicion.get(`kCurva${ojo}`)!
      const dif = posicion.get(`dif${ojo}`)!
      const a = `${letraDeColumna(pl)}${numeroFila}`
      const b = `${letraDeColumna(cu)}${numeroFila}`
      const bio = ojo === 'OD' ? f.od : f.os
      const valor =
        bio?.kPlana !== undefined && bio.kCurva !== undefined
          ? Math.round(Math.abs(bio.kCurva - bio.kPlana) * 100) / 100
          : ''
      fila[dif] = celda(
        valor,
        { ...base, fondo: SECCIONES.PREOP.datos ?? 'FFFFFF', formato: '0.00', alinH: 'center' },
        `IF(OR(${a}="",${b}=""),"",ABS(${b}-${a}))`,
      )
    }
    hoja.push(fila)
  })

  const ultimaFila = Math.max(hoja.length, PRIMERA_FILA_DATOS)
  const colGenero = letraDeColumna(columnas.findIndex((x) => x.titulo === 'Gender'))
  const colInclude = letraDeColumna(total - 1)
  const hojaTracker: Hoja = {
    nombre: 'Lux life Experience Tracker',
    filas: hoja,
    anchos: columnas.map((x) => x.ancho),
    alturas: { 1: 18, 2: 18, 3: 18, 4: 18, 5: 20, 6: 112 },
    combinadas,
    congelar: { filas: 6, columnas: 4 },
    ...(filas.length > 0 ? { filtro: `A6:${letraDeColumna(total - 1)}${ultimaFila}` } : {}),
    // Las listas valen también para las filas que se añadan a mano debajo.
    listas: [
      { rango: `${colGenero}7:${colGenero}500`, opciones: ['Male', 'Female'] },
      { rango: `${colInclude}7:${colInclude}500`, opciones: ['Yes', 'No'] },
    ],
    colorPestana: AZUL_PLANTILLA,
  }

  return crearXlsx([
    hojaTracker,
    hojaDeNotas(filas.length, resultado.casosConAparatosOmitidos, descripcionFiltro, generadoEn),
  ])
}

function hojaDeNotas(
  numeroDeFilas: number,
  casosConAparatosOmitidos: number,
  descripcionFiltro: readonly string[],
  generadoEn: string,
): Hoja {
  const titulo: EstiloCelda = {
    fondo: AZUL_PLANTILLA,
    color: 'FFFFFF',
    negrita: true,
    tamano: 14,
    alinV: 'center',
  }
  const seccion: EstiloCelda = {
    fondo: CELESTE_PLANTILLA,
    color: '00364F',
    negrita: true,
    tamano: 11,
    alinV: 'center',
  }
  const texto: EstiloCelda = { tamano: 10, ajustar: true, alinV: 'top' }
  const filas: (Celda | null)[][] = []
  const combinadas: string[] = []
  const alturas: Record<number, number> = {}
  const linea = (e: EstiloCelda, t: string, alto?: number): void => {
    filas.push([celda(t, e), celda(null, e)])
    combinadas.push(`A${filas.length}:B${filas.length}`)
    if (alto) alturas[filas.length] = alto
  }
  const par = (a: string, b: string, alto = 18): void => {
    filas.push([celda(a, { ...texto, negrita: true }), celda(b, texto)])
    alturas[filas.length] = alto
  }

  linea(titulo, 'NOTAS DEL ESTUDIO', 28)
  filas.push([null, null])
  linea(seccion, 'Qué se ha exportado', 20)
  par('Generado el', generadoEn.slice(0, 10))
  par('Filas', String(numeroDeFilas))
  for (const d of descripcionFiltro) {
    const i = d.indexOf(':')
    par(i > 0 ? d.slice(0, i) : 'Filtro', i > 0 ? d.slice(i + 1).trim() : d)
  }
  if (casosConAparatosOmitidos > 0) {
    par(
      'Aparatos de más',
      `${casosConAparatosOmitidos} caso${casosConAparatosOmitidos === 1 ? '' : 's'} tenía${casosConAparatosOmitidos === 1 ? '' : 'n'} más de dos aparatos: solo salen los dos primeros.`,
      32,
    )
  }
  filas.push([null, null])
  linea(seccion, 'Cómo leerlo', 20)
  par(
    'Una fila',
    'Cada fila es un paciente y un aparato (biómetro o topógrafo), con el ojo derecho y el izquierdo uno al lado del otro. Si el paciente tiene dos aparatos, salen dos filas con los mismos datos de paciente y lente. Un tercer aparato no se incluye.',
    48,
  )
  par(
    'Preoperatorio',
    'Biometría y topografía tal como se confirmó en el caso, del aparato de esa fila: K plana y K curva con sus ejes (la plana es la de menor valor; cada valor conserva su eje), longitud axial, ACD, LT, grosor corneal (CCT), blanco a blanco (WTW) y córnea posterior. Un dato que el aparato no dio queda VACÍO: nunca se rellena con un cero.',
    64,
  )
  par(
    'Lente elegida',
    'La lente que el cirujano ha decidido pedir en la aplicación («Pedir al laboratorio»): nombre, potencia esférica, cilindro y eje. Si no se guardó ninguna, queda vacío. No salen las lentes que dieron las calculadoras ni la estimación propia.',
    48,
  )
  par('SEQ target', 'La refracción objetivo con la que se calculó ese aparato.', 20)
  par(
    'A mano',
    'La fecha de la operación, la edad, la raza, las enfermedades, las complicaciones y todas las revisiones (semana 1, mes 1, mes 3 y mes 6) se rellenan a mano en Excel.',
    32,
  )
  par(
    'Cambios sobre la plantilla',
    'Se han añadido el doctor y el aparato, el CCT, el WTW y la córnea posterior de cada ojo, y la lente elegida lleva además su cilindro y su eje. Hay listas desplegables en Gender e «Include Y/N». Se ha corregido en las revisiones el título del eje de refracción del ojo izquierdo, que la plantilla llamaba «OD».',
    64,
  )
  filas.push([null, null])
  linea(seccion, 'Privacidad', 20)
  par(
    'Ojo',
    'Este fichero lleva el NOMBRE del paciente en la primera columna, que la plantilla marca como «no compartir». Antes de enviarlo fuera, borra esa columna: la segunda lleva solo el código del caso.',
    48,
  )

  return {
    nombre: 'Notas',
    filas,
    anchos: [26, 110],
    alturas,
    combinadas,
    colorPestana: CELESTE_PLANTILLA,
  }
}
