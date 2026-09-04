/**
 * cirugia-refractiva.test.ts — Si un ojo ha tenido cirugía refractiva antes.
 */

import { describe, expect, it } from 'vitest'

import { conCirugiaRefractiva, ojoVacio } from './medida.js'
import { origenDe } from './procedencia.js'

const CUANDO = '2026-09-04T10:00:00.000Z'
const LUEGO = '2026-09-04T10:05:00.000Z'

describe('aportar la cirugía refractiva previa de un ojo', () => {
  it('un ojo recién creado no tiene ninguna aportada', () => {
    expect(ojoVacio('OD').cirugiaRefractivaPrevia).toBeUndefined()
  })

  it('se aporta a mano y queda como APORTADO, no como corregido', () => {
    const ojo = conCirugiaRefractiva(ojoVacio('OD'), 'MIOPICA', CUANDO)
    expect(ojo.cirugiaRefractivaPrevia?.valor).toBe('MIOPICA')
    expect(origenDe(ojo.cirugiaRefractivaPrevia)).toBe('APORTADO')
  })

  it('queda confirmada de inmediato: lo ha escrito una persona mirándolo', () => {
    const ojo = conCirugiaRefractiva(ojoVacio('OD'), 'HIPERMETROPICA', CUANDO)
    expect(ojo.cirugiaRefractivaPrevia?.confirmadoPorUsuario).toBe(true)
  })

  it('cambiar el valor lo deja como CORREGIDO, conservando el original', () => {
    const conMiopica = conCirugiaRefractiva(ojoVacio('OD'), 'MIOPICA', CUANDO)
    const corregido = conCirugiaRefractiva(conMiopica, 'RK', LUEGO)
    expect(corregido.cirugiaRefractivaPrevia?.valor).toBe('RK')
    expect(origenDe(corregido.cirugiaRefractivaPrevia)).toBe('CORREGIDO')
    expect(corregido.cirugiaRefractivaPrevia?.original?.valor).toBe('MIOPICA')
  })

  it('corregir dos veces sigue conservando el PRIMER valor, no el intermedio', () => {
    let ojo = conCirugiaRefractiva(ojoVacio('OD'), 'MIOPICA', CUANDO)
    ojo = conCirugiaRefractiva(ojo, 'HIPERMETROPICA', LUEGO)
    ojo = conCirugiaRefractiva(ojo, 'NINGUNA', LUEGO)
    expect(ojo.cirugiaRefractivaPrevia?.valor).toBe('NINGUNA')
    expect(ojo.cirugiaRefractivaPrevia?.original?.valor).toBe('MIOPICA')
  })

  it('los dos ojos son independientes: uno operado no afecta al otro', () => {
    const od = conCirugiaRefractiva(ojoVacio('OD'), 'MIOPICA', CUANDO)
    const os = ojoVacio('OS')
    expect(od.cirugiaRefractivaPrevia?.valor).toBe('MIOPICA')
    expect(os.cirugiaRefractivaPrevia).toBeUndefined()
  })
})
