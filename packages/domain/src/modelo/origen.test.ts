/**
 * De dónde salió cada dato.
 *
 * La regla que se prueba aquí es una sola, y es de producto:
 *
 *   **El origen pertenece al VALOR concreto, no al tipo de campo.**
 *
 * El mismo campo puede venir del informe en un caso y escribirse a mano en otro.
 * Y un campo que conceptualmente decide el cirujano —la refracción objetivo— es
 * «Del informe» si el informe lo trae impreso.
 *
 * La otra mitad es que **origen y validación son cosas distintas**: de dónde
 * salió un número no dice si es correcto, ni si alguien lo ha revisado.
 */

import { describe, expect, it } from 'vitest'

import { loAportaElCirujano } from './campos.js'
import { conMedida, corregirMedida, crearMedida, obtener, ojoVacio, sinMedida } from './medida.js'
import type { Procedencia } from './procedencia.js'
import {
  origenDe,
  TEXTO_NO_CONSTA,
  TEXTO_ORIGEN,
  TEXTO_PENDIENTE,
  textoDeOrigen,
} from './procedencia.js'

const CUANDO = '2026-08-11T10:00:00.000Z'
const LUEGO = '2026-08-11T10:05:00.000Z'

const DEL_PDF: Procedencia = {
  metodo: 'TEXTO_PDF',
  documentoId: 'doc-1',
  registradoEn: CUANDO,
  evidencia: { texto: 'AL            24.07 mm', pagina: 1 },
}
const DE_OCR: Procedencia = {
  metodo: 'OCR',
  documentoId: 'doc-1',
  confianza: 0.9,
  registradoEn: CUANDO,
  evidencia: { texto: 'AL 24.07 mm', pagina: 1 },
}
const DE_VISION: Procedencia = { ...DE_OCR, metodo: 'VISION' }

// ═══════════════════════════════════════════════════════════════════════════
//  1 · Dato leído del informe
// ═══════════════════════════════════════════════════════════════════════════

describe('un dato leído del informe', () => {
  it('es DEL_INFORME venga del texto del PDF, del OCR o de la visión', () => {
    // Los tres son formas de leer el mismo papel. Para quien revisa, la
    // pregunta «¿lo ponía el informe?» se responde igual en los tres casos; lo
    // fiable que sea cada método es otra columna.
    for (const p of [DEL_PDF, DE_OCR, DE_VISION]) {
      const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, p))
      expect(origenDe(obtener(ojo, 'AL'))).toBe('DEL_INFORME')
    }
  })

  it('se llama «Del informe» en pantalla', () => {
    expect(TEXTO_ORIGEN.DEL_INFORME).toBe('Del informe')
  })

  it('un campo del cirujano que SÍ viene impreso también es DEL_INFORME', () => {
    // Es el caso que más se presta a confusión. La refracción objetivo está
    // catalogada como decisión del cirujano, pero si el ANTERION la imprime, el
    // dato salió del informe. El origen sale del valor, no de la categoría.
    const ojo = conMedida(
      ojoVacio('OD'),
      crearMedida('REFRACCION_OBJETIVO', 'OD', 0, {
        ...DEL_PDF,
        evidencia: { texto: 'Target Refraction  0.00 D', pagina: 1 },
      }),
    )
    expect(loAportaElCirujano('REFRACCION_OBJETIVO')).toBe(true)
    expect(origenDe(obtener(ojo, 'REFRACCION_OBJETIVO'))).toBe('DEL_INFORME')
  })

  it('y un 0.00 leído es un valor, no un hueco', () => {
    // Emetropía es un objetivo legítimo. Si el cero se tratara como ausencia,
    // el programa borraría una decisión clínica real.
    const ojo = conMedida(ojoVacio('OD'), crearMedida('REFRACCION_OBJETIVO', 'OD', 0, DEL_PDF))
    expect(obtener(ojo, 'REFRACCION_OBJETIVO')?.valor).toBe(0)
    expect(origenDe(obtener(ojo, 'REFRACCION_OBJETIVO'))).not.toBe('NO_CONSTA')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  2 · Dato ausente en el informe
// ═══════════════════════════════════════════════════════════════════════════

describe('un dato que no está', () => {
  it('es NO_CONSTA', () => {
    expect(origenDe(obtener(ojoVacio('OD'), 'AL'))).toBe('NO_CONSTA')
    expect(origenDe(undefined)).toBe('NO_CONSTA')
  })

  it('si lo mide el aparato, dice «No consta en el informe»', () => {
    // Es información sobre el documento: ese informe no lo trae. NO es un fallo
    // de lectura, y por eso ya no dice «NO ENCONTRADO».
    expect(loAportaElCirujano('ACD')).toBe(false)
    expect(textoDeOrigen('NO_CONSTA', loAportaElCirujano('ACD'))).toBe(TEXTO_NO_CONSTA)
    expect(textoDeOrigen('NO_CONSTA', false)).not.toMatch(/no encontrado/i)
  })

  it('si lo decide el cirujano, dice «Pendiente de aportar»', () => {
    // El SIA no viene en ninguna biometría: lo pone quien opera. Llamarlo «no
    // encontrado» sugería que algo había fallado.
    expect(loAportaElCirujano('SIA')).toBe(true)
    expect(textoDeOrigen('NO_CONSTA', loAportaElCirujano('SIA'))).toBe(TEXTO_PENDIENTE)
  })

  it('los dos textos son distintos: es justo el problema que se arregla', () => {
    expect(TEXTO_NO_CONSTA).not.toBe(TEXTO_PENDIENTE)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  3 · Dato aportado a mano
// ═══════════════════════════════════════════════════════════════════════════

describe('un dato aportado a mano donde no había nada', () => {
  const ojo = corregirMedida(ojoVacio('OD'), 'SIA', 0.3, CUANDO)

  it('es APORTADO, no CORREGIDO', () => {
    expect(origenDe(obtener(ojo, 'SIA'))).toBe('APORTADO')
  })

  it('NO inventa un valor original: no había nada que conservar', () => {
    expect(obtener(ojo, 'SIA')?.original).toBeUndefined()
  })

  it('queda confirmado, porque lo ha escrito una persona mirando', () => {
    expect(obtener(ojo, 'SIA')?.confirmadoPorUsuario).toBe(true)
  })

  it('se puede aportar cualquier campo, lo mida el aparato o no', () => {
    // Lo que el informe no trae, lo pone el usuario. Vale para un campo del
    // cirujano (SIA) y para uno biométrico que ese informe no publicaba (WTW).
    const conWtw = corregirMedida(ojoVacio('OS'), 'WTW', 11.8, CUANDO)
    expect(origenDe(obtener(conWtw, 'WTW'))).toBe('APORTADO')
    expect(obtener(conWtw, 'WTW')?.valor).toBe(11.8)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  4 y 5 · Dato leído y después corregido, conservando el original
// ═══════════════════════════════════════════════════════════════════════════

describe('un dato del informe que una persona corrige', () => {
  const leido = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, DEL_PDF))
  const corregido = corregirMedida(leido, 'AL', 24.08, LUEGO)

  it('pasa a ser CORREGIDO', () => {
    expect(origenDe(obtener(leido, 'AL'))).toBe('DEL_INFORME')
    expect(origenDe(obtener(corregido, 'AL'))).toBe('CORREGIDO')
  })

  it('el valor que se usa es el nuevo', () => {
    expect(obtener(corregido, 'AL')?.valor).toBe(24.08)
  })

  it('CONSERVA el valor original', () => {
    expect(obtener(corregido, 'AL')?.original?.valor).toBe(24.07)
  })

  it('conserva también la evidencia: la línea literal del informe', () => {
    // Sin esto, el informe final diría «escrito a mano» sin poder explicar
    // frente a qué se corrigió, y nadie podría auditar si fue un arreglo o un
    // desliz.
    expect(obtener(corregido, 'AL')?.original?.procedencia.evidencia?.texto).toBe(
      'AL            24.07 mm',
    )
    expect(obtener(corregido, 'AL')?.original?.procedencia.metodo).toBe('TEXTO_PDF')
  })

  it('corregir dos veces sigue conservando lo que decía el PAPEL', () => {
    // 24.07 → 24.08 → 24.09. El original es el 24.07, no el 24.08. Guardar el
    // intermedio convertiría el rastro en un teléfono escacharrado.
    const otraVez = corregirMedida(corregido, 'AL', 24.09, LUEGO)
    expect(obtener(otraVez, 'AL')?.valor).toBe(24.09)
    expect(obtener(otraVez, 'AL')?.original?.valor).toBe(24.07)
  })

  it('borrar el dato lo devuelve a NO_CONSTA, sin rastro de corrección', () => {
    const borrado = sinMedida(corregido, 'AL')
    expect(origenDe(obtener(borrado, 'AL'))).toBe('NO_CONSTA')
  })

  it('el texto en pantalla es «Corregido»', () => {
    expect(TEXTO_ORIGEN.CORREGIDO).toBe('Corregido')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Origen y validación son cosas distintas
// ═══════════════════════════════════════════════════════════════════════════

describe('el origen no dice nada sobre si el dato es correcto', () => {
  it('un dato del informe puede estar sin confirmar, y uno aportado confirmado', () => {
    const delInforme = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, DE_OCR))
    const aportado = corregirMedida(ojoVacio('OD'), 'SIA', 0.3, CUANDO)

    // Mismo origen ≠ mismo estado de revisión. Son dos ejes independientes.
    expect(origenDe(obtener(delInforme, 'AL'))).toBe('DEL_INFORME')
    expect(obtener(delInforme, 'AL')?.confirmadoPorUsuario).toBe(false)

    expect(origenDe(obtener(aportado, 'SIA'))).toBe('APORTADO')
    expect(obtener(aportado, 'SIA')?.confirmadoPorUsuario).toBe(true)
  })

  it('confirmar un dato NO cambia de dónde salió', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AL', 'OD', 24.07, DE_OCR, true))
    expect(origenDe(obtener(ojo, 'AL'))).toBe('DEL_INFORME')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  8 · AQD no se convierte en ACD
// ═══════════════════════════════════════════════════════════════════════════

describe('AQD y ACD son campos distintos, y nada los mezcla', () => {
  it('tener AQD no rellena ACD', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('AQD', 'OD', 2.65, DEL_PDF))
    expect(obtener(ojo, 'AQD')?.valor).toBe(2.65)
    expect(obtener(ojo, 'ACD')).toBeUndefined()
    // Y el hueco de ACD se declara como tal, no se deduce del otro.
    expect(origenDe(obtener(ojo, 'ACD'))).toBe('NO_CONSTA')
  })

  it('corregir AQD no toca ACD', () => {
    let ojo = conMedida(ojoVacio('OD'), crearMedida('AQD', 'OD', 2.65, DEL_PDF))
    ojo = conMedida(ojo, crearMedida('ACD', 'OD', 3.18, DEL_PDF))
    const tras = corregirMedida(ojo, 'AQD', 2.7, LUEGO)
    expect(obtener(tras, 'AQD')?.valor).toBe(2.7)
    expect(obtener(tras, 'ACD')?.valor).toBe(3.18)
    expect(origenDe(obtener(tras, 'ACD'))).toBe('DEL_INFORME')
  })

  it('aportar ACD a mano no altera el AQD leído', () => {
    const conAqd = conMedida(ojoVacio('OD'), crearMedida('AQD', 'OD', 2.65, DEL_PDF))
    const conAmbos = corregirMedida(conAqd, 'ACD', 3.18, CUANDO)
    expect(origenDe(obtener(conAmbos, 'ACD'))).toBe('APORTADO')
    expect(origenDe(obtener(conAmbos, 'AQD'))).toBe('DEL_INFORME')
    expect(obtener(conAmbos, 'AQD')?.valor).toBe(2.65)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Guarda: «NO ENCONTRADO» no vuelve a la interfaz
// ═══════════════════════════════════════════════════════════════════════════

describe('el texto genérico de hueco no se le enseña al usuario', () => {
  it('ninguno de los textos de origen es «NO ENCONTRADO»', () => {
    // Ese texto mezclaba «el informe no lo trae» con «esto lo pones tú». Existe
    // todavía como marca interna para registros, pero no como algo que se lea en
    // pantalla.
    const todos = [...Object.values(TEXTO_ORIGEN), TEXTO_NO_CONSTA, TEXTO_PENDIENTE]
    for (const t of todos) {
      expect(t).not.toMatch(/no encontrado/i)
    }
  })

  it('cada uno de los cinco estados tiene su texto, y ninguno se repite', () => {
    const textos = [
      textoDeOrigen('DEL_INFORME', false),
      textoDeOrigen('DERIVADO_DEL_INFORME', false),
      textoDeOrigen('APORTADO', false),
      textoDeOrigen('CORREGIDO', false),
      textoDeOrigen('NO_CONSTA', false),
      textoDeOrigen('NO_CONSTA', true),
    ]
    expect(new Set(textos).size).toBe(6)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  9 · Un dato calculado no es ni leído ni aportado
// ═══════════════════════════════════════════════════════════════════════════

describe('un dato que ha calculado el programa', () => {
  const DERIVADO: Procedencia = {
    metodo: 'DERIVADO',
    documentoId: 'doc-1',
    registradoEn: CUANDO,
    derivacion: { deCampos: ['AQD', 'CCT'], explicacion: 'AQD 2.65 mm + CCT 530 µm (0.530 mm)' },
  }

  it('tiene estado propio, distinto de los otros tres', () => {
    // Sin un estado propio habría que elegir entre mentir de dos formas: decir
    // «del informe» de algo que el papel no dice, o decir «aportado» de algo que
    // no ha escrito nadie. Las dos hacen imposible auditar de dónde salió.
    const ojo = conMedida(ojoVacio('OD'), crearMedida('ACD', 'OD', 3.18, DERIVADO))
    const origen = origenDe(obtener(ojo, 'ACD'))

    expect(origen).toBe('DERIVADO_DEL_INFORME')
    expect(origen).not.toBe('DEL_INFORME')
    expect(origen).not.toBe('APORTADO')
    expect(TEXTO_ORIGEN.DERIVADO_DEL_INFORME).toBe('Derivado del informe')
  })

  it('corregido a mano pasa a CORREGIDO y conserva lo que se había calculado', () => {
    const ojo = conMedida(ojoVacio('OD'), crearMedida('ACD', 'OD', 3.18, DERIVADO))
    const tras = corregirMedida(ojo, 'ACD', 3.25, LUEGO)

    expect(origenDe(obtener(tras, 'ACD'))).toBe('CORREGIDO')
    expect(obtener(tras, 'ACD')?.original?.valor).toBe(3.18)
    // Y se conserva también la cuenta con la que se había obtenido.
    expect(obtener(tras, 'ACD')?.original?.procedencia.derivacion?.explicacion).toContain('AQD')
  })
})
