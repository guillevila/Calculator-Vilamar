/**
 * campos.ts — El catálogo único de datos biométricos.
 *
 * Este fichero es la razón por la que existe un solo modelo de datos y no tres
 * copias distintas para Kane, EVO y Barrett. Todo lo que el programa sabe sobre
 * un dato —cómo se llama, en qué unidad va, qué valores son creíbles y cuáles
 * son imposibles— está aquí y en ningún otro sitio.
 *
 * Los rangos marcados como «límite» no son opinión nuestra: son los que las
 * propias calculadoras declaran en su formulario (Barrett los imprime al lado
 * de cada campo). Los marcados como «habitual» sí son un criterio de
 * plausibilidad: fuera de ellos el dato es raro, pero puede ser correcto, así
 * que solo generan un aviso.
 */

/** Qué clase de dato es. Sirve para agrupar la pantalla de revisión. */
export type CategoriaCampo =
  | 'BIOMETRIA' // medido en el ojo por el aparato
  | 'CORNEA_POSTERIOR' // cara posterior de la córnea, cuando el aparato la mide
  | 'QUIRURGICO' // decisiones del cirujano: objetivo, incisión…
  | 'LENTE' // la lente elegida y sus constantes

export type Unidad = 'mm' | 'D' | 'µm' | '°' | 'ninguna'

export type CampoBiometrico =
  // ── Biometría ────────────────────────────────────────────────────────────
  | 'AL'
  | 'K1'
  | 'K1_EJE'
  | 'K2'
  | 'K2_EJE'
  | 'ACD'
  | 'AQD'
  | 'LT'
  | 'CCT'
  | 'WTW'
  | 'TK1'
  | 'TK1_EJE'
  | 'TK2'
  | 'TK2_EJE'
  // ── Córnea posterior ─────────────────────────────────────────────────────
  | 'PK1'
  | 'PK1_EJE'
  | 'PK2'
  | 'PK2_EJE'
  // ── Quirúrgico ───────────────────────────────────────────────────────────
  | 'REFRACCION_OBJETIVO'
  | 'SIA'
  | 'EJE_INCISION'
  // ── Córnea especial (D67): solo con LASIK/PRK/RK previos ───────────────────
  | 'REFRACCION_PRE_LASIK'
  | 'REFRACCION_POST_LASIK'
  // ── Lente ────────────────────────────────────────────────────────────────
  | 'CONSTANTE_A'
  | 'FACTOR_LENTE'
  | 'INDICE_QUERATOMETRICO'

export interface Rango {
  readonly min: number
  readonly max: number
}

export interface DefinicionCampo {
  readonly codigo: CampoBiometrico
  /** Cómo se llama en la pantalla, en español. */
  readonly etiqueta: string
  /** Cómo lo llaman los informes y las calculadoras, en inglés clínico. */
  readonly etiquetaClinica: string
  readonly categoria: CategoriaCampo
  readonly unidad: Unidad
  /** Decimales con los que se enseña y se envía. */
  readonly decimales: number
  /** Un eje se mide en grados y tiene aritmética propia (170° y 10° distan 20°). */
  readonly esEje: boolean
  /**
   * Fuera de este rango el dato es IMPOSIBLE: o está mal leído o está mal
   * escrito. Bloquea el cálculo hasta que una persona lo corrija.
   */
  readonly limite: Rango
  /**
   * Fuera de este rango el dato es RARO pero posible. Genera un aviso que se
   * puede aceptar explícitamente.
   */
  readonly habitual: Rango
  /** Una frase que explica qué es, para quien no lo tenga fresco. */
  readonly descripcion: string
}

/**
 * Rango de eje: 0–180 grados.
 *
 * Un eje de astigmatismo es una orientación, no una dirección: 175° y 355°
 * describen la misma línea. El convenio clínico es expresarlo entre 0 y 180.
 */
const EJE: Rango = { min: 0, max: 180 }

function defEje(
  codigo: CampoBiometrico,
  etiqueta: string,
  etiquetaClinica: string,
  categoria: CategoriaCampo,
  descripcion: string,
): DefinicionCampo {
  return {
    codigo,
    etiqueta,
    etiquetaClinica,
    categoria,
    unidad: '°',
    decimales: 0,
    esEje: true,
    limite: EJE,
    habitual: EJE,
    descripcion,
  }
}

export const REGISTRO_CAMPOS: Readonly<Record<CampoBiometrico, DefinicionCampo>> = {
  AL: {
    codigo: 'AL',
    etiqueta: 'Longitud axial',
    etiquetaClinica: 'Axial Length (AL)',
    categoria: 'BIOMETRIA',
    unidad: 'mm',
    decimales: 2,
    esEje: false,
    // Barrett declara 12~38 mm en su propio formulario.
    limite: { min: 12, max: 38 },
    habitual: { min: 20, max: 28 },
    descripcion: 'Longitud del ojo de delante a atrás. Es el dato que más pesa en el cálculo.',
  },
  K1: {
    codigo: 'K1',
    etiqueta: 'K1 (meridiano plano)',
    etiquetaClinica: 'K1 / Flat K',
    categoria: 'BIOMETRIA',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: 30, max: 60 }, // Barrett: 30~60 D
    habitual: { min: 38, max: 48 },
    descripcion: 'Potencia de la córnea en su meridiano más plano.',
  },
  K1_EJE: defEje(
    'K1_EJE',
    'Eje de K1',
    'K1 Axis / Flat Axis',
    'BIOMETRIA',
    'Orientación del meridiano plano de la córnea.',
  ),
  K2: {
    codigo: 'K2',
    etiqueta: 'K2 (meridiano curvo)',
    etiquetaClinica: 'K2 / Steep K',
    categoria: 'BIOMETRIA',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: 30, max: 60 },
    habitual: { min: 38, max: 50 },
    descripcion: 'Potencia de la córnea en su meridiano más curvo.',
  },
  K2_EJE: defEje(
    'K2_EJE',
    'Eje de K2',
    'K2 Axis / Steep Axis',
    'BIOMETRIA',
    'Orientación del meridiano curvo de la córnea.',
  ),
  ACD: {
    codigo: 'ACD',
    etiqueta: 'ACD (profundidad de cámara anterior)',
    etiquetaClinica: 'ACD — epithelium to lens',
    categoria: 'BIOMETRIA',
    unidad: 'mm',
    decimales: 2,
    esEje: false,
    limite: { min: 0, max: 6 }, // Barrett: 0.0~6.0 mm
    habitual: { min: 2.0, max: 4.5 },
    descripcion:
      'Distancia desde la superficie de la córnea hasta el cristalino. NO es lo mismo que AQD.',
  },
  AQD: {
    codigo: 'AQD',
    etiqueta: 'AQD (profundidad acuosa)',
    etiquetaClinica: 'AQD — endothelium to lens',
    categoria: 'BIOMETRIA',
    unidad: 'mm',
    decimales: 2,
    esEje: false,
    limite: { min: 0, max: 6 },
    habitual: { min: 1.5, max: 4.2 },
    descripcion:
      'Distancia desde el endotelio corneal hasta el cristalino. Es ACD menos el grosor corneal: son datos DISTINTOS y no se pueden sustituir el uno por el otro.',
  },
  LT: {
    codigo: 'LT',
    etiqueta: 'Grosor del cristalino',
    etiquetaClinica: 'Lens Thickness (LT)',
    categoria: 'BIOMETRIA',
    unidad: 'mm',
    decimales: 2,
    esEje: false,
    limite: { min: 2.0, max: 8.0 }, // Barrett: 2.0~8.0 mm
    habitual: { min: 3.0, max: 6.0 },
    descripcion: 'Espesor del cristalino.',
  },
  CCT: {
    codigo: 'CCT',
    etiqueta: 'Grosor corneal central',
    etiquetaClinica: 'Central Corneal Thickness (CCT)',
    categoria: 'BIOMETRIA',
    unidad: 'µm',
    decimales: 0,
    esEje: false,
    limite: { min: 300, max: 800 },
    habitual: { min: 470, max: 620 },
    descripcion: 'Espesor de la córnea en su centro, en micras.',
  },
  WTW: {
    codigo: 'WTW',
    etiqueta: 'Diámetro corneal (blanco a blanco)',
    etiquetaClinica: 'White to White (WTW)',
    categoria: 'BIOMETRIA',
    unidad: 'mm',
    decimales: 2,
    esEje: false,
    limite: { min: 8, max: 14 }, // Barrett: 8~14 mm
    habitual: { min: 10.5, max: 13.0 },
    descripcion: 'Diámetro horizontal visible de la córnea.',
  },
  TK1: {
    codigo: 'TK1',
    etiqueta: 'TK1 (queratometría total, plano)',
    etiquetaClinica: 'Total Keratometry K1 (TK1)',
    categoria: 'BIOMETRIA',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: 30, max: 60 },
    habitual: { min: 38, max: 48 },
    descripcion:
      'Como K1, pero midiendo las dos caras de la córnea en lugar de estimar la posterior.',
  },
  TK1_EJE: defEje(
    'TK1_EJE',
    'Eje de TK1',
    'TK1 Axis',
    'BIOMETRIA',
    'Orientación del meridiano plano en queratometría total.',
  ),
  TK2: {
    codigo: 'TK2',
    etiqueta: 'TK2 (queratometría total, curvo)',
    etiquetaClinica: 'Total Keratometry K2 (TK2)',
    categoria: 'BIOMETRIA',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: 30, max: 60 },
    habitual: { min: 38, max: 50 },
    descripcion:
      'Como K2, pero midiendo las dos caras de la córnea en lugar de estimar la posterior.',
  },
  TK2_EJE: defEje(
    'TK2_EJE',
    'Eje de TK2',
    'TK2 Axis',
    'BIOMETRIA',
    'Orientación del meridiano curvo en queratometría total.',
  ),

  PK1: {
    codigo: 'PK1',
    etiqueta: 'PK1 (córnea posterior, plano)',
    etiquetaClinica: 'Posterior K1 (PK1)',
    categoria: 'CORNEA_POSTERIOR',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    // La cara posterior de la córnea tiene potencia NEGATIVA.
    limite: { min: -12, max: 0 },
    habitual: { min: -7.5, max: -4.5 },
    descripcion: 'Potencia de la cara posterior de la córnea en su meridiano plano. Es negativa.',
  },
  PK1_EJE: defEje(
    'PK1_EJE',
    'Eje de PK1',
    'Posterior K1 Axis',
    'CORNEA_POSTERIOR',
    'Orientación del meridiano plano de la cara posterior.',
  ),
  PK2: {
    codigo: 'PK2',
    etiqueta: 'PK2 (córnea posterior, curvo)',
    etiquetaClinica: 'Posterior K2 (PK2)',
    categoria: 'CORNEA_POSTERIOR',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: -12, max: 0 },
    habitual: { min: -7.5, max: -4.5 },
    descripcion: 'Potencia de la cara posterior de la córnea en su meridiano curvo. Es negativa.',
  },
  PK2_EJE: defEje(
    'PK2_EJE',
    'Eje de PK2',
    'Posterior K2 Axis',
    'CORNEA_POSTERIOR',
    'Orientación del meridiano curvo de la cara posterior.',
  ),

  REFRACCION_OBJETIVO: {
    codigo: 'REFRACCION_OBJETIVO',
    etiqueta: 'Refracción objetivo',
    etiquetaClinica: 'Target Refraction',
    categoria: 'QUIRURGICO',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: -10, max: 6 },
    habitual: { min: -3, max: 0.5 },
    descripcion: 'Resultado refractivo que se busca tras la cirugía. Lo decide el cirujano.',
  },
  SIA: {
    codigo: 'SIA',
    etiqueta: 'Astigmatismo inducido por la incisión (SIA)',
    etiquetaClinica: 'Surgically Induced Astigmatism (SIA)',
    categoria: 'QUIRURGICO',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: 0, max: 2.0 }, // Barrett: 0.0~2.0 D
    habitual: { min: 0, max: 0.75 },
    descripcion: 'Astigmatismo que añade la propia incisión. Lo decide el cirujano.',
  },
  EJE_INCISION: {
    codigo: 'EJE_INCISION',
    etiqueta: 'Eje de la incisión',
    etiquetaClinica: 'Incision Location',
    categoria: 'QUIRURGICO',
    unidad: '°',
    decimales: 0,
    esEje: false, // Barrett lo admite de 0 a 360: aquí sí importa la dirección
    limite: { min: 0, max: 360 },
    habitual: { min: 0, max: 360 },
    descripcion: 'Dónde se va a hacer la incisión. Lo decide el cirujano.',
  },

  REFRACCION_PRE_LASIK: {
    codigo: 'REFRACCION_PRE_LASIK',
    etiqueta: 'Refracción antes del LASIK/PRK/RK',
    etiquetaClinica: 'Pre-Lasik Ref.',
    categoria: 'QUIRURGICO',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    // Barrett True K Toric no declara un rango junto a este campo (a
    // diferencia de casi todos los demás, que sí lo hacen) — límite propio,
    // amplio a propósito para no bloquear un historial real poco habitual.
    limite: { min: -20, max: 20 },
    habitual: { min: -12, max: 6 },
    descripcion:
      'Refracción del paciente antes de la cirugía refractiva (LASIK, PRK o queratotomía radial). Solo hace falta si el ojo tiene una córnea especial (D67): historial del paciente, no lo mide ningún biómetro.',
  },
  REFRACCION_POST_LASIK: {
    codigo: 'REFRACCION_POST_LASIK',
    etiqueta: 'Refracción después del LASIK/PRK/RK',
    etiquetaClinica: 'Post-Lasik Ref.',
    categoria: 'QUIRURGICO',
    unidad: 'D',
    decimales: 2,
    esEje: false,
    limite: { min: -20, max: 20 },
    habitual: { min: -6, max: 6 },
    descripcion:
      'Refracción del paciente después de la cirugía refractiva, antes de la catarata. Solo hace falta si el ojo tiene una córnea especial (D67): historial del paciente, no lo mide ningún biómetro.',
  },

  CONSTANTE_A: {
    codigo: 'CONSTANTE_A',
    etiqueta: 'Constante A',
    etiquetaClinica: 'A Constant',
    categoria: 'LENTE',
    unidad: 'ninguna',
    decimales: 2,
    esEje: false,
    limite: { min: 112, max: 125 }, // Barrett: (112~125)
    habitual: { min: 117, max: 120 },
    descripcion: 'Constante del modelo de lente. La publica el fabricante.',
  },
  FACTOR_LENTE: {
    codigo: 'FACTOR_LENTE',
    etiqueta: 'Factor de lente',
    etiquetaClinica: 'Lens Factor',
    categoria: 'LENTE',
    unidad: 'ninguna',
    decimales: 2,
    esEje: false,
    limite: { min: -2.0, max: 5.0 }, // Barrett: (-2.0~5.0)
    habitual: { min: 0, max: 3 },
    descripcion: 'Constante equivalente que usa la fórmula de Barrett en lugar de la constante A.',
  },
  INDICE_QUERATOMETRICO: {
    codigo: 'INDICE_QUERATOMETRICO',
    etiqueta: 'Índice queratométrico',
    etiquetaClinica: 'K Index',
    categoria: 'LENTE',
    unidad: 'ninguna',
    decimales: 4,
    esEje: false,
    limite: { min: 1.3, max: 1.4 },
    habitual: { min: 1.3315, max: 1.3375 },
    descripcion:
      'Índice con el que el aparato ha convertido curvatura en dioptrías. Cambiarlo cambia las K.',
  },
}

export const CAMPOS: readonly CampoBiometrico[] = Object.keys(REGISTRO_CAMPOS) as CampoBiometrico[]

export function definicionDe(campo: CampoBiometrico): DefinicionCampo {
  const def = REGISTRO_CAMPOS[campo]
  // El tipo lo impide, pero un caso guardado por una versión anterior podría
  // traer un código que ya no existe. Mejor un error claro que un `undefined`
  // paseándose por el cálculo.
  if (!def) throw new Error(`Campo biométrico desconocido: ${String(campo)}`)
  return def
}

export function esCampoBiometrico(valor: unknown): valor is CampoBiometrico {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(REGISTRO_CAMPOS, valor)
}

export function camposDeCategoria(categoria: CategoriaCampo): readonly CampoBiometrico[] {
  return CAMPOS.filter((c) => definicionDe(c).categoria === categoria)
}

/**
 * ¿Es un campo que normalmente pone el cirujano, y no el aparato?
 *
 * Sirve **solo para elegir el texto cuando el campo está vacío**, y conviene no
 * confundirlo con el origen de un dato:
 *
 *  - Un hueco en un campo que mide el aparato → «No consta en el informe». Es
 *    información sobre el documento: ese informe no lo trae.
 *  - Un hueco en un campo que decide el cirujano → «Pendiente de aportar». No ha
 *    fallado nada; es que todavía no lo ha puesto nadie.
 *
 * **No decide el origen de un valor que sí existe.** Si el informe trae impresa
 * la refracción objetivo, ese dato es «Del informe» aunque sea, conceptualmente,
 * una decisión del cirujano. El origen sale siempre del valor concreto, nunca
 * del tipo de campo.
 */
export function loAportaElCirujano(campo: CampoBiometrico): boolean {
  const c = definicionDe(campo).categoria
  return c === 'QUIRURGICO' || c === 'LENTE'
}

/** Formatea un valor con los decimales de su campo. No modifica el dato guardado. */
export function formatearValor(campo: CampoBiometrico, valor: number): string {
  return valor.toFixed(definicionDe(campo).decimales)
}

/** Cómo se enseña un dato completo: «41.22 D» o «530 µm». */
export function formatearConUnidad(campo: CampoBiometrico, valor: number): string {
  const def = definicionDe(campo)
  const texto = formatearValor(campo, valor)
  return def.unidad === 'ninguna' ? texto : `${texto} ${def.unidad}`
}
