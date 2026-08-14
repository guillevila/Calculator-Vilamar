/**
 * diagrama.test.ts — El diagrama del eje de la lente.
 *
 * Existe porque **un eje mal dibujado es clínicamente engañoso**: alguien lo mira
 * para orientar una lente tórica, y una escala girada o volteada no se nota a
 * simple vista. Se comprueba la geometría con números, no con el ojo.
 *
 * La notación es la de las webs y la de los informes de biometría: **0° a la
 * derecha, 90° arriba, creciendo en sentido antihorario.** En SVG la Y crece hacia
 * abajo, así que ahí está el único sitio donde se puede colar un signo.
 */

import { describe, expect, it } from 'vitest'

import type { Comparativa, OjoBiometrico } from '@vilamar/domain'
import { conMedida, crearMedida, ojoVacio } from '@vilamar/domain'

import { diagramaDeEje, extremosDelEje, meridianoCurvo } from './plantilla.js'

const CUANDO = '2026-08-14T10:00:00.000Z'
const DEL_PDF = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  dispositivoId: 'PENTACAM',
  confianza: 0.95,
  registradoEn: CUANDO,
  evidencia: { texto: 'K1 42.6 @ 171', pagina: 1 },
} as const

/** Un ojo con las queratometrías del informe real: K1 42.6 @ 171°, K2 43.6 @ 81°. */
function ojoConK(k1: number, ejeK1: number, k2: number, ejeK2: number): OjoBiometrico {
  let o = ojoVacio('OS')
  for (const [campo, valor] of [
    ['K1', k1],
    ['K1_EJE', ejeK1],
    ['K2', k2],
    ['K2_EJE', ejeK2],
  ] as const) {
    o = conMedida(o, crearMedida(campo, 'OS', valor, DEL_PDF))
  }
  return o
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · La geometría, que es lo que puede engañar
// ═══════════════════════════════════════════════════════════════════════════

describe('los extremos de un eje dentro del círculo', () => {
  const cx = 76
  const cy = 76
  const r = 62

  it('0° es horizontal: derecha e izquierda', () => {
    const e = extremosDelEje(0, cx, cy, r)
    expect(e.x1).toBeCloseTo(138, 5)
    expect(e.y1).toBeCloseTo(76, 5)
    expect(e.x2).toBeCloseTo(14, 5)
    expect(e.y2).toBeCloseTo(76, 5)
  })

  it('90° es vertical, y el extremo va ARRIBA', () => {
    // Aquí es donde se colaría el signo: en SVG la Y crece hacia abajo, así que
    // 90° tiene que dar una Y MENOR que el centro, no mayor.
    const e = extremosDelEje(90, cx, cy, r)
    expect(e.x1).toBeCloseTo(76, 5)
    expect(e.y1).toBeCloseTo(14, 5)
    expect(e.y1).toBeLessThan(cy)
    expect(e.y2).toBeCloseTo(138, 5)
  })

  it('70° —el eje del informe real— va arriba y a la derecha', () => {
    const e = extremosDelEje(70, cx, cy, r)
    expect(e.x1).toBeGreaterThan(cx)
    expect(e.y1).toBeLessThan(cy)
    // Y más vertical que horizontal, porque 70° está cerca de 90°.
    expect(Math.abs(e.y1 - cy)).toBeGreaterThan(Math.abs(e.x1 - cx))
  })

  it('180° cae sobre el mismo sitio que 0°: es una orientación, no una dirección', () => {
    const a = extremosDelEje(0, cx, cy, r)
    const b = extremosDelEje(180, cx, cy, r)
    expect(b.x1).toBeCloseTo(a.x2, 5)
    expect(b.y1).toBeCloseTo(a.y2, 5)
  })

  it('los dos extremos son simétricos respecto al centro', () => {
    for (const g of [0, 12, 45, 70, 81, 100, 135, 171]) {
      const e = extremosDelEje(g, cx, cy, r)
      expect((e.x1 + e.x2) / 2).toBeCloseTo(cx, 5)
      expect((e.y1 + e.y2) / 2).toBeCloseTo(cy, 5)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · El meridiano curvo, sin dar por hecho el convenio
// ═══════════════════════════════════════════════════════════════════════════

describe('el meridiano corneal curvo', () => {
  it('con el convenio normal (K2 la mayor) coge K2 y su eje', () => {
    // Los números del informe real: K1 42.6 @ 171°, K2 43.6 @ 81°.
    const m = meridianoCurvo(ojoConK(42.6, 171, 43.6, 81))
    expect(m?.poder).toBeCloseTo(43.6, 5)
    expect(m?.eje).toBe(81)
    expect(m?.astigmatismo).toBeCloseTo(1.0, 5)
  })

  it('si viniera al revés, coge la mayor de todas formas', () => {
    // No se da por hecho que K2 sea siempre la curva: si un informe las trae
    // cambiadas, coger «K2» a ciegas dibujaría el meridiano plano.
    const m = meridianoCurvo(ojoConK(43.6, 81, 42.6, 171))
    expect(m?.poder).toBeCloseTo(43.6, 5)
    expect(m?.eje).toBe(81)
    expect(m?.astigmatismo).toBeCloseTo(1.0, 5)
  })

  it('sin una de las dos K, no hay meridiano ni astigmatismo', () => {
    let o = ojoVacio('OS')
    o = conMedida(o, crearMedida('K1', 'OS', 42.6, DEL_PDF))
    expect(meridianoCurvo(o)).toBeUndefined()
  })

  it('con las dos K iguales el astigmatismo es cero, no se inventa nada', () => {
    expect(meridianoCurvo(ojoConK(43, 90, 43, 180))?.astigmatismo).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · El dibujo entero
// ═══════════════════════════════════════════════════════════════════════════

/** Una comparativa mínima con los ejes que se le den. */
function comparativa(
  ejes: readonly { calculadora: 'EVO_TORIC' | 'BARRETT_TORIC'; eje?: number; modelo?: string }[],
): Comparativa {
  return {
    ojo: 'OS',
    conResultado: ejes.length,
    comparables: ejes.length,
    observaciones: [],
    celdas: ejes.map((e) => ({
      calculadora: e.calculadora,
      nombre: e.calculadora === 'EVO_TORIC' ? 'EVO Toric' : 'Barrett Toric',
      ejecutada: true,
      estado: 'SUCCESS' as const,
      seleccion: { clase: 'SIN_RESULTADO' as const },
      esfera: { estado: 'NO_DISPONIBLE' as const },
      cilindro: { estado: 'NO_DISPONIBLE' as const },
      eje:
        e.eje === undefined
          ? ({ estado: 'NO_DISPONIBLE' } as const)
          : ({ estado: 'VALOR', valor: e.eje } as const),
      designacion:
        e.modelo === undefined
          ? ({ estado: 'NO_DISPONIBLE' } as const)
          : ({ estado: 'VALOR', valor: e.modelo } as const),
      refraccionPrevista: { estado: 'NO_DISPONIBLE' as const },
      cilindroResidual: { estado: 'NO_DISPONIBLE' as const },
      ejeResidual: { estado: 'NO_DISPONIBLE' as const },
      opciones: [],
    })),
  }
}

const OJO_REAL = ojoConK(42.6, 171, 43.6, 81)

describe('el diagrama dibujado', () => {
  it('con las dos calculadoras de acuerdo, enseña el eje en el centro', () => {
    const h = diagramaDeEje(
      comparativa([
        { calculadora: 'EVO_TORIC', eje: 70, modelo: 'T2' },
        { calculadora: 'BARRETT_TORIC', eje: 70, modelo: 'T2' },
      ]),
      OJO_REAL,
    )
    expect(h).toContain('>70°<')
    expect(h).toContain('Eje LIO EVO Toric 70° · T2')
    expect(h).toContain('Eje LIO Barrett Toric 70° · T2')
  })

  it('dibuja UNA línea por calculadora, no una sola «del caso»', () => {
    const h = diagramaDeEje(
      comparativa([
        { calculadora: 'EVO_TORIC', eje: 70 },
        { calculadora: 'BARRETT_TORIC', eje: 100 },
      ]),
      OJO_REAL,
    )
    // Dos colores distintos, uno por calculadora.
    expect(h).toContain('#0B5F68')
    expect(h).toContain('#1B4C86')
    expect(h).toContain('Eje LIO EVO Toric 70°')
    expect(h).toContain('Eje LIO Barrett Toric 100°')
  })

  it('si NO coinciden, no se pone ningún eje en el centro', () => {
    // Poner uno obligaría a elegir cuál, y eso no le toca al programa.
    const h = diagramaDeEje(
      comparativa([
        { calculadora: 'EVO_TORIC', eje: 70 },
        { calculadora: 'BARRETT_TORIC', eje: 100 },
      ]),
      OJO_REAL,
    )
    expect(h).not.toContain('>70°<')
    expect(h).not.toContain('>100°<')
    expect(h).toContain('no proponen el mismo eje')
  })

  it('enseña el meridiano curvo y el astigmatismo, marcado como derivado', () => {
    const h = diagramaDeEje(comparativa([{ calculadora: 'EVO_TORIC', eje: 70 }]), OJO_REAL)
    expect(h).toContain('Meridiano corneal curvo 81° · 43.60 D')
    expect(h).toContain('Astigmatismo corneal <strong>1.00 D</strong>')
    // Y NO se disfraza de dato leído del informe.
    expect(h).toContain('marca-derivado')
  })

  it('dice la separación entre el meridiano curvo y el eje de la lente', () => {
    const h = diagramaDeEje(comparativa([{ calculadora: 'EVO_TORIC', eje: 70 }]), OJO_REAL)
    // 81° del meridiano y 70° de la lente: 11°.
    expect(h).toContain('EVO Toric 11°')
  })

  it('la incisión y el SIA salen cuando el caso los trae', () => {
    let o = OJO_REAL
    o = conMedida(o, crearMedida('EJE_INCISION', 'OS', 180, DEL_PDF))
    o = conMedida(o, crearMedida('SIA', 'OS', 0.3, DEL_PDF))
    const h = diagramaDeEje(comparativa([{ calculadora: 'EVO_TORIC', eje: 70 }]), o)
    expect(h).toContain('Incisión 180° · SIA 0.30 D')
  })

  it('sin ejes ni queratometrías NO se dibuja un círculo vacío', () => {
    const h = diagramaDeEje(comparativa([{ calculadora: 'EVO_TORIC' }]), ojoVacio('OS'))
    expect(h).not.toContain('<svg')
    expect(h).toContain('No hay nada que dibujar')
  })

  it('sin ojo se apaña con lo que devuelven las calculadoras', () => {
    const h = diagramaDeEje(comparativa([{ calculadora: 'EVO_TORIC', eje: 70 }]), undefined)
    expect(h).toContain('<svg')
    expect(h).toContain('Eje LIO EVO Toric 70°')
    // Sin queratometrías no puede haber ni meridiano ni astigmatismo.
    expect(h).not.toContain('Meridiano corneal curvo')
    expect(h).not.toContain('Astigmatismo corneal')
  })
})
