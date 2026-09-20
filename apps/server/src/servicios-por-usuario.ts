/**
 * servicios-por-usuario.ts — Un `ServicioCasos` (y sus avisos) por cada
 * persona que entra, no uno global.
 *
 * Antes de la Fase 2 (login) había un único `ServicioCasos` para todo el
 * servidor — «un único caso en memoria, igual que hoy en escritorio», pero
 * compartido por cualquiera que llamara a la API. Con login, cada usuario
 * tiene que ver SU PROPIO caso, calculado con SU PROPIO perfil de navegador
 * (para que la aceptación de Kane, por ejemplo, sea de cada persona, no
 * prestada) — exactamente lo que pide `docs/PLAN-APP-MOVIL.md` para la Fase
 * 2: «equivalente a como hoy cada PC tiene la suya, solo que compartiendo
 * máquina».
 *
 * Se crea perezosamente: la primera vez que un usuario hace cualquier
 * petición, y se queda en memoria mientras el servidor sigue arriba —igual
 * que el caso único de antes, solo que ahora hay uno por persona. Si el
 * servidor se reinicia, cada persona empieza con un caso en blanco otra vez
 * (`ServicioCasos.nuevo()`), como ya pasaba antes del login: lo que persiste
 * entre reinicios son los CASOS GUARDADOS en disco (`listarCasosGuardados`),
 * no el que estuviera en memoria en ese momento.
 */

import { ServicioCasos } from '@vilamar/casos'

import { carpetasDeUsuario, crearDependenciasServidor, type RaicesServidor } from './dependencias.js'
import { crearEmisorEventos, type EmisorEventos } from './eventos.js'

export interface ServiciosDeUsuario {
  readonly servicio: ServicioCasos
  readonly eventos: EmisorEventos
}

export interface RegistroPorUsuario {
  obtener(usuarioId: string): ServiciosDeUsuario
}

export function crearRegistroPorUsuario(raices: RaicesServidor): RegistroPorUsuario {
  const porUsuario = new Map<string, ServiciosDeUsuario>()

  return {
    obtener(usuarioId: string): ServiciosDeUsuario {
      const existente = porUsuario.get(usuarioId)
      if (existente) return existente

      const carpetas = carpetasDeUsuario(raices, usuarioId)
      const eventos = crearEmisorEventos()
      const servicio = new ServicioCasos(crearDependenciasServidor(carpetas, eventos))
      const creado: ServiciosDeUsuario = { servicio, eventos }
      porUsuario.set(usuarioId, creado)
      return creado
    },
  }
}
