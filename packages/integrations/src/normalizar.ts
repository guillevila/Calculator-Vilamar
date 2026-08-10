/**
 * normalizar.ts — Convertir lo que dice una web en números del modelo.
 *
 * Las webs devuelven cosas como «21.5», «81°», «-0.06», «0.72 Cyl Axis 81» o
 * «22.0 S.E (Biconvex)». Aquí se convierten en números, y solo eso.
 *
 * Lo que NO se hace aquí: rellenar un campo que la web no ha dado. Si Kane no
 * publica cilindro, el cilindro se queda sin poner y la tabla enseñará «N/A».
 * Inventar una equivalencia sería exactamente lo que este programa no hace.
 */

const MENOS = /[−–—]/g

/**
 * Saca el primer número de un texto. `undefined` si no hay ninguno.
 *
 * Devuelve `undefined` y no `0` a propósito: un resultado que la web no ha dado
 * no es un cero.
 */
export function leerNumeroDeTexto(texto: string | undefined | null): number | undefined {
  if (texto === undefined || texto === null) return undefined
  const limpio = texto.replace(MENOS, '-')
  const m = /-?\d+(?:[.,]\d+)?/.exec(limpio)
  if (!m) return undefined
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Todos los números de un texto, en orden. */
export function leerNumerosDeTexto(texto: string | undefined | null): readonly number[] {
  if (!texto) return []
  const limpio = texto.replace(MENOS, '-')
  return [...limpio.matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((m) => Number(m[0].replace(',', '.')))
    .filter((n) => Number.isFinite(n))
}

/**
 * Lee el astigmatismo residual como lo escribe Barrett:
 * «0.03 Cyl Axis 81» → { magnitud: 0.03, eje: 81 }
 *
 * Si el texto no tiene esa forma, devuelve lo que haya podido leer y deja el
 * resto sin poner.
 */
export function leerCilindroConEje(texto: string | undefined | null): {
  magnitud?: number
  eje?: number
} {
  const numeros = leerNumerosDeTexto(texto)
  if (numeros.length === 0) return {}
  if (numeros.length === 1) return { magnitud: numeros[0] }
  return { magnitud: numeros[0], eje: numeros[numeros.length - 1] }
}
