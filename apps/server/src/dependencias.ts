/**
 * dependencias.ts — Arma el `DependenciasServicio` que necesita `ServicioCasos`
 * (`@vilamar/casos`) para correr aquí, en un servidor Node, en vez de en la
 * app de escritorio.
 *
 * De las nueve piezas, cinco se reutilizan tal cual porque ya eran Node puro
 * (`diagnosticador`, `capturas`, `ahora`) o se han vuelto a escribir para el
 * servidor por una razón concreta y documentada en su propio fichero
 * (`proveedor` — ver `lector-pdf-provisional.ts`, provisional; `abrirNavegador`
 * — ver `navegador.ts`; `imprimirPdf` — ver `pdf.ts`; `emitirProgreso`/
 * `emitirCaso` — ver `eventos.ts`). `lectorVision` se deja sin configurar
 * todavía: el lector con IA vive en la app de escritorio y no se ha movido
 * en esta sesión.
 */

import {
  crearAlmacenCapturas,
  crearDiagnosticador,
  prepararCarpetas,
  type Carpetas,
  type DependenciasServicio,
} from '@vilamar/casos'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { EmisorEventos } from './eventos.js'
import { ProveedorPdfProvisional } from './lector-pdf-provisional.js'
import { abrirNavegadorServidor } from './navegador.js'
import { imprimirPdfServidor } from './pdf.js'

/** La versión que se enseña en el PDF — distinta de la de escritorio a propósito: son productos distintos. */
export const VERSION_SERVIDOR = 'servidor-0.1 (Fase 2: login por persona, sin probar en producción)'

/**
 * Las carpetas RAÍZ del servidor entero — no las de un caso, esas son de
 * cada usuario (`carpetasDeUsuario`, más abajo). Aquí viven solo dos cosas
 * comunes a todo el servidor: `usuarios.json` (la lista de cuentas,
 * `usuarios.ts`) y `secreto-sesion` (`secreto.ts`).
 *
 * No es el Escritorio/OneDrive del dueño —eso era una decisión pensada para
 * una única persona en su propio PC (ver `apps/desktop/src/main/almacen.ts`)—:
 * aquí es una carpeta propia del servidor, configurable por variable de
 * entorno para no obligar a una ruta fija.
 */
export interface RaicesServidor {
  readonly datos: string
  readonly informes?: string
}

export function raicesDelServidor(): RaicesServidor {
  const datos = process.env['VILAMAR_SERVER_DATOS'] ?? './datos-servidor'
  mkdirSync(datos, { recursive: true })
  const informes = process.env['VILAMAR_SERVER_INFORMES']
  return { datos, ...(informes ? { informes } : {}) }
}

/**
 * Las carpetas de UN usuario — su propio `casos/`, `documentos/`,
 * `informes/`… y su propio perfil de navegador (`sesiones`), aparte del de
 * cualquier otro. Es lo que hace que dos personas compartiendo el mismo
 * servidor no vean los casos —ni las cookies de EVO/Barrett/Kane— la una de
 * la otra: cada una recibe un `ServicioCasos` con estas carpetas, nunca las
 * mismas (`servicios-por-usuario.ts`).
 */
export function carpetasDeUsuario(raices: RaicesServidor, usuarioId: string): Carpetas {
  const datos = join(raices.datos, 'usuarios', usuarioId)
  const informes = raices.informes ? join(raices.informes, usuarioId) : undefined
  return prepararCarpetas(datos, informes)
}

export function crearDependenciasServidor(
  carpetas: Carpetas,
  eventos: EmisorEventos,
): DependenciasServicio {
  return {
    carpetas,
    proveedor: new ProveedorPdfProvisional(),
    // Sin lector de visión todavía — ver la cabecera de este fichero.
    lectorVision: undefined,
    diagnosticador: crearDiagnosticador(carpetas.diagnostico),
    capturas: crearAlmacenCapturas(carpetas.capturas),
    version: VERSION_SERVIDOR,
    ahora: () => new Date(),
    abrirNavegador: (conVentana) => abrirNavegadorServidor(conVentana, carpetas.sesiones),
    imprimirPdf: imprimirPdfServidor,
    emitirProgreso: eventos.emitirProgreso,
    emitirCaso: eventos.emitirCaso,
  }
}
