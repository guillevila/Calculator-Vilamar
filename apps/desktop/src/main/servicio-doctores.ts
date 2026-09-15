/**
 * servicio-doctores.ts — La agenda de doctores (D80, 15/09/2026).
 *
 * Aparte de `ServicioCasos` a propósito: los doctores no pertenecen a ningún
 * caso concreto, viven mientras exista la instalación, y `aplicarDoctor` (en
 * `ServicioCasos`) es lo único que los conecta con el caso en curso.
 */

import type { Doctor } from '@vilamar/domain'

import type { Carpetas } from './almacen.js'
import { guardarDoctores, leerDoctores } from './almacen.js'

export class ServicioDoctores {
  constructor(
    private readonly dep: {
      readonly carpetas: Carpetas
      readonly nuevoId: () => string
    },
  ) {}

  listar(): readonly Doctor[] {
    return [...leerDoctores(this.dep.carpetas)].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es'),
    )
  }

  /** Con `id`, edita ese doctor. Sin `id`, lo añade nuevo. */
  guardar(datos: {
    readonly id?: string
    readonly nombre: string
    readonly sia: number | null
    readonly ejeIncision: number | null
  }): readonly Doctor[] {
    const nombre = datos.nombre.trim()
    if (nombre === '') throw new Error('El doctor necesita un nombre.')
    const id = datos.id ?? this.dep.nuevoId()
    const actualizado: Doctor = { id, nombre, sia: datos.sia, ejeIncision: datos.ejeIncision }
    const resto = leerDoctores(this.dep.carpetas).filter((d) => d.id !== id)
    const siguientes = this.ordenados([...resto, actualizado])
    guardarDoctores(this.dep.carpetas, siguientes)
    return siguientes
  }

  eliminar(id: string): readonly Doctor[] {
    const siguientes = leerDoctores(this.dep.carpetas).filter((d) => d.id !== id)
    guardarDoctores(this.dep.carpetas, siguientes)
    return this.ordenados(siguientes)
  }

  obtener(id: string): Doctor | null {
    return leerDoctores(this.dep.carpetas).find((d) => d.id === id) ?? null
  }

  private ordenados(doctores: readonly Doctor[]): readonly Doctor[] {
    return [...doctores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
}
