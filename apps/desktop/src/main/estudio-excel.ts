/**
 * estudio-excel.ts — El Excel de «estudio de casos» (21/10/2026, petición del
 * dueño, con la plantilla «LuxLife Experience Tracker» de ejemplo): una fila por
 * caso, ojo y aparato, con todo dentro del campo PREOPERATORIO.
 *
 *   IDENTIFICACIÓN   paciente · nº de caso · fecha · doctor · ojo · aparato
 *   PREOPERATORIO    biometría del aparato: LA · K1 · eje K1 · K2 · eje K2 · ACD
 *                    tipo de lente
 *                    y, por cada calculadora con resultado: potencia esférica ·
 *                    potencia cilíndrica · eje · residual esférico · residual cilíndrico
 *
 * Los colores salen de la plantilla de ejemplo (azul petróleo 00557F y celeste
 * 00CCFF) y de los de cada calculadora en la propia aplicación. Un dato que falta
 * se deja vacío —nunca se rellena con un cero—.
 */

import { fichaDe } from '@vilamar/domain'
import type {
  Calculadora,
  FiltroAnalisis,
  FilaEstudio,
  LenteDeEstudio,
  OpcionesAnalisis,
} from '@vilamar/domain'

import { crearXlsx, letraDeColumna } from './xlsx.js'
import type { Celda, EstiloCelda, Hoja } from './xlsx.js'

const AZUL_PLANTILLA = '00557F'
const CELESTE_PLANTILLA = '00CCFF'
const LINEA = 'C9D3DC'
const ZEBRA = 'F3F7FA'

/** Nombre y colores de cada calculadora, los mismos que en la aplicación. */
const CALCULADORAS: Readonly<
  Record<Calculadora, { nombre: string; fuerte: string; suave: string }>
> = {
  EVO_TORIC_SIN_CARA_POSTERIOR: {
    nombre: 'EVO Toric · estimada',
    fuerte: '0F766E',
    suave: 'E6F4F2',
  },
  EVO_TORIC: { nombre: 'EVO Toric · córnea posterior medida', fuerte: '0B5F58', suave: 'D3EDEA' },
  BARRETT_TORIC: { nombre: 'Barrett Toric · estimada', fuerte: '1D4ED8', suave: 'E8EEFC' },
  BARRETT_TORIC_CON_CARA_POSTERIOR: {
    nombre: 'Barrett Toric · córnea posterior medida',
    fuerte: '1B3FA8',
    suave: 'D6E0FA',
  },
  KANE: { nombre: 'Kane', fuerte: '7C3AED', suave: 'F1EAFD' },
  BARRETT_TRUE_K_TORIC: { nombre: 'Barrett True-K Toric', fuerte: '475569', suave: 'EEF1F5' },
}

const ORDEN_CALCULADORAS: readonly Calculadora[] = [
  'EVO_TORIC_SIN_CARA_POSTERIOR',
  'EVO_TORIC',
  'BARRETT_TORIC',
  'BARRETT_TORIC_CON_CARA_POSTERIOR',
  'KANE',
  'BARRETT_TRUE_K_TORIC',
]

const CAMPOS_LENTE: readonly {
  readonly clave: keyof LenteDeEstudio
  readonly titulo: string
  readonly formato: string
}[] = [
  { clave: 'esfera', titulo: 'Potencia esférica (D)', formato: '0.00' },
  { clave: 'cilindro', titulo: 'Potencia cilíndrica (D)', formato: '0.00' },
  { clave: 'eje', titulo: 'Eje (°)', formato: '0' },
  { clave: 'residualEsferico', titulo: 'Residual esférico (D)', formato: '0.00' },
  { clave: 'residualCilindrico', titulo: 'Residual cilíndrico (D)', formato: '0.00' },
]

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

function celda(v: Celda['v'], e?: EstiloCelda): Celda {
  return e ? { v, e } : { v }
}

/** Un texto repetido en un rango combinado: la primera celda lleva el texto, el resto, el mismo estilo. */
function banda(
  fila: (Celda | null)[],
  desde: number,
  hasta: number,
  texto: string,
  estilo: EstiloCelda,
): void {
  fila[desde] = celda(texto, estilo)
  for (let c = desde + 1; c <= hasta; c += 1) fila[c] = celda(null, estilo)
}

/**
 * El libro de estudio. `descripcionFiltro` son las líneas que dicen qué búsqueda
 * se exportó (fechas, doctor, lente…), para que el Excel se explique solo.
 */
export function libroDeEstudio(
  filas: readonly FilaEstudio[],
  descripcionFiltro: readonly string[],
  generadoEn: string,
): Uint8Array {
  // Solo las calculadoras que tienen resultado en alguna fila.
  const calculadoras = ORDEN_CALCULADORAS.filter((c) =>
    filas.some((f) => f.lentes[c] !== undefined),
  )

  const IDENT = ['Paciente', 'Nº de caso', 'Fecha', 'Doctor', 'Ojo', 'Aparato']
  const BIOMETRIA = [
    { titulo: 'Longitud axial (mm)', formato: '0.00' },
    { titulo: 'K1 (D)', formato: '0.00' },
    { titulo: 'Eje K1 (°)', formato: '0' },
    { titulo: 'K2 (D)', formato: '0.00' },
    { titulo: 'Eje K2 (°)', formato: '0' },
    { titulo: 'ACD (mm)', formato: '0.00' },
  ]
  const colIdent = 0
  const colBio = IDENT.length
  const colTipo = colBio + BIOMETRIA.length
  const colCalc = colTipo + 1
  const total = colCalc + calculadoras.length * CAMPOS_LENTE.length

  const base: EstiloCelda = { tamano: 10, alinV: 'center', borde: LINEA }
  const hoja: (Celda | null)[][] = []
  const combinadas: string[] = []
  const nueva = (): (Celda | null)[] => new Array<Celda | null>(total).fill(null)

  // 1 · título
  const titulo = nueva()
  titulo[0] = celda('ESTUDIO DE CASOS · Calculator Vilamar', {
    fondo: AZUL_PLANTILLA,
    color: 'FFFFFF',
    negrita: true,
    tamano: 16,
    alinV: 'center',
  })
  for (let c = 1; c < total; c += 1) titulo[c] = celda(null, { fondo: AZUL_PLANTILLA })
  hoja.push(titulo)
  combinadas.push(`A1:${letraDeColumna(total - 1)}1`)

  // 2 · subtítulo
  const sub = nueva()
  const dia = generadoEn.slice(0, 10)
  const resumen = `${filas.length} fila${filas.length === 1 ? '' : 's'} · una por caso, ojo y aparato · generado el ${dia}`
  sub[0] = celda(resumen, { color: '33566B', cursiva: true, tamano: 10, alinV: 'center' })
  hoja.push(sub)
  combinadas.push(`A2:${letraDeColumna(total - 1)}2`)

  // 3 · aire
  hoja.push(nueva())

  // 4 · los dos campos grandes
  const nivel1 = nueva()
  banda(nivel1, colIdent, colBio - 1, 'IDENTIFICACIÓN', {
    fondo: AZUL_PLANTILLA,
    color: 'FFFFFF',
    negrita: true,
    tamano: 12,
    alinH: 'center',
    alinV: 'center',
  })
  banda(nivel1, colBio, total - 1, 'PREOPERATORIO', {
    fondo: CELESTE_PLANTILLA,
    color: '00364F',
    negrita: true,
    tamano: 12,
    alinH: 'center',
    alinV: 'center',
  })
  hoja.push(nivel1)
  combinadas.push(`${letraDeColumna(colIdent)}4:${letraDeColumna(colBio - 1)}4`)
  combinadas.push(`${letraDeColumna(colBio)}4:${letraDeColumna(total - 1)}4`)

  // 5 · los subcampos
  const nivel2 = nueva()
  banda(nivel2, colIdent, colBio - 1, 'DATOS DEL CASO', {
    fondo: '3D7F9F',
    color: 'FFFFFF',
    negrita: true,
    alinH: 'center',
    alinV: 'center',
  })
  banda(nivel2, colBio, colTipo - 1, 'BIOMETRÍA DEL APARATO', {
    fondo: '5DB7D6',
    color: '00364F',
    negrita: true,
    alinH: 'center',
    alinV: 'center',
  })
  nivel2[colTipo] = celda('LENTE', {
    fondo: '8A6BC9',
    color: 'FFFFFF',
    negrita: true,
    alinH: 'center',
    alinV: 'center',
  })
  combinadas.push(`${letraDeColumna(colIdent)}5:${letraDeColumna(colBio - 1)}5`)
  combinadas.push(`${letraDeColumna(colBio)}5:${letraDeColumna(colTipo - 1)}5`)
  calculadoras.forEach((c, i) => {
    const desde = colCalc + i * CAMPOS_LENTE.length
    const hasta = desde + CAMPOS_LENTE.length - 1
    banda(nivel2, desde, hasta, CALCULADORAS[c].nombre.toUpperCase(), {
      fondo: CALCULADORAS[c].fuerte,
      color: 'FFFFFF',
      negrita: true,
      alinH: 'center',
      alinV: 'center',
    })
    combinadas.push(`${letraDeColumna(desde)}5:${letraDeColumna(hasta)}5`)
  })
  hoja.push(nivel2)

  // 6 · cabeceras de columna
  const cabecera = nueva()
  const estiloCab = (fondo: string, color = 'FFFFFF'): EstiloCelda => ({
    ...base,
    fondo,
    color,
    negrita: true,
    alinH: 'center',
    ajustar: true,
  })
  IDENT.forEach((t, i) => (cabecera[colIdent + i] = celda(t, estiloCab('3D7F9F'))))
  BIOMETRIA.forEach(
    (b, i) => (cabecera[colBio + i] = celda(b.titulo, estiloCab('5DB7D6', '00364F'))),
  )
  cabecera[colTipo] = celda('Tipo de lente', estiloCab('8A6BC9'))
  calculadoras.forEach((c, i) =>
    CAMPOS_LENTE.forEach((campo, j) => {
      cabecera[colCalc + i * CAMPOS_LENTE.length + j] = celda(
        campo.titulo,
        estiloCab(CALCULADORAS[c].fuerte),
      )
    }),
  )
  hoja.push(cabecera)

  // 7… · datos
  filas.forEach((f, n) => {
    const fondo = n % 2 === 0 ? 'FFFFFF' : ZEBRA
    const texto: EstiloCelda = { ...base, fondo }
    const centrado: EstiloCelda = { ...texto, alinH: 'center' }
    const numero = (formato: string, fondoCelda = fondo): EstiloCelda => ({
      ...base,
      fondo: fondoCelda,
      formato,
      alinH: 'center',
    })
    const fila = nueva()
    fila[0] = celda(f.nombrePaciente ?? '', { ...texto, negrita: true })
    fila[1] = celda(f.codigo, centrado)
    fila[2] = celda(f.fecha, centrado)
    fila[3] = celda(f.doctor, texto)
    fila[4] = celda(f.ojo, {
      ...centrado,
      negrita: true,
      color: f.ojo === 'OD' ? '1D4ED8' : '0F766E',
    })
    fila[5] = celda(f.aparato, texto)
    const bio = [f.longitudAxial, f.k1, f.ejeK1, f.k2, f.ejeK2, f.acd]
    BIOMETRIA.forEach((b, i) => {
      fila[colBio + i] = celda(bio[i] ?? null, numero(b.formato, n % 2 === 0 ? 'F1FAFD' : 'E3F4FA'))
    })
    fila[colTipo] = celda(f.tipoDeLente, { ...centrado, fondo: n % 2 === 0 ? 'F6F1FD' : 'EEE6FA' })
    calculadoras.forEach((c, i) => {
      const lente = f.lentes[c]
      CAMPOS_LENTE.forEach((campo, j) => {
        const fondoCelda = n % 2 === 0 ? CALCULADORAS[c].suave : mezcla(CALCULADORAS[c].suave)
        fila[colCalc + i * CAMPOS_LENTE.length + j] = celda(
          lente?.[campo.clave] ?? null,
          numero(campo.formato, fondoCelda),
        )
      })
    })
    hoja.push(fila)
  })

  const anchos: number[] = [
    26,
    15,
    12,
    22,
    7,
    24,
    ...BIOMETRIA.map(() => 12.5),
    18,
    ...calculadoras.flatMap(() => CAMPOS_LENTE.map(() => 13)),
  ]
  const ultimaFila = hoja.length

  const hojaEstudio: Hoja = {
    nombre: 'Estudio',
    filas: hoja,
    anchos,
    alturas: { 1: 30, 2: 18, 4: 22, 5: 20, 6: 44 },
    combinadas,
    congelar: { filas: 6, columnas: 2 },
    ...(filas.length > 0 ? { filtro: `A6:${letraDeColumna(total - 1)}${ultimaFila}` } : {}),
    colorPestana: AZUL_PLANTILLA,
  }

  return crearXlsx([
    hojaEstudio,
    hojaDeNotas(filas.length, descripcionFiltro, calculadoras, generadoEn),
  ])
}

/** Un tono algo más oscuro, para las filas alternas de cada calculadora. */
function mezcla(suave: string): string {
  const canales = [0, 2, 4].map((i) => parseInt(suave.slice(i, i + 2), 16))
  return canales
    .map((c) =>
      Math.max(0, c - 10)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()
}

function hojaDeNotas(
  numeroDeFilas: number,
  descripcionFiltro: readonly string[],
  calculadoras: readonly Calculadora[],
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
  filas.push([null, null])
  linea(seccion, 'Cómo leerlo', 20)
  par(
    'Una fila',
    'Cada fila es un caso, un ojo y un aparato (biómetro): si un ojo tiene dos aparatos, salen dos filas.',
    32,
  )
  par(
    'Preoperatorio',
    'Biometría tal como se confirmó en el caso: longitud axial, K1/K2 con sus ejes y ACD de ese aparato. Un dato que el aparato no dio queda VACÍO: nunca se rellena con un cero.',
    48,
  )
  par(
    'Lente',
    'Es la ESTIMACIÓN PROPIA de Calculator Vilamar (primera esfera con refracción prevista negativa —positiva en la familia Lux— y el cilindro tórico más alto que comparte el eje curvo). No es lo que la calculadora señaló ni una recomendación: es orientativa y no vinculante.',
    64,
  )
  par(
    'Eje',
    'El eje residual que publica la propia calculadora para esa opción, como en el informe en PDF.',
    32,
  )
  par(
    'Residuales',
    'Residual esférico = refracción prevista (D). Residual cilíndrico = cilindro residual (D), según la calculadora.',
    32,
  )
  par(
    'Calculadoras',
    calculadoras.length > 0
      ? calculadoras.map((c) => CALCULADORAS[c].nombre).join(' · ')
      : 'Ninguna de las filas tiene resultado de calculadora.',
    32,
  )
  filas.push([null, null])
  linea(seccion, 'Privacidad', 20)
  par(
    'Ojo',
    'Este fichero lleva el NOMBRE del paciente. Guárdalo y compártelo solo donde corresponda.',
    32,
  )

  return {
    nombre: 'Notas',
    filas,
    anchos: [22, 110],
    alturas,
    combinadas,
    colorPestana: CELESTE_PLANTILLA,
  }
}
