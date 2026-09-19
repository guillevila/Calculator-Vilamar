/**
 * index.ts — Punto de arranque del servidor.
 *
 * ⚠️ **Escrito en esta sesión, sin ejecutar todavía.** Se está trabajando en
 * el portátil de empresa del dueño del proyecto, y `docs/PLAN-APP-MOVIL.md`
 * pide expresamente no arrancar nada en red ni lanzar Playwright ahí —
 * puertos y Chromium en segundo plano dentro de la carpeta de OneDrive
 * corporativo. Arrancar esto de verdad (`pnpm --filter @vilamar/server dev`)
 * es la primera prueba pendiente, en el ordenador personal.
 */

import { ServicioCasos } from '@vilamar/casos'

import { carpetasDelServidor, crearDependenciasServidor } from './dependencias.js'
import { crearEmisorEventos } from './eventos.js'
import { crearServidor } from './servidor.js'

const PUERTO = Number(process.env['PORT'] ?? 3001)

const carpetas = carpetasDelServidor()
const eventos = crearEmisorEventos()
const servicio = new ServicioCasos(crearDependenciasServidor(carpetas, eventos))
const app = crearServidor(servicio, eventos)

app.listen(PUERTO, () => {
  console.log(`Calculator Vilamar (servidor) escuchando en el puerto ${PUERTO}.`)
})
