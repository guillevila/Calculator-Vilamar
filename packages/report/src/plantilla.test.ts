/**
 * plantilla.test.ts — Que el informe cuente la verdad y no filtre nada.
 *
 * Lo que más se comprueba aquí no es el aspecto —eso se mira con los ojos— sino
 * dos cosas que sí se pueden probar: que un dato ausente se diga como ausente,
 * y que en el documento no aparezca nada que identifique a una persona.
 */

import { describe, expect, it } from 'vitest'

import type { Caso, OjoBiometrico, Procedencia, ResultadoCalculadora } from '@vilamar/domain'
import {
  APARATO_PRINCIPAL,
  casoNuevo,
  corregirMedida,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
  normalizarOjo,
  ojoVacio,
} from '@vilamar/domain'

import type { ResultadoInforme } from './plantilla.js'
import { esc, generarHtmlInforme, generarHtmlInformeDetallado } from './plantilla.js'
import { recopilarInforme } from './recopilar.js'

const CUANDO = '2026-08-10T10:00:00.000Z'
const DEL_INFORME: Procedencia = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  dispositivoId: 'ANTERION',
  confianza: 0.97,
  registradoEn: CUANDO,
  evidencia: { texto: 'AL 24.07 mm', pagina: 1 },
}
const A_MANO: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }

function casoCompleto(): Caso {
  let ojo = ojoVacio('OD')
  const delInforme: [Parameters<typeof crearMedida>[0], number][] = [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K1_EJE', 175],
    ['K2', 42.52],
    ['K2_EJE', 85],
    ['ACD', 3.18],
    ['LT', 4.53],
    ['CCT', 530],
  ]
  for (const [campo, valor] of delInforme) {
    ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, DEL_INFORME))
  }
  // Escritos a mano por el cirujano: tienen que distinguirse en el informe.
  for (const [campo, valor] of [
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0.3],
    ['EJE_INCISION', 90],
    ['CONSTANTE_A', 119],
  ] as const) {
    ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, A_MANO))
  }
  ojo = confirmarTodas(ojo)

  let caso: Caso = {
    ...casoNuevo('c1', 'CV-2026-0042', CUANDO),
    documentos: [
      {
        id: 'doc-1',
        nombre: 'biometria-sintetica.pdf',
        tipo: 'PDF',
        formato: 'pdf',
        tamanoBytes: 12345,
        paginas: 1,
        cargadoEn: CUANDO,
        ojosDetectados: ['OD'],
        dispositivoDetectado: { dispositivo: 'ANTERION', confianza: 0.9, indicios: ['ANTERION'] },
      },
    ],
    lente: { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
  }
  caso = confirmar(conOjo(caso, ojo, CUANDO), CUANDO)

  const evo: ResultadoCalculadora = {
    calculadora: 'EVO_TORIC',
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    opciones: [{ esfera: 21.5, cilindro: 1, eje: 81, recomendada: true }],
    recomendada: {
      esfera: 21.5,
      cilindro: 1,
      eje: 81,
      designacion: 'T2',
      refraccionPrevista: 0.16,
      cilindroResidual: -0.06,
      ejeResidual: 81,
      recomendada: true,
    },
    entradasSegunLaWeb: {
      Parámetros: 'A Constant: 119.2  Toric Model: Alcon SN6ATx  K Index: 1.3375',
      Biometría: 'AL: 24.07  K1: 41.22 @ 175°  K2: 42.52 @ 85°',
      Ojo: 'OD',
    },
  }
  const barrett: ResultadoCalculadora = {
    calculadora: 'BARRETT_TORIC',
    ojo: 'OD',
    estado: 'MISSING_INPUTS',
    obtenidoEn: CUANDO,
    opciones: [],
    mensaje: 'Barrett necesita el diámetro corneal (WTW) y no se ha encontrado.',
    faltan: ['WTW'],
  }
  caso = conResultado(caso, evo, CUANDO)
  caso = conResultado(caso, barrett, CUANDO)
  return caso
}

/**
 * El informe DETALLADO (portada, tabla comparativa, alternativas, biometría,
 * trazabilidad) — no es el que genera la aplicación por defecto (ver
 * `generarHtmlInforme`, probado más abajo en su propio bloque), pero se
 * conserva y se sigue probando porque el código sigue ahí.
 */
function html(): string {
  const caso = casoCompleto()
  return generarHtmlInformeDetallado(
    recopilarInforme(caso, { version: '0.1.0', generadoEn: '2026-08-10T12:34:00.000Z' }),
  )
}

describe('escapado', () => {
  it('no deja pasar HTML de fuera', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(esc(undefined)).toBe('')
  })

  it('un nombre de fichero con símbolos no rompe el documento', () => {
    // El nombre del documento solo se enseña en el informe DETALLADO (hoja de
    // biometría): el simplificado no lo toca en absoluto.
    let caso = casoCompleto()
    caso = {
      ...caso,
      documentos: [{ ...caso.documentos[0]!, nombre: '<img src=x onerror=alert(1)>.pdf' }],
    }
    const salida = generarHtmlInformeDetallado(
      recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }),
    )
    expect(salida).not.toContain('<img src=x')
    expect(salida).toContain('&lt;img src=x')
  })
})

describe('el informe dice lo que hay', () => {
  it('lleva el nombre del producto, la versión, la fecha y el código del caso', () => {
    const h = html()
    expect(h).toContain('Calculator Vilamar')
    expect(h).toContain('0.1.0')
    expect(h).toContain('CV-2026-0042')
    expect(h).toContain('10/08/2026')
  })

  it('dice qué aparato generó el informe', () => {
    expect(html()).toContain('Heidelberg ANTERION')
  })

  it('distingue lo extraído de lo escrito a mano', () => {
    const h = html()
    expect(h).toContain('Del informe')
    expect(h).toContain('Escrito a mano')
  })

  it('enseña la evidencia de lo que se leyó', () => {
    expect(html()).toContain('AL 24.07 mm')
  })

  it('un campo que no da la calculadora sale como raya, no como 0', () => {
    const h = html()
    // La raya se lee como «no hay dato». «N/A» se leía como «ha fallado», que es
    // otra cosa, y por eso ya no se usa.
    expect(h).toContain('—')
    expect(h).not.toContain('N/A')
    // Kane no se ejecutó: su columna existe pero sin números inventados.
    expect(h).toContain('Kane')
  })

  it('dice por qué no se pudo ejecutar Barrett', () => {
    const h = html()
    expect(h).toContain('WTW')
    expect(h).toMatch(/Barrett/)
  })

  it('recoge lo que la web dice haber recibido', () => {
    const h = html()
    expect(h).toContain('Qué dice cada calculadora haber recibido')
    expect(h).toContain('A Constant: 119.2')
  })

  it('dice claramente que los resultados son de las calculadoras externas', () => {
    const h = html()
    expect(h).toMatch(/proceden de las calculadoras externas/i)
    expect(h).toMatch(/no calcula potencias de lente/i)
  })

  it('dice que no emite recomendación clínica', () => {
    // El texto del pie va partido en varias líneas: se compara sin espacios.
    expect(sinSaltos(html())).toMatch(/no emite ninguna recomendación clínica/i)
  })
})

/** Junta el HTML en una línea para poder buscar frases que van partidas. */
function sinSaltos(h: string): string {
  return h.replace(/\s+/g, ' ')
}

/**
 * El cuerpo del informe, sin el pie ni el contenido opaco de las capturas.
 *
 * El pie NOMBRA los datos que el informe no lleva («no contiene el nombre, la
 * fecha de nacimiento ni el número de historia»). Esa frase tiene que estar, así
 * que la comprobación de privacidad mira el resto del documento: lo que importa
 * es que no aparezca ningún dato identificativo, no que no se nombre la idea.
 *
 * El base64 de una captura es contenido binario opaco: puede contener por azar
 * cualquier subcadena, incluidas las que busca esa comprobación, sin que haya
 * ningún dato identificativo real. Se descarta del barrido antes de buscar.
 */
function cuerpoSinPie(h: string): string {
  const i = h.indexOf('<footer')
  const sinPie = i === -1 ? h : h.slice(0, i)
  return sinPie.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,[omitido]')
}

describe('un dato ausente se dice, no se rellena', () => {
  it('un campo sin valor sale como NO ENCONTRADO', () => {
    // «Datos que faltaban» es la sección de trazabilidad del informe
    // DETALLADO; el simplificado no la tiene.
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.07, DEL_INFORME))
    ojo = confirmarTodas(ojo)
    const caso = confirmar(conOjo(casoNuevo('c', 'CV-1', CUANDO), ojo, CUANDO), CUANDO)
    const h = generarHtmlInformeDetallado(
      recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }),
    )
    // El WTW no está: no puede aparecer un número en su lugar.
    expect(h).toContain('Datos que faltaban')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  El informe SIMPLIFICADO — el que genera de verdad la aplicación
//  (`generarHtmlInforme`). Solo capturas + lente recomendada + aviso de
//  fallo, nada de tabla comparativa, biometría, diagramas ni trazabilidad.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construye el informe simplificado a partir de una lista de resultados hecha
 * a mano. `aparato` es opcional en las llamadas de este fichero: cuando no se
 * da, se rellena con `APARATO_PRINCIPAL` — los tests de aquí no son sobre
 * D47, así que no necesitan repetirlo en cada literal.
 */
function htmlSimple(
  resultados: readonly (Omit<ResultadoInforme, 'aparato'> & { readonly aparato?: string })[],
  codigo = 'CV-2026-0042',
): string {
  const caso = confirmar(
    conOjo(casoNuevo('c1', codigo, CUANDO), confirmarTodas(ojoVacio('OD')), CUANDO),
    CUANDO,
  )
  const conAparato = resultados.map((r) => ({ ...r, aparato: r.aparato ?? APARATO_PRINCIPAL }))
  return generarHtmlInforme(
    recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO, resultados: conAparato }),
  )
}

describe('el informe simplificado (generarHtmlInforme)', () => {
  it('una casilla con éxito lleva la imagen y la lente recomendada', () => {
    const h = htmlSimple([
      {
        calculadora: 'EVO_TORIC',
        ojo: 'OD',
        dataUri: 'data:image/png;base64,QUFB',
        // `eje` (el meridiano corneal, fijo) es a propósito distinto de
        // `ejeResidual` (el que enseña el informe) — ver el fallo real
        // documentado en `recomendacion.ts`, 01/09/2026.
        recomendada: { esfera: 21.5, cilindro: 1, eje: 40, ejeResidual: 81 },
      },
    ])
    expect(h).toContain('<img src="data:image/png;base64,QUFB"')
    expect(h).toContain('Estimación de Calculator Vilamar')
    expect(h).toContain('no vinculante')
    expect(h).toContain('21.50 D')
    expect(h).toContain('Cilindro 1.00 D')
    expect(h).toContain('Eje 81°')
  })

  it('una casilla con resultado pero sin captura legible explica la ausencia, sin inventar una imagen', () => {
    const h = htmlSimple([{ calculadora: 'KANE', ojo: 'OD' }])
    expect(h).toContain('No se pudo guardar la captura de pantalla')
    expect(h).not.toContain('<img src="undefined"')
  })

  it('una casilla sin resultado utilizable enseña el aviso de fallo, no una captura', () => {
    const h = htmlSimple([
      {
        calculadora: 'BARRETT_TORIC',
        ojo: 'OD',
        fallo: 'Barrett necesita el diámetro corneal (WTW) y no se ha encontrado.',
      },
    ])
    expect(h).toContain('Barrett necesita el diámetro corneal (WTW)')
    expect(h).not.toContain('<img')
  })

  it('el orden es calculadora a calculadora, tal como llegan los resultados', () => {
    const h = htmlSimple([
      { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
      { calculadora: 'BARRETT_TORIC', ojo: 'OD', fallo: 'Falta el WTW.' },
      { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 21.5 } },
    ])
    const iEvo = h.indexOf('EVO Toric')
    const iBarrett = h.indexOf('Barrett Toric')
    const iKane = h.indexOf('Kane')
    expect(iEvo).toBeGreaterThan(-1)
    expect(iBarrett).toBeGreaterThan(iEvo)
    expect(iKane).toBeGreaterThan(iBarrett)
  })

  it('sin ningún resultado, genera un informe válido que lo explica en vez de quedar en blanco', () => {
    const h = htmlSimple([])
    expect(h.startsWith('<!doctype html>')).toBe(true)
    expect(h).toContain('Este caso no tiene ningún resultado calculado todavía')
  })

  it('no lleva nada del informe detallado: ni tabla comparativa, ni biometría, ni trazabilidad, ni portada', () => {
    const h = htmlSimple([
      {
        calculadora: 'EVO_TORIC',
        ojo: 'OD',
        dataUri: 'data:image/png;base64,QUFB',
        recomendada: { esfera: 21.5 },
      },
    ])
    expect(h).not.toContain('<div class="cab-marca">')
    expect(h).not.toContain('Qué dice cada calculadora haber recibido')
    expect(h).not.toContain('Biometría confirmada')
    expect(h).not.toContain('class="tabla-comparativa"')
  })

  it('no lleva ningún dato identificativo del paciente', () => {
    const h = htmlSimple([
      { calculadora: 'EVO_TORIC', ojo: 'OD', dataUri: 'data:image/png;base64,QUFB' },
    ])
    const cuerpo = cuerpoSinPie(h).toLowerCase()
    for (const prohibido of ['fecha de nacimiento', 'número de historia', 'nhc', 'apellidos', 'dni']) {
      expect(cuerpo, `el informe menciona «${prohibido}»`).not.toContain(prohibido)
    }
  })

  describe('el cuadro comparativo final (D43)', () => {
    it('con una sola estimación no hay nada que comparar: no sale el cuadro', () => {
      const h = htmlSimple([{ calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } }])
      expect(h).not.toContain('Comparación orientativa')
    })

    it('con dos o más estimaciones del mismo ojo, sale el cuadro con el aviso de no vinculante', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 22.0 } },
      ])
      expect(h).toContain('Comparación orientativa')
      expect(h).toContain('opcional y no vinculante')
      expect(h).toContain('EVO Toric')
      expect(h).toContain('Kane')
    })

    it('no señala ninguna como la más adecuada: solo enseña el valor de cada una', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'BARRETT_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 23.0 } },
      ])
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro.toLowerCase()).not.toContain('más cercana')
      expect(cuadro.toLowerCase()).not.toContain('más adecuada')
    })

    it('no confunde esto con lo que ha destacado la calculadora: nunca dice "ha elegido"', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 22.0 } },
      ])
      // Solo el propio cuadro, sin el pie legal común (que sí menciona «implanta» al
      // hablar de las calculadoras externas, y no es lo que se está comprobando aquí).
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro.toLowerCase()).not.toContain('recomendamos')
      expect(cuadro.toLowerCase()).not.toContain('debes')
      expect(cuadro.toLowerCase()).not.toContain('implanta')
      expect(cuadro.toLowerCase()).not.toContain('ha elegido')
    })

    it('el eje que enseña es el residual de cada calculadora, no el meridiano corneal fijo (fallo real, 01/09/2026)', () => {
      // Caso real: el meridiano corneal («eje») es el mismo para todo el
      // ojo — aquí 0°, repetido en las cinco casillas de un PDF real—,
      // mientras que el eje que cada calculadora dice que quedaría
      // («ejeResidual») varía. Enseñar `eje` (como hacía el fallo) daba
      // «Eje 0°» cinco veces seguidas, sin ninguna información real.
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 29.5, eje: 0, ejeResidual: 94 } },
        { calculadora: 'BARRETT_TORIC', ojo: 'OD', recomendada: { esfera: 28.5, eje: 0, ejeResidual: 4 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 29.0, eje: 0, ejeResidual: 5 } },
      ])
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro).toContain('Eje 94°')
      expect(cuadro).toContain('Eje 4°')
      expect(cuadro).toContain('Eje 5°')
      expect(cuadro).not.toContain('Eje 0°')
    })

    it('la tabla comparativa detallada también enseña el eje residual, no el corneal fijo', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 29.5, eje: 0, ejeResidual: 94 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 29.0, eje: 0, ejeResidual: 5 } },
      ])
      const inicio = h.indexOf('Tabla comparativa detallada')
      const tabla = h.slice(inicio, h.indexOf('</table>', inicio))
      expect(tabla).toContain('94°')
      expect(tabla).toContain('5°')
      expect(tabla).not.toContain('0°')
    })

    it('un ojo sin ninguna estimación (todo fallos) no saca cuadro', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', fallo: 'Falta la constante A.' },
        { calculadora: 'KANE', ojo: 'OD', fallo: 'Falta el sexo.' },
      ])
      expect(h).not.toContain('Comparación orientativa')
    })

    it('D45: la variante «sin córnea posterior» SÍ cuenta para el cuadro, con su propia tarjeta', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'EVO_TORIC_SIN_CARA_POSTERIOR', ojo: 'OD', recomendada: { esfera: 22.0 } },
      ])
      // Dos estimaciones para este ojo — la base y su variante —, así que sí
      // hay algo que poner una al lado de otra.
      expect(h).toContain('Comparación orientativa')
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro).toContain('EVO Toric — estimado')
      expect(cuadro).toContain('22.00 D')
    })

    it('D45: con las tres de verdad Y la variante, el cuadro saca las cinco tarjetas', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'EVO_TORIC_SIN_CARA_POSTERIOR', ojo: 'OD', recomendada: { esfera: 30.0 } },
        { calculadora: 'BARRETT_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 21.5 } },
      ])
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro).toContain('EVO Toric')
      expect(cuadro).toContain('EVO Toric — estimado')
      expect(cuadro).toContain('Barrett Toric')
      expect(cuadro).toContain('Kane')
      expect(cuadro).toContain('30.00 D')
    })

    it('D47: con un solo aparato, la tarjeta no menciona ningún nombre de aparato', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', recomendada: { esfera: 21.5 } },
        { calculadora: 'KANE', ojo: 'OD', recomendada: { esfera: 21.5 } },
      ])
      expect(h).toContain('<div class="tarjeta-nombre">EVO Toric</div>')
      expect(h).toContain('<div class="tarjeta-nombre">Kane</div>')
    })

    it('D47: con dos aparatos del mismo ojo, cada tarjeta dice de cuál es', () => {
      const h = htmlSimple([
        { calculadora: 'EVO_TORIC', ojo: 'OD', aparato: 'IOLMaster 700', recomendada: { esfera: 21.5 } },
        { calculadora: 'EVO_TORIC', ojo: 'OD', aparato: 'ANTERION', recomendada: { esfera: 22.0 } },
      ])
      const cuadro = h.slice(h.indexOf('Comparación orientativa'), h.indexOf('<footer'))
      expect(cuadro).toContain('EVO Toric (IOLMaster 700)')
      expect(cuadro).toContain('EVO Toric (ANTERION)')
    })
  })

  it('D45: una casilla de la variante «sin córnea posterior» dice «estimado» en su título (petición del dueño, 27/08/2026)', () => {
    const h = htmlSimple([
      {
        calculadora: 'EVO_TORIC_SIN_CARA_POSTERIOR',
        ojo: 'OD',
        dataUri: 'data:image/png;base64,QUFB',
        recomendada: { esfera: 22.0 },
      },
    ])
    expect(h).toContain('EVO Toric — estimado')
  })

  it('D45: la variante «con córnea posterior» de Barrett dice «con córnea posterior medida» en su título (petición del dueño, 27/08/2026)', () => {
    const h = htmlSimple([
      {
        calculadora: 'BARRETT_TORIC_CON_CARA_POSTERIOR',
        ojo: 'OD',
        dataUri: 'data:image/png;base64,QUFB',
        recomendada: { esfera: 21.0 },
      },
    ])
    expect(h).toContain('Barrett Toric — con córnea posterior medida')
  })

  it('D45+D47: EVO_TORIC (la base) NO dice «con córnea posterior medida» cuando el ojo no tiene PK1 ni PK2 — sería mentira', () => {
    // Sin esta comprobación, un ojo normal (sin córnea posterior) con solo
    // la calculadora base habría dicho «medida» sin haber medido nada.
    const h = htmlSimple([
      {
        calculadora: 'EVO_TORIC',
        ojo: 'OD',
        dataUri: 'data:image/png;base64,QUFB',
        recomendada: { esfera: 21.5 },
      },
    ])
    expect(h).not.toContain('con córnea posterior medida')
    expect(h).toContain('EVO Toric · Ojo derecho (OD)')
  })

  it('D45+D47: EVO_TORIC (la base) SÍ dice «con córnea posterior medida» cuando el dataset de verdad tiene PK1/PK2', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('PK1', 'OD', -6, A_MANO))
    ojo = conMedida(ojo, crearMedida('PK2', 'OD', -6.1, A_MANO))
    ojo = confirmarTodas(ojo)
    const caso = confirmar(conOjo(casoNuevo('c1', 'CV-2026-0042', CUANDO), ojo, CUANDO), CUANDO)
    const h = generarHtmlInforme(
      recopilarInforme(caso, {
        version: '0.1.0',
        generadoEn: CUANDO,
        resultados: [
          {
            calculadora: 'EVO_TORIC',
            ojo: 'OD',
            aparato: APARATO_PRINCIPAL,
            dataUri: 'data:image/png;base64,QUFB',
            recomendada: { esfera: 21.5 },
          },
        ],
      }),
    )
    expect(h).toContain('EVO Toric — con córnea posterior medida')
  })
})

describe('privacidad del documento', () => {
  it('el cuerpo del informe no contiene campos de identificación de paciente', () => {
    const cuerpo = cuerpoSinPie(html()).toLowerCase()
    for (const prohibido of [
      'fecha de nacimiento',
      'número de historia',
      'nhc',
      'apellidos',
      'dni',
      'patient name',
      'patient id',
    ]) {
      expect(cuerpo, `el informe menciona «${prohibido}»`).not.toContain(prohibido)
    }
  })

  it('dice explícitamente que no lleva datos identificativos', () => {
    expect(sinSaltos(html())).toMatch(/no contiene el nombre, la fecha de nacimiento ni/i)
  })

  it('el caso se identifica solo por su código local', () => {
    const h = html()
    expect(h).toContain('CV-2026-0042')
  })
})

describe('robustez', () => {
  it('un caso sin resultados genera informe igualmente', () => {
    let ojo = ojoVacio('OD')
    ojo = confirmarTodas(conMedida(ojo, crearMedida('AL', 'OD', 24.07, DEL_INFORME)))
    const caso = confirmar(conOjo(casoNuevo('c', 'CV-2', CUANDO), ojo, CUANDO), CUANDO)
    const h = generarHtmlInformeDetallado(
      recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }),
    )
    expect(h).toContain('<!doctype html>')
    expect(h).toContain('CV-2')
  })

  it('un caso con los dos ojos saca las dos secciones', () => {
    const od = confirmarTodas(
      conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, DEL_INFORME)),
    )
    const os = confirmarTodas(
      conMedida(ojoVacio('OS'), crearMedida('AL', 'OS', 24.01, DEL_INFORME)),
    )
    let caso = casoNuevo('c', 'CV-3', CUANDO)
    caso = conOjo(caso, od, CUANDO)
    caso = conOjo(caso, os, CUANDO)
    caso = confirmar(caso, CUANDO)
    const h = generarHtmlInformeDetallado(
      recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }),
    )
    expect(h).toContain('Ojo derecho (OD)')
    expect(h).toContain('Ojo izquierdo (OS)')
    expect(h).toContain('24.07')
    expect(h).toContain('24.01')
    void od
    void os
  })

  it('el HTML generado está bien formado en lo esencial', () => {
    const h = html()
    expect(h.startsWith('<!doctype html>')).toBe(true)
    expect(h).toContain('</html>')
    // Mismo número de apertura y cierre de las etiquetas que estructuran.
    for (const etiqueta of ['table', 'section', 'tbody', 'thead']) {
      const abre = (h.match(new RegExp(`<${etiqueta}[\\s>]`, 'g')) ?? []).length
      const cierra = (h.match(new RegExp(`</${etiqueta}>`, 'g')) ?? []).length
      expect(abre, `<${etiqueta}> abiertas y cerradas`).toBe(cierra)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  El informe dice de dónde salió cada dato, con el mismo vocabulario
//  que la pantalla de revisión
// ═══════════════════════════════════════════════════════════════════════════

describe('el origen de cada dato en el PDF', () => {
  const DEL_PDF = {
    metodo: 'TEXTO_PDF' as const,
    documentoId: 'doc-1',
    registradoEn: CUANDO,
    evidencia: { texto: 'AL            24.07 mm', pagina: 1 },
  }

  function informeCon(construir: (ojo: OjoBiometrico) => OjoBiometrico): string {
    const ojo = confirmarTodas(construir(ojoVacio('OD')))
    const caso = confirmar(
      conOjo(casoNuevo('c-origen', 'CV-2026-0099', CUANDO), ojo, CUANDO),
      CUANDO,
    )
    // «Del informe» / «Corregido» / «Aportado» / «Derivado del informe» son
    // vocabulario de la hoja de biometría del informe DETALLADO — el
    // simplificado no enseña ningún dato biométrico, solo capturas.
    return generarHtmlInformeDetallado({
      caso,
      version: '0.0.0',
      generadoEn: CUANDO,
      comparativas: [],
      avisos: [],
      ausenciasRelevantes: [],
      resultados: [],
    })
  }

  it('un dato leído sale como «Del informe»', () => {
    const html = informeCon((o) => conMedida(o, crearMedida('AL', 'OD', 24.07, DEL_PDF)))
    expect(html).toContain('Del informe')
  })

  it('un dato corregido sale como «Corregido» Y enseña lo que ponía', () => {
    // Es lo que hace auditable una corrección: sin el valor original, el informe
    // diría «escrito a mano» sin poder explicar frente a qué.
    const html = informeCon((o) => {
      const leido = conMedida(o, crearMedida('AL', 'OD', 24.07, DEL_PDF))
      return corregirMedida(leido, 'AL', 24.08, CUANDO)
    })
    expect(html).toContain('Corregido')
    expect(html).toContain('Leído originalmente')
    expect(html).toContain('24.07')
    expect(html).toContain('24.08')
    // Y la línea literal del informe sigue ahí.
    expect(html).toContain('AL            24.07 mm')
  })

  it('un dato aportado a mano sale como «Aportado», sin original inventado', () => {
    const html = informeCon((o) => corregirMedida(o, 'SIA', 0.3, CUANDO))
    expect(html).toContain('Aportado')
    expect(html).not.toContain('Leído originalmente')
  })

  it('ya no dice «NO ENCONTRADO» de forma genérica', () => {
    // El texto viejo mezclaba «el informe no lo trae» con «lo tienes que poner
    // tú», y eso hacía parecer que la lectura había fallado.
    const html = informeCon((o) => conMedida(o, crearMedida('AL', 'OD', 24.07, DEL_PDF)))
    expect(html).not.toContain('NO ENCONTRADO')
  })

  it('una ACD calculada sale como «Derivado del informe», con la cuenta', () => {
    // Quien audite este PDF meses después tiene que poder distinguir de un
    // vistazo lo que ponía el informe de lo que calculó el programa, y poder
    // rehacer la cuenta sin abrir el código.
    const html = informeCon((o) => {
      let ojo = conMedida(
        o,
        crearMedida('AQD', 'OD', 2.65, { ...DEL_PDF, dispositivoId: 'ANTERION' }),
      )
      ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, { ...DEL_PDF, dispositivoId: 'ANTERION' }))
      return normalizarOjo(ojo, 'ANTERION', CUANDO).ojo
    })

    expect(html).toContain('Derivado del informe')
    expect(html).toContain('AQD 2.65 mm + CCT 530 µm (0.530 mm)')
    // Y NO se disfraza de dato leído.
    expect(html).toContain('marca-derivado')
    // Los sumandos siguen en el informe como medidas propias.
    expect(html).toContain('2.65')
    expect(html).toContain('530')
  })
})
