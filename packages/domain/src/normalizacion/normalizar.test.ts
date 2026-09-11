/**
 * La ACD, que puede llegar de dos formas.
 *
 * La regla de negocio que se prueba aquí:
 *
 *   La mayoría de informes traen la ACD impresa y se usa esa. Algunos —ANTERION
 *   antiguos— no la traen, pero sí traen AQD y grosor corneal, y en ESE aparato
 *   la ACD es exactamente la suma de las dos. En otros aparatos no tiene por qué
 *   serlo, así que la derivación depende del perfil y no se aplica a ciegas.
 *
 * Y tres cosas que no pueden pasar nunca, cada una con su prueba:
 *
 *  - Que una ACD calculada se confunda con una leída.
 *  - Que derivar borre la AQD o el CCT de los que salió.
 *  - Que, teniendo las dos vías y no coincidiendo, el programa elija una.
 */

import { describe, expect, it } from 'vitest'

import { conMedida, corregirMedida, crearMedida, obtener, ojoVacio } from '../modelo/medida.js'
import type { Procedencia } from '../modelo/procedencia.js'
import { esDerivado, necesitaComprobacionHumana, origenDe } from '../modelo/procedencia.js'
import { casoNuevo, confirmar, conOjo } from '../modelo/caso.js'
import { confirmarTodas } from '../modelo/medida.js'
import { prepararEntradas } from '../modelo/preparar-entradas.js'
import { CALCULADORAS, FICHAS } from '../modelo/calculadoras.js'
import { validarOjo } from '../validacion/validar.js'
import { cctEnMm, comparacionAcd, normalizarOjo, TOLERANCIA_ACD_MM } from './normalizar.js'
import { PERFILES, perfilDe } from './perfiles.js'

const CUANDO = '2026-08-11T10:00:00.000Z'
const LUEGO = '2026-08-11T10:05:00.000Z'

const DEL_PDF: Procedencia = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  dispositivoId: 'ANTERION',
  registradoEn: CUANDO,
}

function conEvidencia(texto: string): Procedencia {
  return { ...DEL_PDF, evidencia: { texto, pagina: 1 } }
}

/** Un ojo de ANTERION antiguo: AQD y grosor corneal, sin ACD. */
function anterionAntiguo() {
  let ojo = ojoVacio('OD')
  ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.65, conEvidencia('AQD (endo)     2.65 mm')))
  ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, conEvidencia('CCT             530 um')))
  return ojo
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · Si el informe trae la ACD, se usa esa
// ═══════════════════════════════════════════════════════════════════════════

describe('ANTERION moderno, con ACD impresa', () => {
  it('se usa la del informe y no se calcula nada', () => {
    let ojo = anterionAntiguo()
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, conEvidencia('ACD (epi)      3.18 mm')))

    const r = normalizarOjo(ojo, 'ANTERION', LUEGO)
    const acd = obtener(r.ojo, 'ACD')

    expect(acd?.valor).toBe(3.18)
    expect(acd?.procedencia.metodo).toBe('TEXTO_PDF')
    expect(origenDe(acd)).toBe('DEL_INFORME')
    // Ni un aviso: tener las tres medidas es lo normal, no una anomalía.
    expect(r.avisos).toHaveLength(0)
  })

  it('la ACD leída NO se pisa aunque la suma diera otro número', () => {
    // Es la regla que impide que la capa «mejore» un dato del informe. Si no
    // cuadran, lo dice la validación; aquí no se toca.
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.1, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, DEL_PDF))

    const r = normalizarOjo(ojo, 'ANTERION', LUEGO)
    expect(obtener(r.ojo, 'ACD')?.valor).toBe(3.18)
    expect(esDerivado(obtener(r.ojo, 'ACD')!.procedencia)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · ANTERION antiguo: AQD + CCT y sin ACD
// ═══════════════════════════════════════════════════════════════════════════

describe('ANTERION antiguo, sin ACD', () => {
  it('la calcula, y la calcula bien', () => {
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    const acd = obtener(r.ojo, 'ACD')

    // 2.65 mm + 530 µm = 2.65 + 0.530 = 3.18 mm
    expect(acd).toBeDefined()
    expect(acd?.valor).toBe(3.18)
    expect(acd?.unidad).toBe('mm')
    expect(acd?.ojo).toBe('OD')
  })

  it('530 µm son 0.530 mm, no 5.3 ni 0.053', () => {
    // El error de mil es el que da un número plausible: 2.65 + 0.053 = 2.703 es
    // una ACD perfectamente creíble y está mal. Por eso se comprueba la
    // conversión sola, además del resultado.
    expect(cctEnMm(530)).toBeCloseTo(0.53, 10)
    expect(cctEnMm(533)).toBeCloseTo(0.533, 10)
    expect(cctEnMm(1000)).toBe(1)
  })

  it('el redondeo no arrastra basura de coma flotante', () => {
    // 2.65 + 0.53 da 3.1799999999999997 en coma flotante. La ACD es un campo de
    // dos decimales y tiene que quedar guardada como tal, igual que una leída.
    const acd = obtener(normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO).ojo, 'ACD')
    expect(acd?.valor).toBe(3.18)
    expect(String(acd?.valor)).toBe('3.18')
  })

  it('avisa de que la ha calculado, diciendo con qué', () => {
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('2.65 mm')
    expect(r.avisos[0]).toContain('530 µm')
    expect(r.avisos[0]).toContain('3.18 mm')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · Una ACD derivada no es una ACD leída
// ═══════════════════════════════════════════════════════════════════════════

describe('la procedencia distingue una ACD calculada de una leída', () => {
  it('su origen es DERIVADO_DEL_INFORME, distinto de DEL_INFORME', () => {
    const derivada = obtener(normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO).ojo, 'ACD')
    const leida = obtener(conMedida(ojoVacio('OD'), crearMedida('ACD', 'OD', 3.18, DEL_PDF)), 'ACD')

    // El mismo número, dos orígenes distintos. Es exactamente lo que tiene que
    // poder distinguir quien audite el informe meses después.
    expect(derivada?.valor).toBe(leida?.valor)
    expect(origenDe(derivada)).toBe('DERIVADO_DEL_INFORME')
    expect(origenDe(leida)).toBe('DEL_INFORME')
    expect(origenDe(derivada)).not.toBe(origenDe(leida))
  })

  it('lleva escrita la cuenta que se hizo, con el CCT en las dos unidades', () => {
    const acd = obtener(normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO).ojo, 'ACD')
    const d = acd?.procedencia.derivacion

    expect(d?.deCampos).toEqual(['AQD', 'CCT'])
    // µm es lo que pone el informe; mm es lo que entra en la suma. Enseñar solo
    // uno de los dos deja sin comprobar justo el paso donde cabe el error.
    expect(d?.explicacion).toBe('AQD 2.65 mm + CCT 530 µm (0.530 mm)')
  })

  it('no finge una fiabilidad ni una evidencia que no tiene', () => {
    // Una cuenta no se ha leído de ninguna línea del documento. Sus evidencias
    // son las de los dos sumandos, y siguen en sus medidas.
    const acd = obtener(normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO).ojo, 'ACD')
    expect(acd?.procedencia.confianza).toBeUndefined()
    expect(acd?.procedencia.evidencia).toBeUndefined()
    // Pero sí hereda de dónde salieron los sumandos, para poder rastrearla.
    expect(acd?.procedencia.documentoId).toBe('doc-1')
    expect(acd?.procedencia.dispositivoId).toBe('ANTERION')
  })

  it('nadie la ha mirado todavía, así que hay que comprobarla', () => {
    // La cuenta es exacta, pero se hizo con dos números que quizá se leyeran
    // mal, y la ACD va a las tres calculadoras. No se autoconfirma.
    const acd = obtener(normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO).ojo, 'ACD')
    expect(acd?.confirmadoPorUsuario).toBe(false)
    expect(necesitaComprobacionHumana(acd!.procedencia)).toBe(true)
  })

  it('si una persona la corrige, pasa a CORREGIDO y conserva la derivada', () => {
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    const corregido = corregirMedida(r.ojo, 'ACD', 3.25, LUEGO)
    const acd = obtener(corregido, 'ACD')

    expect(origenDe(acd)).toBe('CORREGIDO')
    expect(acd?.valor).toBe(3.25)
    expect(acd?.original?.valor).toBe(3.18)
    expect(acd?.original?.procedencia.metodo).toBe('DERIVADO')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4 · Derivar no destruye nada
// ═══════════════════════════════════════════════════════════════════════════

describe('AQD y CCT siguen siendo medidas independientes', () => {
  it('después de derivar están las tres, cada una con lo suyo', () => {
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)

    const aqd = obtener(r.ojo, 'AQD')
    const cct = obtener(r.ojo, 'CCT')

    expect(aqd?.valor).toBe(2.65)
    expect(aqd?.unidad).toBe('mm')
    expect(origenDe(aqd)).toBe('DEL_INFORME')
    // La evidencia original no se pierde: es lo que permite volver al informe.
    expect(aqd?.procedencia.evidencia?.texto).toContain('2.65')

    expect(cct?.valor).toBe(530)
    // El CCT sigue en µm. Convertirlo para la suma NO convierte el dato guardado.
    expect(cct?.unidad).toBe('µm')
    expect(origenDe(cct)).toBe('DEL_INFORME')

    expect(Object.keys(r.ojo.medidas).sort()).toEqual(['ACD', 'AQD', 'CCT'])
  })

  it('la AQD no se convierte en ACD: siguen siendo campos distintos', () => {
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    expect(obtener(r.ojo, 'AQD')?.valor).toBe(2.65)
    expect(obtener(r.ojo, 'ACD')?.valor).toBe(3.18)
    expect(obtener(r.ojo, 'AQD')?.valor).not.toBe(obtener(r.ojo, 'ACD')?.valor)
  })

  it('aplicarla dos veces no cambia nada', () => {
    // Hay dos caminos de lectura y conviene que pasar dos veces por la capa sea
    // inofensivo, en vez de duplicar el aviso o recalcular sobre lo calculado.
    const una = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    const dos = normalizarOjo(una.ojo, 'ANTERION', LUEGO)

    expect(dos.ojo).toEqual(una.ojo)
    expect(dos.avisos).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  5 · Cuando falta un ingrediente, no se inventa
// ═══════════════════════════════════════════════════════════════════════════

describe('AQD sin grosor corneal', () => {
  it('no se calcula ninguna ACD', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AQD', 'OD', 2.65, DEL_PDF))
    const r = normalizarOjo(ojo, 'ANTERION', LUEGO)

    expect(obtener(r.ojo, 'ACD')).toBeUndefined()
    // Y la AQD sigue intacta, sin haberse «ascendido» a ACD.
    expect(obtener(r.ojo, 'AQD')?.valor).toBe(2.65)
  })

  it('se dice qué falta y que hay que escribirla a mano', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AQD', 'OD', 2.65, DEL_PDF))
    const r = normalizarOjo(ojo, 'ANTERION', LUEGO)

    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/CCT|grosor/i)
    expect(r.avisos[0]).toMatch(/a mano/i)
  })

  it('sin AQD no hay nada que decir: el hueco ya lo enseña la pantalla', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('CCT', 'OD', 530, DEL_PDF))
    const r = normalizarOjo(ojo, 'ANTERION', LUEGO)
    expect(obtener(r.ojo, 'ACD')).toBeUndefined()
    expect(r.avisos).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  6 · La derivación depende del aparato
// ═══════════════════════════════════════════════════════════════════════════

describe('un aparato desconocido no deriva nada', () => {
  it('con AQD y CCT y sin ACD, NO calcula la ACD', () => {
    const r = normalizarOjo(anterionAntiguo(), 'DESCONOCIDO', LUEGO)

    // Es la prueba que impide que la regla se vuelva genérica sin que nadie se
    // dé cuenta. La suma daría 3.18 y sería plausible; da igual.
    expect(obtener(r.ojo, 'ACD')).toBeUndefined()
  })

  it('lo dice, y dice por qué, para que no parezca un fallo del programa', () => {
    const r = normalizarOjo(anterionAntiguo(), 'DESCONOCIDO', LUEGO)
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain(perfilDe('DESCONOCIDO').razonAcd)
    expect(r.avisos[0]).toMatch(/a mano/i)
  })

  it('ni el IOLMaster ni el Pentacam derivan', () => {
    for (const dispositivo of ['IOLMASTER_700', 'PENTACAM'] as const) {
      const r = normalizarOjo(anterionAntiguo(), dispositivo, LUEGO)
      expect(obtener(r.ojo, 'ACD')).toBeUndefined()
    }
  })

  it('la tabla de perfiles es restrictiva por defecto: solo ANTERION deriva', () => {
    // Si alguien añade un aparato y se olvida de pensar esto, el test lo dice.
    const derivan = Object.values(PERFILES)
      .filter((p) => p.acdDesdeAqdMasCct)
      .map((p) => p.dispositivo)
    expect(derivan).toEqual(['ANTERION'])
  })

  it('todos los perfiles explican sus dos decisiones', () => {
    for (const p of Object.values(PERFILES)) {
      expect(p.razonAcd.length).toBeGreaterThan(20)
      expect(p.razonTablaDeLentes.length).toBeGreaterThan(20)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  7 · Las dos vías presentes: coincidir o no coincidir
// ═══════════════════════════════════════════════════════════════════════════

describe('ACD del informe y AQD + CCT a la vez', () => {
  it('si coinciden, no se dice nada', () => {
    let ojo = anterionAntiguo()
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, DEL_PDF))

    const c = comparacionAcd(ojo)
    expect(c?.diferencia).toBeLessThanOrEqual(TOLERANCIA_ACD_MM)
    expect(
      validarOjo(ojo).filter((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT'),
    ).toHaveLength(0)
  })

  it('un desajuste de redondeo no genera ruido', () => {
    // AQD 2.70 + CCT 533 µm = 3.233, y el informe imprime 3.23. Es redondeo, no
    // un problema, y avisar de esto haría que el aviso dejara de leerse.
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.23, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.7, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('CCT', 'OD', 533, DEL_PDF))

    expect(comparacionAcd(ojo)?.diferencia).toBeLessThan(0.01)
    expect(validarOjo(ojo).filter((a) => a.nivel !== 'VALID')).toHaveLength(0)
  })

  it('si NO coinciden, avisa y no elige ninguna', () => {
    // Los tres valores son creíbles por separado y la AQD es menor que la ACD,
    // así que la comprobación de intercambio no los caza. 2.10 + 0.530 = 2.63.
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.1, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, DEL_PDF))

    const aviso = validarOjo(ojo).find((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT')
    expect(aviso).toBeDefined()
    // Avisa, no bloquea: el programa no sabe cuál de los tres está mal.
    expect(aviso?.nivel).toBe('WARNING')
    expect(aviso?.campo).toBe('ACD')
    expect(aviso?.sugerencia).toMatch(/no elige/i)

    // Y lo más importante: los tres datos siguen como estaban.
    expect(obtener(ojo, 'ACD')?.valor).toBe(3.18)
    expect(obtener(ojo, 'AQD')?.valor).toBe(2.1)
    expect(obtener(ojo, 'CCT')?.valor).toBe(530)
  })

  it('el aviso dice los dos números y en cuánto se diferencian', () => {
    let ojo = ojoVacio('OD')
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('AQD', 'OD', 2.1, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('CCT', 'OD', 530, DEL_PDF))

    const aviso = validarOjo(ojo).find((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT')
    expect(aviso?.mensaje).toContain('3.18')
    expect(aviso?.mensaje).toContain('2.630')
    expect(aviso?.mensaje).toContain('0.550')
  })

  it('corregir la AQD deja al descubierto una ACD derivada que ya no cuadra', () => {
    // El caso silencioso: se derivó la ACD con una AQD que luego resultó estar
    // mal leída. Sin esta comprobación, la ACD calculada con el valor viejo
    // seguiría viajando a las tres calculadoras sin que nadie lo notara.
    const r = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    expect(validarOjo(r.ojo).filter((a) => a.nivel === 'WARNING')).toHaveLength(0)

    const tras = corregirMedida(r.ojo, 'AQD', 2.1, LUEGO)
    const aviso = validarOjo(tras).find((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT')
    expect(aviso).toBeDefined()
  })

  it('la tolerancia es lo bastante estrecha para cazar un intercambio', () => {
    // Confundir ACD con AQD desplaza el valor el grosor entero de una córnea:
    // medio milímetro, diez veces la tolerancia. Si alguien la subiera a 0.6, la
    // comprobación dejaría de servir para nada y este test lo diría.
    expect(TOLERANCIA_ACD_MM).toBeLessThan(0.53 / 2)
    // Y lo bastante ancha para no protestar por redondeo (≈0.011 mm).
    expect(TOLERANCIA_ACD_MM).toBeGreaterThan(0.02)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  8 · La ACD derivada llega a las calculadoras
// ═══════════════════════════════════════════════════════════════════════════

describe('una ACD derivada sirve para calcular', () => {
  it('las tres calculadoras la reciben como cualquier otra ACD', () => {
    // Derivarla no serviría de nada si luego no llegara. Se monta un caso
    // completo y se comprueba en las tres, que es donde importa.
    let ojo = anterionAntiguo()
    for (const c of CALCULADORAS) {
      for (const campo of FICHAS[c].requeridos) {
        if (campo === 'ACD') continue
        if (obtener(ojo, campo)) continue
        ojo = conMedida(ojo, crearMedida(campo, 'OD', valorCreible(campo), DEL_PDF))
      }
    }

    const normalizado = normalizarOjo(ojo, 'ANTERION', LUEGO)
    expect(origenDe(obtener(normalizado.ojo, 'ACD'))).toBe('DERIVADO_DEL_INFORME')

    // La persona revisa y confirma. Sin eso no sale nada, derivado o no.
    const base = conOjo(
      casoNuevo('id', 'CV-2026-0001', CUANDO),
      confirmarTodas(normalizado.ojo),
      CUANDO,
    )
    const caso = confirmar(
      {
        ...base,
        // Kane pide el sexo, así que sin él no calcularía y este test no
        // estaría comprobando lo que dice comprobar.
        sexo: {
          valor: 'MUJER' as const,
          procedencia: { metodo: 'MANUAL' as const, registradoEn: CUANDO },
          confirmadoPorUsuario: true,
        },
      },
      CUANDO,
    )

    // Barrett True-K Toric queda fuera de este bucle a propósito: bloquea
    // por su propio motivo —falta la cirugía refractiva previa, D53—, que no
    // tiene nada que ver con la ACD derivada, que es justo lo que prueba
    // este test.
    for (const c of CALCULADORAS.filter((c) => c !== 'BARRETT_TRUE_K_TORIC')) {
      const r = prepararEntradas(caso, c, 'OD')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.entradas.valores.ACD).toBe(3.18)
    }
  })

  it('sin confirmarla, no sale: derivar no salta la revisión', () => {
    const normalizado = normalizarOjo(anterionAntiguo(), 'ANTERION', LUEGO)
    const caso = conOjo(casoNuevo('id', 'CV-2026-0002', CUANDO), normalizado.ojo, CUANDO)
    // Ni siquiera se puede confirmar el caso: hay datos sin revisar.
    const r = prepararEntradas(caso, 'KANE', 'OD')
    expect(r.ok).toBe(false)
  })
})

/** Un valor plausible para rellenar los requeridos que no son el asunto del test. */
function valorCreible(campo: string): number {
  const tabla: Record<string, number> = {
    AL: 24.07,
    K1: 41.22,
    K1_EJE: 175,
    K2: 42.52,
    K2_EJE: 85,
    REFRACCION_OBJETIVO: 0,
    SIA: 0.3,
    EJE_INCISION: 90,
    CONSTANTE_A: 119,
  }
  const v = tabla[campo]
  if (v === undefined) throw new Error(`El test no sabe qué valor creíble poner en ${campo}`)
  return v
}
