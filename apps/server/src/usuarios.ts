/**
 * usuarios.ts — La lista de personas que pueden entrar en este servidor
 * (Fase 2 del plan móvil, `docs/PLAN-APP-MOVIL.md`).
 *
 * Sin registro público a propósito: con dos o tres personas de confianza
 * (el dueño, su mujer…), añadir una cuenta es un gesto administrativo del
 * dueño, no un formulario abierto en internet — se hace con
 * `scripts/crear-usuario-servidor.mjs`. `usuarios.json` vive junto al resto
 * de datos del servidor, nunca en el repositorio (mismo patrón que
 * `doctores.json`/`bandeja.json` en la app de escritorio).
 *
 * Cada usuario tiene además su PROPIA carpeta de casos (`carpetas.ts`) — el
 * aislamiento de datos por persona no está aquí, está en qué `Carpetas` recibe
 * cada `ServicioCasos` (`servicios-por-usuario.ts`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { nuevoId } from '@vilamar/casos'

import { hashContrasena } from './auth.js'

export interface Usuario {
  readonly id: string
  /** El nombre con el que entra, único sin distinguir mayúsculas. */
  readonly usuario: string
  readonly nombre: string
  readonly hashContrasena: string
  readonly creadoEn: string
}

function rutaUsuarios(raizDatos: string): string {
  return join(raizDatos, 'usuarios.json')
}

function leerTodos(raizDatos: string): readonly Usuario[] {
  const ruta = rutaUsuarios(raizDatos)
  if (!existsSync(ruta)) return []
  return JSON.parse(readFileSync(ruta, 'utf8')) as readonly Usuario[]
}

function guardarTodos(raizDatos: string, usuarios: readonly Usuario[]): void {
  const ruta = rutaUsuarios(raizDatos)
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, JSON.stringify(usuarios, null, 2), 'utf8')
}

export function listarUsuarios(raizDatos: string): readonly Usuario[] {
  return leerTodos(raizDatos)
}

export function buscarUsuarioPorNombre(raizDatos: string, usuario: string): Usuario | undefined {
  const buscado = usuario.trim().toLowerCase()
  return leerTodos(raizDatos).find((u) => u.usuario.toLowerCase() === buscado)
}

export function buscarUsuarioPorId(raizDatos: string, id: string): Usuario | undefined {
  return leerTodos(raizDatos).find((u) => u.id === id)
}

/**
 * Da de alta una cuenta nueva. Rechaza un nombre de usuario que ya exista
 * (sin distinguir mayúsculas) — dos cuentas con el mismo nombre no podrían
 * distinguirse al entrar.
 */
export function crearUsuario(
  raizDatos: string,
  datos: { readonly usuario: string; readonly nombre: string; readonly contrasena: string },
): Usuario {
  const usuarios = leerTodos(raizDatos)
  if (buscarUsuarioPorNombre(raizDatos, datos.usuario)) {
    throw new Error(`Ya existe un usuario con el nombre «${datos.usuario}».`)
  }
  const nuevo: Usuario = {
    id: nuevoId(),
    usuario: datos.usuario.trim(),
    nombre: datos.nombre.trim(),
    hashContrasena: hashContrasena(datos.contrasena),
    creadoEn: new Date().toISOString(),
  }
  guardarTodos(raizDatos, [...usuarios, nuevo])
  return nuevo
}
