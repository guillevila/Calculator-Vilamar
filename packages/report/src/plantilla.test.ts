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

import { esc, generarHtmlInforme } from './plantilla.js'
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

function html(): string {
  const caso = casoCompleto()
  return generarHtmlInforme(
    recopilarInforme(caso, { version: '0.1.0', generadoEn: '2026-08-10T12:34:00.000Z' }),
  )
}

describe('escapado', () => {
  it('no deja pasar HTML de fuera', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(esc(undefined)).toBe('')
  })

  it('un nombre de fichero con símbolos no rompe el documento', () => {
    let caso = casoCompleto()
    caso = {
      ...caso,
      documentos: [{ ...caso.documentos[0]!, nombre: '<img src=x onerror=alert(1)>.pdf' }],
    }
    const salida = generarHtmlInforme(
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
 * El cuerpo del informe, sin el pie.
 *
 * El pie NOMBRA los datos que el informe no lleva («no contiene el nombre, la
 * fecha de nacimiento ni el número de historia»). Esa frase tiene que estar, así
 * que la comprobación de privacidad mira el resto del documento: lo que importa
 * es que no aparezca ningún dato identificativo, no que no se nombre la idea.
 */
function cuerpoSinPie(h: string): string {
  const i = h.indexOf('<footer')
  return i === -1 ? h : h.slice(0, i)
}

describe('un dato ausente se dice, no se rellena', () => {
  it('un campo sin valor sale como NO ENCONTRADO', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.07, DEL_INFORME))
    ojo = confirmarTodas(ojo)
    const caso = confirmar(conOjo(casoNuevo('c', 'CV-1', CUANDO), ojo, CUANDO), CUANDO)
    const h = generarHtmlInforme(recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }))
    // El WTW no está: no puede aparecer un número en su lugar.
    expect(h).toContain('Datos que faltaban')
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
    const h = generarHtmlInforme(recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }))
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
    const h = generarHtmlInforme(recopilarInforme(caso, { version: '0.1.0', generadoEn: CUANDO }))
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
    return generarHtmlInforme({
      caso,
      version: '0.0.0',
      generadoEn: CUANDO,
      comparativas: [],
      avisos: [],
      ausenciasRelevantes: [],
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
