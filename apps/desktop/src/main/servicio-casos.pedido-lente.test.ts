/**
 * D93, 20/09/2026: la lente que el cirujano decide pedir para un ojo, y el
 * texto del correo para pedirla al laboratorio.
 *
 * Petición expresa del dueño del proyecto: «me gustaría que el doctor
 * pudiera decidir qué lente elige y que quede grabado, y dándole a un botón
 * poder crear un mail directo al laboratorio para pedirlo».
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { DependenciasServicio } from './servicio-casos.js'

const { prepararCarpetas } = await import('./almacen.js')
const { ServicioCasos } = await import('./servicio-casos.js')

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-pedido-lente-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): InstanceType<typeof ServicioCasos> {
  const dep: DependenciasServicio = {
    carpetas: prepararCarpetas(raizTemporal()),
    proveedor: {
      nombre: 'test',
      puedeCon: () => false,
      extraer: () => Promise.reject(new Error('no usado')),
    },
    diagnosticador: { carpeta: '', guardar: () => Promise.resolve('') },
    capturas: { carpeta: '', guardar: () => Promise.resolve(''), leer: () => null },
    version: '0.0.0-test',
    ahora: () => new Date('2026-09-20T10:00:00.000Z'),
    abrirNavegador: () => Promise.resolve({ close: () => Promise.resolve() } as never),
    imprimirPdf: () => Promise.resolve(),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('guardarPedidoLente', () => {
  it('graba la lente a pedir, y se puede leer después con obtener()', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.guardarPedidoLente('OD', {
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      cilindro: 1.0,
      eje: 90,
    })
    const caso = servicio.obtener()!
    expect(caso.pedidosLente?.OD).toMatchObject({
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      cilindro: 1.0,
      eje: 90,
    })
  })

  it('funciona igual sobre un caso reabierto (no depende de una sesión de cálculo)', () => {
    const servicio = servicioDePrueba()
    const c = servicio.nuevo()
    servicio.abrirCaso(c.codigo)
    servicio.guardarPedidoLente('OS', {
      fabricante: 'Alcon',
      modelo: 'Alcon SN6ATx',
      esfera: 20,
    })
    expect(servicio.obtener()!.pedidosLente?.OS?.fabricante).toBe('Alcon')
  })

  it('sin caso abierto, falla con un mensaje claro en vez de crear uno vacío', () => {
    const servicio = servicioDePrueba()
    expect(() =>
      servicio.guardarPedidoLente('OD', { fabricante: 'Alcon', modelo: 'x', esfera: 20 }),
    ).toThrow(/no hay ningún cálculo abierto/i)
  })
})

describe('mailtoPedidoLente', () => {
  it('construye el asunto y el cuerpo con el código del caso, nunca el nombre del paciente', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.establecerIdentificacion({
      nombrePaciente: 'Paciente De Prueba',
      nombreCirujano: 'Dra. Ruiz',
    })
    servicio.guardarPedidoLente('OD', {
      fabricante: 'Bausch & Lomb',
      modelo: 'B&L Aspire',
      esfera: 21.5,
      cilindro: 1.0,
      eje: 90,
    })
    const caso = servicio.obtener()!
    const { asunto, cuerpo } = servicio.mailtoPedidoLente('OD')

    expect(asunto).toContain(caso.codigo)
    expect(cuerpo).toContain(caso.codigo)
    expect(cuerpo).toContain('Dra. Ruiz')
    expect(cuerpo).toContain('Bausch & Lomb')
    expect(cuerpo).toContain('B&L Aspire')
    expect(cuerpo).toContain('21.50 D')
    expect(cuerpo).toContain('1.00 D')
    expect(cuerpo).toContain('90')
    expect(cuerpo).not.toContain('Paciente De Prueba')
  })

  it('sin cilindro ni eje guardados, esas líneas no aparecen (no se inventa un dato)', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.guardarPedidoLente('OD', { fabricante: 'Alcon', modelo: 'SN6ATx', esfera: 20 })
    const { cuerpo } = servicio.mailtoPedidoLente('OD')
    expect(cuerpo).not.toContain('cilíndrica')
    expect(cuerpo).not.toContain('Eje')
  })

  it('sin ningún pedido guardado para ese ojo, falla con un mensaje claro', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    expect(() => servicio.mailtoPedidoLente('OD')).toThrow(/todavía no se ha guardado/i)
  })
})
