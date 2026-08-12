/**
 * perfiles.ts — Qué se puede deducir de los datos de cada aparato.
 *
 * Este fichero existe para impedir una cosa concreta: que una regla que es
 * cierta para UN aparato se aplique a todos.
 *
 * El caso que lo motiva es la ACD. En un ANTERION, la ACD y la AQD están
 * definidas de forma que la diferencia entre las dos es exactamente el grosor
 * de la córnea, así que `ACD = AQD + CCT` es una identidad, no una estimación.
 * En otro aparato que llame «ACD» a otra distancia, esa misma cuenta da un
 * número plausible y equivocado — y un número plausible y equivocado es
 * justamente lo que este programa no puede producir.
 *
 * Por eso la tabla es **explícita y por defecto restrictiva**: un aparato que no
 * esté aquí, o del que no sepamos cómo define sus medidas, no deriva nada.
 * Preferimos decir «falta la ACD, escríbela» antes que rellenarla con una cuenta
 * que quizá no valga para ese informe.
 *
 * ⚠️ **Para añadir un aparato hace falta el dato, no la intuición.** Antes de
 * poner `true` en una derivación hay que poder señalar dónde dice el propio
 * informe —o su documentación— desde qué superficie mide cada distancia. Si eso
 * no se puede señalar, la respuesta es `false`.
 */

import type { Dispositivo } from '../modelo/documento.js'

/**
 * Cómo presenta un informe las constantes A de las lentes.
 *
 * Es un formato de informe, no una regla genérica, y de eso depende todo: un
 * número junto a «SRK/T» solo significa «constante A de esta lente» si sabemos que
 * el informe está montado así. En un documento cualquiera, interpretarlo sería
 * inventar una relación entre un modelo y un número que quizá no exista.
 */
export type FormatoTablaLentes =
  /**
   * Una lista de modelos y, bajo cada uno, la constante por fórmula:
   *
   *   Bausch&Lomb enVista MX60
   *   SRK/T: 119.2
   */
  | 'CONSTANTES_POR_FORMULA'
  /** Este informe no trae tabla de lentes, o no sabemos cómo la monta. */
  | 'NINGUNA'

export interface PerfilDispositivo {
  readonly dispositivo: Dispositivo
  /**
   * ¿Se puede obtener la ACD sumando AQD + CCT en los informes de este aparato?
   *
   * Solo `true` cuando la definición de AQD de ese aparato lo hace exacto: AQD
   * medida desde el endotelio y ACD desde el epitelio, con el grosor corneal
   * entre las dos.
   */
  readonly acdDesdeAqdMasCct: boolean
  /** Por qué sí o por qué no. Se enseña al usuario cuando la respuesta es que no. */
  readonly razonAcd: string
  /** Cómo lee este aparato su tabla de lentes, si la tiene. */
  readonly tablaDeLentes: FormatoTablaLentes
  /** Por qué ese formato, o por qué ninguno. */
  readonly razonTablaDeLentes: string
}

/**
 * Lo que se sabe de cada aparato.
 *
 * `DESCONOCIDO` está en la tabla a propósito, con todo a `false`. No es un hueco
 * que se nos haya pasado: es la respuesta correcta cuando no se ha reconocido el
 * informe, y tenerla escrita evita que alguien la trate como un caso «por
 * definir» y le ponga un valor por defecto permisivo.
 */
export const PERFILES: Readonly<Record<Dispositivo, PerfilDispositivo>> = {
  ANTERION: {
    dispositivo: 'ANTERION',
    acdDesdeAqdMasCct: true,
    // El propio informe imprime las dos etiquetas con su superficie de
    // referencia —«ACD (epithelium)» y «AQD (endothelium)»—, que es lo que hace
    // la suma exacta y no una aproximación. El parser de ANTERION lee esas dos
    // etiquetas literalmente; ver `packages/extraction/src/parsers/dispositivos.ts`.
    razonAcd:
      'El informe de ANTERION dice desde dónde mide cada distancia: la ACD desde el epitelio y la AQD desde el endotelio. Entre las dos está justo el grosor de la córnea.',
    // Su módulo de cataratas imprime una lista de modelos de LIO y, bajo cada
    // uno, la constante por fórmula. Es una tabla, no una constante del caso.
    tablaDeLentes: 'CONSTANTES_POR_FORMULA',
    razonTablaDeLentes:
      'ANTERION lista los modelos de lente y, debajo de cada uno, la constante que usa cada fórmula. La constante pertenece a ese modelo, no al informe.',
  },
  IOLMASTER_700: {
    dispositivo: 'IOLMASTER_700',
    acdDesdeAqdMasCct: false,
    // No publica AQD, así que la cuestión ni se plantea: no hay de qué derivar.
    razonAcd: 'El IOLMaster 700 no publica AQD, así que no hay nada de lo que derivar la ACD.',
    tablaDeLentes: 'NINGUNA',
    razonTablaDeLentes:
      'No se ha comprobado cómo presenta el IOLMaster 700 sus constantes de lente, así que no se interpretan.',
  },
  PENTACAM: {
    dispositivo: 'PENTACAM',
    acdDesdeAqdMasCct: false,
    // Es un topógrafo y su «ACD» no viene con la superficie de referencia
    // impresa al lado. Sin eso escrito, sumarle el CCT sería suponer.
    razonAcd:
      'En el informe del Pentacam no consta desde qué superficie mide la ACD, así que sumarle el grosor corneal sería suponer.',
    tablaDeLentes: 'NINGUNA',
    razonTablaDeLentes: 'El Pentacam es un topógrafo y no propone modelos de lente.',
  },
  DESCONOCIDO: {
    dispositivo: 'DESCONOCIDO',
    acdDesdeAqdMasCct: false,
    razonAcd:
      'No se ha reconocido el aparato, así que no se sabe cómo define sus medidas. En algunos aparatos la ACD es la AQD más el grosor corneal y en otros no.',
    // Y aquí está la razón de que esto sea un perfil y no una expresión regular
    // suelta: en un documento cualquiera, un número junto a «SRK/T» puede ser
    // cualquier cosa. Emparejarlo con el texto de arriba inventaría una relación
    // entre un modelo y una constante que quizá no exista en ese papel.
    tablaDeLentes: 'NINGUNA',
    razonTablaDeLentes:
      'No se ha reconocido el aparato, así que no se sabe si un número junto a «SRK/T» es la constante A de la lente de arriba o cualquier otra cosa.',
  },
}

export function perfilDe(dispositivo: Dispositivo): PerfilDispositivo {
  const p = PERFILES[dispositivo]
  // El tipo lo impide, pero un caso guardado por una versión anterior podría
  // traer un aparato que ya no existe. Ante la duda, el perfil más restrictivo.
  return p ?? PERFILES.DESCONOCIDO
}
