import { describe, expect, it } from 'vitest'

import {
  doctorComoYaExiste,
  leerResumenCalculadores,
  lenteDelCatalogo,
  normalizarNombre,
} from './resumen-calculadores.js'

// Texto tal como lo da el PDF de ejemplo (caso inventado de prueba), página a página.
const PAGINA_1 = `2026-10-22 · hospital perpetuo socorro · maria pilar · EnVista · OD · Tórica
IOLMaster Advanced Technology · SimK · Tórica · EnVista · EVO estimado
OD · EVO estimado
IOLMaster Advanced Technology · SimK · Tórica · EnVista · Barrett estimado
OD · Barrett estimado · A 119.150 · pasos de cilindro genéricos`
const PAGINA_2 = `2026-10-22 · hospital perpetuo socorro · maria pilar · EnVista · OD · Tórica
IOLMaster Advanced Technology · SimK · Tórica · EnVista · KANE estimado
OD · KANE estimado
Pentacam · SimK · Tórica · EnVista · EVO estimado
OD · EVO estimado`
const PAGINA_3 = `2026-10-22 · hospital perpetuo socorro · maria pilar · EnVista · OD · Tórica
Pentacam · SimK · Tórica · EnVista · Barrett estimado
Pentacam · SimK · Tórica · EnVista · KANE estimado`
const FICHERO =
  '2026-10-22_hospital-perpetuo-socorro_maria-pilar_EnVista_OD_162128960-b05857_Torica.pdf'

describe('leerResumenCalculadores', () => {
  it('lee la cabecera, los aparatos y las calculadoras del PDF de ejemplo', () => {
    const r = leerResumenCalculadores([PAGINA_1, PAGINA_2, PAGINA_3], FICHERO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos).toEqual({
      fecha: '2026-10-22',
      doctor: 'hospital perpetuo socorro',
      paciente: 'maria pilar',
      lente: 'EnVista',
      ojos: ['OD'],
      tipoDeLente: 'Tórica',
      aparatos: ['IOLMaster Advanced Technology', 'Pentacam'],
      calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR', 'BARRETT_TORIC', 'KANE'],
      idExterno: '162128960-b05857',
    })
  })

  it('«OI» (ojo izquierdo) es OS, y «medido» es la variante con córnea posterior', () => {
    const r = leerResumenCalculadores(
      [
        '2026-10-01 · Dr Prueba · paciente x · LuxLife · OI · Esférica\nPentacam · SimK · Esférica · LuxLife · EVO medido\nPentacam · SimK · Esférica · LuxLife · Barrett medido',
      ],
      'otro.pdf',
    )
    expect(r.ok && r.datos.ojos).toEqual(['OS'])
    expect(r.ok && r.datos.calculadoras).toEqual(['EVO_TORIC', 'BARRETT_TORIC_CON_CARA_POSTERIOR'])
    expect(r.ok && r.datos.idExterno).toBeUndefined()
  })

  it('una franja partida en dos líneas («… · EVO» / «medido») se lee entera', () => {
    const r = leerResumenCalculadores(
      [
        '2026-10-01 · Dr X · pac · EnVista · OD · Tórica\nIOLMaster Advanced Technology · SimK · Tórica · EnVista · EVO\nmedido\nPentacam · SimK · Tórica · EnVista · Barrett\nestimado',
      ],
      'a.pdf',
    )
    expect(r.ok && r.datos.calculadoras).toEqual(['EVO_TORIC', 'BARRETT_TORIC'])
  })

  it('una lente con « · » dentro se conserva entera', () => {
    const r = leerResumenCalculadores(
      ['2026-10-01 · Dr X · pac · Aspire · Plus · OD · Tórica'],
      'a.pdf',
    )
    expect(r.ok && r.datos.lente).toBe('Aspire · Plus')
  })

  it('un PDF que no es de esa app no se reconoce, y dice por qué', () => {
    const r = leerResumenCalculadores(['Informe de biometría\nAL 24.07 mm'], 'x.pdf')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).toContain('cabecera')
  })

  it('lo que el PDF no dice queda ausente, no inventado', () => {
    const r = leerResumenCalculadores(['2026-10-01 · OD · Tórica'], 'x.pdf')
    expect(r.ok).toBe(false)
  })
})

describe('doctorComoYaExiste', () => {
  it('usa la forma que ya existe, sin mirar mayúsculas ni tildes', () => {
    expect(
      doctorComoYaExiste('hospital perpetuo socorro', ['Dr Rocha', 'Hospital Perpetuo Socorro']),
    ).toBe('Hospital Perpetuo Socorro')
  })
  it('no cuenta el tratamiento: «Aurelio rocha» es «Dr aurelio Rocha»', () => {
    expect(doctorComoYaExiste('Aurelio rocha', ['Dr Hamdy', 'Dr aurelio Rocha'])).toBe(
      'Dr aurelio Rocha',
    )
  })
  it('si no existe, lo deja como viene', () => {
    expect(doctorComoYaExiste('  Dra. Nueva ', ['Dr Rocha'])).toBe('Dra. Nueva')
  })
  it('normalizarNombre', () => {
    expect(normalizarNombre('  Dra.  MÁRQUEZ ')).toBe('dra. marquez')
  })
})

describe('lenteDelCatalogo', () => {
  it('traduce los nombres claros a la lente del catálogo', () => {
    const modelo = (n: string) => lenteDelCatalogo(n)?.modelo
    expect(modelo('EnVista')).toBe('B&L MX60ET/PT')
    expect(modelo('enVista Envy')).toBe('B&L Envy')
    expect(modelo('Aspire')).toBe('B&L Aspire')
    expect(modelo('LuxSmart')).toBe('B&L LuxSmart')
    expect(modelo('B+L LuxLife Toric')).toBe('B&L LuxLife')
    expect(modelo('lux good')).toBe('B&L LuxGood')
    expect(lenteDelCatalogo('EnVista')?.fabricante).toBe('Bausch & Lomb')
  })

  it('lo que no se reconoce, no se adivina', () => {
    expect(lenteDelCatalogo('Vivity')).toBeUndefined()
    expect(lenteDelCatalogo('Tecnis Eyhance')).toBeUndefined()
  })
})

// Un PDF con los dos ojos en el mismo fichero (caso inventado de prueba).
const DOS_OJOS = `2026-10-22 · Aurelio rocha · 007-009 Ángeles · EnVista Envy · OD-OI · Tórica
IOLMaster · SimK · Tórica · EnVista Envy · EVO estimado
OD · EVO estimado OI · EVO estimado
IOLMaster · SimK · Tórica · EnVista Envy · KANE · OD / OI
OD / OI · KANE estimado`
const FICHERO_DOS_OJOS =
  '2026-10-22_Aurelio-rocha_007-009-Angeles_EnVista-Envy_OD-OI_personalizado_085542495-902041_Torica.pdf'

describe('un PDF con los dos ojos', () => {
  it('lee «OD-OI» como los dos ojos, la franja de Kane que no acaba en «KANE» y el identificador', () => {
    const r = leerResumenCalculadores([DOS_OJOS], FICHERO_DOS_OJOS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos).toMatchObject({
      fecha: '2026-10-22',
      doctor: 'Aurelio rocha',
      paciente: '007-009 Ángeles',
      lente: 'EnVista Envy',
      ojos: ['OD', 'OS'],
      aparatos: ['IOLMaster'],
      calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR', 'KANE'],
      idExterno: '085542495-902041',
    })
    // «EnVista Envy» es la lente Envy del catálogo.
    expect(lenteDelCatalogo(r.datos.lente ?? '')?.modelo).toBe('B&L Envy')
  })

  it('el identificador se saca también con un trozo extra («personalizado») en el nombre', () => {
    const r = leerResumenCalculadores([DOS_OJOS], FICHERO_DOS_OJOS)
    expect(r.ok && r.datos.idExterno).toBe('085542495-902041')
  })

  it('un «ojo» que no es ojo no se acepta', () => {
    const r = leerResumenCalculadores(['2026-10-22 · Dr · pac · Envy · OD-XX · Tórica'], 'a.pdf')
    expect(r.ok).toBe(false)
  })
})
