/**
 * Lo que se envió frente a lo que la web dice haber usado.
 *
 * Esto existe por un comportamiento real: **elegir el modelo de lente en el
 * formulario de una calculadora puede cambiar su propia constante A.** EVO lo
 * hace. Si la web calcula con 119.20 y nosotros le mandamos 119.10, el resultado
 * es el de la web, y un informe que no lo dijera estaría mintiendo por omisión.
 *
 * Lo que NO se prueba aquí porque el programa no lo hace: corregir. No se cambia
 * la constante del caso, no se reintenta y no se decide quién tiene razón.
 */

import { describe, expect, it } from 'vitest'

import type { ResultadoCalculadora } from '../modelo/calculadoras.js'
import type { Caso } from '../modelo/caso.js'
import { casoNuevo, confirmar, conOjo, conResultado, ojoDe } from '../modelo/caso.js'
import { conMedida, confirmarTodas, crearMedida, ojoVacio } from '../modelo/medida.js'
import type { Procedencia } from '../modelo/procedencia.js'
import {
  constanteSegunLaWeb,
  describirDiscrepancia,
  discrepanciasDeConstante,
} from './auditoria-constante.js'

const CUANDO = '2026-08-12T10:00:00.000Z'
const DEL_PDF: Procedencia = { metodo: 'TEXTO_PDF', documentoId: 'doc-1', registradoEn: CUANDO }

function casoCon(constante: number, resultado: ResultadoCalculadora, modelo?: string): Caso {
  const ojo = confirmarTodas(
    conMedida(ojoVacio('OD'), crearMedida('CONSTANTE_A', 'OD', constante, DEL_PDF)),
  )
  let caso: Caso = conOjo(casoNuevo('c1', 'CV-2026-0200', CUANDO), ojo, CUANDO)
  if (modelo !== undefined) caso = { ...caso, lente: { modelo } }
  return conResultado(confirmar(caso, CUANDO), resultado, CUANDO)
}

function resultadoEvo(eco?: string): ResultadoCalculadora {
  return {
    calculadora: 'EVO_TORIC',
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    opciones: [],
    ...(eco !== undefined ? { entradasSegunLaWeb: { Parámetros: eco } } : {}),
  }
}

describe('leer la constante del eco de la web', () => {
  it('la encuentra en el texto que EVO enseña de sí misma', () => {
    expect(
      constanteSegunLaWeb(
        resultadoEvo('A Constant: 119.2  Toric Model: Alcon SN6ATx  K Index: 1.3375'),
      ),
    ).toBe(119.2)
  })

  it('admite las formas en que puede venir escrita', () => {
    for (const [texto, esperado] of [
      ['A Constant: 119.20', 119.2],
      ['A-Constant = 118.5', 118.5],
      ['a constant 119', 119],
      ['A Constante: 119,10', 119.1],
    ] as const) {
      expect(constanteSegunLaWeb(resultadoEvo(texto)), texto).toBe(esperado)
    }
  })

  it('devuelve undefined si la web no la publica, y eso NO es un problema', () => {
    // Barrett no enseña su constante. No poder comprobarla es distinto de que no
    // cuadre, y confundir las dos cosas llenaría el informe de avisos falsos.
    expect(constanteSegunLaWeb(resultadoEvo())).toBeUndefined()
    expect(constanteSegunLaWeb(resultadoEvo('Toric Model: Alcon SN6ATx'))).toBeUndefined()
  })
})

describe('la discrepancia queda registrada', () => {
  it('si la web usó otra constante, se dice cuál y cuál se envió', () => {
    const caso = casoCon(119.1, resultadoEvo('A Constant: 119.2'), 'Alcon SN6ATx')
    const d = discrepanciasDeConstante(caso)

    expect(d).toHaveLength(1)
    expect(d[0]!.enviada).toBe(119.1)
    expect(d[0]!.segunLaWeb).toBe(119.2)
    expect(d[0]!.calculadora).toBe('EVO_TORIC')
    expect(d[0]!.modeloLente).toBe('Alcon SN6ATx')
  })

  it('la explicación dice que manda la de la web, no la nuestra', () => {
    const caso = casoCon(119.1, resultadoEvo('A Constant: 119.2'), 'Alcon SN6ATx')
    const texto = describirDiscrepancia(discrepanciasDeConstante(caso)[0]!)
    expect(texto).toContain('119.20')
    expect(texto).toContain('119.10')
    expect(texto).toMatch(/el resultado es el de la constante que usó la web/i)
    expect(texto).toContain('Alcon SN6ATx')
  })

  it('NO se corrige el caso: la constante enviada sigue siendo la que era', () => {
    const caso = casoCon(119.1, resultadoEvo('A Constant: 119.2'))
    discrepanciasDeConstante(caso)
    expect(ojoDe(caso, 'OD').medidas.CONSTANTE_A?.valor).toBe(119.1)
  })

  it('si coinciden, no se dice nada', () => {
    expect(
      discrepanciasDeConstante(casoCon(119.2, resultadoEvo('A Constant: 119.2'))),
    ).toHaveLength(0)
  })

  it('el redondeo de la web no cuenta como discrepancia', () => {
    // 119.20 y 119.2 son el mismo número escrito de dos formas.
    expect(
      discrepanciasDeConstante(casoCon(119.2, resultadoEvo('A Constant: 119.20'))),
    ).toHaveLength(0)
  })

  it('sin eco de la web no hay nada que comparar, y no se inventa un aviso', () => {
    expect(discrepanciasDeConstante(casoCon(119.1, resultadoEvo()))).toHaveLength(0)
  })
})
