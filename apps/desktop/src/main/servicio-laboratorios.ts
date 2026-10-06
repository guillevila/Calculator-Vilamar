/**
 * servicio-laboratorios.ts — A qué email se pide la lente, según el
 * fabricante (D93, 20/09/2026).
 *
 * Aparte de `ServicioCasos` a propósito, igual que `ServicioDoctores`: los
 * laboratorios no pertenecen a ningún caso concreto, viven mientras exista
 * la instalación.
 */

import type { Laboratorio } from '@vilamar/domain'

import type { Carpetas } from './almacen.js'
import { guardarLaboratorios, leerLaboratorios } from './almacen.js'

export class ServicioLaboratorios {
  constructor(
    private readonly dep: {
      readonly carpetas: Carpetas
      readonly nuevoId: () => string
    },
  ) {}

  listar(): readonly Laboratorio[] {
    return this.ordenados(leerLaboratorios(this.dep.carpetas))
  }

  /** Con `id`, edita ese laboratorio. Sin `id`, lo añade nuevo. */
  guardar(datos: {
    readonly id?: string
    readonly fabricante: string
    readonly email: string
  }): readonly Laboratorio[] {
    const fabricante = datos.fabricante.trim()
    const email = datos.email.trim()
    if (fabricante === '') throw new Error('Hace falta el nombre del fabricante.')
    if (email === '') throw new Error('Hace falta el email del laboratorio.')
    const id = datos.id ?? this.dep.nuevoId()
    const actualizado: Laboratorio = { id, fabricante, email }
    const resto = leerLaboratorios(this.dep.carpetas).filter((l) => l.id !== id)
    const siguientes = this.ordenados([...resto, actualizado])
    guardarLaboratorios(this.dep.carpetas, siguientes)
    return siguientes
  }

  eliminar(id: string): readonly Laboratorio[] {
    const siguientes = leerLaboratorios(this.dep.carpetas).filter((l) => l.id !== id)
    guardarLaboratorios(this.dep.carpetas, siguientes)
    return this.ordenados(siguientes)
  }

  /** El email guardado para ese fabricante, o `undefined` si no hay ninguno. */
  emailDe(fabricante: string): string | undefined {
    const buscado = fabricante.trim().toLowerCase()
    return leerLaboratorios(this.dep.carpetas).find(
      (l) => l.fabricante.trim().toLowerCase() === buscado,
    )?.email
  }

  private ordenados(laboratorios: readonly Laboratorio[]): readonly Laboratorio[] {
    return [...laboratorios].sort((a, b) => a.fabricante.localeCompare(b.fabricante, 'es'))
  }
}
