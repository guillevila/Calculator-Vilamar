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

import type { EmisorEventos } from './eventos.js'
import { ProveedorPdfProvisional } from './lector-pdf-provisional.js'
import { abrirNavegadorServidor } from './navegador.js'
import { imprimirPdfServidor } from './pdf.js'

/** La versión que se enseña en el PDF — distinta de la de escritorio a propósito: son productos distintos. */
export const VERSION_SERVIDOR = 'servidor-0.1 (Fase 1, sin probar en producción)'

/**
 * Dónde guarda sus datos el servidor. No es el Escritorio/OneDrive del
 * dueño —eso era una decisión pensada para una única persona en su propio
 * PC (ver `apps/desktop/src/main/almacen.ts`)—: aquí es una carpeta propia
 * del servidor, configurable por variable de entorno para no obligar a una
 * ruta fija.
 */
export function carpetasDelServidor(): Carpetas {
  const rutaDatos = process.env['VILAMAR_SERVER_DATOS'] ?? './datos-servidor'
  const rutaInformes = process.env['VILAMAR_SERVER_INFORMES']
  return prepararCarpetas(rutaDatos, rutaInformes)
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
