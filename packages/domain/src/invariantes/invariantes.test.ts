/**
 * invariantes.test.ts — Las diez reglas clínicas que no se negocian.
 *
 * Cada bloque de este fichero corresponde a una de las invariantes del
 * producto. No son tests de cobertura: son la definición ejecutable de lo que
 * este programa tiene prohibido hacer.
 *
 * **Si un cambio hace fallar un test de aquí, el que está mal es el cambio.**
 * No se relaja la regla para que pase.
 */

import { describe, expect, it } from 'vitest'

import {
  APARATO_PRINCIPAL,
  aparatosDe,
  autorizadoACalcular,
  camposDerivados,
  camposManuales,
  casoNuevo,
  confirmar,
  confirmarTodas,
  conAparatoRenombrado,
  conMedida,
  conOjo,
  crearMedida,
  datasetsDe,
  detectarDiscrepancias,
  esLecturaAutomatica,
  formatearMedida,
  necesitaComprobacionHumana,
  nivelDeCampo,
  obtener,
  ojoDe,
  ojoVacio,
  prepararEntradas,
  sePuedeConfirmar,
  sePuedeConfirmarDataset,
  sinMedida,
  TEXTO_AUSENTE,
  tiene,
  valorDe,
  validarOjo,
} from '../index.js'
import type { Caso, Lateralidad, OjoBiometrico, Procedencia } from '../index.js'

const CUANDO = '2026-08-10T10:00:00.000Z'

const EXTRAIDO: Procedencia = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  confianza: 0.98,
  registradoEn: CUANDO,
  evidencia: { texto: 'AL 24.07 mm', pagina: 1 },
}
const MANUAL: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }
const DERIVADO: Procedencia = {
  metodo: 'DERIVADO',
  registradoEn: CUANDO,
  derivacion: { deCampos: ['ACD', 'CCT'], explicacion: 'AQD = ACD − CCT' },
}

/** Fixture sintético del ojo derecho. Datos inventados, no de una persona. */
function odCompleto(): OjoBiometrico {
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
    ['CONSTANTE_A', 119.0],
  ]
  for (const [campo, valor] of datos) {
    ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, EXTRAIDO))
  }
  return ojo
}

function casoCon(ojos: OjoBiometrico[]): Caso {
  let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
  for (const o of ojos) caso = conOjo(caso, o, CUANDO)
  return caso
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 1 — un dato que falta no es cero', () => {
  it('un campo ausente no se puede leer como 0', () => {
    const ojo = ojoVacio('OD')
    expect(tiene(ojo, 'LT')).toBe(false)
    expect(valorDe(ojo, 'LT')).toBeUndefined()
    // Lo importante: NO devuelve 0.
    expect(valorDe(ojo, 'LT')).not.toBe(0)
  })

  it('borrar un dato lo deja ausente, no a cero', () => {
    const conLt = conMedida(ojoVacio('OD'), crearMedida('LT', 'OD', 4.53, EXTRAIDO))
    const sinLt = sinMedida(conLt, 'LT')
    expect(tiene(sinLt, 'LT')).toBe(false)
    expect(valorDe(sinLt, 'LT')).toBeUndefined()
  })

  it('un dato ausente se enseña como NO ENCONTRADO, nunca como un número', () => {
    expect(formatearMedida(ojoVacio('OD'), 'WTW')).toBe(TEXTO_AUSENTE)
    expect(formatearMedida(ojoVacio('OD'), 'WTW')).not.toContain('0')
  })

  it('no se puede fabricar una medida con un valor que no es un número', () => {
    expect(() => crearMedida('AL', 'OD', Number.NaN, EXTRAIDO)).toThrow(/no es un número/)
    expect(() => crearMedida('AL', 'OD', Number.POSITIVE_INFINITY, EXTRAIDO)).toThrow()
  })

  it('un cero de verdad se distingue de un dato ausente', () => {
    // El objetivo refractivo 0.00 D es un valor real y legítimo.
    const ojo = conMedida(ojoVacio('OD'), crearMedida('REFRACCION_OBJETIVO', 'OD', 0, EXTRAIDO))
    expect(tiene(ojo, 'REFRACCION_OBJETIVO')).toBe(true)
    expect(valorDe(ojo, 'REFRACCION_OBJETIVO')).toBe(0)
    expect(formatearMedida(ojo, 'REFRACCION_OBJETIVO')).not.toBe(TEXTO_AUSENTE)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 2 — lo desconocido no se rellena con un valor «normal»', () => {
  it('preparar entradas no inventa los campos que faltan', () => {
    let ojo = odCompleto()
    ojo = sinMedida(ojo, 'WTW')
    ojo = confirmarTodas(ojo)
    const caso = confirmar(casoCon([ojo]), CUANDO)

    const r = prepararEntradas(caso, 'BARRETT_TORIC', 'OD')
    // Barrett tiene WTW como opcional: se puede calcular, pero el WTW NO viaja.
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.valores.WTW).toBeUndefined()
      expect('WTW' in r.entradas.valores).toBe(false)
    }
  })

  it('un campo obligatorio ausente bloquea, no se sustituye por un valor plausible', () => {
    let ojo = odCompleto()
    ojo = sinMedida(ojo, 'AL')
    ojo = confirmarTodas(ojo)
    const caso = confirmar(casoCon([ojo]), CUANDO)

    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('FALTAN_DATOS')
    if (r.ok === false && r.motivo === 'FALTAN_DATOS') {
      expect(r.detalle.faltan).toContain('AL')
    }
  })

  it('el nivel de un campo ausente es MISSING, no VALID', () => {
    const ojo = ojoVacio('OD')
    expect(nivelDeCampo(validarOjo(ojo), ojo, 'WTW')).toBe('MISSING')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 3 — AQD y ACD no son intercambiables', () => {
  it('son dos campos distintos y guardarlos no confunde el uno con el otro', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, EXTRAIDO))
    expect(tiene(ojo, 'ACD')).toBe(true)
    expect(tiene(ojo, 'AQD')).toBe(false)
    expect(valorDe(ojo, 'AQD')).toBeUndefined()
  })

  it('avisa si AQD no es menor que ACD, porque entonces están cambiadas', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 3.18, EXTRAIDO))
    const avisos = validarOjo(ojo)
    const aviso = avisos.find((a) => a.codigo === 'AQD_NO_MENOR_QUE_ACD')
    expect(aviso).toBeDefined()
    expect(aviso?.nivel).toBe('INVALID')
  })

  it('una AQD correcta (menor que ACD) no genera aviso', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.65, EXTRAIDO))
    expect(validarOjo(ojo).find((a) => a.codigo === 'AQD_NO_MENOR_QUE_ACD')).toBeUndefined()
  })

  it('EVO recibe la ACD, y nunca la AQD en su lugar', () => {
    let ojo = ojoVacio('OD')
    for (const [campo, valor] of [
      ['AL', 24.07],
      ['K1', 41.22],
      ['K1_EJE', 175],
      ['K2', 42.52],
      ['K2_EJE', 85],
      ['REFRACCION_OBJETIVO', 0],
      ['CONSTANTE_A', 119],
      ['AQD', 2.65],
    ] as const) {
      ojo = conMedida(ojo, crearMedida(campo, 'OD', valor, EXTRAIDO))
    }
    ojo = confirmarTodas(ojo)
    const caso = confirmar(casoCon([ojo]), CUANDO)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    // Falta la ACD de verdad: no se usa la AQD como sustituta.
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('FALTAN_DATOS')
    if (r.ok === false && r.motivo === 'FALTAN_DATOS') expect(r.detalle.faltan).toContain('ACD')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 4 — los dos ojos no se mezclan', () => {
  it('no se puede guardar una medida de OS dentro del ojo OD', () => {
    const od = ojoVacio('OD')
    const medidaDeOS = crearMedida('AL', 'OS', 24.01, EXTRAIDO)
    expect(() => conMedida(od, medidaDeOS)).toThrow(/no se mezclan/)
  })

  it('cada ojo guarda sus propios valores sin contaminarse', () => {
    const od = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, EXTRAIDO))
    const os = conMedida(ojoVacio('OS'), crearMedida('AL', 'OS', 24.01, EXTRAIDO))
    const caso = casoCon([od, os])
    expect(valorDe(ojoDe(caso, 'OD'), 'AL')).toBe(24.07)
    expect(valorDe(ojoDe(caso, 'OS'), 'AL')).toBe(24.01)
  })

  it('un caso con un solo ojo no inventa el otro', () => {
    const caso = casoCon([odCompleto()])
    expect(tiene(ojoDe(caso, 'OS'), 'AL')).toBe(false)
  })

  it('las entradas preparadas llevan la lateralidad del ojo pedido', () => {
    const od = confirmarTodas(odCompleto())
    const caso = confirmar(casoCon([od]), CUANDO)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.ojo).toBe<Lateralidad>('OD')
  })

  it('los avisos de validación dicen de qué ojo son', () => {
    const os = conMedida(ojoVacio('OS'), crearMedida('AL', 'OS', 99, EXTRAIDO))
    const avisos = validarOjo(os)
    expect(avisos.length).toBeGreaterThan(0)
    expect(avisos.every((a) => a.ojo === 'OS')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 5 — cada K conserva su eje', () => {
  it('K1 y K2 tienen ejes independientes', () => {
    const ojo = odCompleto()
    expect(valorDe(ojo, 'K1_EJE')).toBe(175)
    expect(valorDe(ojo, 'K2_EJE')).toBe(85)
    expect(valorDe(ojo, 'K1_EJE')).not.toBe(valorDe(ojo, 'K2_EJE'))
  })

  it('avisa si K1 es mayor que K2, pero NO las intercambia', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1', 'OD', 42.52, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('K2', 'OD', 41.22, EXTRAIDO))
    const avisos = validarOjo(ojo)
    expect(avisos.find((a) => a.codigo === 'K_INVERTIDAS')).toBeDefined()
    // Los valores siguen exactamente donde estaban.
    expect(valorDe(ojo, 'K1')).toBe(42.52)
    expect(valorDe(ojo, 'K2')).toBe(41.22)
  })

  it('avisa si los ejes no son perpendiculares', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1_EJE', 'OD', 175, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('K2_EJE', 'OD', 120, EXTRAIDO))
    expect(validarOjo(ojo).find((a) => a.codigo === 'EJES_NO_PERPENDICULARES')).toBeDefined()
  })

  it('acepta 175/85 como perpendiculares', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('K1_EJE', 'OD', 175, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('K2_EJE', 'OD', 85, EXTRAIDO))
    expect(validarOjo(ojo).find((a) => a.codigo === 'EJES_NO_PERPENDICULARES')).toBeUndefined()
  })

  it('un eje fuera de 0–180 es INVALID', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('K1_EJE', 'OD', 200, EXTRAIDO))
    const aviso = validarOjo(ojo).find((a) => a.codigo === 'EJE_FUERA_DE_RANGO')
    expect(aviso?.nivel).toBe('INVALID')
    // Sugiere el equivalente, pero no lo aplica.
    expect(aviso?.sugerencia).toContain('20')
    expect(valorDe(ojo, 'K1_EJE')).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 6 — no se inventan campos', () => {
  it('si falta el WTW, no aparece un 12.0 de la nada', () => {
    const ojo = odCompleto()
    const sinWtw = sinMedida(ojo, 'WTW')
    expect(valorDe(sinWtw, 'WTW')).toBeUndefined()
    expect(formatearMedida(sinWtw, 'WTW')).toBe(TEXTO_AUSENTE)
  })

  it('las entradas solo contienen campos que existen de verdad', () => {
    let ojo = sinMedida(odCompleto(), 'LT')
    ojo = sinMedida(ojo, 'CCT')
    ojo = confirmarTodas(ojo)
    const caso = confirmar(casoCon([ojo]), CUANDO)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      for (const [, valor] of Object.entries(r.entradas.valores)) {
        expect(valor).not.toBeUndefined()
      }
      expect(Object.keys(r.entradas.valores)).not.toContain('LT')
      expect(Object.keys(r.entradas.valores)).not.toContain('CCT')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 7 — nada derivado se disfraza de medido', () => {
  it('un dato derivado se distingue de uno medido y dice de dónde sale', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.65, DERIVADO))

    expect(camposDerivados(ojo)).toContain('AQD')
    expect(camposDerivados(ojo)).not.toContain('ACD')

    const aqd = obtener(ojo, 'AQD')
    expect(aqd?.procedencia.metodo).toBe('DERIVADO')
    expect(aqd?.procedencia.derivacion?.explicacion).toBe('AQD = ACD − CCT')
  })

  it('un dato manual se distingue de uno extraído', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.07, EXTRAIDO))
    ojo = conMedida(ojo, crearMedida('SIA', 'OD', 0.3, MANUAL))
    expect(camposManuales(ojo)).toEqual(['SIA'])
    expect(camposManuales(ojo)).not.toContain('AL')
  })

  it('un dato escrito a mano no lleva una confianza inventada', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('SIA', 'OD', 0.3, MANUAL))
    expect(obtener(ojo, 'SIA')?.procedencia.confianza).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 8 — dos documentos no son el mismo paciente por estar juntos', () => {
  it('un caso nuevo no da por hecho ninguna relación entre documentos', () => {
    const caso = casoNuevo('c', 'CV-2026-0002', CUANDO)
    expect(caso.documentos).toEqual([])
    expect(caso.ojos).toEqual({})
  })

  it('cargar documentos no crea ojos por su cuenta', () => {
    const caso: Caso = {
      ...casoNuevo('c', 'CV-2026-0003', CUANDO),
      documentos: [
        {
          id: 'd1',
          nombre: 'informe-a.pdf',
          tipo: 'PDF',
          formato: 'pdf',
          tamanoBytes: 1000,
          paginas: 1,
          cargadoEn: CUANDO,
          ojosDetectados: ['OD'],
        },
        {
          id: 'd2',
          nombre: 'informe-b.pdf',
          tipo: 'PDF',
          formato: 'pdf',
          tamanoBytes: 1000,
          paginas: 1,
          cargadoEn: CUANDO,
          ojosDetectados: ['OS'],
        },
      ],
    }
    // Hay dos documentos, cada uno dice contener un ojo. El caso NO ha decidido
    // por su cuenta que sean de la misma persona: sigue sin datos biométricos.
    expect(caso.documentos).toHaveLength(2)
    expect(Object.keys(caso.ojos)).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 9 — un error de lectura se enseña, no se corrige solo', () => {
  it('AL = 240.7 se marca INVALID y el valor no cambia', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 240.7, EXTRAIDO))
    const avisos = validarOjo(ojo)
    const aviso = avisos.find((a) => a.codigo === 'FUERA_DE_LIMITE')
    expect(aviso?.nivel).toBe('INVALID')
    // Sugiere cuál era probablemente el valor…
    expect(aviso?.sugerencia).toContain('24.07')
    // …y NO lo aplica.
    expect(valorDe(ojo, 'AL')).toBe(240.7)
  })

  it('el aviso dice explícitamente que el programa no cambia datos solo', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 240.7, EXTRAIDO))
    const aviso = validarOjo(ojo).find((a) => a.codigo === 'FUERA_DE_LIMITE')
    expect(aviso?.sugerencia).toMatch(/no cambia datos/)
  })

  it('un valor raro pero posible es WARNING, no INVALID', () => {
    // 30 mm de longitud axial es muchísimo, pero existe (miopía magna).
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 30, EXTRAIDO))
    const avisos = validarOjo(ojo)
    expect(avisos.find((a) => a.codigo === 'FUERA_DE_LO_HABITUAL')?.nivel).toBe('WARNING')
    expect(avisos.find((a) => a.nivel === 'INVALID')).toBeUndefined()
  })

  it('validar nunca devuelve datos modificados: solo avisos', () => {
    const antes = odCompleto()
    const copia = JSON.stringify(antes)
    validarOjo(antes)
    expect(JSON.stringify(antes)).toBe(copia)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 10 — nada sin confirmar llega a una calculadora', () => {
  it('un caso sin confirmar no produce entradas', () => {
    const caso = casoCon([confirmarTodas(odCompleto())])
    expect(caso.estado).not.toBe('CONFIRMADO')
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(false)
    // Sin `if`: si el motivo fuese otro, este test tiene que caerse.
    expect(r.ok === false && r.motivo).toBe('SIN_CONFIRMAR_EL_CASO')
  })

  it('no se puede confirmar un caso con datos sin revisar', () => {
    const caso = casoCon([odCompleto()]) // sin confirmar las medidas
    expect(sePuedeConfirmar(caso)).toBe(false)
    expect(() => confirmar(caso, CUANDO)).toThrow(/sin ningún conjunto de medidas/)
  })

  it('un campo añadido DESPUÉS de confirmar no viaja sin revisar', () => {
    let ojo = confirmarTodas(odCompleto())
    // El caso está confirmado; ahora entra un dato nuevo sin revisar.
    ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, MANUAL))
    const caso: Caso = { ...casoCon([ojo]), estado: 'CONFIRMADO' }

    // La primera barrera (el estado) está abierta…
    expect(autorizadoACalcular(caso)).toBe(true)
    // …y aun así la segunda lo para, porque mira campo por campo.
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toBe('FALTAN_DATOS')
    if (r.ok === false && r.motivo === 'FALTAN_DATOS') {
      expect(r.detalle.sinConfirmar).toContain('CCT')
      expect(r.detalle.faltan).toEqual([])
    }
  })

  it('con todo confirmado, sí se preparan las entradas', () => {
    const caso = confirmar(casoCon([confirmarTodas(odCompleto())]), CUANDO)
    expect(autorizadoACalcular(caso)).toBe(true)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.valores.AL).toBe(24.07)
      expect(r.entradas.codigoCaso).toBe('CV-2026-0001')
    }
  })

  it('sin nombre de paciente en el caso, las entradas solo llevan el código', () => {
    const caso = confirmar(casoCon([confirmarTodas(odCompleto())]), CUANDO)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.nombrePaciente).toBeUndefined()
      expect(r.entradas.codigoCaso).toMatch(/^CV-/)
    }
  })

  it('D41/D44: el nombre del cirujano y el del paciente viajan, si el caso los tiene', () => {
    let caso = confirmar(casoCon([confirmarTodas(odCompleto())]), CUANDO)
    caso = { ...caso, nombreCirujano: 'Dra. Prueba', nombrePaciente: 'Paciente Sintético' }
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.nombreCirujano).toBe('Dra. Prueba')
      // D44 (27/08/2026): el nombre del paciente ya no es una excepción — se
      // pidió expresamente, dos veces, tras dos avisos explícitos.
      expect(r.entradas.nombrePaciente).toBe('Paciente Sintético')
    }
  })

  it('sin nombre de cirujano ni de paciente en el caso, las entradas no los llevan', () => {
    const caso = confirmar(casoCon([confirmarTodas(odCompleto())]), CUANDO)
    const r = prepararEntradas(caso, 'EVO_TORIC', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entradas.nombreCirujano).toBeUndefined()
      expect(r.entradas.nombrePaciente).toBeUndefined()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 11 — un dato leído por una máquina no se da por bueno solo', () => {
  const DE_OCR: Procedencia = {
    metodo: 'OCR',
    documentoId: 'doc-1',
    // Ojo al dato: esta fiabilidad es REAL de una prueba, y el valor que
    // acompañaba estaba MAL. Por eso no sirve como filtro.
    confianza: 0.93,
    registradoEn: CUANDO,
    evidencia: { texto: 'AL 24.81 mm', pagina: 1 },
  }

  it('se distingue de un dato exacto y de uno escrito a mano', () => {
    expect(esLecturaAutomatica(DE_OCR)).toBe(true)
    expect(esLecturaAutomatica(EXTRAIDO)).toBe(false) // texto nativo del PDF: exacto
    expect(esLecturaAutomatica(MANUAL)).toBe(false) // lo ha puesto una persona
    // Una cuenta NO es una lectura. Meterla aquí haría que la pantalla dijera
    // «leído de la imagen» de algo que no se ha leído de ninguna parte.
    expect(esLecturaAutomatica(DERIVADO)).toBe(false)
  })

  it('lo calculado tampoco se da por bueno solo, aunque no sea una lectura', () => {
    // Son dos motivos distintos para la misma exigencia: lo leído por una
    // máquina puede estar mal; lo calculado está bien pero NADIE LO HA VISTO, y
    // una ACD obtenida de AQD + CCT va a las tres calculadoras.
    expect(necesitaComprobacionHumana(DE_OCR)).toBe(true)
    expect(necesitaComprobacionHumana(DERIVADO)).toBe(true)
    // Lo exacto y lo escrito por una persona no lo necesitan.
    expect(necesitaComprobacionHumana(EXTRAIDO)).toBe(false)
    expect(necesitaComprobacionHumana(MANUAL)).toBe(false)
  })

  it('una fiabilidad alta NO lo convierte en fiable', () => {
    // 24.81 con un 93 % de fiabilidad, cuando el informe decía 24.01. El valor
    // está dentro de rango, así que la validación lo da por bueno: es
    // exactamente por eso que hace falta que lo mire una persona.
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.81, DE_OCR))
    const avisos = validarOjo(ojo)
    expect(avisos.find((a) => a.nivel === 'INVALID')).toBeUndefined()
    expect(nivelDeCampo(avisos, ojo, 'AL')).toBe('VALID')
    // Y aun así, sin confirmar.
    expect(obtener(ojo, 'AL')?.confirmadoPorUsuario).toBe(false)
  })

  it('confirmar todo NO confirma lo leído por OCR', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.81, DE_OCR))
    ojo = conMedida(ojo, crearMedida('SIA', 'OD', 0.3, MANUAL))

    // `confirmarTodas` del dominio es la operación de bajo nivel: confirma todo.
    // Lo que NO debe hacerlo en bloque es la aplicación, que filtra por
    // procedencia antes de llamarla. Aquí se comprueba el filtro.
    const aConfirmar = (Object.keys(ojo.medidas) as (keyof typeof ojo.medidas)[]).filter((c) => {
      const m = ojo.medidas[c]
      return m !== undefined && !esLecturaAutomatica(m.procedencia)
    })
    expect(aConfirmar).toEqual(['SIA'])
    expect(aConfirmar).not.toContain('AL')
  })

  it('un caso con datos de OCR sin comprobar no se puede confirmar', () => {
    let ojo = odCompleto()
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.81, DE_OCR))
    // Todo lo demás sí está confirmado; solo queda el de OCR.
    for (const campo of Object.keys(ojo.medidas) as Parameters<typeof crearMedida>[0][]) {
      const m = ojo.medidas[campo]
      if (m && !esLecturaAutomatica(m.procedencia)) ojo = confirmarTodas(ojo)
    }
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.81, DE_OCR)) // vuelve a entrar sin confirmar
    const caso = casoCon([ojo])
    expect(sePuedeConfirmar(caso)).toBe(false)
    expect(() => confirmar(caso, CUANDO)).toThrow(/sin ningún conjunto de medidas/)
  })

  it('comprobado uno a uno, sí se puede confirmar', () => {
    let ojo = odCompleto()
    ojo = conMedida(ojo, crearMedida('AL', 'OD', 24.07, DE_OCR))
    ojo = confirmarTodas(ojo) // el equivalente a haber pulsado «Está bien» en cada uno
    const caso = confirmar(casoCon([ojo]), CUANDO)
    expect(prepararEntradas(caso, 'EVO_TORIC', 'OD').ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Invariante 12 — los aparatos del mismo ojo no se mezclan sin que la persona lo pida (D47)', () => {
  it('dos conjuntos de medidas del mismo ojo, aparatos distintos, conviven sin pisarse', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, odCompleto(), CUANDO) // aparato por defecto: APARATO_PRINCIPAL
    const otro = conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.5, EXTRAIDO))
    caso = conOjo(caso, otro, CUANDO)

    expect(aparatosDe(caso, 'OD')).toEqual([APARATO_PRINCIPAL, 'ANTERION'])
    expect(ojoDe(caso, 'OD', APARATO_PRINCIPAL).medidas.AL?.valor).toBe(24.07)
    expect(ojoDe(caso, 'OD', 'ANTERION').medidas.AL?.valor).toBe(24.5)
  })

  it('guardar el mismo aparato dos veces sustituye, no acumula', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.0, EXTRAIDO)), CUANDO)
    caso = conOjo(caso, conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.3, EXTRAIDO)), CUANDO)

    expect(datasetsDe(caso, 'OD')).toHaveLength(1)
    expect(ojoDe(caso, 'OD', 'ANTERION').medidas.AL?.valor).toBe(24.3)
  })

  it('confirmar un aparato NO confirma el otro del mismo ojo', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, confirmarTodas(odCompleto()), CUANDO)
    caso = conOjo(caso, conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.5, EXTRAIDO)), CUANDO)

    expect(sePuedeConfirmarDataset(caso, 'OD', APARATO_PRINCIPAL)).toBe(true)
    expect(sePuedeConfirmarDataset(caso, 'OD', 'ANTERION')).toBe(false)
  })

  it('se puede confirmar el caso con un aparato listo, aunque otro del mismo ojo siga a medias', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, confirmarTodas(odCompleto()), CUANDO)
    caso = conOjo(caso, conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.5, EXTRAIDO)), CUANDO)

    expect(sePuedeConfirmar(caso)).toBe(true)
    expect(() => confirmar(caso, CUANDO)).not.toThrow()
  })

  it('una discrepancia real entre dos aparatos confirmados del mismo ojo se detecta', () => {
    const principal = confirmarTodas(odCompleto())
    const anterion = confirmarTodas(
      conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 25.5, EXTRAIDO)), // 1.43 mm de diferencia con AL=24.07
    )
    const discrepancias = detectarDiscrepancias([principal, anterion])
    expect(discrepancias.length).toBeGreaterThan(0)
    expect(discrepancias.some((d) => d.campo === 'AL')).toBe(true)
  })

  it('sin ninguna discrepancia real, no se inventa ninguna', () => {
    const principal = confirmarTodas(odCompleto())
    const anterion = confirmarTodas(
      conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.09, EXTRAIDO)), // dentro del umbral
    )
    expect(detectarDiscrepancias([principal, anterion])).toHaveLength(0)
  })

  it('renombrar un aparato conserva sus medidas, sin crear uno nuevo', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, odCompleto(), CUANDO) // APARATO_PRINCIPAL
    caso = conAparatoRenombrado(caso, 'OD', APARATO_PRINCIPAL, 'ZEISS IOLMaster 700', CUANDO)

    expect(aparatosDe(caso, 'OD')).toEqual(['ZEISS IOLMaster 700'])
    expect(ojoDe(caso, 'OD', 'ZEISS IOLMaster 700').medidas.AL?.valor).toBe(24.07)
    expect(ojoDe(caso, 'OD', APARATO_PRINCIPAL).medidas.AL).toBeUndefined()
  })

  it('renombrar a un nombre que ya usa OTRO aparato del mismo ojo lanza, no fusiona en silencio', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, odCompleto(), CUANDO) // APARATO_PRINCIPAL
    caso = conOjo(caso, conMedida(ojoVacio('OD', 'ANTERION'), crearMedida('AL', 'OD', 24.5, EXTRAIDO)), CUANDO)

    expect(() => conAparatoRenombrado(caso, 'OD', APARATO_PRINCIPAL, 'ANTERION', CUANDO)).toThrow()
    // Los dos siguen intactos: el intento fallido no ha tocado nada.
    expect(ojoDe(caso, 'OD', APARATO_PRINCIPAL).medidas.AL?.valor).toBe(24.07)
    expect(ojoDe(caso, 'OD', 'ANTERION').medidas.AL?.valor).toBe(24.5)
  })

  it('renombrar un aparato que no existe, o al mismo nombre que ya tiene, no hace nada', () => {
    let caso = casoNuevo('caso-1', 'CV-2026-0001', CUANDO)
    caso = conOjo(caso, odCompleto(), CUANDO)

    expect(conAparatoRenombrado(caso, 'OD', 'ANTERION', 'Otro', CUANDO)).toBe(caso)
    expect(conAparatoRenombrado(caso, 'OD', APARATO_PRINCIPAL, APARATO_PRINCIPAL, CUANDO)).toBe(caso)
  })
})
