/**
 * kane-torico.test.ts — El modo tórico de Kane.
 *
 * Kane tiene dos modos por ojo, y hasta el 13/08/2026 este producto solo usaba el
 * no tórico. Eso dejaba su columna a medias justo en lo que se estaba comparando:
 * se pedían tres calculadoras TÓRICAS para una lente tórica y Kane solo devolvía
 * esfera y refracción prevista, con el cilindro vacío.
 *
 * Lo que se prueba aquí, por orden de importancia:
 *
 *  1. **Que ninguna opción tórica se marca como recomendada.** Kane no destaca
 *     ninguna, y este producto compara pero no recomienda.
 *  2. Que el modo se decide por los datos y no por una preferencia.
 *  3. Que las filas de su tabla tórica se leen como las escribe él.
 *  4. Que los identificadores del ojo izquierdo no son los del derecho copiados.
 *
 * Los datos son sintéticos, con la FORMA de los reales: las cadenas de texto están
 * copiadas de una captura de su web hecha con datos inventados.
 */

import { describe, expect, it } from 'vitest'

import {
  camposDeKane,
  construirOpcionesDeKane,
  leerFilaToricaDeKane,
  modoParaKane,
  puedePedirseToricoAKane,
  type FilaDeKane,
} from './kane.js'

/** Los cuatro datos que su modo tórico necesita, y nada más. */
const LOS_CUATRO = { K1_EJE: 175, K2_EJE: 85, SIA: 0.3, EJE_INCISION: 90 } as const

const ENTRADAS_BASE = {
  ojo: 'OD' as const,
  codigoCaso: 'CV-SIN-001',
  valores: { AL: 24.07, K1: 41.22, K2: 42.52, ACD: 3.18, CONSTANTE_A: 119 },
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · La regla que no se negocia
// ═══════════════════════════════════════════════════════════════════════════

describe('ninguna opción tórica se marca como recomendada', () => {
  /** La tabla de potencias tal y como la devuelve Kane, con SU fila destacada. */
  const POTENCIAS: readonly FilaDeKane[] = [
    { celdas: ['23.0', '-1.11'], destacada: false },
    { celdas: ['22.5', '-0.76'], destacada: false },
    { celdas: ['22.0', '-0.41'], destacada: false },
    { celdas: ['21.5', '-0.06'], destacada: true },
    { celdas: ['21.0', '0.28'], destacada: false },
  ]

  /** Su tabla tórica. En la web real NINGUNA fila lleva `table-active`. */
  const TORICAS: readonly FilaDeKane[] = [
    { celdas: ['Non-toric (0.00)', '0.42 D Axis 80'], destacada: false },
    { celdas: ['T2 (1.00)', '0.24 D Axis 170'], destacada: false },
    { celdas: ['T3 (1.50)', '0.57 D Axis 170'], destacada: false },
  ]

  it('la recomendada es la potencia esférica que Kane destaca, y no lleva cilindro', () => {
    const { opciones } = construirOpcionesDeKane(POTENCIAS, TORICAS)
    const recomendadas = opciones.filter((o) => o.recomendada)

    expect(recomendadas).toHaveLength(1)
    expect(recomendadas[0]?.esfera).toBe(21.5)
    expect(recomendadas[0]?.refraccionPrevista).toBe(-0.06)
    // No se le cuelga un cilindro que Kane no ha elegido.
    expect(recomendadas[0]?.cilindro).toBeUndefined()
    expect(recomendadas[0]?.designacion).toBeUndefined()
  })

  it('ninguna fila con designación tórica sale como recomendada', () => {
    const { opciones } = construirOpcionesDeKane(POTENCIAS, TORICAS)
    const conDesignacion = opciones.filter((o) => o.designacion !== undefined)

    expect(conDesignacion).toHaveLength(3)
    for (const o of conDesignacion) expect(o.recomendada).toBe(false)
  })

  it('AUNQUE Kane marcase una tórica, no se traslada como recomendada', () => {
    // Esta es la prueba de que la regla no depende de lo que haga su web. Si algún
    // día Kane empezara a destacar una fila tórica, seguiríamos sin elegirla: no
    // hemos verificado qué significaría esa marca, y una recomendación clínica
    // equivocada se lee igual de creíble que una correcta.
    const conUnaMarcada = TORICAS.map((f, i) => ({ ...f, destacada: i === 1 }))
    const { opciones } = construirOpcionesDeKane(POTENCIAS, conUnaMarcada)

    const recomendadas = opciones.filter((o) => o.recomendada)
    expect(recomendadas).toHaveLength(1)
    expect(recomendadas[0]?.designacion).toBeUndefined()
  })

  it('no se elige la tórica de menor cilindro residual, que es la tentación', () => {
    // T2 deja 0.24 D y las otras más. Elegirla «porque es la mejor» sería inventarse
    // la recomendación que Kane se ha guardado a propósito.
    const { opciones } = construirOpcionesDeKane(POTENCIAS, TORICAS)
    const t2 = opciones.find((o) => o.designacion === 'T2')

    expect(t2?.cilindroResidual).toBe(0.24)
    expect(t2?.recomendada).toBe(false)
  })

  it('las tóricas llevan la esfera que Kane destaca, porque es el mismo cálculo', () => {
    const { opciones } = construirOpcionesDeKane(POTENCIAS, TORICAS)
    for (const o of opciones.filter((x) => x.designacion !== undefined)) {
      expect(o.esfera).toBe(21.5)
    }
  })

  it('sin potencia destacada, las tóricas se conservan sin esfera inventada', () => {
    const sinDestacar = POTENCIAS.map((f) => ({ ...f, destacada: false }))
    const { opciones } = construirOpcionesDeKane(sinDestacar, TORICAS)

    expect(opciones.some((o) => o.recomendada)).toBe(false)
    for (const o of opciones.filter((x) => x.designacion !== undefined)) {
      expect(o.esfera).toBeUndefined()
    }
  })

  it('cuenta cuántas tóricas ha leído, para poder avisar si no ha leído ninguna', () => {
    expect(construirOpcionesDeKane(POTENCIAS, TORICAS).toricasLeidas).toBe(3)
    expect(construirOpcionesDeKane(POTENCIAS, []).toricasLeidas).toBe(0)
  })

  it('la opción de NO poner tórica se conserva: dice cuánto astigmatismo se deja', () => {
    const { opciones } = construirOpcionesDeKane(POTENCIAS, TORICAS)
    const noTorica = opciones.find((o) => o.designacion === 'Non-toric')

    expect(noTorica?.cilindro).toBe(0)
    expect(noTorica?.cilindroResidual).toBe(0.42)
    expect(noTorica?.ejeResidual).toBe(80)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · El modo se decide por los datos
// ═══════════════════════════════════════════════════════════════════════════

describe('cuándo se le pide a Kane el cálculo tórico', () => {
  it('con los cuatro datos, tórico', () => {
    expect(puedePedirseToricoAKane({ ...ENTRADAS_BASE.valores, ...LOS_CUATRO })).toBe(true)
    expect(
      modoParaKane({ ...ENTRADAS_BASE, valores: { ...ENTRADAS_BASE.valores, ...LOS_CUATRO } }),
    ).toBe('TORICO')
  })

  it.each(['K1_EJE', 'K2_EJE', 'SIA', 'EJE_INCISION'] as const)(
    'sin %s, no tórico — y no se rellena medio formulario tórico',
    (queFalta) => {
      const valores: Record<string, number> = { ...ENTRADAS_BASE.valores, ...LOS_CUATRO }
      delete valores[queFalta]

      expect(puedePedirseToricoAKane(valores)).toBe(false)
      expect(modoParaKane({ ...ENTRADAS_BASE, valores })).toBe('NO_TORICO')
    },
  )

  it('un eje de 0 grados NO cuenta como ausente', () => {
    // 0° es un eje perfectamente real. Si `0` se tratara como falta de dato, un
    // astigmatismo a 0° tiraría el cálculo al modo no tórico sin avisar.
    const valores = { ...ENTRADAS_BASE.valores, ...LOS_CUATRO, K1_EJE: 0, EJE_INCISION: 0 }
    expect(puedePedirseToricoAKane(valores)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · Leer sus filas tal y como las escribe
// ═══════════════════════════════════════════════════════════════════════════

describe('leer una fila de la tabla tórica de Kane', () => {
  it('«T2 (1.00)» + «0.24 D Axis 170»', () => {
    expect(leerFilaToricaDeKane(['T2 (1.00)', '0.24 D Axis 170'])).toEqual({
      designacion: 'T2',
      cilindro: 1,
      cilindroResidual: 0.24,
      ejeResidual: 170,
    })
  })

  it('«Non-toric (0.00)» es una opción, no un error', () => {
    expect(leerFilaToricaDeKane(['Non-toric (0.00)', '0.42 D Axis 80'])).toEqual({
      designacion: 'Non-toric',
      cilindro: 0,
      cilindroResidual: 0.42,
      ejeResidual: 80,
    })
  })

  it('una designación con espacios se conserva entera', () => {
    expect(leerFilaToricaDeKane(['SN6AT3 XL (1.50)', '0.10 D Axis 5'])?.designacion).toBe(
      'SN6AT3 XL',
    )
  })

  it('sin residual legible, la fila sigue valiendo por su cilindro', () => {
    const r = leerFilaToricaDeKane(['T4 (2.25)', '—'])
    expect(r?.cilindro).toBe(2.25)
    expect(r?.cilindroResidual).toBeUndefined()
    expect(r?.ejeResidual).toBeUndefined()
  })

  it.each([
    ['sin paréntesis', ['T2 1.00', '0.24 D Axis 170']],
    ['con un cilindro que no es número', ['T2 (n/a)', '0.24 D Axis 170']],
    ['con la celda vacía', ['', '0.24 D Axis 170']],
    ['sin celdas', []],
    ['solo el paréntesis, sin designación', ['(1.00)', '0.24 D Axis 170']],
  ])('devuelve null %s, en vez de adivinar', (_caso, celdas) => {
    expect(leerFilaToricaDeKane(celdas)).toBeNull()
  })

  it('su propia cabecera colada como fila no se lee como opción', () => {
    // «Toric (Cylinder Power)» tiene la FORMA de una fila válida —texto y
    // paréntesis—, así que solo la salva que lo de dentro tenga que ser un número.
    // Sin esa comprobación, la cabecera entraría en la tabla como una lente.
    expect(leerFilaToricaDeKane(['Toric (Cylinder Power)', 'Residual Cylinder'])).toBeNull()
  })

  // Comprobado en vivo el 28/08/2026 con la lente «B+L LuxSmart Toric»: al elegir un
  // modelo concreto, Kane deja de escribir «T2 (1.00)» y pone solo el número, bajo
  // una columna que ya no se llama «Toric (Cylinder Power)» sino con el nombre de la
  // lente («B+L Cylinder Power»). Antes de este caso, ese formato hacía que
  // `toricasLeidas` saliera en 0 y el adaptador devolviera ADAPTER_BROKEN aunque
  // Kane sí había dado sus tres opciones.
  it('«0.75» a secas —una lente concreta, sin designación de Kane— también es una opción', () => {
    expect(leerFilaToricaDeKane(['0.75', '0.29 D Axis 75'])).toEqual({
      designacion: '0.75',
      cilindro: 0.75,
      cilindroResidual: 0.29,
      ejeResidual: 75,
    })
  })

  it('su propia cabecera con el nombre de la lente tampoco se lee como opción', () => {
    expect(leerFilaToricaDeKane(['B+L Cylinder Power', 'Residual Cylinder'])).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4 · Los identificadores del formulario
// ═══════════════════════════════════════════════════════════════════════════

describe('los campos de cada modo y cada ojo', () => {
  it('el modo tórico añade el eje de K1, el SIA y el eje de la incisión', () => {
    const noTorico = Object.keys(camposDeKane('NO_TORICO', 'OD'))
    const torico = Object.keys(camposDeKane('TORICO', 'OD'))

    for (const nuevo of ['K1_EJE', 'SIA', 'EJE_INCISION']) {
      expect(noTorico).not.toContain(nuevo)
      expect(torico).toContain(nuevo)
    }
  })

  it('NO se manda el eje de K2: Kane no deja escribirlo, lo deriva perpendicular', () => {
    // Comprobado contra su web el 13/08/2026: `#k2-right-t-axis` existe pero no
    // admite escritura. Tenerlo en la tabla haría fallar el relleno en cada
    // ejecución, y el fallo se vería cuatro pasos más adelante.
    expect(Object.keys(camposDeKane('TORICO', 'OD'))).not.toContain('K2_EJE')
    expect(Object.keys(camposDeKane('TORICO', 'OS'))).not.toContain('K2_EJE')
  })

  it.each(['NO_TORICO', 'TORICO'] as const)(
    'en modo %s, el ojo izquierdo no usa ningún identificador del derecho',
    (modo) => {
      // El bloque del OS se escribió por simetría con el del OD y luego se verificó
      // contra la web. Este test protege de la copia sin cambiar: un `-right` en el
      // lado izquierdo leería y escribiría el ojo equivocado.
      for (const [campo, loc] of Object.entries(camposDeKane(modo, 'OS'))) {
        expect(loc.selector, `${campo} del OS`).not.toMatch(/right/i)
        expect(loc.selector, `${campo} del OS`).not.toMatch(/Constant1\b/)
      }
      for (const [campo, loc] of Object.entries(camposDeKane(modo, 'OD'))) {
        expect(loc.selector, `${campo} del OD`).not.toMatch(/left/i)
        expect(loc.selector, `${campo} del OD`).not.toMatch(/Constant2\b/)
      }
    },
  )

  it('los campos biométricos del modo tórico llevan el sufijo -t', () => {
    // La constante A y la refracción objetivo NO lo llevan: viven fuera del bloque
    // que conmuta, y por eso son la excepción declarada.
    const fuera = new Set(['CONSTANTE_A', 'REFRACCION_OBJETIVO', 'SIA', 'EJE_INCISION'])
    for (const [campo, loc] of Object.entries(camposDeKane('TORICO', 'OD'))) {
      if (fuera.has(campo)) continue
      expect(loc.selector, campo).toMatch(/-t(-axis)?$/)
    }
  })

  it('el modo no tórico sigue siendo el de la captura del 12/08/2026', () => {
    // Guarda contra que añadir el tórico haya movido el que ya funcionaba.
    expect(camposDeKane('NO_TORICO', 'OD').AL?.selector).toBe('#al-right')
    expect(camposDeKane('NO_TORICO', 'OS').AL?.selector).toBe('#al-left')
    expect(camposDeKane('TORICO', 'OD').AL?.selector).toBe('#al-right-t')
    expect(camposDeKane('TORICO', 'OS').AL?.selector).toBe('#al-left-t')
  })
})
