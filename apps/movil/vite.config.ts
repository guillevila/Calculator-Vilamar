/**
 * vite.config.ts — Servidor de desarrollo de la PWA (Fase 3 del plan móvil).
 *
 * En desarrollo, todas las rutas de la API (`/login`, `/casos*`, `/eventos`…)
 * se reenvían al servidor real (`apps/server`) mediante el proxy de Vite —
 * así el navegador ve un único origen y no hace falta configurar CORS ni
 * tocar la cookie de sesión (que en `apps/server` es `SameSite=Lax`: viaja
 * bien entre puertos de `localhost`, pero solo si el origen es EL MISMO desde
 * el punto de vista del navegador, que es justo lo que da el proxy).
 *
 * En producción, esta app se sirve compilada como ficheros estáticos DESDE el
 * propio `apps/server` (mismo origen, sin proxy) — pendiente de montar
 * cuando se despliegue de verdad (ver `docs/PLAN-APP-MOVIL.md`).
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PUERTO_SERVIDOR = process.env['VILAMAR_MOVIL_SERVIDOR_PUERTO'] ?? '3001'
const DESTINO = `http://127.0.0.1:${PUERTO_SERVIDOR}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/login': DESTINO,
      '/logout': DESTINO,
      '/quien-soy': DESTINO,
      '/casos': DESTINO,
      '/eventos': DESTINO,
    },
  },
})
