/**
 * `aplicarDoctor` (D80, 15/09/2026): elegir un doctor guardado pone su
 * nombre y, si tiene SIA/eje de incisión guardados, los escribe en todos
 * los datasets que el caso ya tenga.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { doctorVacio, ojoDe } from '@vilamar/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from './almacen.js'
import { ServicioCasos, type DependenciasServicio } from './servicio-casos.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-aplicar-doctor-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioCasos {
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
    ahora: () => new Date('2026-09-15T10:00:00.000Z'),
    abrirNavegador: () => Promise.reject(new Error('no usado')),
    imprimirPdf: () => Promise.reject(new Error('no usado')),
    emitirProgreso: () => {},
    emitirCaso: () => {},
  }
  return new ServicioCasos(dep)
}

describe('ServicioCasos.aplicarDoctor', () => {
  it('pone el nombre del doctor, aunque no tenga SIA ni eje guardados', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    const doctor = doctorVacio('d1', 'Dra. López')

    const caso = servicio.aplicarDoctor(doctor)

    expect(caso.nombreCirujano).toBe('Dra. López')
  })

  it('un doctor sin SIA ni eje, en un caso sin ningún dato todavía, no crea ningún dataset', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()

    const caso = servicio.aplicarDoctor(doctorVacio('d1', 'Dra. López'))

    expect(caso.ojos.OD).toBeUndefined()
    expect(caso.ojos.OS).toBeUndefined()
  })

  it('con un caso sin ningún dato todavía, SIEMBRA el SIA/eje del doctor en los dos ojos — fallo real reportado por el dueño (15/09/2026): eligió el doctor antes de escribir nada, y el SIA se quedó en el valor de partida', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    const doctor = { id: 'd1', nombre: 'Dra. López', sia: 0.3, ejeIncision: 90 }

    const caso = servicio.aplicarDoctor(doctor)

    expect(caso.nombreCirujano).toBe('Dra. López')
    expect(ojoDe(caso, 'OD').medidas.SIA?.valor).toBe(0.3)
    expect(ojoDe(caso, 'OD').medidas.EJE_INCISION?.valor).toBe(90)
    expect(ojoDe(caso, 'OS').medidas.SIA?.valor).toBe(0.3)
    expect(ojoDe(caso, 'OS').medidas.EJE_INCISION?.valor).toBe(90)
    // Nada más se ha escrito: sigue siendo un dataset con solo estos dos
    // campos, no una biometría inventada.
    expect(ojoDe(caso, 'OD').medidas.AL).toBeUndefined()
  })

  it('escribe el SIA y el eje del doctor en un dataset que ya existía', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5)
    // El SIA ya trae un valor de partida propio (D38) distinto del que va a
    // aplicar el doctor — así se comprueba que el doctor SÍ lo sustituye.
    servicio.editarMedida('OD', 'SIA', 0.25)

    const doctor = { id: 'd1', nombre: 'Dr. Ruiz', sia: 0.6, ejeIncision: 45 }
    const caso = servicio.aplicarDoctor(doctor)

    const od = ojoDe(caso, 'OD')
    expect(od.medidas.SIA?.valor).toBe(0.6)
    expect(od.medidas.SIA?.confirmadoPorUsuario).toBe(true)
    expect(od.medidas.EJE_INCISION?.valor).toBe(45)
  })

  it('un doctor sin SIA/eje guardados no toca esos campos si ya tenían algo', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5)
    servicio.editarMedida('OD', 'SIA', 0.4)

    const caso = servicio.aplicarDoctor(doctorVacio('d1', 'Dr. Ruiz'))

    expect(ojoDe(caso, 'OD').medidas.SIA?.valor).toBe(0.4)
  })

  it('se aplica a los dos ojos y a todos los aparatos que el caso ya tenga', () => {
    const servicio = servicioDePrueba()
    servicio.nuevo()
    servicio.editarMedida('OD', 'AL', 23.5, 'ZEISS IOLMaster 700')
    servicio.editarMedida('OD', 'AL', 23.6, 'OCULUS Pentacam')
    servicio.editarMedida('OS', 'AL', 23.4, 'ZEISS IOLMaster 700')

    const doctor = { id: 'd1', nombre: 'Dra. López', sia: 0.5, ejeIncision: 135 }
    const caso = servicio.aplicarDoctor(doctor)

    expect(ojoDe(caso, 'OD', 'ZEISS IOLMaster 700').medidas.SIA?.valor).toBe(0.5)
    expect(ojoDe(caso, 'OD', 'OCULUS Pentacam').medidas.SIA?.valor).toBe(0.5)
    expect(ojoDe(caso, 'OS', 'ZEISS IOLMaster 700').medidas.SIA?.valor).toBe(0.5)
    expect(ojoDe(caso, 'OD', 'ZEISS IOLMaster 700').medidas.EJE_INCISION?.valor).toBe(135)
  })
})
