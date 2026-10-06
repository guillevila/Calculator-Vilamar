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

import { prepararCarpetas } from './almacen.js'
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

/**
 * Fallo real reportado por el dueño del proyecto (24/09/2026): «quiero
 * poder meter fotos de varios pacientes de un mismo doctor... creo una
 * carpeta con el nombre del doctor y dentro meto las imágenes, pero si son
 * de distintos pacientes la app las toma como si fuera uno solo... he
 * probado a crear subcarpetas con el nombre de los pacientes... pero no lo
 * detecta». La raíz solo miraba ficheros sueltos, nunca subcarpetas —
 * cualquier carpeta de doctor, con lo que fuera dentro, se ignoraba del
 * todo. Confirmado con el dueño (D102): quiere la carpeta del doctor Y la
 * de prioridad juntas, una dentro de la otra.
 */
describe('ServicioBandeja — carpeta de entrada, por doctor (D102, 24/09/2026)', () => {
  it('una subcarpeta de la raíz que no es Alta/Normal/Baja/Importadas se trata como la carpeta de un doctor', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    const carpetaDoctor = join(entrada, 'Dr Rocha', 'Alta', 'paciente uno')
    mkdirSync(carpetaDoctor, { recursive: true })
    writeFileSync(join(carpetaDoctor, 'od.jpg'), 'foto od')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.delegado).toBe('Dr Rocha')
    expect(bandeja[0]?.descripcion).toBe('paciente uno')
    expect(bandeja[0]?.prioridad).toBe('URGENTE')
  })

  it('dos pacientes del MISMO doctor, en subcarpetas de paciente distintas, salen como DOS avisos separados', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    const pacienteA = join(entrada, 'Dr Rocha', 'Normal', 'Paciente A')
    const pacienteB = join(entrada, 'Dr Rocha', 'Normal', 'Paciente B')
    mkdirSync(pacienteA, { recursive: true })
    mkdirSync(pacienteB, { recursive: true })
    writeFileSync(join(pacienteA, 'foto.jpg'), 'a')
    writeFileSync(join(pacienteB, 'foto.jpg'), 'b')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(2)
    expect(bandeja.every((e) => e.delegado === 'Dr Rocha')).toBe(true)
    expect(bandeja.map((e) => e.descripcion).sort()).toEqual(['Paciente A', 'Paciente B'])
    // Nunca mezcladas: cada aviso solo trae la foto de SU paciente.
    expect(bandeja.find((e) => e.descripcion === 'Paciente A')?.rutasFotos).toHaveLength(1)
    expect(bandeja.find((e) => e.descripcion === 'Paciente B')?.rutasFotos).toHaveLength(1)
  })

  it('crea Alta/Normal/Baja/Importadas dentro de la carpeta del doctor, igual que en la raíz', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Dra Marina'), { recursive: true })

    servicio.buscarFotosNuevas()

    const carpetaDoctor = join(entrada, 'Dra Marina')
    expect(existsSync(join(carpetaDoctor, 'Alta'))).toBe(true)
    expect(existsSync(join(carpetaDoctor, 'Normal'))).toBe(true)
    expect(existsSync(join(carpetaDoctor, 'Baja'))).toBe(true)
    expect(existsSync(join(carpetaDoctor, 'Importadas'))).toBe(true)
  })

  it('una foto suelta directamente en la carpeta del doctor (sin prioridad) cuenta como Normal', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Dr Handy'), { recursive: true })
    writeFileSync(join(entrada, 'Dr Handy', 'suelta.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.delegado).toBe('Dr Handy')
    expect(bandeja[0]?.prioridad).toBe('NORMAL')
  })

  it('una subcarpeta de paciente directamente en la carpeta del doctor (sin prioridad) se agrupa igual', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    const carpetaPaciente = join(entrada, 'Dr Handy', 'Rafael Manzano')
    mkdirSync(carpetaPaciente, { recursive: true })
    writeFileSync(join(carpetaPaciente, 'od.jpg'), 'od')
    writeFileSync(join(carpetaPaciente, 'os.jpg'), 'os')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.delegado).toBe('Dr Handy')
    expect(bandeja[0]?.descripcion).toBe('Rafael Manzano')
    expect(bandeja[0]?.rutasFotos).toHaveLength(2)
  })

  it('se archiva en la «Importadas» del propio doctor, no en la de la raíz', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Dr Espejo', 'Alta'), { recursive: true })
    writeFileSync(join(entrada, 'Dr Espejo', 'Alta', 'foto.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja[0]?.rutasFotos).toEqual([join(entrada, 'Dr Espejo', 'Importadas', 'foto.jpg')])
    expect(existsSync(join(entrada, 'Importadas', 'foto.jpg'))).toBe(false)
  })

  it('conviven sin mezclarse: fotos sin doctor (raíz) y fotos de dos doctores distintos, cada una con su delegado', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    writeFileSync(join(entrada, 'Alta', 'sin-doctor.jpg'), 'foto')
    mkdirSync(join(entrada, 'Dr Rocha', 'Baja'), { recursive: true })
    writeFileSync(join(entrada, 'Dr Rocha', 'Baja', 'foto.jpg'), 'foto')
    mkdirSync(join(entrada, 'Dra Marina', 'Normal'), { recursive: true })
    writeFileSync(join(entrada, 'Dra Marina', 'Normal', 'foto.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(3)
    expect(bandeja.find((e) => e.descripcion === 'sin-doctor')?.delegado).toBe('Carpeta de entrada')
    expect(bandeja.find((e) => e.delegado === 'Dr Rocha')?.prioridad).toBe('BAJA')
    expect(bandeja.find((e) => e.delegado === 'Dra Marina')?.prioridad).toBe('NORMAL')
  })

  it('buscar dos veces no duplica los avisos de un doctor, igual que en la raíz', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Dr Rocha', 'Alta'), { recursive: true })
    writeFileSync(join(entrada, 'Dr Rocha', 'Alta', 'foto.jpg'), 'foto')

    servicio.buscarFotosNuevas()
    const segunda = servicio.buscarFotosNuevas()
    expect(segunda).toHaveLength(1)
  })
})

/**
 * Fallo real reportado por el dueño del proyecto (29/09/2026), con
 * capturas de su OneDrive real: organiza al revés de lo que D102 esperaba
 * —Alta/Normal/Baja FUERA, la carpeta del doctor DENTRO de la prioridad
 * que toque, con una subcarpeta por paciente dentro de esa—. Ejemplo
 * exacto que reportó: `IOL ENTRADA/Alta/dra sagrario/{maricarmen,
 * inmaculada}`, cada una con sus propias fotos. «No me los reconoce».
 */
describe('ServicioBandeja — carpeta de entrada, doctor DENTRO de una prioridad (D104, 29/09/2026)', () => {
  it('dos pacientes de un mismo doctor, cada uno en su propia subcarpeta dentro de Alta, salen como DOS avisos separados', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    const maricarmen = join(entrada, 'Alta', 'dra sagrario', 'maricarmen')
    const inmaculada = join(entrada, 'Alta', 'dra sagrario', 'inmaculada')
    mkdirSync(maricarmen, { recursive: true })
    mkdirSync(inmaculada, { recursive: true })
    writeFileSync(join(maricarmen, 'foto.jpg'), 'foto de maricarmen')
    writeFileSync(join(inmaculada, 'foto.jpg'), 'foto de inmaculada')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(2)
    expect(bandeja.every((e) => e.delegado === 'dra sagrario')).toBe(true)
    expect(bandeja.every((e) => e.prioridad === 'URGENTE')).toBe(true)
    expect(bandeja.map((e) => e.descripcion).sort()).toEqual(['inmaculada', 'maricarmen'])
    // Nunca mezcladas: cada aviso solo trae la foto de SU paciente.
    expect(bandeja.find((e) => e.descripcion === 'maricarmen')?.rutasFotos).toHaveLength(1)
    expect(bandeja.find((e) => e.descripcion === 'inmaculada')?.rutasFotos).toHaveLength(1)
  })

  it('funciona igual en Normal y en Baja, no solo en Alta', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Normal', 'Dr Handy', 'Rafael'), { recursive: true })
    writeFileSync(join(entrada, 'Normal', 'Dr Handy', 'Rafael', 'foto.jpg'), 'foto')
    mkdirSync(join(entrada, 'Baja', 'Dr Handy', 'Sonia'), { recursive: true })
    writeFileSync(join(entrada, 'Baja', 'Dr Handy', 'Sonia', 'foto.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(2)
    expect(bandeja.find((e) => e.descripcion === 'Rafael')?.prioridad).toBe('NORMAL')
    expect(bandeja.find((e) => e.descripcion === 'Sonia')?.prioridad).toBe('BAJA')
    expect(bandeja.every((e) => e.delegado === 'Dr Handy')).toBe(true)
  })

  it('no rompe el caso de siempre: una subcarpeta de paciente CON fotos sueltas directamente dentro de Alta sigue sin doctor', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'Paciente Directo'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'Paciente Directo', 'foto.jpg'), 'foto')

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(1)
    expect(bandeja[0]?.delegado).toBe('Carpeta de entrada')
    expect(bandeja[0]?.descripcion).toBe('Paciente Directo')
  })

  it('una carpeta de doctor sin ningún paciente dentro (vacía o con subcarpetas vacías) no genera ningún aviso', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra sagrario', 'paciente-sin-fotos'), { recursive: true })

    const bandeja = servicio.buscarFotosNuevas()
    expect(bandeja).toHaveLength(0)
  })

  it('buscar dos veces no duplica los avisos de un doctor dentro de una prioridad', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra sagrario', 'maricarmen'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'dra sagrario', 'maricarmen', 'foto.jpg'), 'foto')

    servicio.buscarFotosNuevas()
    const segunda = servicio.buscarFotosNuevas()
    expect(segunda).toHaveLength(1)
  })
})

/**
 * Fallo real reportado por el dueño del proyecto (30/09/2026), confirmado
 * mirando su OneDrive real: tres carpetas de doctor en Alta —«dra
 * Claudia», «dra patricia», «vicente mtnez»—, cada una ya vacía por
 * dentro (todos sus pacientes se habían movido a Importadas hacía días),
 * seguían ahí sin más. «Se van acumulando».
 */
describe('ServicioBandeja — la carpeta de grupo/doctor se limpia sola al vaciarse (D108, 30/09/2026)', () => {
  it('la carpeta de doctor desaparece en cuanto se mueve a su único paciente', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra Claudia', 'brenda'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'dra Claudia', 'brenda', 'foto.jpg'), 'foto')

    servicio.buscarFotosNuevas()

    expect(existsSync(join(entrada, 'Alta', 'dra Claudia'))).toBe(false)
    expect(existsSync(join(entrada, 'Alta'))).toBe(true)
  })

  it('con varios pacientes, la carpeta de doctor desaparece solo cuando el ÚLTIMO se mueve', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra Claudia', 'brenda'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'dra Claudia', 'brenda', 'foto.jpg'), 'foto')
    mkdirSync(join(entrada, 'Alta', 'dra Claudia', 'carmen'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'dra Claudia', 'carmen', 'foto.jpg'), 'foto')

    servicio.buscarFotosNuevas()

    expect(existsSync(join(entrada, 'Alta', 'dra Claudia'))).toBe(false)
  })

  it('si todavía queda un paciente sin fotos válidas dentro, la carpeta de doctor NO se borra', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra Claudia', 'brenda'), { recursive: true })
    writeFileSync(join(entrada, 'Alta', 'dra Claudia', 'brenda', 'foto.jpg'), 'foto')
    // «carmen» todavía no tiene ninguna foto válida — puede que se esté
    // sincronizando desde el móvil todavía.
    mkdirSync(join(entrada, 'Alta', 'dra Claudia', 'carmen'), { recursive: true })

    servicio.buscarFotosNuevas()

    expect(existsSync(join(entrada, 'Alta', 'dra Claudia'))).toBe(true)
    expect(existsSync(join(entrada, 'Alta', 'dra Claudia', 'carmen'))).toBe(true)
  })

  it('la carpeta de un doctor DIRECTAMENTE en la raíz (D102) no se toca — solo se limpian las de dentro de una prioridad', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Dr Rocha', 'Alta', 'paciente1'), { recursive: true })
    writeFileSync(join(entrada, 'Dr Rocha', 'Alta', 'paciente1', 'foto.jpg'), 'foto')

    servicio.buscarFotosNuevas()

    // Su paciente se movió a SU Importadas, pero la carpeta del doctor en
    // la raíz sigue existiendo — es su hogar permanente, no una de grupo.
    expect(existsSync(join(entrada, 'Dr Rocha'))).toBe(true)
    expect(existsSync(join(entrada, 'Dr Rocha', 'Alta', 'paciente1'))).toBe(false)
  })

  it('una carpeta que nunca ha tenido ningún paciente dentro no se toca — solo se limpian las que ESTA búsqueda acaba de vaciar', () => {
    const servicio = servicioDePrueba()
    const entrada = raizTemporal()
    servicio.configurarCarpetaEntrada(entrada)
    mkdirSync(join(entrada, 'Alta', 'dra vacia'), { recursive: true })

    expect(() => servicio.buscarFotosNuevas()).not.toThrow()
    // Nunca fue la carpeta de grupo de ningún candidato: se deja tal cual,
    // igual que una subcarpeta de paciente (D86) que todavía no tiene foto.
    expect(existsSync(join(entrada, 'Alta', 'dra vacia'))).toBe(true)
  })
})
