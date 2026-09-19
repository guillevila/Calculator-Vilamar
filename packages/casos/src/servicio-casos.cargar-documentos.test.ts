/**
 * Reproducción de un fallo real reportado por el dueño del proyecto
 * (17/09/2026): «si tengo dos imágenes o más del mismo paciente [y del
 * mismo ojo], al crear el caso sube una, y la otra no se ve» — justo el
 * escenario que D86 quería resolver (varias fotos de un mismo ojo, juntas
 * en una subcarpeta de la carpeta de entrada, cargadas de una vez con
 * `cargarDocumentos`).
 *
 * El primer arreglo (D88) fusionaba dos documentos del mismo ojo también
 * cuando NINGUNO de los dos se reconocía como ningún aparato en concreto
 * —asumiendo que eran fragmentos del mismo examen—. El dueño, probándolo,
 * pidió lo contrario: sin reconocer, NUNCA fusionar, porque podrían ser
 * perfectamente dos biómetros de verdad distintos; cada uno se queda como
 * su propio aparato («Otro», «Otro (2)»…) para renombrarlo a mano.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DispositivoDetectado } from '@vilamar/domain'
import { datasetsDe } from '@vilamar/domain'
import type { DocumentoEntrada, LectorVision, ResultadoExtraccion } from '@vilamar/extraction'
import { afterEach, describe, expect, it } from 'vitest'

import type { DependenciasServicio } from './servicio-casos.js'

const { prepararCarpetas } = await import('./almacen.js')
const { ServicioCasos } = await import('./servicio-casos.js')

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-cargar-documentos-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

/** Un lector de prueba: cada llamada a `leer()` devuelve el resultado que le toque, en orden. */
function lectorDePrueba(resultados: readonly ResultadoExtraccion[]): LectorVision {
  let siguiente = 0
  return {
    nombre: 'test',
    disponible: () => true,
    porQueNoDisponible: '',
    leer: (_documento: DocumentoEntrada) => {
      const r = resultados[siguiente]
      siguiente += 1
      if (!r) throw new Error('el lector de prueba se ha quedado sin resultados')
      return Promise.resolve(r)
    },
  }
}

function resultadoDe(
  documentoId: string,
  dispositivo: DispositivoDetectado,
  campos: Readonly<Record<string, number>>,
): ResultadoExtraccion {
  return {
    documentoId,
    dispositivo,
    disposicion: 'UN_OJO',
    explicacionOjos: 'una sola sección, se asume OD',
    ojos: {
      OD: {
        lateralidad: 'OD',
        aparato: 'Principal',
        medidas: Object.fromEntries(
          Object.entries(campos).map(([campo, valor]) => [
            campo,
            {
              campo,
              ojo: 'OD',
              valor,
              unidad: campo === 'AL' || campo === 'ACD' || campo === 'LT' ? 'mm' : 'D',
              procedencia: {
                metodo: 'VISION',
                documentoId,
                registradoEn: '2026-09-17T10:00:00.000Z',
              },
              confirmadoPorUsuario: false,
            },
          ]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      },
    },
    lentes: [],
    paciente: {},
    avisos: [],
    proveedor: 'test',
    metodo: 'VISION',
  }
}

function servicioDePrueba(lectorVision: LectorVision): InstanceType<typeof ServicioCasos> {
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raizTemporal()),
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado, hay lector de visión')),
    },
    lectorVision,
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-17T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('cargarDocumentos — dos fotos del mismo ojo, mismo aparato detectado (D86, 17/09/2026)', () => {
  it('se fusionan en UN solo dataset, no en dos aparatos separados', async () => {
    // Dos fotos del MISMO informe de biometría, fotografiado en dos trozos
    // porque no cupo entero en un encuadre — el propio dueño describió
    // exactamente este caso. Las dos se detectan como el mismo aparato
    // (IOLMASTER_700), y cada una trae campos DISTINTOS y complementarios.
    const lector = lectorDePrueba([
      resultadoDe(
        'doc-1',
        { dispositivo: 'IOLMASTER_700', confianza: 0.9, indicios: [] },
        { AL: 24.0 },
      ),
      resultadoDe(
        'doc-2',
        { dispositivo: 'IOLMASTER_700', confianza: 0.9, indicios: [] },
        { K1: 43.5, K2: 44.2 },
      ),
    ])
    const servicio = servicioDePrueba(lector)
    servicio.nuevo()

    const { caso } = await servicio.cargarDocumentos([
      { nombre: 'foto1.jpg', datos: new Uint8Array([1, 2, 3]) },
      { nombre: 'foto2.jpg', datos: new Uint8Array([4, 5, 6]) },
    ])

    const datasetsOD = datasetsDe(caso, 'OD')
    expect(datasetsOD).toHaveLength(1)
    expect(datasetsOD[0]?.medidas.AL?.valor).toBe(24.0)
    expect(datasetsOD[0]?.medidas.K1?.valor).toBe(43.5)
    expect(datasetsOD[0]?.medidas.K2?.valor).toBe(44.2)
  })

  it(
    'cuando el aparato NO se reconoce en ninguna de las dos fotos, NO se fusionan — cada una ' +
      'se queda como su propio aparato («Otro», «Otro (2)»), para no asumir que son el mismo examen',
    async () => {
      const lector = lectorDePrueba([
        resultadoDe(
          'doc-1',
          { dispositivo: 'DESCONOCIDO', confianza: 0, indicios: [] },
          { AL: 24.0 },
        ),
        resultadoDe(
          'doc-2',
          { dispositivo: 'DESCONOCIDO', confianza: 0, indicios: [] },
          { AL: 24.5 },
        ),
      ])
      const servicio = servicioDePrueba(lector)
      servicio.nuevo()

      const { caso } = await servicio.cargarDocumentos([
        { nombre: 'foto1.jpg', datos: new Uint8Array([1, 2, 3]) },
        { nombre: 'foto2.jpg', datos: new Uint8Array([4, 5, 6]) },
      ])

      const datasetsOD = datasetsDe(caso, 'OD')
      expect(datasetsOD).toHaveLength(2)
      expect(datasetsOD.map((d) => d.aparato).sort()).toEqual(['Otro', 'Principal'])
      expect(datasetsOD.find((d) => d.aparato === 'Principal')?.medidas.AL?.valor).toBe(24.0)
      expect(datasetsOD.find((d) => d.aparato === 'Otro')?.medidas.AL?.valor).toBe(24.5)
    },
  )

  it('una TERCERA foto sin reconocer, del mismo ojo, no pisa la anterior «Otro» — usa «Otro (2)»', async () => {
    const lector = lectorDePrueba([
      resultadoDe(
        'doc-1',
        { dispositivo: 'DESCONOCIDO', confianza: 0, indicios: [] },
        { AL: 24.0 },
      ),
      resultadoDe(
        'doc-2',
        { dispositivo: 'DESCONOCIDO', confianza: 0, indicios: [] },
        { AL: 24.5 },
      ),
      resultadoDe(
        'doc-3',
        { dispositivo: 'DESCONOCIDO', confianza: 0, indicios: [] },
        { AL: 25.0 },
      ),
    ])
    const servicio = servicioDePrueba(lector)
    servicio.nuevo()

    const { caso } = await servicio.cargarDocumentos([
      { nombre: 'foto1.jpg', datos: new Uint8Array([1, 2, 3]) },
      { nombre: 'foto2.jpg', datos: new Uint8Array([4, 5, 6]) },
      { nombre: 'foto3.jpg', datos: new Uint8Array([7, 8, 9]) },
    ])

    const datasetsOD = datasetsDe(caso, 'OD')
    expect(datasetsOD.map((d) => d.aparato).sort()).toEqual(['Otro', 'Otro (2)', 'Principal'])
  })

  it('dos fotos de aparatos REALMENTE distintos siguen creando dos datasets separados', async () => {
    const lector = lectorDePrueba([
      resultadoDe(
        'doc-1',
        { dispositivo: 'IOLMASTER_700', confianza: 0.9, indicios: [] },
        { AL: 24.0 },
      ),
      resultadoDe('doc-2', { dispositivo: 'ANTERION', confianza: 0.9, indicios: [] }, { AL: 24.1 }),
    ])
    const servicio = servicioDePrueba(lector)
    servicio.nuevo()

    const { caso } = await servicio.cargarDocumentos([
      { nombre: 'iolmaster.pdf', datos: new Uint8Array([1, 2, 3]) },
      { nombre: 'anterion.pdf', datos: new Uint8Array([4, 5, 6]) },
    ])

    const datasetsOD = datasetsDe(caso, 'OD')
    expect(datasetsOD).toHaveLength(2)
    expect(datasetsOD.map((d) => d.aparato).sort()).toEqual(['Heidelberg ANTERION', 'Principal'])
  })
})
