/**
 * servidor.ts — Arma la aplicación Express de esta primera versión.
 *
 * Superficie mínima para demostrar el recorrido completo: crear un caso,
 * cargar un documento, calcular contra EVO/Barrett/Kane de verdad y sacar
 * el PDF en el disco del servidor. No es el catálogo entero de canales IPC
 * de la app de escritorio (`apps/desktop/src/compartido/ipc.ts` tiene
 * ~30) — el resto (doctores, bandeja, dashboard…) queda para cuando esta
 * primera pieza esté probada de verdad. Sin login todavía: eso es la Fase 2
 * del plan móvil, a propósito, y por ahora hay un único caso en memoria,
 * igual que la app de escritorio hoy.
 *
 * ⚠️ Esta función se puede construir sin arrancar nada en red — es
 * `express()` construyendo un objeto, no un servidor escuchando—. Arrancarlo
 * de verdad (`app.listen(...)`) es cosa de `index.ts`, que esta sesión
 * escribe pero no ejecuta (ver `docs/PLAN-APP-MOVIL.md`: se prueba en el
 * ordenador personal, no en el portátil de empresa).
 */

import express, { type Express } from 'express'
import multer from 'multer'

import type { ServicioCasos } from '@vilamar/casos'

import type { EmisorEventos } from './eventos.js'
import { archivoEntranteDesdeSubida, estadoHttpDelError, mensajeDelError } from './rutas.js'

const subida = multer({ storage: multer.memoryStorage() })

export function crearServidor(servicio: ServicioCasos, eventos: EmisorEventos): Express {
  const app = express()
  app.use(express.json())

  app.get('/casos', (_req, res) => {
    res.json(servicio.obtener())
  })

  app.post('/casos', async (_req, res) => {
    try {
      res.json(await servicio.nuevo())
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  app.post('/casos/documentos', subida.array('documentos'), async (req, res) => {
    try {
      const ficheros = (req.files ?? []) as Express.Multer.File[]
      const archivos = ficheros.map(archivoEntranteDesdeSubida)
      res.json(await servicio.cargarDocumentos(archivos))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  app.patch('/casos/medida', async (req, res) => {
    try {
      const { ojo, campo, valor, aparato } = req.body as {
        readonly ojo: Parameters<ServicioCasos['editarMedida']>[0]
        readonly campo: Parameters<ServicioCasos['editarMedida']>[1]
        readonly valor: Parameters<ServicioCasos['editarMedida']>[2]
        readonly aparato?: string
      }
      res.json(await servicio.editarMedida(ojo, campo, valor, aparato))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  app.post('/casos/confirmar', async (_req, res) => {
    try {
      res.json(await servicio.confirmarTodo())
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  app.post('/casos/calcular', async (req, res) => {
    try {
      const { calculadoras, filtro } = req.body as {
        readonly calculadoras?: Parameters<ServicioCasos['calcular']>[0]
        readonly filtro?: Parameters<ServicioCasos['calcular']>[1]
      }
      res.json(await servicio.calcular(calculadoras, filtro))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  app.post('/casos/pdf', async (_req, res) => {
    try {
      res.json(await servicio.generarPdf())
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  // Server-Sent Events: el equivalente de `alProgresar`/`alCambiarCaso` de
  // la app de escritorio (IPC), aquí para cualquiera que esté conectado.
  app.get('/eventos', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const desuscribir = eventos.suscribir((evento) => {
      res.write(`event: ${evento.tipo}\n`)
      res.write(`data: ${JSON.stringify(evento.datos)}\n\n`)
    })

    req.on('close', desuscribir)
  })

  return app
}
