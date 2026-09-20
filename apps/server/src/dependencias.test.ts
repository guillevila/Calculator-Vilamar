/**
 * dependencias.test.ts — solo la parte que no toca red ni navegador:
 * dónde busca sus carpetas el servidor, y que `crearDependenciasServidor`
 * arma un objeto con las nueve piezas que pide `ServicioCasos`. Arrancar
 * de verdad `abrirNavegador`/`imprimirPdf` (Playwright) queda para el
 * ordenador personal — ver `docs/PLAN-APP-MOVIL.md`.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  carpetasDeUsuario,
  crearDependenciasServidor,
  raicesDelServidor,
  VERSION_SERVIDOR,
} from './dependencias.js'
import { crearEmisorEventos } from './eventos.js'

const rutasTemporales: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-server-'))
  rutasTemporales.push(raiz)
  return raiz
}

afterEach(() => {
  delete process.env['VILAMAR_SERVER_DATOS']
  delete process.env['VILAMAR_SERVER_INFORMES']
  while (rutasTemporales.length > 0) {
    const raiz = rutasTemporales.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

describe('raicesDelServidor', () => {
  it('usa VILAMAR_SERVER_DATOS, no el Escritorio del usuario', () => {
    const raiz = raizTemporal()
    process.env['VILAMAR_SERVER_DATOS'] = raiz
    const raices = raicesDelServidor()
    expect(raices.datos).toBe(raiz)
    expect(raices.informes).toBeUndefined()
  })

  it('con VILAMAR_SERVER_INFORMES puesta, la recoge aparte', () => {
    const raiz = raizTemporal()
    const informes = raizTemporal()
    process.env['VILAMAR_SERVER_DATOS'] = raiz
    process.env['VILAMAR_SERVER_INFORMES'] = informes
    const raices = raicesDelServidor()
    expect(raices.informes).toBe(informes)
  })
})

describe('carpetasDeUsuario', () => {
  it('cada usuario cae en su propia subcarpeta, nunca en la misma', () => {
    const raiz = raizTemporal()
    const raices = { datos: raiz }
    const deAna = carpetasDeUsuario(raices, 'usuario-ana')
    const deBea = carpetasDeUsuario(raices, 'usuario-bea')
    expect(deAna.raiz).toBe(join(raiz, 'usuarios', 'usuario-ana'))
    expect(deBea.raiz).toBe(join(raiz, 'usuarios', 'usuario-bea'))
    expect(deAna.raiz).not.toBe(deBea.raiz)
    expect(deAna.sesiones).not.toBe(deBea.sesiones)
  })

  it('con informes base puesta, cada usuario tiene también su propia subcarpeta de informes', () => {
    const raiz = raizTemporal()
    const informesBase = raizTemporal()
    const carpetas = carpetasDeUsuario({ datos: raiz, informes: informesBase }, 'usuario-ana')
    expect(carpetas.informes).toBe(join(informesBase, 'usuario-ana'))
  })
})

describe('crearDependenciasServidor', () => {
  it('arma las nueve piezas que pide ServicioCasos, con la versión propia del servidor', () => {
    const raiz = raizTemporal()
    const carpetas = carpetasDeUsuario({ datos: raiz }, 'usuario-ana')
    const dep = crearDependenciasServidor(carpetas, crearEmisorEventos())

    expect(dep.version).toBe(VERSION_SERVIDOR)
    expect(dep.lectorVision).toBeUndefined()
    expect(typeof dep.ahora).toBe('function')
    expect(typeof dep.abrirNavegador).toBe('function')
    expect(typeof dep.imprimirPdf).toBe('function')
    expect(typeof dep.emitirProgreso).toBe('function')
    expect(typeof dep.emitirCaso).toBe('function')
    expect(dep.proveedor.nombre).toBe('servidor (provisional: solo PDF con texto)')
  })
})
