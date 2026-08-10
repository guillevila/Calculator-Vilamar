/**
 * arquitectura.test.ts — Que la frontera siga donde se puso.
 *
 * Hay una regla estructural en este proyecto que es fácil de romper sin darse
 * cuenta, porque romperla no da ningún error: **ningún selector HTML de una web
 * ajena sale de `src/adapters/`**.
 *
 * Si el dominio, la interfaz o el informe empiezan a saber que en EVO el botón
 * de calcular se llama `#btnCalculate`, el día que EVO lo cambie habrá que
 * tocar cinco sitios en lugar de uno. Este test lo impide, y también comprueba
 * lo de siempre: que la normalización no invente datos.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { leerCilindroConEje, leerNumeroDeTexto, leerNumerosDeTexto } from './normalizar.js'

// ═══════════════════════════════════════════════════════════════════════════
describe('normalizar lo que dicen las webs', () => {
  it('lee números con símbolos alrededor', () => {
    expect(leerNumeroDeTexto('21.5')).toBe(21.5)
    expect(leerNumeroDeTexto('81°')).toBe(81)
    expect(leerNumeroDeTexto('-0.06')).toBe(-0.06)
    expect(leerNumeroDeTexto('22.0 S.E (Biconvex)')).toBe(22)
    expect(leerNumeroDeTexto('(T2)')).toBe(2)
  })

  it('lee el menos unicode que usan algunas webs', () => {
    expect(leerNumeroDeTexto('−6.20')).toBe(-6.2)
  })

  it('un campo que la web no da queda sin poner, no a cero', () => {
    expect(leerNumeroDeTexto(undefined)).toBeUndefined()
    expect(leerNumeroDeTexto(null)).toBeUndefined()
    expect(leerNumeroDeTexto('')).toBeUndefined()
    expect(leerNumeroDeTexto('N/A')).toBeUndefined()
    expect(leerNumeroDeTexto('Non Toric')).toBeUndefined()
  })

  it('lee varios números en orden', () => {
    expect(leerNumerosDeTexto('0.72 D @ 81 Degrees')).toEqual([0.72, 81])
    expect(leerNumerosDeTexto('sin números')).toEqual([])
  })

  it('lee el astigmatismo residual tal y como lo escribe Barrett', () => {
    expect(leerCilindroConEje('0.03 Cyl Axis 81')).toEqual({ magnitud: 0.03, eje: 81 })
    expect(leerCilindroConEje('0.72 Cyl Axis 171')).toEqual({ magnitud: 0.72, eje: 171 })
  })

  it('si solo hay un número, no se inventa el eje', () => {
    expect(leerCilindroConEje('0.50')).toEqual({ magnitud: 0.5 })
    expect(leerCilindroConEje('')).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('los selectores no salen de los adaptadores', () => {
  const raiz = join(import.meta.dirname, '..', '..', '..')

  function ficherosTs(directorio: string): string[] {
    const salida: string[] = []
    let entradas: string[]
    try {
      entradas = readdirSync(directorio)
    } catch {
      return salida
    }
    for (const entrada of entradas) {
      if (entrada === 'node_modules' || entrada === 'dist' || entrada === 'out') continue
      const ruta = join(directorio, entrada)
      if (statSync(ruta).isDirectory()) salida.push(...ficherosTs(ruta))
      else if (/\.tsx?$/.test(entrada)) salida.push(ruta)
    }
    return salida
  }

  /**
   * Marcas de que un fichero conoce el HTML de una web ajena.
   *
   * Son identificadores REALES de EVO y Barrett, no un patrón genérico de CSS:
   * la interfaz tiene sus propios selectores y sus propias clases, y eso es
   * legítimo. Lo que no es legítimo es que conozca los de otro.
   *
   * Los NOMBRES DE DOMINIO no están en esta lista, y es a propósito. Que el
   * informe diga «los resultados proceden de evoiolcalculator.com» no es
   * conocer su HTML: es atribuir la fuente, que el producto está obligado a
   * hacer. Meterlos aquí convertía este guardián en un estorbo, que es la
   * segunda forma de que una protección acabe desinstalada.
   */
  const HUELLAS_DE_WEB_AJENA = [
    'txtAL',
    'btnCalculate',
    'RadioButtonRLEye',
    'DropDownToric',
    'LabelRecIOL',
    'MainContent_',
    'cky-tag',
    'cky-overlay',
  ]

  /** Los sitios donde SÍ puede aparecer el HTML de una web ajena. */
  const PERMITIDO = [
    join('packages', 'integrations', 'src', 'adapters'),
    join('scripts', 'sondas'),
    // Este propio test los nombra para poder buscarlos.
    join('packages', 'integrations', 'src', 'arquitectura.test.ts'),
  ]

  it('ni el dominio, ni la extracción, ni el informe, ni la interfaz saben HTML ajeno', () => {
    const candidatos = [
      ...ficherosTs(join(raiz, 'packages', 'domain', 'src')),
      ...ficherosTs(join(raiz, 'packages', 'extraction', 'src')),
      ...ficherosTs(join(raiz, 'packages', 'report', 'src')),
      ...ficherosTs(join(raiz, 'apps')),
    ]
    // Si esta lista se queda vacía, el test no está comprobando nada.
    expect(candidatos.length).toBeGreaterThan(0)

    const infracciones: string[] = []
    for (const fichero of candidatos) {
      const relativo = fichero.slice(raiz.length + 1)
      if (PERMITIDO.some((p) => relativo.startsWith(p))) continue
      const contenido = readFileSync(fichero, 'utf8')
      for (const huella of HUELLAS_DE_WEB_AJENA) {
        if (contenido.includes(huella)) infracciones.push(`${relativo} menciona «${huella}»`)
      }
    }

    expect(infracciones, infracciones.join('\n')).toEqual([])
  })

  it('la lectura de informes no sabe que existen las calculadoras', () => {
    // `@vilamar/extraction` convierte documentos en datos. Qué se haga después
    // con esos datos no es asunto suyo, y si empieza a nombrar calculadoras es
    // que se le está metiendo lógica que no le toca.
    const ficheros = ficherosTs(join(raiz, 'packages', 'extraction', 'src'))
    expect(ficheros.length).toBeGreaterThan(0)
    for (const fichero of ficheros) {
      const contenido = readFileSync(fichero, 'utf8')
      for (const nombre of ['evoiolcalculator', 'iolformula', 'apacrs', 'Barrett', 'EVO_TORIC']) {
        expect(contenido, `${fichero} menciona «${nombre}»`).not.toContain(nombre)
      }
    }
  })

  it('el dominio no importa Playwright', () => {
    for (const fichero of ficherosTs(join(raiz, 'packages', 'domain', 'src'))) {
      const contenido = readFileSync(fichero, 'utf8')
      expect(contenido, `${fichero} importa Playwright`).not.toMatch(/from\s+['"]playwright/)
      expect(contenido, `${fichero} importa Electron`).not.toMatch(/from\s+['"]electron/)
      expect(contenido, `${fichero} usa el sistema de ficheros`).not.toMatch(/from\s+['"]node:fs/)
    }
  })
})
