/**
 * capturas.ts — Guarda, tal cual, la pantalla de cada resultado de éxito.
 *
 * A diferencia de diagnostico.ts, esto no es un cuaderno de depuración
 * rotatorio: es parte permanente del caso, la evidencia de lo que la web
 * mostró. Por eso no se poda con un máximo de expedientes, igual que no se
 * podan los casos ni los documentos guardados en almacen.ts.
 *
 * Igual que diagnostico.ts: puede contener biometría en la propia imagen, así
 * que se guarda SOLO en local, dentro de la carpeta de datos de la aplicación,
 * fuera del repositorio, y nunca se manda a ningún sitio.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DatosCaptura } from '@vilamar/integrations'

export interface AlmacenCapturas {
  readonly guardar: (datos: DatosCaptura) => Promise<string>
  readonly leer: (id: string) => Uint8Array | null
  readonly carpeta: string
}

export function crearAlmacenCapturas(carpeta: string): AlmacenCapturas {
  mkdirSync(carpeta, { recursive: true })

  return {
    carpeta,
    guardar: async (datos: DatosCaptura): Promise<string> => {
      const marca = new Date().toISOString().replace(/[:.]/g, '-')
      const id = `${datos.calculadora.toLowerCase()}-${datos.ojo.toLowerCase()}-${marca}`
      try {
        writeFileSync(join(carpeta, `${id}.png`), datos.png)
        writeFileSync(
          join(carpeta, `${id}.json`),
          JSON.stringify(
            {
              id,
              calculadora: datos.calculadora,
              ojo: datos.ojo,
              guardadoEn: new Date().toISOString(),
              aviso:
                'Esta captura puede contener biometría del paciente. Es local: no subir nunca al repositorio ni compartir sin revisar.',
            },
            null,
            2,
          ),
          'utf8',
        )
      } catch {
        // El guardado de la captura no puede tumbar un cálculo ya obtenido.
      }
      return id
    },
    leer: (id: string): Uint8Array | null => {
      try {
        return new Uint8Array(readFileSync(join(carpeta, `${id}.png`)))
      } catch {
        return null
      }
    },
  }
}
