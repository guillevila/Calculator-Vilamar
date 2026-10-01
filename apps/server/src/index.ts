/**
 * index.ts — Punto de arranque del servidor.
 *
 * Verificado en vivo el 20/09/2026 (Fase 1: EVO/Barrett/Kane reales, hasta
 * el PDF — ver `docs/PLAN-APP-MOVIL.md` y `PROJECT_STATUS.md`). La Fase 2
 * (login por persona) añade `raicesDelServidor`/`secretoDeSesion`/
 * `crearRegistroPorUsuario`, sin probar todavía contra las webs reales —
 * eso es cosa de la próxima sesión que arranque el servidor de verdad.
 */

import { cargarEnv } from './ajustes.js'
import { raicesDelServidor } from './dependencias.js'
import { secretoDeSesion } from './secreto.js'
import { crearRegistroPorUsuario } from './servicios-por-usuario.js'
import { crearServidor } from './servidor.js'

const PUERTO = Number(process.env['PORT'] ?? 3001)

const raices = raicesDelServidor()

// Antes que nada: si hay un `.env` con ANTHROPIC_API_KEY, se carga. Tiene que
// ir aquí arriba porque el lector de visión (`dependencias.ts`) mira la
// variable de entorno al construirse, y una clave cargada después no la
// vería nadie.
const ficheroEnvUsado = cargarEnv(raices.datos)

const secreto = secretoDeSesion(raices.datos)
const registro = crearRegistroPorUsuario(raices)
const app = crearServidor(raices, secreto, registro)

app.listen(PUERTO, () => {
  console.log(`Calculator Vilamar (servidor) escuchando en el puerto ${PUERTO}.`)

  // Nunca se imprime la clave — solo si hay una puesta. Es la única forma de
  // comprobar, sin adivinar, si una foto subida se va a leer con IA o va a
  // caer al lector local (ver `dependencias.ts`).
  const clave = process.env['ANTHROPIC_API_KEY']
  if (typeof clave === 'string' && clave.trim().length > 0) {
    console.log(`Lector de visión (IA): ACTIVO. Clave leída de: ${ficheroEnvUsado ?? '(variable de entorno)'}`)
  } else {
    console.log(
      'Lector de visión (IA): NO activo — no se ha encontrado ANTHROPIC_API_KEY. Las fotos y PDF escaneados no se podrán leer; solo el texto nativo de un PDF.',
    )
  }
})
