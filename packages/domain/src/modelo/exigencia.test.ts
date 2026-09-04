/**
 * Cuánta falta hace cada campo.
 *
 * La regla que se prueba aquí es que **«obligatorio» no es una propiedad del
 * campo**: depende de qué calculadora quieras usar. Sin SIA, Barrett no calcula y
 * EVO sí. Marcar los dos casos igual haría que alguien rellenara datos que no le
 * hacen falta, o se dejara sin rellenar uno que sí.
 *
 * Todo sale de `FICHAS`, que está comprobada contra los formularios reales. No
 * hay una segunda lista que mantener.
 */

import { describe, expect, it } from 'vitest'

import {
  CALCULADORAS,
  exigenciaDe,
  FICHAS,
  quienNoPuedeCalcular,
  textoDeExigencia,
} from './calculadoras.js'
import { CAMPOS } from './campos.js'

describe('los cuatro niveles', () => {
  it('AL es obligatorio para las tres', () => {
    const e = exigenciaDe('AL')
    expect(e.nivel).toBe('OBLIGATORIO')
    expect(e.requeridoPor).toHaveLength(CALCULADORAS.length)
    expect(textoDeExigencia(e)).toBe('Obligatorio')
  })

  it('el SIA solo es obligatorio para las dos calculadoras de Barrett, y se dice cuáles', () => {
    // Es el caso que hace falsa la etiqueta «obligatorio» a secas.
    // Barrett True-K Toric es la misma familia de fórmula que Barrett Toric
    // y pide lo mismo — comprobado abriendo su formulario real (D53).
    const e = exigenciaDe('SIA')
    expect(e.nivel).toBe('SEGUN_CALCULADORA')
    expect(e.requeridoPor).toEqual(['BARRETT_TORIC', 'BARRETT_TRUE_K_TORIC'])
    expect(e.opcionalPara).toContain('EVO_TORIC')
    // El texto NOMBRA la calculadora: es lo que lo hace accionable.
    expect(textoDeExigencia(e)).toContain('Barrett')
    expect(textoDeExigencia(e)).toMatch(/^Obligatorio para /)
  })

  it('el grosor del cristalino es opcional en todas', () => {
    const e = exigenciaDe('LT')
    expect(e.nivel).toBe('OPCIONAL')
    expect(e.requeridoPor).toHaveLength(0)
    expect(e.opcionalPara.length).toBeGreaterThan(0)
    expect(textoDeExigencia(e)).toBe('Opcional')
  })

  it('AQD no se envía a ninguna calculadora, y se dice', () => {
    // Se leen del informe y quedan en el PDF por trazabilidad, pero no alimentan
    // ningún cálculo. Callarlo haría pensar que hacen falta.
    // El nk ESTABA aquí, y era un error mío: al capturar el formulario real de
    // Kane el 12/08/2026 resultó que su lista «Index» es justo ese dato, y que la
    // marca como obligatoria. Ahora es opcional para nosotros —si el informe no lo
    // trae, Kane usa su 1.3375 por defecto—, pero desde luego se envía.
    for (const campo of ['AQD'] as const) {
      const e = exigenciaDe(campo)
      expect(e.nivel).toBe('INFORMATIVO')
      expect(e.requeridoPor).toHaveLength(0)
      expect(e.opcionalPara).toHaveLength(0)
      expect(textoDeExigencia(e)).toMatch(/no se envía/i)
    }
  })

  it('el nk SÍ se envía: es la lista «Index» de Kane', () => {
    // Este test existe por un error concreto: durante un tiempo el nk estaba
    // clasificado como «no se envía a ninguna calculadora», y se le dijo así al
    // dueño del proyecto. Al capturar el formulario real de Kane resultó que su
    // lista «Index» es exactamente ese dato, con cinco valores y 1.3375 por
    // defecto, y que él la marca obligatoria.
    const e = exigenciaDe('INDICE_QUERATOMETRICO')
    expect(e.nivel).toBe('OPCIONAL')
    expect(e.opcionalPara).toEqual(['KANE'])
    expect(e.requeridoPor).toHaveLength(0)
  })
})

describe('la clasificación cubre todos los campos y no se contradice', () => {
  it('cada campo cae en exactamente un nivel', () => {
    for (const campo of CAMPOS) {
      const e = exigenciaDe(campo)
      expect(['OBLIGATORIO', 'SEGUN_CALCULADORA', 'OPCIONAL', 'INFORMATIVO']).toContain(e.nivel)
      // Un campo no puede ser a la vez requerido y opcional para LA MISMA
      // calculadora: sería una ficha mal escrita.
      for (const c of e.requeridoPor) expect(e.opcionalPara).not.toContain(c)
    }
  })

  it('sale de las fichas, no de una lista escrita a mano', () => {
    // Si mañana Barrett deja de pedir el SIA, se cambia su ficha y esto cambia
    // solo. Esta comprobación es la que garantiza que no hay dos verdades.
    for (const campo of CAMPOS) {
      const e = exigenciaDe(campo)
      for (const c of CALCULADORAS) {
        expect(FICHAS[c].requeridos.includes(campo)).toBe(e.requeridoPor.includes(c))
        expect(FICHAS[c].opcionales.includes(campo)).toBe(e.opcionalPara.includes(c))
      }
    }
  })

  it('hay al menos un campo de cada nivel: la clasificación sirve para algo', () => {
    const niveles = new Set(CAMPOS.map((c) => exigenciaDe(c).nivel))
    expect(niveles.size).toBe(4)
  })
})

describe('avisar ANTES de confirmar de quién no va a poder calcular', () => {
  it('sin nada, ninguna de las tres habituales puede, y se dice qué falta a cada una', () => {
    // Barrett True-K Toric NO sale aquí sin que se aporte cirugía refractiva
    // previa (D53): es opcional, nadie la ha pedido, y avisar de que «no
    // puede calcular» algo que no se va a lanzar sería ruido.
    const r = quienNoPuedeCalcular({})
    expect(r).toHaveLength(CALCULADORAS.length - 1)
    expect(r.map((x) => x.calculadora)).not.toContain('BARRETT_TRUE_K_TORIC')
    for (const x of r) {
      expect(x.faltan).toEqual(FICHAS[x.calculadora].requeridos)
    }
  })

  it('con cirugía refractiva aportada, Barrett True-K Toric SÍ entra en el aviso', () => {
    const r = quienNoPuedeCalcular({}, true, {}, true)
    expect(r.map((x) => x.calculadora)).toContain('BARRETT_TRUE_K_TORIC')
    expect(r).toHaveLength(CALCULADORAS.length)
  })

  it('con todo lo que pide cada una, la lista está vacía', () => {
    const todo: Record<string, number> = {}
    for (const c of CALCULADORAS) for (const campo of FICHAS[c].requeridos) todo[campo] = 1
    expect(quienNoPuedeCalcular(todo)).toHaveLength(0)
  })

  it('falta SOLO el SIA: Barrett no puede, EVO y Kane sí', () => {
    // Es la razón de ser de todo esto. Un fallo de una calculadora no bloquea a
    // las demás, y ahora se sabe antes de esperar 47 segundos.
    const todo: Record<string, number> = {}
    for (const c of CALCULADORAS) for (const campo of FICHAS[c].requeridos) todo[campo] = 1
    delete todo['SIA']

    const r = quienNoPuedeCalcular(todo)
    expect(r).toHaveLength(1)
    expect(r[0]!.calculadora).toBe('BARRETT_TORIC')
    expect(r[0]!.faltan).toEqual(['SIA'])
  })

  it('un valor 0 cuenta como presente, no como hueco', () => {
    // La refracción objetivo 0.00 es emetropía: un dato real. Si el cero se
    // tomara por ausencia, el aviso diría que falta algo que sí está.
    const todo: Record<string, number> = {}
    for (const c of CALCULADORAS) for (const campo of FICHAS[c].requeridos) todo[campo] = 1
    todo['REFRACCION_OBJETIVO'] = 0
    expect(quienNoPuedeCalcular(todo)).toHaveLength(0)
  })
})
