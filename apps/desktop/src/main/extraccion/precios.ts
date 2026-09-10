/**
 * precios.ts — Lo que cuesta cada modelo, para poder decidir con un número.
 *
 * Está aquí y no en un comentario porque la pregunta «¿compensa el modelo caro?»
 * solo se responde midiendo aciertos Y coste a la vez. Un modelo que acierta un
 * 2 % más por cinco veces el precio es una mala compra; uno que acierta un 20 %
 * más por el doble es una compra excelente. Sin las dos cifras juntas no se sabe
 * cuál de los dos casos tienes delante.
 *
 * PRECIOS DE TARIFA PÚBLICA, en dólares por millón de tokens, anotados el
 * 11/08/2026. No son un contrato: si la tarifa cambia, esta tabla se queda
 * antigua en silencio. Por eso el comparador imprime la fecha junto al coste.
 */

export interface Tarifa {
  readonly entrada: number
  readonly salida: number
  /** Tamaño mínimo para que el prompt se pueda cachear, en tokens. */
  readonly minimoCache: number
  /** Resolución máxima de imagen que aprovecha, en píxeles del lado largo. */
  readonly ladoMaximoImagen: number
}

export const ANOTADO_EL = '11/08/2026'

export const TARIFAS: Readonly<Record<string, Tarifa>> = {
  // El más barato. No entra en el nivel de alta resolución: recorta las
  // imágenes a 1568 px, que en un informe con cifras pequeñas puede notarse.
  'claude-haiku-4-5': { entrada: 1, salida: 5, minimoCache: 4096, ladoMaximoImagen: 1568 },
  // Iba a subir a 3 y 15 el 01/09/2026 (nota de lanzamiento); no ha subido,
  // este precio se quedó fijo. Comprobado el 04/09/2026.
  'claude-sonnet-5': { entrada: 2, salida: 10, minimoCache: 1024, ladoMaximoImagen: 2576 },
  'claude-opus-5': { entrada: 5, salida: 25, minimoCache: 512, ladoMaximoImagen: 2576 },
  'claude-opus-4-8': { entrada: 5, salida: 25, minimoCache: 1024, ladoMaximoImagen: 2576 },
}

export interface Uso {
  readonly entrada: number
  readonly salida: number
  readonly cacheEscrito: number
  readonly cacheLeido: number
}

/**
 * Cuánto ha costado una lectura, en dólares.
 *
 * Una lectura desde caché cuesta la décima parte; escribirla, un 25 % más. Se
 * cuentan las cuatro cosas por separado porque si no, un ahorro por caché
 * parecería un modelo más barato de lo que es.
 */
export function coste(modelo: string, uso: Uso): number {
  const t = TARIFAS[modelo]
  if (!t) throw new Error(`No hay tarifa anotada para «${modelo}».`)
  const porMillon = (tokens: number, precio: number): number => (tokens / 1_000_000) * precio
  return (
    porMillon(uso.entrada, t.entrada) +
    porMillon(uso.cacheEscrito, t.entrada * 1.25) +
    porMillon(uso.cacheLeido, t.entrada * 0.1) +
    porMillon(uso.salida, t.salida)
  )
}

/** En euros y céntimos, que es como se piensa el gasto. */
export function enCentimos(dolares: number): string {
  // Cambio aproximado. Sirve para hacerse una idea, no para contabilidad.
  const euros = dolares * 0.92
  return euros < 0.01 ? `${(euros * 100).toFixed(2)} c` : `${(euros * 100).toFixed(1)} c`
}
