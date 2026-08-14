/**
 * opciones-informe.test.ts — El informe tampoco elige una lente.
 *
 * El PDF es la parte que sale del programa y acaba en una historia clínica. Si en
 * algún sitio no se puede confundir «lo dice la calculadora» con «lo ha elegido el
 * programa», es aquí.
 *
 * La regla es la misma que en pantalla, y por eso vive en el dominio y no en cada
 * capa: si la web no ha señalado ninguna opción, el informe enseña **todas** las
 * alternativas y no convierte ninguna en «el resultado».
 */

import { describe, expect, it } from 'vitest'

import type { Caso, ResultadoCalculadora } from '@vilamar/domain'
import {
  casoNuevo,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
  ojoVacio,
} from '@vilamar/domain'

import { generarHtmlInforme } from './plantilla.js'
import { recopilarInforme } from './recopilar.js'

const CUANDO = '2026-08-13T10:00:00.000Z'
const A_MANO = { metodo: 'MANUAL', registradoEn: CUANDO } as const

/** Las tres alternativas del caso observado. Ninguna destacada por la web. */
const TRES = [
  { esfera: 21.5, refraccionPrevista: 0.4, recomendada: false },
  { esfera: 22.0, refraccionPrevista: 0.1, recomendada: false },
  { esfera: 22.5, refraccionPrevista: -0.17, recomendada: false },
]

function informeCon(opciones: readonly ResultadoCalculadora['opciones'][number][]): string {
  let ojo = ojoVacio('OD')
  for (const [campo, valor] of [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K2', 42.52],
    ['ACD', 3.18],
    ['REFRACCION_OBJETIVO', 0],
    ['CONSTANTE_A', 119],
  ] as const) {
    ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, A_MANO))
  }
  ojo = confirmarTodas(ojo)

  let caso: Caso = confirmar(conOjo(casoNuevo('c1', 'CV-2026-0099', CUANDO), ojo, CUANDO), CUANDO)
  const destacada = opciones.find((o) => o.recomendada)
  caso = conResultado(
    caso,
    {
      calculadora: 'KANE',
      ojo: 'OD',
      estado: 'SUCCESS',
      obtenidoEn: CUANDO,
      opciones,
      ...(destacada ? { recomendada: destacada } : {}),
    },
    CUANDO,
  )
  return generarHtmlInforme(recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }))
}

/**
 * Solo el trozo de la tabla comparativa.
 *
 * Se acota por las etiquetas completas y no por el nombre de la clase suelto: el
 * informe lleva sus estilos dentro, así que buscar 'opciones-devueltas' a secas
 * encontraba primero la regla CSS y el corte salía vacío.
 */
function soloComparativa(html: string): string {
  const desde = html.indexOf('<table class="tabla-comparativa">')
  const hasta = html.indexOf('<section class="opciones-devueltas">')
  return html.slice(desde, hasta > desde ? hasta : undefined)
}

describe('6 · el informe conserva las alternativas sin inventar una elegida', () => {
  const html = () => informeCon(TRES)

  it('las tres esferas aparecen en el documento', () => {
    const h = html()
    for (const esfera of ['21.50', '22.00', '22.50']) expect(h).toContain(esfera)
  })

  it('las tres refracciones también', () => {
    const h = html()
    for (const refr of ['0.40', '0.10', '-0.17']) expect(h).toContain(refr)
  })

  it('hay un bloque que las presenta como alternativas devueltas', () => {
    const h = html()
    expect(h).toContain('3 alternativas devueltas')
    expect(h).toContain('Potencia LIO')
  })

  it('dice que la calculadora no ha señalado ninguna, y que no elige el programa', () => {
    const h = html()
    expect(h).toContain('no ha señalado ninguna opción preferente')
    expect(h).toContain('La elección no la hace Calculator Vilamar')
  })

  it('NO marca ninguna como destacada', () => {
    expect(html()).not.toContain('Destacada por')
  })

  it('la tabla comparativa dice «3 opciones», no una de las tres', () => {
    const h = html()
    const comparativa = soloComparativa(h)
    // Tres alternativas que solo se diferencian en potencia y refracción: la
    // fila de la esfera es la que las nombra.
    expect(comparativa).toContain('3 alternativas de potencia')
    expect(comparativa).toContain('Ver alternativas')
    // Y dentro de la comparativa no se ha colado ninguna de las tres cifras.
    for (const esfera of ['21.50', '22.00', '22.50']) {
      expect(comparativa).not.toContain(esfera)
    }
  })

  it('los campos que ninguna opción trae salen como raya, no como «3 opciones»', () => {
    const h = html()
    const comparativa = soloComparativa(h)
    // Cinco filas tóricas sin dato: cilindro, eje, modelo, residual y eje residual.
    // En la columna de Kane las cinco tienen que ser una raya.
    expect((comparativa.match(/<td class="na">—<\/td>/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('no aparece «N/A» en ninguna parte del informe', () => {
    // Se leía como «ha fallado». Ya no se usa en ningún estado.
    expect(html()).not.toContain('N/A')
  })
})

describe('6 bis · si la web SÍ destaca una, el informe lo dice', () => {
  const conDestacada = () => informeCon(TRES.map((o, i) => ({ ...o, recomendada: i === 2 })))

  it('la marca en el detalle', () => {
    expect(conDestacada()).toContain('Destacada por Kane')
  })

  it('y la usa en la comparativa', () => {
    const h = conDestacada()
    const comparativa = soloComparativa(h)
    expect(comparativa).toContain('22.50')
    expect(comparativa).not.toContain('alternativas de potencia')
  })

  it('sigue enseñando las tres alternativas', () => {
    const h = conDestacada()
    expect(h).toContain('3 alternativas devueltas')
    for (const esfera of ['21.50', '22.00', '22.50']) expect(h).toContain(esfera)
  })
})
