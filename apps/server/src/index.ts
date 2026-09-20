/**
 * index.ts — Punto de arranque del servidor.
 *
 * Verificado en vivo el 20/09/2026 (Fase 1: EVO/Barrett/Kane reales, hasta
 * el PDF — ver `docs/PLAN-APP-MOVIL.md` y `PROJECT_STATUS.md`). La Fase 2
 * (login por persona) añade `raicesDelServidor`/`secretoDeSesion`/
 * `crearRegistroPorUsuario`, sin probar todavía contra las webs reales —
 * eso es cosa de la próxima sesión que arranque el servidor de verdad.
 */

import { raicesDelServidor } from './dependencias.js'
import { secretoDeSesion } from './secreto.js'
import { crearRegistroPorUsuario } from './servicios-por-usuario.js'
import { crearServidor } from './servidor.js'

const PUERTO = Number(process.env['PORT'] ?? 3001)

const raices = raicesDelServidor()
const secreto = secretoDeSesion(raices.datos)
const registro = crearRegistroPorUsuario(raices)
const app = crearServidor(raices, secreto, registro)

app.listen(PUERTO, () => {
  console.log(`Calculator Vilamar (servidor) escuchando en el puerto ${PUERTO}.`)
})
