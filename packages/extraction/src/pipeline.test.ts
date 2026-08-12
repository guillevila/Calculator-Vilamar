/**
 * pipeline.test.ts — Que lo leído sea lo que pone, y de qué ojo es.
 *
 * Estos tests usan textos SINTÉTICOS. Comprueban el motor de lectura, no que el
 * programa sepa leer un informe de verdad: para eso hacen falta informes reales
 * y todavía no los hay. La diferencia está escrita en `PROJECT_STATUS.md`.
 */

import { describe, expect, it } from 'vitest'

import { origenDe, valorDe, validarOjo, tiene } from '@vilamar/domain'

import { detectarEnTexto } from './deteccion/detector.js'
import * as fx from './fixtures/sinteticos.js'
import { interpretarTexto } from './pipeline.js'
import { textoAUnDocumento } from './proveedores/fixture.js'
import { segmentarPorOjo } from './parsers/segmentar.js'
import { leerNumero } from './parsers/nucleo.js'
import { reconstruirLineas } from './parsers/lineas.js'

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

// ═══════════════════════════════════════════════════════════════════════════
//  Regresiones de la sesión del 11/08/2026
//
//  Cinco fallos que aparecieron al probar la lectura con documentos de verdad
//  —no leyendo el código— y que el usuario encontró antes que yo. Cada uno tiene
//  aquí su test para que no vuelva.
// ═══════════════════════════════════════════════════════════════════════════

describe('regresión — reconstruir líneas a partir de trozos', () => {
  it('agrupa por altura, no por orden de llegada', () => {
    // El OCR devuelve una palabra por trozo. Si se juntan con saltos de línea,
    // la etiqueta y el número quedan en líneas distintas y no se lee nada.
    const bloques = [
      { texto: 'mm', x: 0.3, y: 0.2, ancho: 0.04, alto: 0.02 },
      { texto: 'AL', x: 0.1, y: 0.2, ancho: 0.04, alto: 0.02 },
      { texto: '24.07', x: 0.2, y: 0.201, ancho: 0.06, alto: 0.02 },
      { texto: 'K1', x: 0.1, y: 0.3, ancho: 0.04, alto: 0.02 },
    ]
    const lineas = reconstruirLineas(bloques).split('\n')
    // Lo que importa: la etiqueta y su valor acaban en la MISMA línea, que es
    // donde las reglas de lectura los buscan. El espaciado da igual.
    expect(lineas[0]).toMatch(/^AL\s+24\.07\s+mm$/)
    expect(lineas[1]).toBe('K1')
    expect(lineas).toHaveLength(2)
  })

  it('un hueco grande se marca con doble espacio, que es lo que separa columnas', () => {
    const bloques = [
      { texto: '24.07', x: 0.1, y: 0.2, ancho: 0.06, alto: 0.02 },
      { texto: '24.01', x: 0.6, y: 0.2, ancho: 0.06, alto: 0.02 },
    ]
    expect(reconstruirLineas(bloques)).toBe('24.07  24.01')
  })
})

describe('regresión — la frontera entre columnas es el hueco, no el punto medio', () => {
  it('un valor al final de la columna izquierda no se va a la derecha', () => {
    // Caso real: el eje «@ 175» del ojo derecho estaba a la derecha del punto
    // medio entre los rótulos, y se leía como dato del ojo izquierdo. El ojo
    // derecho se quedaba sin ejes y el izquierdo tenía ejes ajenos.
    const bloques = [
      { texto: 'OD', x: 0.08, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'OS', x: 0.62, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'K1', x: 0.08, y: 0.2, ancho: 0.04, alto: 0.02 },
      { texto: '41.22', x: 0.2, y: 0.2, ancho: 0.06, alto: 0.02 },
      { texto: 'D', x: 0.3, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '@', x: 0.34, y: 0.2, ancho: 0.02, alto: 0.02 },
      // Este está pasado el punto medio (0.35) pero pertenece a la izquierda.
      { texto: '175', x: 0.4, y: 0.2, ancho: 0.05, alto: 0.02 },
      { texto: 'K1', x: 0.62, y: 0.2, ancho: 0.04, alto: 0.02 },
      { texto: '40.27', x: 0.74, y: 0.2, ancho: 0.06, alto: 0.02 },
      { texto: 'D', x: 0.84, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '@', x: 0.88, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '8', x: 0.93, y: 0.2, ancho: 0.02, alto: 0.02 },
    ]
    const s = segmentarPorOjo(reconstruirLineas(bloques), bloques)
    expect(s.disposicion).toBe('DOS_COLUMNAS')
    expect(s.porOjo.OD).toContain('175')
    expect(s.porOjo.OS).not.toContain('175')
    expect(s.porOjo.OS).toContain('8')
  })
})

describe('regresión — el cero por la letra O del OCR', () => {
  it('«0D» y «0S» se reconocen como rótulos de ojo', () => {
    const bloques = [
      { texto: '0D', x: 0.2, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: '0S', x: 0.7, y: 0.1, ancho: 0.04, alto: 0.02 },
      { texto: 'AL 24.07 mm', x: 0.15, y: 0.2, ancho: 0.2, alto: 0.02 },
      { texto: 'AL 24.01 mm', x: 0.65, y: 0.2, ancho: 0.2, alto: 0.02 },
    ]
    const s = segmentarPorOjo(reconstruirLineas(bloques), bloques)
    expect(s.disposicion).toBe('DOS_COLUMNAS')
    expect(s.porOjo.OD).toContain('24.07')
    expect(s.porOjo.OS).toContain('24.01')
  })

  it('un «0D» en medio de una línea NO convierte el informe en un informe de OD', () => {
    // «target 0 D» mal leído no puede bastar para atribuir todo el documento al
    // ojo derecho: es la clase de error que produce un resultado creíble y falso.
    const texto = ['Biometry summary', 'AL 24.07 mm', 'Target refraction 0D', 'ACD 3.18 mm'].join(
      '\n',
    )
    const s = segmentarPorOjo(texto)
    expect(s.disposicion).toBe('DESCONOCIDA')
    expect(s.porOjo.OD).toBeUndefined()
    expect(s.porOjo.OS).toBeUndefined()
  })

  it('un «OD» como encabezado de línea sí vale', () => {
    const texto = ['ANTERION', 'OD', 'AL 24.07 mm', 'ACD 3.18 mm'].join('\n')
    const s = segmentarPorOjo(texto)
    expect(s.disposicion).toBe('UN_OJO')
    expect(s.porOjo.OD).toBeDefined()
  })
})

describe('regresión — no decir «no he encontrado nada» cuando sí se ha encontrado', () => {
  it('si los datos se leen pero falta el ojo, se dice eso y no lo contrario', () => {
    const r = leer(fx.SIN_MARCA_DE_OJO)
    const todos = r.avisos.join(' ')
    expect(todos).toMatch(/Se han reconocido \d+ datos/)
    expect(todos).not.toMatch(/No se ha podido leer ningún dato/)
  })

  it('si de verdad no hay nada, se dice que no hay nada', () => {
    const r = leer(fx.SIN_DATOS)
    expect(r.avisos.join(' ')).toMatch(/No se ha podido leer ningún dato/)
  })
})

describe('regresión — el hueco entre columnas no es «el hueco más grande»', () => {
  it('un espacio ancho entre la etiqueta y su valor no parte la columna', () => {
    // Caso real, y de los peores: en la columna izquierda el espacio entre «K1»
    // y su valor era MAYOR que el espacio entre las dos columnas. La frontera se
    // colocaba ahí y el ojo derecho salía SIN NINGUNA K —etiqueta a un lado,
    // número al otro— mientras el izquierdo salía perfecto. Sin ningún error.
    const bloques = [
      { texto: 'OD', x: 0.07, y: 0.1, ancho: 0.03, alto: 0.02 },
      { texto: 'OS', x: 0.62, y: 0.1, ancho: 0.03, alto: 0.02 },
      // Izquierda: hueco de 0.13 entre la etiqueta y el valor.
      { texto: 'K1', x: 0.07, y: 0.2, ancho: 0.03, alto: 0.02 },
      { texto: '41.22', x: 0.23, y: 0.2, ancho: 0.06, alto: 0.02 },
      { texto: 'D', x: 0.31, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '@', x: 0.35, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '175', x: 0.39, y: 0.2, ancho: 0.05, alto: 0.02 },
      // Derecha: el hueco entre columnas (0.44 → 0.62) es MENOR que el de arriba.
      { texto: 'K1', x: 0.62, y: 0.2, ancho: 0.03, alto: 0.02 },
      { texto: '40.27', x: 0.78, y: 0.2, ancho: 0.06, alto: 0.02 },
      { texto: 'D', x: 0.86, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '@', x: 0.9, y: 0.2, ancho: 0.02, alto: 0.02 },
      { texto: '8', x: 0.94, y: 0.2, ancho: 0.02, alto: 0.02 },
    ]
    const s = segmentarPorOjo(reconstruirLineas(bloques), bloques)
    expect(s.disposicion).toBe('DOS_COLUMNAS')
    // Cada K con su etiqueta, su valor y su eje, en su ojo.
    expect(s.porOjo.OD).toMatch(/K1[\s\S]*41\.22[\s\S]*175/)
    expect(s.porOjo.OS).toMatch(/K1[\s\S]*40\.27[\s\S]*8/)
    expect(s.porOjo.OD).not.toContain('40.27')
    expect(s.porOjo.OS).not.toContain('41.22')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  Datos del ANTERION que antes se tiraban
// ═══════════════════════════════════════════════════════════════════════════
//
// El informe los imprime y el modelo ya tenía los campos; lo que faltaba eran
// las reglas de lectura. No se ha inventado ninguna equivalencia clínica: cada
// uno va a su campo y ya está.

describe('ANTERION: refracción objetivo y nk', () => {
  const r = leer(fx.ANTERION_OD_OS)

  it('lee la refracción objetivo, incluido un 0.00', () => {
    // 0.00 D es emetropía: un objetivo legítimo, no un hueco. Si el cero se
    // tratara como ausencia, el programa borraría una decisión clínica real.
    expect(valorDe(r.ojos.OD!, 'REFRACCION_OBJETIVO')).toBe(0)
  })

  it('lee una refracción objetivo NEGATIVA con su signo', () => {
    // Comerse el menos convertiría una miopía buscada en una hipermetropía.
    expect(valorDe(r.ojos.OS!, 'REFRACCION_OBJETIVO')).toBe(-0.25)
  })

  it('la refracción objetivo leída viene DEL INFORME, no aportada', () => {
    // Aunque el campo esté catalogado como decisión del cirujano: el origen
    // sale del valor concreto, no del tipo de campo.
    const m = r.ojos.OD!.medidas.REFRACCION_OBJETIVO
    expect(m).toBeDefined()
    expect(origenDe(m)).toBe('DEL_INFORME')
    expect(m!.procedencia.evidencia?.texto).toMatch(/Target/i)
  })

  it('lee nk = 1.3375 en los dos ojos', () => {
    expect(valorDe(r.ojos.OD!, 'INDICE_QUERATOMETRICO')).toBe(1.3375)
    expect(valorDe(r.ojos.OS!, 'INDICE_QUERATOMETRICO')).toBe(1.3375)
  })

  it('nk queda dentro de su rango válido y no genera aviso', () => {
    const avisos = validarOjo(r.ojos.OD!).filter((a) => a.campo === 'INDICE_QUERATOMETRICO')
    expect(avisos.filter((a) => a.nivel === 'INVALID')).toHaveLength(0)
  })

  it('no se inventa ninguno cuando el informe no los trae', () => {
    // El IOLMaster de los fixtures no publica ni Target ni nk. Un extractor que
    // «rellenara» con el valor típico sería justo lo que este programa no hace.
    const otro = leer(fx.IOLMASTER_DOS_COLUMNAS)
    expect(tiene(otro.ojos.OD!, 'REFRACCION_OBJETIVO')).toBe(false)
    expect(tiene(otro.ojos.OD!, 'INDICE_QUERATOMETRICO')).toBe(false)
  })
})

describe('AQD no se transforma nunca en ACD', () => {
  const r = leer(fx.ANTERION_OD_OS)

  it('los dos se leen, y cada uno con su valor', () => {
    // Es la trampa clásica de este informe: se parecen y no son lo mismo. ACD se
    // mide desde el epitelio; AQD desde el endotelio.
    expect(valorDe(r.ojos.OD!, 'ACD')).toBe(3.18)
    expect(valorDe(r.ojos.OD!, 'AQD')).toBe(2.65)
    expect(valorDe(r.ojos.OD!, 'ACD')).not.toBe(valorDe(r.ojos.OD!, 'AQD'))
  })

  it('un informe que solo trae AQD deja ACD sin constar', () => {
    const soloAqd = leer(`ANTERION
OD
AL   24.07 mm
AQD (endo)  2.65 mm`)
    expect(valorDe(soloAqd.ojos.OD!, 'AQD')).toBe(2.65)
    expect(tiene(soloAqd.ojos.OD!, 'ACD')).toBe(false)
  })

  it('un informe que solo trae ACD deja AQD sin constar', () => {
    const soloAcd = leer(`ANTERION
OD
AL   24.07 mm
ACD (epi)   3.18 mm`)
    expect(valorDe(soloAcd.ojos.OD!, 'ACD')).toBe(3.18)
    expect(tiene(soloAcd.ojos.OD!, 'AQD')).toBe(false)
  })
})
