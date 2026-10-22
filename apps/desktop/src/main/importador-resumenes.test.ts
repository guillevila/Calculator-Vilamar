import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Caso } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { listarCasos, leerCaso, prepararCarpetas } from './almacen.js'
import { importarResumenes } from './importador-resumenes.js'

const TEXTO = [
  `2026-10-22 · hospital perpetuo socorro · maria pilar · EnVista · OD · Tórica
IOLMaster Advanced Technology · SimK · Tórica · EnVista · EVO estimado
Pentacam · SimK · Tórica · EnVista · KANE estimado`,
]
const NOMBRE =
  '2026-10-22_hospital-perpetuo-socorro_maria-pilar_EnVista_OD_162128960-b05857_Torica.pdf'

const raices: string[] = []
afterEach(() => {
  while (raices.length > 0) rmSync(raices.pop()!, { recursive: true, force: true })
})

function entorno(textoPorContenido: Record<string, readonly string[]> = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-import-'))
  raices.push(raiz)
  const carpetas = prepararCarpetas(join(raiz, 'datos'))
  const origen = join(raiz, 'pdfs')
  mkdirSync(origen)
  const ejecutar = (casos: readonly Caso[] = [], doctores: readonly string[] = []) =>
    importarResumenes({
      carpetas,
      origen,
      ahora: new Date('2026-10-22T10:00:00.000Z'),
      casos,
      doctoresConocidos: doctores,
      carpetaDeCopia: ({ doctor, paciente, ojo }) =>
        join(carpetas.informes, doctor ?? 'Sin doctor', 'Importados', paciente ?? 'x', ojo),
      leerTexto: (datos) =>
        Promise.resolve(textoPorContenido[Buffer.from(datos).toString()] ?? TEXTO),
    })
  const casos = (): Caso[] => listarCasos(carpetas).map((c) => leerCaso(carpetas, c)!)
  return { carpetas, origen, ejecutar, casos }
}

describe('importarResumenes', () => {
  it('importa un PDF: copia en la carpeta del doctor y crea un caso importado terminado', async () => {
    const { origen, ejecutar, casos, carpetas } = entorno()
    writeFileSync(join(origen, NOMBRE), 'pdf-uno')
    const r = await ejecutar([], ['Hospital Perpetuo Socorro'])
    expect(r).toMatchObject({ nuevos: 1, repetidos: 0, total: 1 })

    const [c] = casos()
    expect(c).toMatchObject({
      codigo: 'IM-2026-0001',
      estado: 'COMPLETADO',
      nombrePaciente: 'maria pilar',
      // el doctor se escribe como ya existía en el programa
      nombreCirujano: 'Hospital Perpetuo Socorro',
      lente: { modelo: 'EnVista' },
      actualizadoEn: '2026-10-22T12:00:00.000Z',
    })
    expect(c?.importado).toMatchObject({
      ojo: 'OD',
      idExterno: '162128960-b05857',
      calculadoras: ['EVO_TORIC_SIN_CARA_POSTERIOR', 'KANE'],
      aparatos: ['IOLMaster Advanced Technology', 'Pentacam'],
    })
    const copia = c?.importado?.rutaPdf ?? ''
    expect(copia).toContain(join(carpetas.informes, 'Hospital Perpetuo Socorro', 'Importados'))
    expect(readFileSync(copia, 'utf8')).toBe('pdf-uno')
    // el original no se toca
    expect(existsSync(join(origen, NOMBRE))).toBe(true)
  })

  it('el mismo PDF dos veces, o el mismo caso con otro contenido, no se cuenta dos veces', async () => {
    const { origen, ejecutar, casos } = entorno()
    writeFileSync(join(origen, NOMBRE), 'pdf-uno')
    await ejecutar()
    // mismo contenido con otro nombre
    writeFileSync(join(origen, 'copia.pdf'), 'pdf-uno')
    // mismo caso de la otra app (mismo identificador y ojo), contenido distinto
    writeFileSync(
      join(
        origen,
        '2026-10-23_hospital-perpetuo-socorro_maria-pilar_EnVista_OD_162128960-b05857_Torica.pdf',
      ),
      'pdf-recalculado',
    )
    const r = await ejecutar(casos())
    expect(r).toMatchObject({ nuevos: 0, repetidos: 3 })
    expect(casos()).toHaveLength(1)
  })

  it('un PDF que no es de esa app no se importa y dice por qué', async () => {
    const { origen, ejecutar, casos } = entorno({ otro: ['Informe de biometría AL 24.07'] })
    writeFileSync(join(origen, 'biometria.pdf'), 'otro')
    const r = await ejecutar()
    expect(r.nuevos).toBe(0)
    expect(r.noReconocidos[0]?.fichero).toBe('biometria.pdf')
    expect(r.noReconocidos[0]?.motivo).toContain('cabecera')
    expect(casos()).toHaveLength(0)
  })

  it('un doctor nuevo se escribe como viene; los ficheros que no son PDF se ignoran', async () => {
    const { origen, ejecutar, casos } = entorno()
    writeFileSync(join(origen, NOMBRE), 'pdf-uno')
    writeFileSync(join(origen, 'notas.txt'), 'nada')
    const r = await ejecutar([], ['Dr Rocha'])
    expect(r).toMatchObject({ nuevos: 1, total: 1 })
    expect(casos()[0]?.nombreCirujano).toBe('hospital perpetuo socorro')
  })

  it('con una carpeta que no existe, lo dice', async () => {
    const { origen, ejecutar } = entorno()
    rmSync(origen, { recursive: true })
    await expect(ejecutar()).rejects.toThrow(/No puedo abrir la carpeta/)
  })
})
