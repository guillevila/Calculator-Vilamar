/**
 * validar.ts — Detectar errores evidentes sin tocar los datos.
 *
 * Regla de oro de este fichero: **la validación no corrige nada**. Ni redondea,
 * ni cambia unidades, ni intercambia K1 y K2, ni mueve un punto decimal. Mira,
 * clasifica y avisa. Corregir es de la persona.
 *
 * Esto no es purismo: un OCR que lee «240.7» donde ponía «24.07» tiene un fallo
 * que hay que ver. Si el programa lo arregla solo, el fallo se vuelve invisible
 * y la próxima vez que se equivoque —en un dígito que sí sea plausible— nadie
 * se enterará.
 */

import type { CampoBiometrico } from '../modelo/campos.js'
import { definicionDe, formatearConUnidad } from '../modelo/campos.js'
import type { Lateralidad } from '../modelo/lateralidad.js'
import type { OjoBiometrico } from '../modelo/medida.js'
import { obtener, tiene, valorDe } from '../modelo/medida.js'
import { comparacionAcd, TOLERANCIA_ACD_MM } from '../normalizacion/normalizar.js'

export type NivelValidacion = 'VALID' | 'WARNING' | 'INVALID' | 'MISSING'

export interface Aviso {
  readonly nivel: NivelValidacion
  readonly ojo: Lateralidad
  /** El campo al que apunta. Puede faltar si el aviso es del conjunto. */
  readonly campo?: CampoBiometrico
  /** Código estable, para poder buscarlo y para los tests. */
  readonly codigo: string
  /** Lo que ve el usuario. En lenguaje normal, sin jerga. */
  readonly mensaje: string
  /** Qué hacer. Opcional. */
  readonly sugerencia?: string
}

/** Ordena los avisos de más grave a menos. */
const PESO: Record<NivelValidacion, number> = { INVALID: 0, WARNING: 1, MISSING: 2, VALID: 3 }

export function ordenarAvisos(avisos: readonly Aviso[]): readonly Aviso[] {
  return [...avisos].sort((a, b) => PESO[a.nivel] - PESO[b.nivel])
}

export function hayInvalidos(avisos: readonly Aviso[]): boolean {
  return avisos.some((a) => a.nivel === 'INVALID')
}

export function avisosDeCampo(
  avisos: readonly Aviso[],
  ojo: Lateralidad,
  campo: CampoBiometrico,
): readonly Aviso[] {
  return avisos.filter((a) => a.ojo === ojo && a.campo === campo)
}

/**
 * Nivel de un campo concreto: lo peor que se haya dicho de él.
 */
export function nivelDeCampo(
  avisos: readonly Aviso[],
  ojo: OjoBiometrico,
  campo: CampoBiometrico,
): NivelValidacion {
  if (!tiene(ojo, campo)) return 'MISSING'
  const propios = avisosDeCampo(avisos, ojo.lateralidad, campo)
  if (propios.some((a) => a.nivel === 'INVALID')) return 'INVALID'
  if (propios.some((a) => a.nivel === 'WARNING')) return 'WARNING'
  return 'VALID'
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reglas por campo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta el error de coma decimal más típico del OCR.
 *
 * Si un valor está fuera de rango pero al dividirlo o multiplicarlo por 10 o
 * por 100 cae justo dentro, casi seguro que se ha leído mal un punto. Se DICE,
 * con el valor que probablemente era. **No se cambia.**
 */
function sospechaDeComaDecimal(campo: CampoBiometrico, valor: number): number | null {
  const { limite, habitual } = definicionDe(campo)
  if (valor >= limite.min && valor <= limite.max) return null
  for (const factor of [10, 100, 0.1, 0.01]) {
    const candidato = valor * factor
    if (candidato >= habitual.min && candidato <= habitual.max) return candidato
  }
  return null
}

function validarCampo(ojo: OjoBiometrico, campo: CampoBiometrico): Aviso[] {
  const medida = obtener(ojo, campo)
  if (!medida) return []
  const def = definicionDe(campo)
  const v = medida.valor
  const avisos: Aviso[] = []

  if (!Number.isFinite(v)) {
    avisos.push({
      nivel: 'INVALID',
      ojo: ojo.lateralidad,
      campo,
      codigo: 'NO_NUMERICO',
      mensaje: `${def.etiqueta} no es un número.`,
      sugerencia: 'Escribe el valor a mano o bórralo.',
    })
    return avisos
  }

  if (def.esEje && (v < 0 || v > 180)) {
    avisos.push({
      nivel: 'INVALID',
      ojo: ojo.lateralidad,
      campo,
      codigo: 'EJE_FUERA_DE_RANGO',
      mensaje: `${def.etiqueta} vale ${v}°, y un eje va de 0° a 180°.`,
      sugerencia:
        v > 180 && v <= 360
          ? `Si en el informe pone ${v}°, el eje equivalente es ${v - 180}°. Compruébalo antes de cambiarlo.`
          : 'Comprueba el informe.',
    })
    return avisos
  }

  if (v < def.limite.min || v > def.limite.max) {
    const probable = sospechaDeComaDecimal(campo, v)
    avisos.push({
      nivel: 'INVALID',
      ojo: ojo.lateralidad,
      campo,
      codigo: 'FUERA_DE_LIMITE',
      mensaje:
        `${def.etiqueta} vale ${formatearConUnidad(campo, v)}, y eso está fuera de lo posible ` +
        `(de ${def.limite.min} a ${def.limite.max} ${def.unidad === 'ninguna' ? '' : def.unidad}).`.trim(),
      sugerencia:
        probable !== null
          ? `Parece un punto decimal mal leído: podría ser ${formatearConUnidad(campo, probable)}. ` +
            'Compruébalo en el informe y corrígelo tú — el programa no cambia datos por su cuenta.'
          : 'Comprueba el informe y corrígelo a mano.',
    })
    return avisos
  }

  if (v < def.habitual.min || v > def.habitual.max) {
    avisos.push({
      nivel: 'WARNING',
      ojo: ojo.lateralidad,
      campo,
      codigo: 'FUERA_DE_LO_HABITUAL',
      mensaje:
        `${def.etiqueta} vale ${formatearConUnidad(campo, v)}, que es poco frecuente ` +
        `(lo habitual va de ${def.habitual.min} a ${def.habitual.max}).`,
      sugerencia: 'Puede ser correcto. Confírmalo si es lo que pone el informe.',
    })
  }

  return avisos
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reglas de conjunto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * K1 es, por convenio, el meridiano PLANO: tiene que ser menor o igual que K2.
 *
 * Si vienen al revés, casi seguro que se han asignado mal al leer el informe.
 * Se avisa; **no se intercambian**, porque intercambiarlos también intercambia
 * sus ejes y una corrección silenciosa aquí cambia el resultado del cálculo sin
 * que nadie lo vea.
 */
function validarOrdenK(
  ojo: OjoBiometrico,
  plano: CampoBiometrico,
  curvo: CampoBiometrico,
): Aviso[] {
  const k1 = valorDe(ojo, plano)
  const k2 = valorDe(ojo, curvo)
  if (k1 === undefined || k2 === undefined) return []
  if (k1 <= k2) return []
  return [
    {
      nivel: 'WARNING',
      ojo: ojo.lateralidad,
      campo: plano,
      codigo: 'K_INVERTIDAS',
      mensaje:
        `${definicionDe(plano).etiqueta} (${formatearConUnidad(plano, k1)}) es mayor que ` +
        `${definicionDe(curvo).etiqueta} (${formatearConUnidad(curvo, k2)}), y debería ser al revés.`,
      sugerencia:
        'Probablemente estén cambiadas. Cámbialas tú junto con sus ejes: el programa no lo hace solo porque también habría que mover los ejes.',
    },
  ]
}

/**
 * Los dos ejes de un astigmatismo son perpendiculares. Si no lo son, algo se
 * ha leído mal.
 */
function validarPerpendicularidad(
  ojo: OjoBiometrico,
  ejePlano: CampoBiometrico,
  ejeCurvo: CampoBiometrico,
): Aviso[] {
  const a = valorDe(ojo, ejePlano)
  const b = valorDe(ojo, ejeCurvo)
  if (a === undefined || b === undefined) return []
  // Distancia angular entre dos orientaciones (0–90).
  const bruta = Math.abs(a - b) % 180
  const separacion = bruta > 90 ? 180 - bruta : bruta
  const desviacion = Math.abs(separacion - 90)
  if (desviacion <= 5) return []
  return [
    {
      nivel: 'WARNING',
      ojo: ojo.lateralidad,
      campo: ejeCurvo,
      codigo: 'EJES_NO_PERPENDICULARES',
      mensaje: `Los dos ejes (${a}° y ${b}°) deberían estar a 90° y están a ${separacion.toFixed(0)}°.`,
      sugerencia: 'Comprueba que cada eje va con su K en el informe.',
    },
  ]
}

/**
 * AQD y ACD no son lo mismo, y la diferencia es el grosor de la córnea.
 *
 * Si las dos están y AQD no es menor que ACD, o una de ellas se ha copiado en
 * el sitio de la otra.
 */
function validarAcdFrenteAAqd(ojo: OjoBiometrico): Aviso[] {
  const acd = valorDe(ojo, 'ACD')
  const aqd = valorDe(ojo, 'AQD')
  if (acd === undefined || aqd === undefined) return []
  if (aqd < acd) return []
  return [
    {
      nivel: 'INVALID',
      ojo: ojo.lateralidad,
      campo: 'AQD',
      codigo: 'AQD_NO_MENOR_QUE_ACD',
      mensaje:
        `AQD (${formatearConUnidad('AQD', aqd)}) tendría que ser menor que ACD ` +
        `(${formatearConUnidad('ACD', acd)}): se diferencian en el grosor de la córnea.`,
      sugerencia:
        'Es probable que una de las dos esté en el campo de la otra. Son datos distintos.',
    },
  ]
}

/**
 * Si la ACD del informe cuadra con AQD + grosor corneal.
 *
 * Es una comprobación DISTINTA de la de arriba, y las dos hacen falta:
 *
 *  - La de arriba caza el intercambio: alguien copió la AQD en el sitio de la
 *    ACD y sale una AQD mayor que la ACD, que es imposible.
 *  - Esta caza la incoherencia: las dos son plausibles por separado y su
 *    relación no se sostiene. Con ACD 3.18, AQD 2.10 y CCT 530 µm, los tres
 *    números son perfectamente normales y **uno de los tres está mal**.
 *
 * Es un AVISO, no un bloqueo, y sobre todo **no elige**. El programa no puede
 * saber cuál de los tres es el equivocado, y quedarse con uno en silencio sería
 * exactamente lo que este fichero existe para impedir.
 *
 * Se comprueba también cuando la ACD es derivada. Recién derivada la diferencia
 * es cero y no dice nada; el caso que importa es el de después: si alguien
 * corrige la AQD, la ACD que se calculó con la anterior deja de cuadrar, y eso
 * hay que verlo.
 */
function validarCoherenciaAcd(ojo: OjoBiometrico): Aviso[] {
  const c = comparacionAcd(ojo)
  if (c === null || c.diferencia <= TOLERANCIA_ACD_MM) return []
  return [
    {
      nivel: 'WARNING',
      ojo: ojo.lateralidad,
      campo: 'ACD',
      codigo: 'ACD_NO_CUADRA_CON_AQD_MAS_CCT',
      mensaje:
        `La ACD (${formatearConUnidad('ACD', c.acd)}) no cuadra con AQD + grosor corneal ` +
        `(${c.suma.toFixed(3)} mm): se diferencian en ${c.diferencia.toFixed(3)} mm. ` +
        'Entre la ACD y la AQD debería haber justo el grosor de la córnea.',
      sugerencia:
        'Uno de los tres datos está mal leído. El programa no elige ninguno: mira el informe y corrige el que corresponda.',
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Punto de entrada
// ─────────────────────────────────────────────────────────────────────────────

/** Valida todos los datos de un ojo. */
export function validarOjo(ojo: OjoBiometrico): readonly Aviso[] {
  const avisos: Aviso[] = []
  for (const campo of Object.keys(ojo.medidas) as CampoBiometrico[]) {
    avisos.push(...validarCampo(ojo, campo))
  }
  avisos.push(...validarOrdenK(ojo, 'K1', 'K2'))
  avisos.push(...validarOrdenK(ojo, 'TK1', 'TK2'))
  avisos.push(...validarPerpendicularidad(ojo, 'K1_EJE', 'K2_EJE'))
  avisos.push(...validarPerpendicularidad(ojo, 'TK1_EJE', 'TK2_EJE'))
  avisos.push(...validarAcdFrenteAAqd(ojo))
  avisos.push(...validarCoherenciaAcd(ojo))
  return ordenarAvisos(avisos)
}

/**
 * Valida los ojos de un caso entero.
 *
 * Cada ojo se valida por separado y sus avisos llevan su lateralidad. En ningún
 * momento se comparan datos de un ojo con los del otro para «corregir» nada.
 */
export function validarOjos(ojos: readonly OjoBiometrico[]): readonly Aviso[] {
  return ordenarAvisos(ojos.flatMap((o) => validarOjo(o)))
}
