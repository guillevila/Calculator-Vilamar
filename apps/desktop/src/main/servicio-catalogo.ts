/**
 * servicio-catalogo.ts — Guardar, editar y borrar el catálogo de lentes propio.
 *
 * A diferencia de `ServicioCasos`, este no tiene estado en memoria ni depende
 * de que haya un caso abierto: lee y escribe el fichero en cada operación. El
 * catálogo es una lista pequeña que una persona edita a mano de vez en cuando,
 * no algo que haga falta cachear.
 */

import type { LenteDeCatalogo, LenteDeCatalogoEntrada } from '@vilamar/domain'
import { erroresDeLenteCatalogo } from '@vilamar/domain'

import type { Carpetas } from './almacen.js'
import { guardarCatalogo, leerCatalogo, nuevoId } from './almacen.js'

export class ServicioCatalogo {
  constructor(private readonly carpetas: Carpetas) {}

  listar(): readonly LenteDeCatalogo[] {
    return ordenado(leerCatalogo(this.carpetas))
  }

  /**
   * Añade una lente nueva o, si `id` viene informado, sustituye la que tenía
   * ese id. Devuelve el catálogo completo ya actualizado.
   */
  guardar(id: string | undefined, entrada: LenteDeCatalogoEntrada): readonly LenteDeCatalogo[] {
    const errores = erroresDeLenteCatalogo(entrada)
    if (errores.length > 0) throw new Error(errores.join(' '))

    const lente: LenteDeCatalogo = { ...entrada, id: id ?? nuevoId() }
    const actualizado = ordenado([
      ...leerCatalogo(this.carpetas).filter((l) => l.id !== lente.id),
      lente,
    ])
    guardarCatalogo(this.carpetas, actualizado)
    return actualizado
  }

  borrar(id: string): readonly LenteDeCatalogo[] {
    const actualizado = leerCatalogo(this.carpetas).filter((l) => l.id !== id)
    guardarCatalogo(this.carpetas, actualizado)
    return actualizado
  }
}

/** Alfabético por modelo, para que la lista no cambie de orden sola entre ediciones. */
function ordenado(catalogo: readonly LenteDeCatalogo[]): readonly LenteDeCatalogo[] {
  return [...catalogo].sort((a, b) => a.modelo.localeCompare(b.modelo))
}
