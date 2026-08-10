/**
 * pipeline.test.ts — Que lo leído sea lo que pone, y de qué ojo es.
 *
 * Estos tests usan textos SINTÉTICOS. Comprueban el motor de lectura, no que el
 * programa sepa leer un informe de verdad: para eso hacen falta informes reales
 * y todavía no los hay. La diferencia está escrita en `PROJECT_STATUS.md`.
 */

import { describe, expect, it } from 'vitest'

import { valorDe, validarOjo, tiene } from '@vilamar/domain'

import { detectarEnTexto } from './deteccion/detector.js'
import * as fx from './fixtures/sinteticos.js'
import { interpretarTexto } from './pipeline.js'
import { textoAUnDocumento } from './proveedores/fixture.js'
import { segmentarPorOjo } from './parsers/segmentar.js'
import { leerNumero } from './parsers/nucleo.js'

const OPCIONES = { ahora: () => '2026-08-10T10:00:00.000Z' }

function leer(texto: string) {
  return interpretarTexto('doc-1', textoAUnDocumento(texto), OPCIONES)
}

describe('leer un número como viene en un informe', () => {
  it('acepta punto y coma decimal', () => {
    expect(leerNumero('24.07')).toBe(24.07)
    expect(leerNumero('24,07')).toBe(24.07)
    expect(leerNumero(' 530 ')).toBe(530)
  })

  it('acepta los guiones raros que salen del OCR', () => {
    expect(leerNumero('−6.20')).toBe(-6.2)
    expect(leerNumero('–6.20')).toBe(-6.2)
  })

  it('devuelve null si no es un número, en lugar de inventarse un 0', () => {
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('N/A')).toBeNull()
    expect(leerNumero('--')).toBeNull()
    expect(leerNumero('12.3.4')).toBeNull()
  })
})

describe('reconocer el aparato', () => {
  it('reconoce el ANTERION', () => {
    const d = detectarEnTexto(fx.ANTERION_OD_OS)
    expect(d.dispositivo).toBe('ANTERION')
    expect(d.confianza).toBeGreaterThan(0.4)
  })

  it('reconoce el IOLMaster 700', () => {
    expect(detectarEnTexto(fx.IOLMASTER_DOS_COLUMNAS).dispositivo).toBe('IOLMASTER_700')
  })

  it('reconoce el Pentacam', () => {
    expect(detectarEnTexto(fx.PENTACAM_OD).dispositivo).toBe('PENTACAM')
  })

  it('dice DESCONOCIDO cuando no lo sabe, en vez de elegir uno', () => {
    const d = detectarEnTexto(fx.SIN_DATOS)
    expect(d.dispositivo).toBe('DESCONOCIDO')
    expect(d.confianza).toBe(0)
  })
})

describe('separar los dos ojos', () => {
  it('lee un informe por secciones y no mezcla', () => {
    const r = leer(fx.ANTERION_OD_OS)
    expect(r.disposicion).toBe('SECCIONES')
    const od = r.ojos.OD
    const os = r.ojos.OS
    expect(od).toBeDefined()
    expect(os).toBeDefined()
    if (!od || !os) return

    expect(valorDe(od, 'AL')).toBe(24.07)
    expect(valorDe(os, 'AL')).toBe(24.01)
    expect(valorDe(od, 'K1')).toBe(41.22)
    expect(valorDe(os, 'K1')).toBe(40.27)
    // Cada eje con su K, y los de un ojo no se cuelan en el otro.
    expect(valorDe(od, 'K1_EJE')).toBe(175)
    expect(valorDe(od, 'K2_EJE')).toBe(85)
    expect(valorDe(os, 'K1_EJE')).toBe(8)
    expect(valorDe(os, 'K2_EJE')).toBe(98)
  })

  it('lee un informe a dos columnas y respeta el orden de los rótulos', () => {
    const r = leer(fx.IOLMASTER_DOS_COLUMNAS)
    expect(r.disposicion).toBe('DOS_COLUMNAS')
    const od = r.ojos.OD
    const os = r.ojos.OS
    expect(valorDe(od!, 'AL')).toBe(23.85)
    expect(valorDe(os!, 'AL')).toBe(23.91)
    expect(valorDe(od!, 'ACD')).toBe(3.05)
    expect(valorDe(os!, 'ACD')).toBe(3.11)
    expect(valorDe(od!, 'CCT')).toBe(545)
    expect(valorDe(os!, 'CCT')).toBe(548)
  })

  it('un informe de un solo ojo no inventa el otro', () => {
    const r = leer(fx.ANTERION_SOLO_OD)
    expect(r.ojos.OD).toBeDefined()
    expect(r.ojos.OS).toBeUndefined()
  })

  it('sin marca de ojo no asigna nada y lo dice', () => {
    const r = leer(fx.SIN_MARCA_DE_OJO)
    expect(r.disposicion).toBe('DESCONOCIDA')
    expect(r.ojos.OD).toBeUndefined()
    expect(r.ojos.OS).toBeUndefined()
    expect(r.avisos.join(' ')).toMatch(/no dice claramente qué datos son de cada ojo/i)
  })

  it('segmentar por posición gana cuando hay coordenadas', () => {
    const bloques = [
      { texto: 'OD', x: 0.3, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'OS', x: 0.7, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'AL 24.07 mm', x: 0.25, y: 0.2, ancho: 0.2, alto: 0.02 },
      { texto: 'AL 24.01 mm', x: 0.65, y: 0.2, ancho: 0.2, alto: 0.02 },
    ]
    const s = segmentarPorOjo(bloques.map((b) => b.texto).join('\n'), bloques)
    expect(s.disposicion).toBe('DOS_COLUMNAS')
    expect(s.porOjo.OD).toContain('24.07')
    expect(s.porOjo.OS).toContain('24.01')
  })

  it('si OS está a la izquierda, se respeta y no se asume el orden', () => {
    const bloques = [
      { texto: 'OS', x: 0.3, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'OD', x: 0.7, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'AL 24.01 mm', x: 0.25, y: 0.2, ancho: 0.2, alto: 0.02 },
      { texto: 'AL 24.07 mm', x: 0.65, y: 0.2, ancho: 0.2, alto: 0.02 },
    ]
    const s = segmentarPorOjo(bloques.map((b) => b.texto).join('\n'), bloques)
    expect(s.porOjo.OS).toContain('24.01')
    expect(s.porOjo.OD).toContain('24.07')
  })
})

describe('ANTERION: ACD y AQD son campos distintos', () => {
  it('lee las dos y no las confunde', () => {
    const r = leer(fx.ANTERION_OD_OS)
    const od = r.ojos.OD!
    expect(valorDe(od, 'ACD')).toBe(3.18)
    expect(valorDe(od, 'AQD')).toBe(2.65)
    expect(valorDe(od, 'ACD')).not.toBe(valorDe(od, 'AQD'))
  })
})

describe('IOLMaster: la queratometría total va aparte de la estándar', () => {
  it('guarda K y TK por separado, con sus ejes', () => {
    const r = leer(fx.IOLMASTER_CON_TK)
    const od = r.ojos.OD!
    expect(valorDe(od, 'K1')).toBe(43.15)
    expect(valorDe(od, 'TK1')).toBe(43.02)
    expect(valorDe(od, 'K1_EJE')).toBe(12)
    expect(valorDe(od, 'TK1_EJE')).toBe(14)
  })
})

describe('Pentacam: lo que el aparato no mide, no aparece', () => {
  it('no hay longitud axial y no se inventa', () => {
    const r = leer(fx.PENTACAM_OD)
    const od = r.ojos.OD!
    expect(tiene(od, 'AL')).toBe(false)
    expect(valorDe(od, 'AL')).toBeUndefined()
  })

  it('lee la córnea posterior con su signo negativo', () => {
    const r = leer(fx.PENTACAM_OD)
    const od = r.ojos.OD!
    expect(valorDe(od, 'PK1')).toBe(-6.2)
    expect(valorDe(od, 'PK2')).toBe(-6.55)
  })
})

describe('un error de lectura se enseña, no se arregla', () => {
  it('AL = 240.7 se lee tal cual y la validación lo marca', () => {
    const r = leer(fx.CON_ERROR_DE_COMA)
    const od = r.ojos.OD!
    // Se ha leído lo que ponía, sin corregirlo por el camino.
    expect(valorDe(od, 'AL')).toBe(240.7)
    const aviso = validarOjo(od).find((a) => a.codigo === 'FUERA_DE_LIMITE')
    expect(aviso?.nivel).toBe('INVALID')
    expect(aviso?.sugerencia).toContain('24.07')
  })
})

describe('lo que sale de la extracción no está confirmado', () => {
  it('ninguna medida llega confirmada: eso lo hace una persona', () => {
    const r = leer(fx.ANTERION_OD_OS)
    for (const ojo of Object.values(r.ojos)) {
      for (const medida of Object.values(ojo.medidas)) {
        expect(medida.confirmadoPorUsuario).toBe(false)
      }
    }
  })

  it('cada medida guarda de dónde salió', () => {
    const r = leer(fx.ANTERION_OD_OS)
    const al = r.ojos.OD!.medidas.AL
    expect(al?.procedencia.documentoId).toBe('doc-1')
    expect(al?.procedencia.dispositivoId).toBe('ANTERION')
    expect(al?.procedencia.evidencia?.texto).toContain('24.07')
    expect(al?.procedencia.metodo).toBe('TEXTO_PDF')
  })
})

describe('documentos que no dan nada', () => {
  it('un documento sin datos lo dice y no revienta', () => {
    const r = leer(fx.SIN_DATOS)
    expect(Object.keys(r.ojos)).toHaveLength(0)
    expect(r.avisos.join(' ')).toMatch(/No se ha podido leer ningún dato/i)
  })

  it('un documento vacío no revienta', () => {
    const r = interpretarTexto(
      'vacio',
      { paginas: [], proveedor: 'test', metodo: 'TEXTO_PDF', avisos: [] },
      OPCIONES,
    )
    expect(Object.keys(r.ojos)).toHaveLength(0)
  })
})
