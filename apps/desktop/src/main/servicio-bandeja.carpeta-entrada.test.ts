/**
 * La carpeta de entrada por prioridad (D84, 16/09/2026): fotos que llegan
 * de OneDrive, clasificadas a mano en Alta/Normal/Baja, se convierten en
 * avisos de la bandeja ya enganchados a su foto. Varias fotos del mismo
 * paciente, en una subcarpeta (D86, 17/09/2026), se agrupan en un aviso.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepararCarpetas } from '@vilamar/casos'

import { ServicioBandeja } from './servicio-bandeja.js'

const carpetas: string[] = []

function raizTemporal(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'vilamar-carpeta-entrada-'))
  carpetas.push(raiz)
  return raiz
}

afterEach(() => {
  while (carpetas.length > 0) {
    const raiz = carpetas.pop()
    if (raiz) rmSync(raiz, { recursive: true, force: true })
  }
})

function servicioDePrueba(): ServicioBandeja {
  let contador = 0
  return new ServicioBandeja({
    carpetas: prepararCarpetas(raizTemporal()),
    nuevoId: () => `entrada-${++contador}`,
    ahora: () => new Date('2026-09-16T10:00:00.000Z'),
  })
}

describe('ServicioBandeja — carpeta de entrada (D84)', () => {
  it('sin configurar, no hay ninguna carpeta', () => {
    expect(servicioDePrueba().carpetaEntrada()).toBeNull()
  })

  it('configurarCarpetaEntrada guarda la ruta y crea las subcarpetas', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)

    expect(servicio.carpetaEntrada()).toBe(entrada)
    expect(existsSync(join(entrada, 'Alta'))).toBe(true)
    expect(existsSync(join(entrada, 'Normal'))).toBe(true)
    expect(existsSync(join(entrada, 'Baja'))).toBe(true)
    expect(existsSync(join(entrada, 'Importadas'))).toBe(true)
  })

  it('buscarFotosNuevas sin haber configurado ninguna carpeta, falla con un mensaje claro', () => {
    const servicio = servicioDePrueba()
    expect(() => servicio.buscarFotosNuevas()).toThrow(/carpeta de entrada/)
  })

  it('detecta una foto en cada subcarpeta, con la prioridad correcta, y la archiva en Importadas', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)

    writeFileSync(join(entrada, 'Alta', 'urgente.jpg'), 'foto')
    writeFileSync(join(entrada, 'Normal', 'normal.jpg'), 'foto')
    writeFileSync(join(entrada, 'Baja', 'baja.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(3)

    const urgente = bandeja.find((e) => e.descripcion === 'urgente')
    expect(urgente?.prioridad).toBe('URGENTE')
    expect(urgente?.rutasFotos).toEqual([join(entrada, 'Importadas', 'urgente.jpg')])
    expect(existsSync(join(entrada, 'Alta', 'urgente.jpg'))).toBe(false)
    expect(existsSync(urgente!.rutasFotos[0]!)).toBe(true)

    expect(bandeja.find((e) => e.descripcion === 'normal')?.prioridad).toBe('NORMAL')
    expect(bandeja.find((e) => e.descripcion === 'baja')?.prioridad).toBe('BAJA')
  })

  it('una foto suelta en la raíz cuenta como prioridad Normal', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'suelta.png'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.prioridad).toBe('NORMAL')
    expect(bandeja[0]?.rutasFotos).toEqual([join(entrada, 'Importadas', 'suelta.png')])
  })

  it('buscar dos veces seguidas no duplica el aviso — la foto ya está en Importadas', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'Alta', 'paciente.jpg'), 'foto')

    servicio.buscarFotosNuevas()
    const segundaBusqueda = servicio.buscarFotosNuevas()
    expect(segundaBusqueda).toHaveLength(1)
  })

  it('ignora ficheros con una extensión que no es de biometría', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'Alta', 'notas.txt'), 'no es una foto')

    expect(servicio.buscarFotosNuevas()).toHaveLength(0)
  })

  it('dos fotos con el mismo nombre no se pisan al archivarlas', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'Alta', 'foto.jpg'), 'primera')
    servicio.buscarFotosNuevas()

    writeFileSync(join(entrada, 'Alta', 'foto.jpg'), 'segunda')
    const bandeja = servicio.buscarFotosNuevas()

    expect(bandeja).toHaveLength(2)
    expect(existsSync(join(entrada, 'Importadas', 'foto.jpg'))).toBe(true)
    expect(existsSync(join(entrada, 'Importadas', 'foto (2).jpg'))).toBe(true)
  })

  it('una subcarpeta con varias fotos (D86) se agrupa en UN solo aviso, con su nombre como descripción', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    const carpetaPaciente = join(entrada, 'Normal', 'Juana Pérez')
    mkdirSync(carpetaPaciente, { recursive: true })
    writeFileSync(join(carpetaPaciente, 'od.jpg'), 'foto od')
    writeFileSync(join(carpetaPaciente, 'os.jpg'), 'foto os')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.descripcion).toBe('Juana Pérez')
    expect(bandeja[0]?.prioridad).toBe('NORMAL')
    expect(bandeja[0]?.rutasFotos).toEqual(
      expect.arrayContaining([
        join(entrada, 'Importadas', 'Juana Pérez', 'od.jpg'),
        join(entrada, 'Importadas', 'Juana Pérez', 'os.jpg'),
      ]),
    )
    expect(bandeja[0]?.rutasFotos).toHaveLength(2)
    // La carpeta original ya no está en Normal — se movió entera.
    expect(existsSync(carpetaPaciente)).toBe(false)
    for (const ruta of bandeja[0]!.rutasFotos) expect(existsSync(ruta)).toBe(true)
  })

  it('una subcarpeta vacía, o sin ninguna foto válida, no genera ningún aviso', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'Carpeta Vacía'), { recursive: true })
    mkdirSync(join(entrada, 'Alta', 'Solo Notas'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'Solo Notas', 'notas.txt'), 'no es una foto')

    expect(servicio.buscarFotosNuevas()).toHaveLength(0)
    // Como no se movieron (nada que archivar), las carpetas siguen ahí —
    // para que, en cuanto lleguen fotos de verdad, se detecten entonces.
    expect(existsSync(join(entrada, 'Alta', 'Carpeta Vacía'))).toBe(true)
  })

  it('ficheros sueltos y una subcarpeta en la misma prioridad conviven, cada uno como su propio aviso', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'Baja', 'suelta.jpg'), 'foto')
    const carpetaPaciente = join(entrada, 'Baja', 'Otro Paciente')
    mkdirSync(carpetaPaciente, { recursive: true })
    writeFileSync(join(carpetaPaciente, 'foto.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(2)
    expect(bandeja.find((e) => e.descripcion === 'suelta')?.rutasFotos).toHaveLength(1)
    expect(bandeja.find((e) => e.descripcion === 'Otro Paciente')?.rutasFotos).toHaveLength(1)
  })
})
