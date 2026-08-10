/**
 * diagnostico.ts — El cuaderno de bitácora de los adaptadores.
 *
 * Las webs van a cambiar. Cuando una lo haga, hay que poder saber QUÉ ha
 * cambiado sin reproducirlo a ciegas. Este módulo guarda, en local:
 *
 *   - qué adaptador falló y en qué fase,
 *   - qué dirección tenía delante,
 *   - qué selector esperaba encontrar,
 *   - el error técnico,
 *   - una captura de pantalla.
 *
 * Lo que NO guarda: ningún dato del paciente. Ni en el texto, ni en el nombre
 * del fichero. Las capturas son de una web externa rellenada con los datos del
 * caso, así que **pueden contener biometría**: se guardan porque son
 * imprescindibles para reparar un adaptador, y se guardan SOLO en local, dentro
 * de la carpeta de datos de la aplicación, que está fuera del repositorio.
 *
 * Se limita el número de expedientes para que esto no crezca sin freno.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DatosDiagnostico } from '@vilamar/integrations'

/** Cuántos expedientes se conservan. Los más viejos se borran. */
const MAXIMO_EXPEDIENTES = 40

export interface Diagnosticador {
  readonly guardar: (datos: DatosDiagnostico) => Promise<string>
  readonly carpeta: string
}

export function crearDiagnosticador(carpeta: string): Diagnosticador {
  mkdirSync(carpeta, { recursive: true })

  return {
    carpeta,
    guardar: async (datos: DatosDiagnostico): Promise<string> => {
      const marca = new Date().toISOString().replace(/[:.]/g, '-')
      const id = `${datos.calculadora.toLowerCase()}-${marca}`
      const destino = join(carpeta, id)
      try {
        mkdirSync(destino, { recursive: true })

        const informe = {
          id,
          adaptador: datos.calculadora,
          fase: datos.fase,
          url: datos.url,
          selectorEsperado: datos.selectorEsperado ?? null,
          errorTecnico: datos.errorTecnico,
          cuando: new Date().toISOString(),
          aviso:
            'Este expediente puede contener biometría en la captura de pantalla. Es local: no subir nunca al repositorio ni compartir sin revisar.',
        }
        writeFileSync(join(destino, 'informe.json'), JSON.stringify(informe, null, 2), 'utf8')

        // Un resumen en texto plano, para poder leerlo de un vistazo dentro de
        // seis meses sin abrir el JSON.
        writeFileSync(
          join(destino, 'resumen.txt'),
          [
            `Adaptador : ${datos.calculadora}`,
            `Fase      : ${datos.fase}`,
            `URL       : ${datos.url}`,
            `Esperaba  : ${datos.selectorEsperado ?? '(no aplica)'}`,
            `Error     : ${datos.errorTecnico}`,
            `Cuando    : ${informe.cuando}`,
            '',
            'Si el selector esperado ya no existe en esa web, el adaptador que hay',
            `que actualizar está en packages/integrations/src/adapters/.`,
          ].join('\n'),
          'utf8',
        )

        if (datos.captura) writeFileSync(join(destino, 'pantalla.png'), datos.captura)

        limpiarViejos(carpeta)
      } catch {
        // Que falle el diagnóstico no puede tumbar el cálculo. Es un cuaderno,
        // no una parte del proceso.
      }
      return id
    },
  }
}

function limpiarViejos(carpeta: string): void {
  try {
    const entradas = readdirSync(carpeta).sort()
    if (entradas.length <= MAXIMO_EXPEDIENTES) return
    for (const vieja of entradas.slice(0, entradas.length - MAXIMO_EXPEDIENTES)) {
      rmSync(join(carpeta, vieja), { recursive: true, force: true })
    }
  } catch {
    // ídem
  }
}
