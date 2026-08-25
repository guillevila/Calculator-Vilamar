/**
 * pipeline.test.ts — Que lo leído sea lo que pone, y de qué ojo es.
 *
 * Estos tests usan textos SINTÉTICOS. Comprueban el motor de lectura, no que el
 * programa sepa leer un informe de verdad: para eso hacen falta informes reales
 * y todavía no los hay. La diferencia está escrita en `PROJECT_STATUS.md`.
 */

import { describe, expect, it } from 'vitest'

import { claveLente, origenDe, valorDe, validarOjo, tiene } from '@vilamar/domain'

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

// ═══════════════════════════════════════════════════════════════════════════
//  La ACD, que puede llegar impresa o haber que calcularla
// ═══════════════════════════════════════════════════════════════════════════

describe('ACD: documento completo, de principio a fin', () => {
  it('ANTERION moderno: la ACD impresa se usa tal cual', () => {
    const m = leer(fx.ANTERION_OD_OS).ojos.OD!.medidas.ACD
    expect(m?.valor).toBe(3.18)
    expect(origenDe(m)).toBe('DEL_INFORME')
    expect(m?.procedencia.evidencia?.texto).toMatch(/ACD/i)
  })

  it('ANTERION antiguo sin ACD: se calcula de AQD + CCT', () => {
    const r = leer(fx.ANTERION_ANTIGUO_SIN_ACD)
    const m = r.ojos.OD!.medidas.ACD

    expect(r.dispositivo.dispositivo).toBe('ANTERION')
    expect(m?.valor).toBe(3.18)
    expect(origenDe(m)).toBe('DERIVADO_DEL_INFORME')
    expect(m?.procedencia.derivacion?.explicacion).toBe('AQD 2.65 mm + CCT 530 µm (0.530 mm)')
  })

  it('y los datos de los que salió siguen ahí, intactos', () => {
    const ojo = leer(fx.ANTERION_ANTIGUO_SIN_ACD).ojos.OD!
    expect(valorDe(ojo, 'AQD')).toBe(2.65)
    expect(valorDe(ojo, 'CCT')).toBe(530)
    expect(origenDe(ojo.medidas.AQD)).toBe('DEL_INFORME')
    expect(origenDe(ojo.medidas.CCT)).toBe('DEL_INFORME')
  })

  it('el aviso dice de qué ojo habla', () => {
    // Con dos ojos sin ACD saldrían dos mensajes idénticos y no habría forma de
    // saber a cuál mirar.
    const r = leer(fx.ANTERION_ANTIGUO_SIN_ACD)
    const aviso = r.avisos.find((a) => a.includes('AQD'))
    expect(aviso).toBeDefined()
    expect(aviso).toContain('Ojo derecho (OD)')
  })

  it('ANTERION con AQD pero sin grosor corneal: NO se inventa la ACD', () => {
    const r = leer(fx.ANTERION_AQD_SIN_CCT)
    expect(tiene(r.ojos.OD!, 'ACD')).toBe(false)
    expect(valorDe(r.ojos.OD!, 'AQD')).toBe(2.65)
    expect(r.avisos.some((a) => /grosor|CCT/i.test(a) && /a mano/i.test(a))).toBe(true)
  })

  it('aparato desconocido con AQD y CCT: NO se calcula nada automáticamente', () => {
    // La suma daría 3.09, que es una ACD perfectamente creíble. Por eso mismo no
    // se hace: si no se sabe cómo mide ese aparato, un número creíble y
    // equivocado es indistinguible de uno correcto.
    const r = leer(fx.DESCONOCIDO_CON_AQD_Y_CCT)
    expect(r.dispositivo.dispositivo).toBe('DESCONOCIDO')
    expect(tiene(r.ojos.OD!, 'ACD')).toBe(false)
    expect(valorDe(r.ojos.OD!, 'AQD')).toBe(2.55)
    expect(r.avisos.some((a) => /no se ha reconocido el aparato/i.test(a))).toBe(true)
  })

  it('ACD impresa que no cuadra con AQD + CCT: avisa y no elige', () => {
    const r = leer(fx.ANTERION_ACD_INCOHERENTE)
    const ojo = r.ojos.OD!

    // Los tres datos se conservan exactamente como venían.
    expect(valorDe(ojo, 'ACD')).toBe(3.18)
    expect(valorDe(ojo, 'AQD')).toBe(2.1)
    expect(valorDe(ojo, 'CCT')).toBe(530)
    expect(origenDe(ojo.medidas.ACD)).toBe('DEL_INFORME')

    const aviso = validarOjo(ojo).find((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT')
    expect(aviso?.nivel).toBe('WARNING')
  })

  it('un informe coherente no genera ese aviso', () => {
    // Guarda contra un aviso que salte siempre: si saltara, dejaría de leerse.
    for (const ojo of [leer(fx.ANTERION_OD_OS).ojos.OD!, leer(fx.ANTERION_OD_OS).ojos.OS!]) {
      expect(
        validarOjo(ojo).filter((a) => a.codigo === 'ACD_NO_CUADRA_CON_AQD_MAS_CCT'),
      ).toHaveLength(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  La tabla de lentes: cada constante con su modelo
// ═══════════════════════════════════════════════════════════════════════════

describe('modelos de lente y su constante A', () => {
  it('lee las cuatro lentes del informe, cada una con la suya', () => {
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    const porModelo = new Map(r.lentes.map((l) => [l.modelo, l.constanteA]))

    expect(r.lentes).toHaveLength(4)
    expect(porModelo.get('LUX SMART')).toBe(118.5)
    expect(porModelo.get('ZEISS AT ELANA 841P')).toBe(119.6)
    expect(porModelo.get('Bausch&Lomb Akreos AO MI60')).toBe(119.1)
    expect(porModelo.get('Bausch&Lomb enVista MX60')).toBe(119.2)
  })

  it('cada constante conserva la evidencia y la etiqueta de la fórmula', () => {
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    for (const l of r.lentes) {
      expect(l.etiquetaConstante).toBe('SRK/T')
      expect(l.procedencia.evidencia?.texto).toContain(l.modelo)
      expect(l.procedencia.evidencia?.texto).toMatch(/SRK\/T/)
      expect(l.procedencia.dispositivoId).toBe('ANTERION')
      expect(l.procedencia.metodo).toBe('TEXTO_PDF')
    }
  })

  it('separa el fabricante cuando lo reconoce, sin partir el nombre a ciegas', () => {
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    const akreos = r.lentes.find((l) => l.modelo.includes('Akreos'))
    expect(akreos?.fabricante).toBe('Bausch&Lomb')
    // «LUX SMART» no lleva marca conocida delante: se deja entero, sin inventar.
    const lux = r.lentes.find((l) => l.modelo === 'LUX SMART')
    expect(lux?.fabricante).toBeUndefined()
  })

  it('NINGUNA se convierte en la CONSTANTE_A del ojo', () => {
    // Es la regla entera: cuatro constantes en el papel y cero en el ojo, porque
    // cuál vale depende de qué lente se implante y eso no lo decide el programa.
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    expect(r.lentes).toHaveLength(4)
    expect(tiene(r.ojos.OD!, 'CONSTANTE_A')).toBe(false)
  })

  it('las lentes NO se guardan dentro de un ojo', () => {
    // La tabla de modelos no habla de ojos. Meterla en uno obligaría a decidir
    // una lateralidad que el documento no da.
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    expect(r.lentes.length).toBeGreaterThan(0)
    expect(Object.keys(r.ojos.OD!.medidas)).not.toContain('CONSTANTE_A')
  })

  it('en un aparato desconocido NO se interpreta «SRK/T»', () => {
    // El mismo listado sin reconocer el aparato: un número junto a SRK/T puede
    // ser cualquier cosa si no se sabe cómo está montado el informe.
    const r = leer(fx.DESCONOCIDO_CON_SRKT)
    expect(r.dispositivo.dispositivo).toBe('DESCONOCIDO')
    expect(r.lentes).toHaveLength(0)
  })

  it('un ANTERION sin tabla de lentes devuelve la lista vacía, no un error', () => {
    const r = leer(fx.ANTERION_OD_OS)
    expect(r.dispositivo.dispositivo).toBe('ANTERION')
    expect(r.lentes).toHaveLength(0)
  })

  it('no confunde una línea de medidas con un modelo de lente', () => {
    // La línea de arriba de la primera constante podría ser cualquier cosa del
    // informe. Si no parece un nombre de lente, no se empareja nada.
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
OD
AL            24.07 mm
SRK/T: 118.5
`)
    expect(r.lentes).toHaveLength(0)
  })

  it('descarta un número que está FUERA del rango de una constante A', () => {
    // Fuera de 112–125 no es una constante A, sea lo que sea: será el a0 de otra
    // fórmula, un porcentaje o un error de lectura. Media relación —un modelo con
    // una constante imposible— no vale para nada.
    //
    // Los dos valores están elegidos para que **lleguen** a la comprobación de
    // rango: tienen la forma de una constante (dos o tres cifras) y solo fallan
    // por el valor. Con «1.85» este test pasaría sin que la comprobación
    // existiera, porque lo descartaría antes la propia forma del número.
    for (const fuera of ['99.50', '148.00', '87.0']) {
      const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App

LUX SMART
SRK/T: ${fuera}
`)
      expect(r.lentes, `${fuera} no puede ser una constante A`).toHaveLength(0)
    }
  })

  it('acepta los dos extremos del rango, para no pasarse de estricto', () => {
    for (const dentro of ['112.00', '125.00']) {
      const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App

LUX SMART
SRK/T: ${dentro}
`)
      expect(r.lentes, `${dentro} sí es una constante A posible`).toHaveLength(1)
    }
  })

  it('el aviso enumera los modelos, sin elegir ninguno', () => {
    const r = leer(fx.ANTERION_CON_TABLA_DE_LENTES)
    const aviso = r.avisos.find((a) => /modelo/i.test(a))
    // El pipeline no avisa: quien avisa es el servicio, que es quien junta los
    // documentos. Aquí lo que importa es que los datos estén y no se haya elegido.
    expect(aviso).toBeUndefined()
    expect(r.lentes.map((l) => l.constanteA)).toEqual([118.5, 119.6, 119.1, 119.2])
  })
})

describe('la criba de nombres de lente', () => {
  it('no toma otra línea de fórmula por un modelo', () => {
    // Un informe que lista varias fórmulas por lente. La línea de encima de
    // «SRK/T» es otra constante, no un modelo, y se reconoce por su FORMA
    // —«nombre: número»— y no por una lista de nombres de fórmula, que se
    // quedaría corta en cuanto apareciera una que no estuviera en ella.
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App

Bausch&Lomb enVista MX60
Haigis a0: 1.28
SRK/T: 119.2
`)
    // Se empareja con «Bausch&Lomb enVista MX60»… o con nada, pero NUNCA con
    // «Haigis a0», que es una constante de otra fórmula.
    for (const l of r.lentes) {
      expect(l.modelo).not.toMatch(/haigis/i)
    }
  })

  it('no toma la cabecera del informe por un modelo de lente', () => {
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
SRK/T: 118.5
`)
    expect(r.lentes).toHaveLength(0)
  })

  it('no toma una marca de ojo por un modelo de lente', () => {
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App

OD
SRK/T: 118.5
`)
    expect(r.lentes).toHaveLength(0)
  })

  it('lee el modelo y la constante aunque vengan en la misma línea', () => {
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App

Bausch&Lomb enVista MX60   SRK/T: 119.2
`)
    expect(r.lentes).toHaveLength(1)
    expect(r.lentes[0]!.modelo).toBe('Bausch&Lomb enVista MX60')
    expect(r.lentes[0]!.constanteA).toBe(119.2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  El paciente: sexo y nombre
// ═══════════════════════════════════════════════════════════════════════════

describe('sexo y nombre del informe', () => {
  it('lee el sexo cuando el informe lo imprime, con su evidencia', () => {
    const r = leer(fx.ANTERION_CON_SEXO)
    expect(r.paciente.sexo).toBe('MUJER')
    expect(r.paciente.evidenciaSexo).toContain('Sex')
    expect(r.paciente.evidenciaSexo).toMatch(/female/i)
  })

  it('lee el nombre, que es lo único identificativo que este programa lee', () => {
    const r = leer(fx.ANTERION_CON_SEXO)
    expect(r.paciente.nombre).toBe('María Ejemplo Sintética')
  })

  it('si el informe no dice el sexo, el nombre queda para poder deducirlo', () => {
    const r = leer(fx.ANTERION_SIN_SEXO)
    expect(r.paciente.sexo).toBeUndefined()
    expect(r.paciente.nombre).toBe('Antonio Ejemplo Sintético')
  })

  it('un informe sin ninguno de los dos no inventa nada', () => {
    const r = leer(fx.ANTERION_OD_OS)
    expect(r.paciente.sexo).toBeUndefined()
    expect(r.paciente.nombre).toBeUndefined()
  })

  it('lee el nombre con la etiqueta «Paciente:» a secas, sin «Nombre» delante', () => {
    // Caso real que trajo el dueño del proyecto (25/08/2026): su informe no
    // dice «Nombre del paciente», dice solo «Paciente:».
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App
Paciente: Sintético De Prueba

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
`)
    expect(r.paciente.nombre).toBe('Sintético De Prueba')
  })

  it('el sexo y el nombre NO se guardan dentro de un ojo', () => {
    // Una persona no tiene un sexo por ojo. Guardarlo ahí permitiría que el
    // derecho y el izquierdo dijeran cosas distintas.
    const r = leer(fx.ANTERION_CON_SEXO)
    expect(Object.keys(r.ojos.OD!.medidas)).not.toContain('SEXO')
    expect(r.paciente.sexo).toBeDefined()
  })
})

describe('el informe español, en columnas y sin dos puntos', () => {
  it('lee el sexo aunque la etiqueta vaya separada por espacios', () => {
    // Es el caso que falló de verdad: el patrón exigía «Sexo:» y el informe pone
    // «Sexo   Femenino». El caso se quedaba sin sexo y una de las calculadoras no podía calcular.
    const r = leer(fx.ANTERION_ESPANOL_EN_COLUMNAS)
    expect(r.paciente.sexo).toBe('MUJER')
    expect(r.paciente.evidenciaSexo).toMatch(/sexo/i)
  })

  it('aflojar el separador NO abre la puerta a cualquier palabra', () => {
    // Lo que hace segura la regla: la palabra tiene que ser reconocible. Si detrás
    // de «Sexo» hay otra cosa, no se traduce y el campo se queda vacío.
    const r = leer(`HEIDELBERG ENGINEERING ANTERION
Cataract App
Sexo   pendiente de revisar

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
`)
    expect(r.paciente.sexo).toBeUndefined()
  })

  it('el punto y coma del fabricante no impide emparejar la lente', () => {
    // El PDF real trae literalmente «Bausch&Lomb;». Sin quitar el punto y coma,
    // ese modelo no se emparejaría con «Bausch & Lomb» de ninguna lista.
    const r = leer(fx.ANTERION_ESPANOL_EN_COLUMNAS)
    const lente = r.lentes.find((l) => /Akreos/.test(l.modelo))
    expect(lente?.constanteA).toBe(119.1)
    expect(claveLente(lente!)).toBe(claveLente({ modelo: 'Bausch & Lomb Akreos AO MI60' }))
  })
})
