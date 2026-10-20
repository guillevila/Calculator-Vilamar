/**
 * version-visible.test.ts — El número que se ve en pantalla no se puede quedar
 * atrás (lección del 21/10/2026).
 *
 * El dueño pidió (15/09/2026) que la barra superior suba 0,01 con cada versión
 * que se le entrega, para saber de un vistazo si está en la última. Se olvidó
 * durante semanas. Esta prueba lo vigila: la cabecera más reciente de
 * `docs/CHANGELOG.md` dice qué versión visible lleva, y tiene que ser la misma
 * que `VERSION_VISIBLE` en `index.ts`.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

describe('la versión visible en pantalla', () => {
  it('coincide con la que declara la entrada más reciente del changelog', () => {
    const changelog = readFileSync(join(raiz, 'docs', 'CHANGELOG.md'), 'utf8')
    const cabecera = /^## \[[^\]]+\][^\n]*versión visible en pantalla: v(\d+\.\d+)\)/m.exec(
      changelog,
    )
    expect(cabecera, 'el changelog no declara la versión visible').not.toBeNull()

    const fuente = readFileSync(join(raiz, 'apps', 'desktop', 'src', 'main', 'index.ts'), 'utf8')
    const constante = /const VERSION_VISIBLE = '(\d+\.\d+)'/.exec(fuente)
    expect(constante, 'no se encuentra VERSION_VISIBLE en index.ts').not.toBeNull()

    expect(constante?.[1]).toBe(cabecera?.[1])
  })
})
