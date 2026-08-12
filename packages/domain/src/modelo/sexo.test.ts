/**
 * El sexo del paciente: de dónde sale y qué no puede pasar con él.
 *
 * Lo pide Kane. EVO no —comprobado el 12/08/2026: 36 campos, ninguno— y Barrett
 * tampoco. Se guarda en el CASO y no en el ojo, porque es de la persona.
 *
 * La parte delicada es que **puede deducirse del nombre**, por decisión expresa
 * del dueño del proyecto. Una deducción de ese tipo falla en silencio —«Andrea»
 * puede ser un hombre—, así que lo que se prueba aquí sobre todo es lo que NO
 * puede pasar: que se adivine cuando no está claro, y que algo deducido salga
 * hacia una web sin que una persona lo haya mirado.
 */

import { describe, expect, it } from 'vitest'

import { CALCULADORAS, FICHAS } from './calculadoras.js'
import type { Caso } from './caso.js'
import { casoNuevo, confirmar, conOjo } from './caso.js'
import { confirmarTodas, conMedida, crearMedida, ojoVacio } from './medida.js'
import { prepararEntradas, explicarBloqueo } from './preparar-entradas.js'
import type { Procedencia } from './procedencia.js'
import { necesitaComprobacionHumana, origenDe } from './procedencia.js'
import type { Sexo, SexoDelCaso } from './sexo.js'
import {
  aportarSexo,
  confirmarSexo,
  deducirSexoDelNombre,
  EQUIVALENCIA_KANE_VERIFICADA,
  interpretarSexo,
  SEXO_EN_KANE,
  sexoDeducidoDelNombre,
  sexoDelInforme,
  TEXTO_SEXO,
} from './sexo.js'

const CUANDO = '2026-08-12T10:00:00.000Z'
const LUEGO = '2026-08-12T10:05:00.000Z'

const DEL_PDF: Procedencia = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  registradoEn: CUANDO,
  evidencia: { texto: 'Sex: Female', pagina: 1 },
}

/** Caso con un ojo completo para Kane, y sin sexo. */
function casoSinSexo(): Caso {
  let ojo = ojoVacio('OD')
  const datos: [Parameters<typeof crearMedida>[0], number][] = [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K2', 42.52],
    ['ACD', 3.18],
    ['REFRACCION_OBJETIVO', 0],
    ['CONSTANTE_A', 119],
    ['K1_EJE', 175],
    ['K2_EJE', 85],
    ['SIA', 0.3],
    ['EJE_INCISION', 90],
  ]
  for (const [campo, valor] of datos) {
    ojo = conMedida(
      ojo,
      crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
    )
  }
  return confirmar(
    conOjo(casoNuevo('c1', 'CV-2026-0300', CUANDO), confirmarTodas(ojo), CUANDO),
    CUANDO,
  )
}

function con(caso: Caso, sexo: SexoDelCaso): Caso {
  return { ...caso, sexo }
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · Del informe
// ═══════════════════════════════════════════════════════════════════════════

describe('el sexo que trae el informe', () => {
  it('se lee y sale como dato del informe, con su evidencia', () => {
    const s = sexoDelInforme('MUJER', DEL_PDF)
    expect(s.valor).toBe('MUJER')
    expect(origenDe(s)).toBe('DEL_INFORME')
    expect(s.procedencia.evidencia?.texto).toBe('Sex: Female')
    // Del texto del PDF, así que es exacto y no hace falta comprobarlo a mano.
    expect(necesitaComprobacionHumana(s.procedencia)).toBe(false)
  })

  it('entiende cómo lo escriben los informes', () => {
    for (const [texto, esperado] of [
      ['Female', 'MUJER'],
      ['female', 'MUJER'],
      ['F', 'MUJER'],
      ['Mujer', 'MUJER'],
      ['Male', 'HOMBRE'],
      ['M', 'HOMBRE'],
      ['Varón', 'HOMBRE'],
    ] as const) {
      expect(interpretarSexo(texto), texto).toBe(esperado)
    }
  })

  it('lo que no reconoce NO lo traduce', () => {
    // Traducir mal un dato cerrado es peor que dejarlo vacío: el error no avisa.
    for (const raro of ['Otro', 'X', 'N/A', '', '42', 'Femenina o masculino']) {
      expect(interpretarSexo(raro), raro).toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · Deducido del nombre
// ═══════════════════════════════════════════════════════════════════════════

describe('deducir el sexo del nombre', () => {
  it('reconoce nombres de la lista, y dice que fue por eso', () => {
    for (const [nombre, esperado] of [
      ['María García López', 'MUJER'],
      ['Antonio Pérez', 'HOMBRE'],
      ['CARMEN R.', 'MUJER'],
      ['josé luis martín', 'HOMBRE'],
    ] as const) {
      const d = deducirSexoDelNombre(nombre)
      expect(d?.sexo, nombre).toBe(esperado)
      expect(d?.regla).toBe('nombre conocido')
    }
  })

  it('con un nombre que no conoce usa la terminación, y lo DICE', () => {
    // La regla floja se marca como tal para que quien revise se fíe menos.
    const d = deducirSexoDelNombre('Zoraida Q.')
    expect(d?.sexo).toBe('MUJER')
    expect(d?.regla).toBe('terminación del nombre')
  })

  it('NO adivina un nombre unisex', () => {
    // Es el caso que más caro sale, porque parece fácil. Echar a suertes «Alex»
    // sería peor que no responder.
    for (const nombre of ['Alex Smith', 'Andrea Rossi', 'Cruz Delgado', 'Reyes M.', 'Jordan T.']) {
      expect(deducirSexoDelNombre(nombre), nombre).toBeNull()
    }
  })

  it('NO adivina cuando no hay de dónde', () => {
    for (const nada of ['', '   ', 'X', 'A. B.', '12345', '---']) {
      expect(deducirSexoDelNombre(nada), JSON.stringify(nada)).toBeNull()
    }
  })

  it('las tildes no cambian el resultado', () => {
    expect(deducirSexoDelNombre('Encarnación R.')?.sexo).toBe('MUJER')
    expect(deducirSexoDelNombre('Andrés Gómez')?.sexo).toBe('HOMBRE')
  })

  it('lo deducido queda marcado como derivado y NO se autoconfirma', () => {
    // La regla que hace segura la deducción: es un dato derivado, así que la D32
    // le aplica y no sale hacia Kane hasta que una persona lo mira.
    const d = deducirSexoDelNombre('María García')!
    const s = sexoDeducidoDelNombre(d, { documentoId: 'doc-1' }, CUANDO)

    expect(s.valor).toBe('MUJER')
    expect(origenDe(s)).toBe('DERIVADO_DEL_INFORME')
    expect(s.confirmadoPorUsuario).toBe(false)
    expect(necesitaComprobacionHumana(s.procedencia)).toBe(true)
    // Y lleva escrito de dónde salió, para poder juzgarlo.
    expect(s.procedencia.derivacion?.explicacion).toContain('maria')
    expect(s.procedencia.derivacion?.deCampos).toEqual(['NOMBRE_PACIENTE'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · Aportado y corregido
// ═══════════════════════════════════════════════════════════════════════════

describe('el sexo que escribe una persona', () => {
  it('sin nada antes es APORTADO, y queda confirmado', () => {
    const s = aportarSexo(undefined, 'HOMBRE', CUANDO)
    expect(origenDe(s)).toBe('APORTADO')
    expect(s.confirmadoPorUsuario).toBe(true)
    expect(s.original).toBeUndefined()
  })

  it('sobre algo leído es CORREGIDO, y conserva el original', () => {
    const leido = sexoDelInforme('MUJER', DEL_PDF)
    const s = aportarSexo(leido, 'HOMBRE', LUEGO)

    expect(s.valor).toBe('HOMBRE')
    expect(origenDe(s)).toBe('CORREGIDO')
    expect(s.original?.valor).toBe('MUJER')
    // Con su evidencia: se puede auditar frente a qué se corrigió.
    expect(s.original?.procedencia.evidencia?.texto).toBe('Sex: Female')
  })

  it('corregir dos veces conserva lo PRIMERO, no el paso intermedio', () => {
    const leido = sexoDelInforme('MUJER', DEL_PDF)
    const una = aportarSexo(leido, 'HOMBRE', LUEGO)
    const dos = aportarSexo(una, 'MUJER', LUEGO)
    expect(dos.original?.valor).toBe('MUJER')
    expect(dos.original?.procedencia.metodo).toBe('TEXTO_PDF')
  })

  it('corregir una deducción conserva la deducción', () => {
    const d = deducirSexoDelNombre('Zoraida Q.')!
    const deducido = sexoDeducidoDelNombre(d, {}, CUANDO)
    const corregido = aportarSexo(deducido, 'HOMBRE', LUEGO)

    expect(corregido.valor).toBe('HOMBRE')
    expect(origenDe(corregido)).toBe('CORREGIDO')
    expect(corregido.original?.valor).toBe('MUJER')
    expect(corregido.original?.procedencia.metodo).toBe('DERIVADO')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4 · Bloquea a Kane, y solo a Kane
// ═══════════════════════════════════════════════════════════════════════════

describe('qué calculadoras piden el sexo', () => {
  it('Kane sí; EVO y Barrett no', () => {
    expect(FICHAS.KANE.exigeSexo).toBe(true)
    expect(FICHAS.EVO_TORIC.exigeSexo).toBe(false)
    expect(FICHAS.BARRETT_TORIC.exigeSexo).toBe(false)
  })

  it('sin sexo, Kane no calcula y las otras dos sí', () => {
    const caso = casoSinSexo()
    for (const c of CALCULADORAS) {
      const r = prepararEntradas(caso, c, 'OD')
      if (c === 'KANE') {
        expect(r.ok, 'Kane no debería poder sin sexo').toBe(false)
        if (!r.ok) expect(r.motivo).toBe('FALTA_EL_SEXO')
      } else {
        expect(r.ok, `${c} no debería bloquearse por el sexo`).toBe(true)
      }
    }
  })

  it('el motivo se explica en lenguaje normal, sin jerga', () => {
    const r = prepararEntradas(casoSinSexo(), 'KANE', 'OD')
    const texto = explicarBloqueo(r) ?? ''
    expect(texto).toMatch(/sexo/i)
    expect(texto).not.toMatch(/FALTA_EL_SEXO|undefined|null/)
  })

  it('con el sexo confirmado, Kane ya puede', () => {
    const caso = con(casoSinSexo(), aportarSexo(undefined, 'MUJER', CUANDO))
    const r = prepararEntradas(caso, 'KANE', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.sexo).toBe('MUJER')
  })

  it('un sexo DEDUCIDO y sin comprobar NO sale hacia Kane', () => {
    // Es la garantía que hace segura la deducción del nombre. La cuenta puede
    // estar mal —«Andrea» puede ser un hombre— y el error no avisaría.
    const d = deducirSexoDelNombre('María García')!
    const caso = con(casoSinSexo(), sexoDeducidoDelNombre(d, {}, CUANDO))

    const r = prepararEntradas(caso, 'KANE', 'OD')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('FALTA_EL_SEXO')
  })

  it('el mismo sexo deducido, ya comprobado, sí sale', () => {
    const d = deducirSexoDelNombre('María García')!
    const caso = con(casoSinSexo(), confirmarSexo(sexoDeducidoDelNombre(d, {}, CUANDO)))
    const r = prepararEntradas(caso, 'KANE', 'OD')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entradas.sexo).toBe('MUJER')
  })

  it('a EVO y a Barrett NO se les manda el sexo, aunque el caso lo tenga', () => {
    // Un dato de la persona no viaja a una web que no lo necesita.
    const caso = con(casoSinSexo(), aportarSexo(undefined, 'MUJER', CUANDO))
    for (const c of ['EVO_TORIC', 'BARRETT_TORIC'] as const) {
      const r = prepararEntradas(caso, c, 'OD')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.entradas.sexo, c).toBeUndefined()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  5 · La traducción a lo que espera Kane
// ═══════════════════════════════════════════════════════════════════════════

describe('cómo se le dice el sexo a Kane', () => {
  it('hay una traducción explícita para cada valor', () => {
    // El valor canónico del programa y el que espera la web son cosas distintas,
    // y la equivalencia está escrita en un solo sitio.
    expect(SEXO_EN_KANE.MUJER).toBe('Female')
    expect(SEXO_EN_KANE.HOMBRE).toBe('Male')
    for (const s of ['MUJER', 'HOMBRE'] as Sexo[]) {
      expect(SEXO_EN_KANE[s], s).toBeTruthy()
    }
  })

  it('está declarada como NO verificada, y eso importa', () => {
    // El formulario de Kane vive detrás de un acuerdo de licencia que solo puede
    // aceptar una persona, así que estos textos son una suposición razonable y no
    // un dato. Cuando alguien ejecute `pnpm reconocer:kane` y ponga los valores
    // reales, este test le recuerda que hay que cambiar también la bandera.
    expect(EQUIVALENCIA_KANE_VERIFICADA).toBe(false)
  })

  it('los textos de pantalla están en español y son los dos', () => {
    expect(TEXTO_SEXO.MUJER).toBe('Mujer')
    expect(TEXTO_SEXO.HOMBRE).toBe('Hombre')
  })
})
