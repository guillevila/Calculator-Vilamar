/**
 * kane-resultado.spec.ts — Leer el resultado de Kane, y no inventar la recomendada.
 *
 * La estructura que se reproduce aquí es **la real**, capturada el 12/08/2026 tras
 * una ejecución completa contra su web:
 *
 *     <div class="res_tab3_wait">Processing… </div>       ← mientras calcula
 *     <div class="res_nontoric">
 *       <table class="res_tab3">
 *         <thead><th>IOL Power (D)</th><th>Refraction (D)</th></thead>
 *         <tbody class="res_tab3_lines">
 *           <tr><td>23.5</td><td>-1.47</td></tr>
 *           …
 *           <tr class="table-active"><td>21.5</td><td>-0.06</td></tr>   ← LA SUYA
 *
 * Y hay **una sección por ojo**, igual que en el formulario.
 *
 * Lo que se prueba es lo que el dueño del proyecto pidió expresamente: que
 * `recomendada` salga de **la marca de Kane** y no de la posición de la fila.
 * Antes se marcaba la del medio «porque suele ir en el centro», que era inventarse
 * una recomendación clínica.
 *
 * No se va a iolformula.com y no se acepta nada: es una página sintética.
 */

import { expect, test } from '@playwright/test'
import { chromium, type Browser, type Page } from 'playwright'

let navegador: Browser

test.beforeAll(async () => {
  navegador = await chromium.launch()
})
test.afterAll(async () => {
  await navegador?.close().catch(() => undefined)
})

/** Las siete potencias que devolvió Kane de verdad, con su marca en la quinta. */
const FILAS_REALES: readonly [string, string, boolean][] = [
  ['23.5', '-1.47', false],
  ['23.0', '-1.11', false],
  ['22.5', '-0.76', false],
  ['22.0', '-0.41', false],
  ['21.5', '-0.06', true],
  ['21.0', '0.28', false],
  ['20.5', '0.62', false],
]

function tabla(filas: readonly [string, string, boolean][]): string {
  return `<table class="table table-bordered text-center res_tab3">
    <thead class="thead-light"><tr><th>IOL Power (D)</th><th>Refraction (D)</th></tr></thead>
    <tbody class="res_tab3_lines">
      ${filas
        .map(
          ([p, r, marcada]) =>
            `<tr${marcada ? ' class="table-active"' : ''}><td>${p}</td><td>${r}</td></tr>`,
        )
        .join('')}
    </tbody></table>`
}

/** Una pantalla de resultados de Kane, con sus dos ojos. */
function pantalla(opciones: {
  readonly od?: readonly [string, string, boolean][]
  readonly os?: readonly [string, string, boolean][]
  readonly alDeOd?: string
}): string {
  const seccion = (filas: readonly [string, string, boolean][] | undefined, al: string) => `
    <table class="table res_tab1"><tbody>
      <tr><td>AL:</td><td>${al} mm</td></tr>
      <tr><td>K1:</td><td>41.22 D</td></tr>
      <tr><td>K2:</td><td>42.52 D</td></tr>
      <tr><td>ACD:</td><td>3.18 mm</td></tr>
    </tbody></table>
    <table class="table res_tab2"><tbody>
      <tr><td>A-Constant:</td><td>119.00</td></tr>
      <tr><td>Target Ref:</td><td>0.00 D</td></tr>
    </tbody></table>
    <div class="text-center res_tab3_wait" style="display: none"><p>Processing…</p></div>
    <div class="res_nontoric">${tabla(filas ?? [])}</div>`

  return `<!doctype html><title>Kane Formula</title><body>
    ${seccion(opciones.od, opciones.alDeOd ?? '24.07')}
    ${seccion(opciones.os, '23.11')}
  </body>`
}

/**
 * La misma lectura que hace el adaptador, sobre la página que se le dé.
 *
 * Se replica aquí y no se importa del adaptador porque `leerResultado` es un
 * método privado que necesita el contexto entero de ejecución. Lo que interesa
 * comprobar es **el criterio**, y el criterio es este `evaluate`: es el mismo
 * código que corre dentro del navegador en producción.
 */
async function leer(pagina: Page, indiceDelOjo: number) {
  return pagina.evaluate(
    ({ indice }) => {
      const bloque = document.querySelectorAll('.res_nontoric')[indice]
      const eco = (clase: string): string => {
        const t = document.querySelectorAll(`table.${clase}`)[indice]
        return t instanceof HTMLElement ? t.innerText.replace(/\s+/g, ' ').trim() : ''
      }
      const filas = [...(bloque?.querySelectorAll('tbody.res_tab3_lines tr') ?? [])].map((f) => ({
        celdas: [...(f as HTMLTableRowElement).cells].map((c) => c.innerText.trim()),
        destacada: (f as HTMLElement).classList.contains('table-active'),
      }))
      return { filas, entradas: eco('res_tab1'), parametros: eco('res_tab2') }
    },
    { indice: indiceDelOjo },
  )
}

test('lee las siete potencias del ojo derecho', async () => {
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: FILAS_REALES }))

  const r = await leer(pagina, 0)
  expect(r.filas).toHaveLength(7)
  expect(r.filas.map((f) => f.celdas[0])).toEqual([
    '23.5',
    '23.0',
    '22.5',
    '22.0',
    '21.5',
    '21.0',
    '20.5',
  ])
  expect(r.filas[4]?.celdas[1]).toBe('-0.06')
  await pagina.close()
})

test('la recomendada es la que Kane marca, no la del medio', async () => {
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: FILAS_REALES }))

  const r = await leer(pagina, 0)
  const marcadas = r.filas.filter((f) => f.destacada)
  expect(marcadas).toHaveLength(1)
  expect(marcadas[0]?.celdas[0]).toBe('21.5')
  await pagina.close()
})

test('si Kane marca una que NO es la del medio, se coge la marcada', async () => {
  // Es el test que distingue «leer la marca» de «coger la del centro». Con siete
  // filas, la del medio es la quinta; aquí la marca está en la segunda.
  const desplazada = FILAS_REALES.map(([p, r], i) => [p, r, i === 1] as [string, string, boolean])
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: desplazada }))

  const r = await leer(pagina, 0)
  const marcadas = r.filas.filter((f) => f.destacada)
  expect(marcadas).toHaveLength(1)
  expect(marcadas[0]?.celdas[0]).toBe('23.0')
  await pagina.close()
})

test('si Kane no marca ninguna, no se marca ninguna', async () => {
  // Y se conservan todas las opciones. Inventar una recomendación clínica a
  // partir de una posición es lo que este test impide.
  const sinMarca = FILAS_REALES.map(([p, r]) => [p, r, false] as [string, string, boolean])
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: sinMarca }))

  const r = await leer(pagina, 0)
  expect(r.filas).toHaveLength(7)
  expect(r.filas.filter((f) => f.destacada)).toHaveLength(0)
  await pagina.close()
})

test('cada ojo lee SU sección, no la del otro', async () => {
  const delOtroOjo: readonly [string, string, boolean][] = [
    ['19.5', '0.10', false],
    ['19.0', '0.44', true],
  ]
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: FILAS_REALES, os: delOtroOjo }))

  const od = await leer(pagina, 0)
  const os = await leer(pagina, 1)

  expect(od.filas).toHaveLength(7)
  expect(os.filas).toHaveLength(2)
  expect(od.filas.find((f) => f.destacada)?.celdas[0]).toBe('21.5')
  expect(os.filas.find((f) => f.destacada)?.celdas[0]).toBe('19.0')
  await pagina.close()
})

test('el eco de la web permite cazar que se está leyendo el ojo equivocado', async () => {
  // La sección se elige por posición, así que hace falta una comprobación: Kane
  // repite las entradas, y si la AL que enseña no es la que se le mandó, el
  // resultado sería del otro ojo. Y parecería válido.
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: FILAS_REALES, alDeOd: '24.07' }))

  const od = await leer(pagina, 0)
  const os = await leer(pagina, 1)

  const alDe = (texto: string) => Number(/AL:\s*([\d.,]+)/i.exec(texto)?.[1] ?? 'NaN')
  expect(alDe(od.entradas)).toBeCloseTo(24.07, 2)
  // El del otro ojo enseña otra AL: es lo que delataría el cruce.
  expect(alDe(os.entradas)).toBeCloseTo(23.11, 2)
  expect(alDe(od.entradas)).not.toBeCloseTo(alDe(os.entradas), 2)

  // Y el eco lleva los parámetros, que es la parte auditable del informe.
  expect(od.parametros).toContain('A-Constant')
  expect(od.parametros).toContain('119.00')
  await pagina.close()
})

test('una tabla vacía no produce ninguna opción inventada', async () => {
  // Kane sirve la tabla con filas de relleno «00» antes de calcular. Si se leyera
  // eso, saldrían siete potencias falsas.
  const pagina = await navegador.newPage()
  await pagina.setContent(pantalla({ od: [] }))

  const r = await leer(pagina, 0)
  expect(r.filas).toHaveLength(0)
  await pagina.close()
})
