/**
 * Lo que se prueba aquí, en una frase: la constante A puede venir de fuera
 * del ojo —el catálogo, o la propia web de EVO/Kane al reconocer el
 * modelo— y eso no puede bloquear la confirmación de un caso que en realidad
 * sí puede calcular (D38).
 *
 * El fallo que esto fija: pedía escribir a mano una constante que ya se sabía
 * de otro sitio, porque `prepararEntradas` solo miraba la medida del ojo.
 */

import { describe, expect, it } from 'vitest'

import type { Calculadora } from './calculadoras.js'
import type { Caso } from './caso.js'
import { casoNuevo, confirmar, conOjo } from './caso.js'
import type { Catalogo } from './catalogo-lentes.js'
import { confirmarTodas, conCirugiaRefractiva, conMedida, crearMedida, ojoVacio } from './medida.js'
import { explicarBloqueo, prepararEntradas, tieneConstanteFueraDelOjo } from './preparar-entradas.js'

const CUANDO = '2026-08-24T10:00:00.000Z'

/** Un caso confirmado, con el ojo derecho completo salvo la constante A. */
function casoListoSinConstante(lente?: { modelo: string; fabricante?: string }): Caso {
  let ojo = ojoVacio('OD')
  const datos: [Parameters<typeof crearMedida>[0], number][] = [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K1_EJE', 175],
    ['K2', 42.52],
    ['K2_EJE', 85],
    ['ACD', 3.18],
    ['LT', 4.53],
    ['CCT', 530],
    ['WTW', 11.9],
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0],
    ['EJE_INCISION', 0],
  ]
  for (const [campo, valor] of datos) {
    ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }))
  }
  ojo = confirmarTodas(ojo)

  let caso = confirmar(conOjo(casoNuevo('c1', 'CV-2026-0001', CUANDO), ojo, CUANDO), CUANDO)
  caso = {
    ...caso,
    sexo: {
      valor: 'MUJER',
      procedencia: { metodo: 'MANUAL', registradoEn: CUANDO },
      confirmadoPorUsuario: true,
    },
    ...(lente ? { lente } : {}),
  }
  return caso
}

const CATALOGO: Catalogo = [
  {
    id: 'envy',
    modelo: 'enVista ENVY',
    fabricante: 'Bausch & Lomb',
    torica: false,
    constantesA: { BARRETT_TORIC: 119.28, KANE: 119.33 },
  },
]

describe('tieneConstanteFueraDelOjo', () => {
  const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })

  it('EVO y Kane: basta con haber elegido una lente, tenga o no catálogo', () => {
    expect(tieneConstanteFueraDelOjo(caso, 'EVO_TORIC', undefined)).toBe(true)
    expect(tieneConstanteFueraDelOjo(caso, 'KANE', undefined)).toBe(true)
    expect(tieneConstanteFueraDelOjo(caso, 'EVO_TORIC', [])).toBe(true)
  })

  it('Barrett: hace falta que el catálogo tenga su constante para esa lente', () => {
    expect(tieneConstanteFueraDelOjo(caso, 'BARRETT_TORIC', undefined)).toBe(false)
    expect(tieneConstanteFueraDelOjo(caso, 'BARRETT_TORIC', [])).toBe(false)
    expect(tieneConstanteFueraDelOjo(caso, 'BARRETT_TORIC', CATALOGO)).toBe(true)
  })

  it('sin ninguna lente elegida, ninguna calculadora tiene constante de fuera', () => {
    const sinLente = casoListoSinConstante()
    for (const c of ['EVO_TORIC', 'BARRETT_TORIC', 'KANE'] as const) {
      expect(tieneConstanteFueraDelOjo(sinLente, c, CATALOGO)).toBe(false)
    }
  })
})

describe('prepararEntradas con la constante fuera del ojo', () => {
  // CONSTANTE_A es «requerido» en la ficha de EVO y de Kane, y solo
  // «opcional» en la de Barrett (su propia adapter.validarEntradas exige
  // «constante O factor de lente» por su cuenta, un nivel más abajo — eso no
  // se puede probar aquí sin abrir su web, así que este fichero solo cubre lo
  // que decide `prepararEntradas`).
  it('sin lente elegida y sin constante en el ojo, EVO y Kane piden la constante A', () => {
    const caso = casoListoSinConstante()
    for (const c of ['EVO_TORIC', 'KANE'] as const satisfies readonly Calculadora[]) {
      const r = prepararEntradas(caso, c, 'OD')
      expect(r.ok).toBe(false)
      if (!r.ok && r.motivo === 'FALTAN_DATOS') {
        expect(r.detalle.faltan).toContain('CONSTANTE_A')
      }
    }
  })

  it('con una lente elegida, EVO y Kane YA NO piden la constante A', () => {
    const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    expect(prepararEntradas(caso, 'EVO_TORIC', 'OD').ok).toBe(true)
    expect(prepararEntradas(caso, 'KANE', 'OD').ok).toBe(true)
  })

  it('Barrett nunca bloquea aquí por la constante — su propio adaptador la exige aparte', () => {
    const sinLente = casoListoSinConstante()
    const conLente = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    expect(prepararEntradas(sinLente, 'BARRETT_TORIC', 'OD').ok).toBe(true)
    expect(prepararEntradas(conLente, 'BARRETT_TORIC', 'OD').ok).toBe(true)
  })

  it('las entradas que salen no llevan CONSTANTE_A si no había medida — la pone el orquestador', () => {
    const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.valores.CONSTANTE_A).toBeUndefined()
  })
})

describe('prepararEntradas y la cirugía refractiva previa', () => {
  it('si no se ha aportado nada, las entradas no la llevan — no bloquea nada', () => {
    const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.cirugiaRefractivaPrevia).toBeUndefined()
  })

  it('si se ha aportado, viaja en las entradas de EVO', () => {
    let caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const conCirugia = conCirugiaRefractiva(
      caso.ojos.OD ?? ojoVacio('OD'),
      'MIOPICA',
      '2026-09-04T10:00:00.000Z',
    )
    caso = conOjo(caso, conCirugia, '2026-09-04T10:00:00.000Z')
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.cirugiaRefractivaPrevia).toBe('MIOPICA')
  })
})

describe('Barrett True-K Toric: solo para ojos con cirugía refractiva previa (D53)', () => {
  it('sin aportar nada, no puede lanzarse', () => {
    const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const r = prepararEntradas(caso, 'BARRETT_TRUE_K_TORIC', 'OD')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('FALTA_LA_CIRUGIA_REFRACTIVA')
  })

  it('con «NINGUNA» aportada explícitamente, tampoco puede', () => {
    let caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const conNinguna = conCirugiaRefractiva(
      caso.ojos.OD ?? ojoVacio('OD'),
      'NINGUNA',
      '2026-09-04T10:00:00.000Z',
    )
    caso = conOjo(caso, conNinguna, '2026-09-04T10:00:00.000Z')
    const r = prepararEntradas(caso, 'BARRETT_TRUE_K_TORIC', 'OD')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('FALTA_LA_CIRUGIA_REFRACTIVA')
  })

  it('con una cirugía real aportada, sí puede — y viaja en las entradas', () => {
    let caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const conCirugia = conCirugiaRefractiva(
      caso.ojos.OD ?? ojoVacio('OD'),
      'HIPERMETROPICA',
      '2026-09-04T10:00:00.000Z',
    )
    caso = conOjo(caso, conCirugia, '2026-09-04T10:00:00.000Z')
    const r = prepararEntradas(caso, 'BARRETT_TRUE_K_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.cirugiaRefractivaPrevia).toBe('HIPERMETROPICA')
  })

  it('el motivo se explica en lenguaje normal, sin jerga', () => {
    const caso = casoListoSinConstante({ modelo: 'enVista ENVY', fabricante: 'Bausch & Lomb' })
    const r = prepararEntradas(caso, 'BARRETT_TRUE_K_TORIC', 'OD')
    const texto = explicarBloqueo(r) ?? ''
    expect(texto).toMatch(/cirugía refractiva/i)
    expect(texto).not.toMatch(/FALTA_LA_CIRUGIA_REFRACTIVA|undefined|null/)
  })
})
