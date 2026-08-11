/**
 * Pruebas del lector de visión.
 *
 * Ninguna sale a internet. Lo que se comprueba aquí no es que el modelo acierte
 * —eso no se puede probar en un test— sino que **lo que devuelva se trate con la
 * desconfianza que le corresponde**: que entre marcado como lectura automática,
 * que un ojo dudoso se descarte en vez de asignarse a medias, y que nada se
 * pierda en silencio.
 */

import { describe, expect, it } from 'vitest'

import type { CampoBiometrico } from '@vilamar/domain'
import { CAMPOS, esLecturaAutomatica, obtener } from '@vilamar/domain'
import type { DocumentoEntrada } from '@vilamar/extraction'

import { aResultado, crearLectorVision, MODELO } from './vision-claude.js'

const CUANDO = '2026-08-11T10:00:00.000Z'
const DOC: DocumentoEntrada = {
  id: 'doc-1',
  nombre: 'informe.pdf',
  formato: 'pdf',
  datos: new Uint8Array([1, 2, 3]),
}

function leido(ojos: Parameters<typeof aResultado>[1]['ojos'], notas: string[] = []) {
  return { dispositivo: 'ANTERION' as const, ojos, notas }
}

describe('el lector de visión está apagado mientras no se configure', () => {
  it('sin clave, se declara no disponible y lo explica', () => {
    const lector = crearLectorVision({ clave: undefined })
    expect(lector.disponible()).toBe(false)
    // El mensaje es para una persona, no para un log.
    expect(lector.porQueNoDisponible).toContain('ANTHROPIC_API_KEY')
    expect(lector.porQueNoDisponible).not.toMatch(/error|fallo|excepción/i)
  })

  it('una clave en blanco no cuenta como clave', () => {
    expect(crearLectorVision({ clave: '   ' }).disponible()).toBe(false)
  })

  it('con clave, se declara disponible y dice con qué modelo lee', () => {
    const lector = crearLectorVision({ clave: 'sk-ant-de-mentira' })
    expect(lector.disponible()).toBe(true)
    expect(lector.nombre).toContain(MODELO)
  })

  it('leer sin clave lanza en vez de intentarlo', async () => {
    await expect(crearLectorVision({ clave: undefined }).leer(DOC)).rejects.toThrow(
      /no está configurado/i,
    )
  })
})

describe('lo que devuelve el modelo entra como lectura automática', () => {
  it('cada medida se marca VISION, con su línea original como evidencia', () => {
    const r = aResultado(
      DOC,
      leido([
        {
          lado: 'OD',
          comoSeSabe: 'La columna izquierda está encabezada por «OD»',
          medidas: [{ campo: 'AL', valor: 24.07, textoOriginal: 'AL      24.07 mm' }],
        },
      ]),
      CUANDO,
    )

    const medida = obtener(r.ojos.OD!, 'AL')
    expect(medida?.valor).toBe(24.07)
    expect(medida?.procedencia.metodo).toBe('VISION')
    expect(medida?.procedencia.evidencia?.texto).toBe('AL      24.07 mm')
    expect(medida?.procedencia.documentoId).toBe('doc-1')
    expect(r.metodo).toBe('VISION')
  })

  it('y por tanto NO se da por buena sola — la invariante 11 la alcanza', () => {
    const r = aResultado(
      DOC,
      leido([
        {
          lado: 'OD',
          comoSeSabe: 'OD',
          medidas: [{ campo: 'AL', valor: 24.07, textoOriginal: 'AL 24.07' }],
        },
      ]),
      CUANDO,
    )
    const medida = obtener(r.ojos.OD!, 'AL')!
    // Esto es lo que obliga a comprobarla una a una en la pantalla de revisión.
    expect(esLecturaAutomatica(medida.procedencia)).toBe(true)
    expect(medida.confirmadoPorUsuario).toBe(false)
  })

  it('el aviso de arriba dice claramente que hay que comprobar', () => {
    const r = aResultado(DOC, leido([]), CUANDO)
    expect(r.avisos[0]).toMatch(/comprueba cada dato/i)
  })
})

describe('lo dudoso se descarta, no se asigna a medias', () => {
  it('dos bloques del mismo ojo: se tiran los dos y se dice', () => {
    const r = aResultado(
      DOC,
      leido([
        {
          lado: 'OD',
          comoSeSabe: 'columna 1',
          medidas: [{ campo: 'AL', valor: 24.07, textoOriginal: 'AL 24.07' }],
        },
        {
          lado: 'OD',
          comoSeSabe: 'columna 2',
          medidas: [{ campo: 'AL', valor: 24.01, textoOriginal: 'AL 24.01' }],
        },
      ]),
      CUANDO,
    )
    // Quedarse con uno de los dos sería elegir al azar entre dos ojos.
    expect(r.ojos.OD).toBeUndefined()
    expect(r.avisos.some((a) => a.includes('dos veces el ojo OD'))).toBe(true)
  })

  it('sin ningún ojo identificado, no se rellena nada y se explica por qué', () => {
    const r = aResultado(DOC, leido([], ['Las dos columnas están sin etiquetar.']), CUANDO)
    expect(Object.keys(r.ojos)).toHaveLength(0)
    expect(r.avisos.some((a) => a.includes('no mezclarlos'))).toBe(true)
    // Las notas del modelo llegan al usuario, no se pierden.
    expect(r.avisos).toContain('Las dos columnas están sin etiquetar.')
  })

  it('un valor que no es un número se descarta CON aviso, no en silencio', () => {
    const r = aResultado(
      DOC,
      leido([
        {
          lado: 'OS',
          comoSeSabe: 'OS',
          medidas: [
            { campo: 'AL', valor: Number.NaN, textoOriginal: 'AL —' },
            { campo: 'K1', valor: 41.22, textoOriginal: 'K1 41.22 D' },
          ],
        },
      ]),
      CUANDO,
    )
    expect(obtener(r.ojos.OS!, 'AL')).toBeUndefined()
    expect(obtener(r.ojos.OS!, 'K1')?.valor).toBe(41.22)
    // El filtro que descarta el dato malo sin decirlo esconde el error.
    expect(r.avisos.some((a) => a.includes('AL') && a.includes('OS'))).toBe(true)
  })

  it('los dos ojos no se mezclan: cada medida queda en el suyo', () => {
    const r = aResultado(
      DOC,
      leido([
        {
          lado: 'OD',
          comoSeSabe: 'OD',
          medidas: [{ campo: 'AL', valor: 24.07, textoOriginal: 'a' }],
        },
        {
          lado: 'OS',
          comoSeSabe: 'OS',
          medidas: [{ campo: 'AL', valor: 24.01, textoOriginal: 'b' }],
        },
      ]),
      CUANDO,
    )
    expect(obtener(r.ojos.OD!, 'AL')?.valor).toBe(24.07)
    expect(obtener(r.ojos.OS!, 'AL')?.valor).toBe(24.01)
    expect(r.disposicion).toBe('DOS_COLUMNAS')
  })
})

describe('no se inventa confianza', () => {
  it('si no reconoce el aparato, la confianza es 0 y no un número bonito', () => {
    const r = aResultado(DOC, { dispositivo: 'DESCONOCIDO', ojos: [], notas: [] }, CUANDO)
    expect(r.dispositivo.dispositivo).toBe('DESCONOCIDO')
    expect(r.dispositivo.confianza).toBe(0)
  })
})

describe('el catálogo de campos sale del dominio, no de una lista paralela', () => {
  it('todos los campos del dominio se le pueden pedir al modelo', () => {
    // Si alguien añade un campo al dominio y aquí hubiera una lista escrita a
    // mano, ese campo no se leería nunca y nadie sabría por qué.
    const lector = crearLectorVision({ clave: 'x' })
    expect(lector.nombre).toBeTruthy()
    expect(CAMPOS.length).toBeGreaterThan(20)
    // Comprobación real: los campos que devuelve el modelo son del dominio.
    for (const campo of CAMPOS) {
      const r = aResultado(
        DOC,
        leido([
          { lado: 'OD', comoSeSabe: 'OD', medidas: [{ campo, valor: 1, textoOriginal: 't' }] },
        ]),
        CUANDO,
      )
      expect(obtener(r.ojos.OD!, campo as CampoBiometrico)).toBeDefined()
    }
  })
})
