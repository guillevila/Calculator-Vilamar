/**
 * servidor.ts — Arma la aplicación Express de esta primera versión.
 *
 * Superficie mínima para demostrar el recorrido completo: entrar con una
 * cuenta, crear un caso, cargar un documento, calcular contra EVO/Barrett/Kane
 * de verdad y sacar el PDF en el disco del servidor. No es el catálogo entero
 * de canales IPC de la app de escritorio (`apps/desktop/src/compartido/ipc.ts`
 * tiene ~30) — el resto (doctores, bandeja, dashboard…) queda para más
 * adelante.
 *
 * **Fase 2 (20/09/2026): login por persona.** Cada usuario ve su propio
 * caso, con su propio perfil de navegador — `servicios-por-usuario.ts` crea
 * un `ServicioCasos` por cuenta, nunca uno compartido. Todas las rutas de
 * `/casos*` y `/eventos` exigen la cookie de sesión (`requiereSesion`); sin
 * ella, 401. Entrar es `POST /login` con `{ usuario, contrasena }`; sin
 * cuenta previa no hay forma de entrar — se crea con
 * `pnpm crear-usuario-servidor`, a propósito sin registro público.
 *
 * ⚠️ Esta función se puede construir sin arrancar nada en red — es
 * `express()` construyendo un objeto, no un servidor escuchando—. Arrancarlo
 * de verdad (`app.listen(...)`) es cosa de `index.ts`.
 */

import { existsSync } from 'node:fs'
import { relative } from 'node:path'

import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'

import type { ServicioCasos } from '@vilamar/casos'

import { crearToken, verificarContrasena, verificarToken } from './auth.js'
import { borrarCookieSesion, leerCookie, NOMBRE_COOKIE_SESION, ponerCookieSesion } from './cookies.js'
import { carpetasDeUsuario, type RaicesServidor } from './dependencias.js'
import { archivoEntranteDesdeSubida, estadoHttpDelError, mensajeDelError, rutaDescargaSegura } from './rutas.js'
import type { RegistroPorUsuario } from './servicios-por-usuario.js'
import { buscarUsuarioPorId, buscarUsuarioPorNombre } from './usuarios.js'

const subida = multer({ storage: multer.memoryStorage() })

/** Una petición ya pasada por `requiereSesion`: trae el id de quien entró. */
interface PeticionConSesion extends Request {
  usuarioId: string
}

export function crearServidor(
  raices: RaicesServidor,
  secreto: Buffer,
  registro: RegistroPorUsuario,
): Express {
  const app = express()
  app.use(express.json())

  // Cookie sin `Secure` en desarrollo local por HTTP; en el VPS, con HTTPS
  // de verdad, tiene que ir con `VILAMAR_SERVER_COOKIE_SEGURA=1`.
  const cookieSegura = process.env['VILAMAR_SERVER_COOKIE_SEGURA'] === '1'

  app.post('/login', (req, res) => {
    const { usuario, contrasena } = req.body as { readonly usuario?: string; readonly contrasena?: string }
    if (!usuario || !contrasena) {
      res.status(400).json({ error: 'Hacen falta «usuario» y «contrasena».' })
      return
    }
    const cuenta = buscarUsuarioPorNombre(raices.datos, usuario)
    if (!cuenta || !verificarContrasena(contrasena, cuenta.hashContrasena)) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' })
      return
    }
    ponerCookieSesion(res, crearToken(cuenta.id, secreto), cookieSegura)
    res.json({ id: cuenta.id, usuario: cuenta.usuario, nombre: cuenta.nombre })
  })

  app.post('/logout', (_req, res) => {
    borrarCookieSesion(res, cookieSegura)
    res.json({ ok: true })
  })

  /** El id que dejó `requiereSesion` en la petición — solo válido DESPUÉS de pasar por ella. */
  function usuarioIdDe(req: Request): string {
    return (req as PeticionConSesion).usuarioId
  }

  function requiereSesion(req: Request, res: Response, next: NextFunction): void {
    const token = leerCookie(req, NOMBRE_COOKIE_SESION)
    const usuarioId = token ? verificarToken(token, secreto) : null
    if (!usuarioId || !buscarUsuarioPorId(raices.datos, usuarioId)) {
      res.status(401).json({ error: 'Sesión no válida o caducada. Entra de nuevo con /login.' })
      return
    }
    ;(req as PeticionConSesion).usuarioId = usuarioId
    next()
  }

  app.get('/quien-soy', requiereSesion, (req, res) => {
    const cuenta = buscarUsuarioPorId(raices.datos, usuarioIdDe(req))
    res.json({ id: cuenta?.id, usuario: cuenta?.usuario, nombre: cuenta?.nombre })
  })

  const casos = express.Router()
  casos.use(requiereSesion)

  function servicioDe(req: Request): ServicioCasos {
    return registro.obtener(usuarioIdDe(req)).servicio
  }

  casos.get('/', (req, res) => {
    res.json(servicioDe(req).obtener())
  })

  casos.post('/', async (req, res) => {
    try {
      res.json(await servicioDe(req).nuevo())
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.post('/documentos', subida.array('documentos'), async (req, res) => {
    try {
      const ficheros = (req.files ?? []) as Express.Multer.File[]
      const archivos = ficheros.map(archivoEntranteDesdeSubida)
      res.json(await servicioDe(req).cargarDocumentos(archivos))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.patch('/identificacion', async (req, res) => {
    try {
      const { nombrePaciente, nombreCirujano } = req.body as {
        readonly nombrePaciente?: string
        readonly nombreCirujano?: string
      }
      res.json(await servicioDe(req).establecerIdentificacion({ nombrePaciente, nombreCirujano }))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.patch('/sexo', async (req, res) => {
    try {
      const { sexo } = req.body as { readonly sexo: Parameters<ServicioCasos['elegirSexo']>[0] }
      res.json(await servicioDe(req).elegirSexo(sexo))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  // Sin catálogo de lentes en el móvil a propósito (Fase 3, ver
  // docs/PLAN-APP-MOVIL.md): el modelo se escribe a mano, y la constante A
  // conocida, si la hay, se le manda directamente — `elegirLente` sigue
  // siendo el único sitio donde una constante se convierte en la del caso,
  // así que el resto de reglas (D33) no cambia, solo se salta la búsqueda
  // en la tabla de lentes conocidas de la interfaz de escritorio.
  casos.post('/lente', async (req, res) => {
    try {
      const { fabricante, modelo, constanteConocida } = req.body as {
        readonly fabricante?: string
        readonly modelo: string
        readonly constanteConocida?: number
      }
      res.json(
        await servicioDe(req).elegirLente(fabricante ?? '', modelo, undefined, undefined, constanteConocida),
      )
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.patch('/medida', async (req, res) => {
    try {
      const { ojo, campo, valor, aparato } = req.body as {
        readonly ojo: Parameters<ServicioCasos['editarMedida']>[0]
        readonly campo: Parameters<ServicioCasos['editarMedida']>[1]
        readonly valor: Parameters<ServicioCasos['editarMedida']>[2]
        readonly aparato?: string
      }
      res.json(await servicioDe(req).editarMedida(ojo, campo, valor, aparato))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.post('/confirmar', async (req, res) => {
    try {
      res.json(await servicioDe(req).confirmarTodo())
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.post('/calcular', async (req, res) => {
    try {
      const { calculadoras, filtro } = req.body as {
        readonly calculadoras?: Parameters<ServicioCasos['calcular']>[0]
        readonly filtro?: Parameters<ServicioCasos['calcular']>[1]
      }
      res.json(await servicioDe(req).calcular(calculadoras, filtro))
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  // El PDF vive en el disco del SERVIDOR: `generarPdf()` devuelve una ruta
  // absoluta de ahí (útil para la app de escritorio, que es la misma
  // máquina) — un móvil no puede pedir esa ruta directamente. Aquí se
  // convierte en un enlace de descarga propio, relativo a la carpeta de
  // informes de ESTE usuario, nunca la ruta real del disco.
  casos.post('/pdf', async (req, res) => {
    try {
      const carpetas = carpetasDeUsuario(raices, usuarioIdDe(req))
      const { rutas } = await servicioDe(req).generarPdf()
      res.json({
        rutas: rutas.map((r) => ({
          ojo: r.ojo,
          descarga: `/casos/pdf/archivo?ruta=${encodeURIComponent(relative(carpetas.informes, r.ruta))}`,
        })),
      })
    } catch (error) {
      res.status(estadoHttpDelError(error)).json({ error: mensajeDelError(error) })
    }
  })

  casos.get('/pdf/archivo', (req, res) => {
    const relativo = req.query['ruta']
    if (typeof relativo !== 'string') {
      res.status(400).json({ error: 'Falta el parámetro «ruta».' })
      return
    }
    const carpetas = carpetasDeUsuario(raices, usuarioIdDe(req))
    const ruta = rutaDescargaSegura(carpetas.informes, relativo)
    if (!ruta || !existsSync(ruta)) {
      res.status(404).json({ error: 'No se encuentra ese informe.' })
      return
    }
    res.download(ruta)
  })

  app.use('/casos', casos)

  // Server-Sent Events: el equivalente de `alProgresar`/`alCambiarCaso` de
  // la app de escritorio (IPC), aquí para cualquiera que esté conectado —
  // pero solo a SUS PROPIOS avisos: cada usuario tiene su propio
  // `EmisorEventos` (`servicios-por-usuario.ts`), nunca uno compartido.
  app.get('/eventos', requiereSesion, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const { eventos } = registro.obtener(usuarioIdDe(req))
    const desuscribir = eventos.suscribir((evento) => {
      res.write(`event: ${evento.tipo}\n`)
      res.write(`data: ${JSON.stringify(evento.datos)}\n\n`)
    })

    req.on('close', desuscribir)
  })

  return app
}
