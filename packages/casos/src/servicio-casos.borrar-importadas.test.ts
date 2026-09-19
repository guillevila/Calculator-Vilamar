/**
 * D89, 17/09/2026: una vez que una foto de la carpeta de entrada
 * («Importadas», D84/D86) se ha usado para calcular un caso —y por tanto
 * ya tiene su copia a salvo en `<Doctor>/Datos previos/`, D87—, la copia
 * de «Importadas» se borra, para que esa carpeta no acumule fotos ya
 * procesadas sin parar.
 *
 * Petición expresa del dueño del proyecto: «una vez que las imágenes
 * pasan a la carpeta de importadas y se usan para calcular, lo mejor
 * sería que desaparezcan de allí para que no se acumulen, pues si las
 * necesitamos ya están en la carpeta del dr en la sesión datos previos».
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DispositivoDetectado } from '@vilamar/domain'
import type { DocumentoEntrada, LectorVision, ResultadoExtraccion } from '@vilamar/extraction'
import { afterEach, describe, expect, it } from 'vitest'

import type { DependenciasServicio } from './servicio-casos.js'

const { guardarCarpetaEntrada, prepararCarpetas } = await import('./almacen.js')
const { ServicioCasos } = await import('./servicio-casos.js')

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-borrar-importadas-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function lectorDeUnaFoto(): LectorVision {
  return {
    nombre: 'test',
    disponible: () => true,
    porQueNoDisponible: '',
    leer: (_documento: DocumentoEntrada) => {
      const resultado: ResultadoExtraccion = {
        documentoId: 'doc-1',
        dispositivo: {
          dispositivo: 'IOLMASTER_700',
          confianza: 0.9,
          indicios: [],
        } satisfies DispositivoDetectado,
        disposicion: 'UN_OJO',
        explicacionOjos: 'una sola sección, se asume OD',
        ojos: {
          OD: {
            lateralidad: 'OD',
            aparato: 'Principal',
            medidas: {
              AL: {
                campo: 'AL',
                ojo: 'OD',
                valor: 24.0,
                unidad: 'mm',
                procedencia: {
                  metodo: 'VISION',
                  documentoId: 'doc-1',
                  registradoEn: '2026-09-17T10:00:00.000Z',
                },
                confirmadoPorUsuario: false,
              },
            },
          },
        },
        lentes: [],
        paciente: {},
        avisos: [],
        proveedor: 'test',
        metodo: 'VISION',
      }
      return Promise.resolve(resultado)
    },
  }
}

function servicioDePrueba(): {
  servicio: InstanceType<typeof ServicioCasos>
  carpetas: ReturnType<typeof prepararCarpetas>
} {
  const carpetasDePrueba = prepararCarpetas(raizTemporal())
  const dep: DependenciasServicio = {
    carpetas: carpetasDePrueba,
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado, hay lector de visión')),
    },
    lectorVision: lectorDeUnaFoto(),
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-17T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return { servicio: new ServicioCasos(dep), carpetas: carpetasDePrueba }
}

describe('generarPdf — borra de «Importadas» la foto ya archivada en «Datos previos» (D89, 17/09/2026)', () => {
  it('una foto suelta en Importadas desaparece de ahí tras calcular, y sigue en «Datos previos»', async () => {
    const { servicio, carpetas: carpetasApp } = servicioDePrueba()
    const raizEntrada = raizTemporal()
    guardarCarpetaEntrada(carpetasApp, raizEntrada)
    const importadas = join(raizEntrada, 'Importadas')
    mkdirSync(importadas, { recursive: true })
    const rutaFoto = join(importadas, 'foto.jpg')
    writeFileSync(rutaFoto, 'contenido de prueba')

    servicio.nuevo()
    servicio.establecerIdentificacion({
      nombrePaciente: 'Paciente Importadas',
      nombreCirujano: 'Dra. Ruiz',
    })
    await servicio.cargarDocumentos([{ nombre: 'foto.jpg', ruta: rutaFoto }])

    await servicio.generarPdf()

    expect(existsSync(rutaFoto), 'la foto sigue en Importadas tras calcular').toBe(false)
    const datosPrevios = join(
      carpetasApp.informes,
      'Dra. Ruiz',
      'Datos previos',
      'Paciente Importadas',
      'foto.jpg',
    )
    expect(existsSync(datosPrevios), 'no se encuentra la copia en Datos previos').toBe(true)
  })

  it('un fichero elegido a mano FUERA de Importadas nunca se borra', async () => {
    const { servicio, carpetas: carpetasApp } = servicioDePrueba()
    const raizEntrada = raizTemporal()
    guardarCarpetaEntrada(carpetasApp, raizEntrada)
    // Ni siquiera hace falta que exista Importadas: el fichero vive en otro
    // sitio del disco por completo, como si viniera de «Elegir archivo».
    const otraCarpeta = raizTemporal()
    const rutaFoto = join(otraCarpeta, 'foto-elegida-a-mano.jpg')
    writeFileSync(rutaFoto, 'contenido de prueba')

    servicio.nuevo()
    servicio.establecerIdentificacion({
      nombrePaciente: 'Paciente Elegido A Mano',
      nombreCirujano: 'Dra. Ruiz',
    })
    await servicio.cargarDocumentos([{ nombre: 'foto-elegida-a-mano.jpg', ruta: rutaFoto }])

    await servicio.generarPdf()

    expect(existsSync(rutaFoto), 'un fichero fuera de Importadas no debe borrarse nunca').toBe(true)
  })

  it('una subcarpeta agrupada (D86) se borra entera cuando sus dos fotos ya se archivaron', async () => {
    const { servicio, carpetas: carpetasApp } = servicioDePrueba()
    const raizEntrada = raizTemporal()
    guardarCarpetaEntrada(carpetasApp, raizEntrada)
    const importadas = join(raizEntrada, 'Importadas')
    const grupo = join(importadas, 'Paciente Grupo')
    mkdirSync(grupo, { recursive: true })
    const foto1 = join(grupo, 'foto1.jpg')
    const foto2 = join(grupo, 'foto2.jpg')
    writeFileSync(foto1, 'a')
    writeFileSync(foto2, 'b')

    servicio.nuevo()
    servicio.establecerIdentificacion({
      nombrePaciente: 'Paciente Grupo',
      nombreCirujano: 'Dra. Ruiz',
    })
    // Mismo dispositivo en las dos → se fusionan en un dataset (D88), pero
    // cada una conserva su propio `rutaOrigenEntrada`.
    await servicio.cargarDocumentos([
      { nombre: 'foto1.jpg', ruta: foto1 },
      { nombre: 'foto2.jpg', ruta: foto2 },
    ])

    await servicio.generarPdf()

    expect(existsSync(foto1)).toBe(false)
    expect(existsSync(foto2)).toBe(false)
    expect(existsSync(grupo), 'la subcarpeta del grupo debería haberse quitado, ya vacía').toBe(
      false,
    )
    // La propia carpeta «Importadas» nunca se borra, aunque quede vacía.
    expect(existsSync(importadas)).toBe(true)
  })
})
