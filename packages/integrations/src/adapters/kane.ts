/**
 * kane.ts — Adaptador de la fórmula de Kane.
 *
 *   https://www.iolformula.com
 *
 * ✅ ESTADO: VERIFICADO CONTRA EL FORMULARIO REAL el 12/08/2026.
 *
 * Se capturó con `pnpm reconocer:kane` después de que una persona aceptara su
 * acuerdo de licencia, y se ejecutó de punta a punta contra su web con datos
 * sintéticos: rellena, calcula y lee. Los identificadores de aquí están copiados
 * de esa captura, no supuestos.
 *
 * ## La puerta sigue siendo de la persona
 *
 *  1. Kane no enseña su calculadora hasta que se acepta un **acuerdo de
 *     licencia** («I Agree»). Es un contrato legal entre el autor y quien lo usa.
 *     Calculator Vilamar **no lo acepta en nombre de nadie**: lo pulsa una
 *     persona, en su navegador. Una vez — la aceptación queda en el perfil.
 *  2. La web declara estar protegida por reCAPTCHA. No se rodea, no se resuelve
 *     por detrás y no se falsea el navegador. Si aparece una comprobación, la
 *     hace la persona.
 *
 * ## Cuatro cosas que solo se supieron al mirarlo, y que estaban mal supuestas
 *
 *  - **El sexo son dos CASILLAS** (`gender_1` = M, `gender_2` = F), y se pulsa la
 *    etiqueta que las envuelve. Se había supuesto un desplegable esperando
 *    «Female»/«Male»: mal en el valor y mal en el control.
 *  - **El botón de calcular es `<input type="button">`**, no un `submit`.
 *  - **La lista «Index» es nuestro índice queratométrico**, y Kane la marca
 *    obligatoria. Estaba clasificado como «no se envía a ninguna calculadora».
 *  - **Elegir una lente tórica cambia ese ojo al modo tórico** y esconde los
 *    campos que este adaptador rellena. Por eso el modo lo decide y lo reafirma
 *    este adaptador (`asegurarModo`), nunca la lista de lentes por su cuenta —
 *    ver "El modelo de lente" más abajo para cómo conviven las dos cosas.
 *
 * ## El modo tórico — añadido el 13/08/2026
 *
 * Kane tiene dos modos por ojo y los dos se usan ahora, según los datos que haya:
 *
 *  - **Tórico** cuando están el eje de las dos K, el SIA y el eje de la incisión.
 *    Sus campos son los mismos con sufijo `-t`, y devuelve dos tablas: las
 *    potencias esféricas y las opciones tóricas con su cilindro residual.
 *  - **No tórico** si falta alguno. Da esfera y refracción prevista.
 *
 * ⚠️ **En la tabla tórica, Kane no destaca ninguna fila.** Enseña lo que quedaría
 * con cada potencia tórica y deja elegir a quien opera. Este adaptador NO elige por
 * él: las devuelve todas con `recomendada: false`.
 *
 * ## El modelo de lente — añadido el 26/08/2026
 *
 * Kane tiene un desplegable de modelo por ojo (`#type1`/`#type2`, comprobado con
 * el perfil de navegador ya autorizado, sin volver a aceptar ninguna condición).
 * Si el modelo del caso está en su lista, se elige — y entonces se deja el
 * A-Constant que Kane rellena solo, sin sobrescribirlo con el escrito a mano,
 * igual que se pidió para EVO.
 *
 * El problema es que elegir un modelo TÓRICO de esa lista cambia el modo del
 * formulario por su cuenta (ver más arriba). Por eso el modelo se elige DESPUÉS
 * de fijar el modo por primera vez, y el modo se **reafirma** justo después de
 * elegir el modelo, antes de escribir ningún número — no se pierde nada porque
 * todavía no se ha escrito nada. El modo que manda siempre es el que decide
 * `modoParaKane` a partir de los datos del caso, nunca el que sugiera la lista.
 *
 * ## Los dos ojos
 *
 * Kane los presenta **en la misma página**, con sufijos `1`/`right` y `2`/`left`.
 * Este adaptador rellena y lee **solo el lado del ojo que se le pide**, porque la
 * primitiva del orquestador es una calculadora para un ojo. Los dos ojos salen de
 * dos ejecuciones seguidas, y la sesión del navegador se comparte.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Locator, Page } from 'playwright'

import { capturarResultado } from '../captura.js'
import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador, esperarAlUsuario } from '../contrato.js'
import { leerNumeroDeTexto } from '../normalizar.js'

const URL = 'https://www.iolformula.com'

/**
 * Cómo encontrar cada campo, por orden de preferencia.
 *
 * `selector` es el identificador REAL, copiado del formulario capturado con
 * `pnpm reconocer:kane` el 12/08/2026. Las etiquetas se quedan como respaldo por
 * si Kane renombra un `id`: entonces el adaptador sigue funcionando y lo dice,
 * en vez de caerse.
 */
interface LocalizadorCampo {
  /** Identificador CSS exacto. Es lo primero que se prueba. */
  readonly selector?: string
  /** Etiquetas por las que buscar el campo si el identificador falla. */
  readonly etiquetas: readonly RegExp[]
  readonly decimales: number
}

/**
 * El formulario de Kane, tal y como es.
 *
 * ⚠️ **Los identificadores NO siguen ningún patrón**, y esto importa: hay
 * `al-right`, `A-Constant1` y `right-target` en el mismo formulario. No se pueden
 * generar; están copiados uno a uno de la captura.
 *
 * Kane presenta **los dos ojos en la misma página**: el sufijo `1` / `right` es el
 * derecho y el `2` / `left` el izquierdo. Este adaptador rellena **solo el lado
 * del ojo que se le pide**, porque la primitiva del orquestador es una calculadora
 * para un ojo.
 */
const CAMPOS_POR_OJO = {
  OD: {
    AL: { selector: '#al-right', etiquetas: [/axial\s*length/i], decimales: 2 },
    K1: { selector: '#k1-right', etiquetas: [/^\s*K1/i], decimales: 2 },
    K2: { selector: '#k2-right', etiquetas: [/^\s*K2/i], decimales: 2 },
    ACD: { selector: '#acd-right', etiquetas: [/\bACD\b/i], decimales: 2 },
    LT: { selector: '#lt-right', etiquetas: [/\bLT\b/i], decimales: 2 },
    CCT: { selector: '#cct-right', etiquetas: [/\bCCT\b/i], decimales: 0 },
    REFRACCION_OBJETIVO: {
      selector: '#right-target',
      etiquetas: [/target\s*refraction/i],
      decimales: 2,
    },
    CONSTANTE_A: { selector: '#A-Constant1', etiquetas: [/a[\s-]*constant/i], decimales: 2 },
  },
  OS: {
    AL: { selector: '#al-left', etiquetas: [/axial\s*length/i], decimales: 2 },
    K1: { selector: '#k1-left', etiquetas: [/^\s*K1/i], decimales: 2 },
    K2: { selector: '#k2-left', etiquetas: [/^\s*K2/i], decimales: 2 },
    ACD: { selector: '#acd-left', etiquetas: [/\bACD\b/i], decimales: 2 },
    LT: { selector: '#lt-left', etiquetas: [/\bLT\b/i], decimales: 2 },
    CCT: { selector: '#cct-left', etiquetas: [/\bCCT\b/i], decimales: 0 },
    REFRACCION_OBJETIVO: {
      selector: '#left-target',
      etiquetas: [/target\s*refraction/i],
      decimales: 2,
    },
    CONSTANTE_A: { selector: '#A-Constant2', etiquetas: [/a[\s-]*constant/i], decimales: 2 },
  },
} satisfies Record<
  'OD' | 'OS',
  Partial<Record<keyof EntradasCalculadora['valores'], LocalizadorCampo>>
>

/**
 * Los mismos campos en el MODO TÓRICO de Kane.
 *
 * Capturado el 13/08/2026 pulsando su interruptor «Toric». El patrón es el sufijo
 * `-t`, y aparecen tres campos que en no tórico no existen: el eje de K1, el SIA y
 * el eje de la incisión.
 *
 * ⚠️ **El eje de K2 NO se rellena.** Existe (`#k2-right-t-axis`) pero no admite
 * escritura: Kane lo deriva perpendicular al de K1, que es lo correcto. Intentar
 * escribirlo falla, y por eso no está en esta tabla.
 *
 * La constante A y la refracción objetivo NO cambian de identificador: viven fuera
 * del bloque que conmuta.
 */
const CAMPOS_TORICOS = {
  OD: {
    AL: { selector: '#al-right-t', etiquetas: [/axial\s*length/i], decimales: 2 },
    K1: { selector: '#k1-right-t', etiquetas: [/^\s*K1/i], decimales: 2 },
    K1_EJE: { selector: '#k1-right-t-axis', etiquetas: [], decimales: 0 },
    K2: { selector: '#k2-right-t', etiquetas: [/^\s*K2/i], decimales: 2 },
    ACD: { selector: '#acd-right-t', etiquetas: [/\bACD\b/i], decimales: 2 },
    SIA: { selector: '#sia-right', etiquetas: [/\bSIA\b/i], decimales: 2 },
    EJE_INCISION: { selector: '#inc-right', etiquetas: [/incision/i], decimales: 0 },
    LT: { selector: '#lt-right-t', etiquetas: [/\bLT\b/i], decimales: 2 },
    CCT: { selector: '#cct-right-t', etiquetas: [/\bCCT\b/i], decimales: 0 },
    REFRACCION_OBJETIVO: {
      selector: '#right-target',
      etiquetas: [/target\s*refraction/i],
      decimales: 2,
    },
    CONSTANTE_A: { selector: '#A-Constant1', etiquetas: [/a[\s-]*constant/i], decimales: 2 },
  },
  OS: {
    AL: { selector: '#al-left-t', etiquetas: [/axial\s*length/i], decimales: 2 },
    K1: { selector: '#k1-left-t', etiquetas: [/^\s*K1/i], decimales: 2 },
    K1_EJE: { selector: '#k1-left-t-axis', etiquetas: [], decimales: 0 },
    K2: { selector: '#k2-left-t', etiquetas: [/^\s*K2/i], decimales: 2 },
    ACD: { selector: '#acd-left-t', etiquetas: [/\bACD\b/i], decimales: 2 },
    SIA: { selector: '#sia-left', etiquetas: [/\bSIA\b/i], decimales: 2 },
    EJE_INCISION: { selector: '#inc-left', etiquetas: [/incision/i], decimales: 0 },
    LT: { selector: '#lt-left-t', etiquetas: [/\bLT\b/i], decimales: 2 },
    CCT: { selector: '#cct-left-t', etiquetas: [/\bCCT\b/i], decimales: 0 },
    REFRACCION_OBJETIVO: {
      selector: '#left-target',
      etiquetas: [/target\s*refraction/i],
      decimales: 2,
    },
    CONSTANTE_A: { selector: '#A-Constant2', etiquetas: [/a[\s-]*constant/i], decimales: 2 },
  },
} satisfies Record<
  'OD' | 'OS',
  Partial<Record<keyof EntradasCalculadora['valores'], LocalizadorCampo>>
>

/**
 * ¿Se le puede pedir a Kane el cálculo TÓRICO?
 *
 * Solo si están los cuatro datos que su modo tórico necesita. Con ellos, Kane
 * devuelve además las opciones tóricas con su cilindro residual, que es lo que
 * permite comparar su columna con las de EVO y Barrett. Sin ellos, su modo no
 * tórico funciona igual y da esfera y refracción prevista.
 *
 * No se fuerza el tórico cuando faltan datos: **rellenar la mitad de su formulario
 * tórico daría un resultado peor, no mejor**.
 */
export function puedePedirseToricoAKane(valores: EntradasCalculadora['valores']): boolean {
  return (
    valores.K1_EJE !== undefined &&
    valores.K2_EJE !== undefined &&
    valores.SIA !== undefined &&
    valores.EJE_INCISION !== undefined
  )
}

/** Lo que no es de un ojo, sino de la persona o del caso. */
export type ModoDeKane = 'NO_TORICO' | 'TORICO'

/**
 * En qué modo se le pide el cálculo a Kane.
 *
 * Se decide por los DATOS, no por una preferencia: si están el eje de las dos K,
 * el SIA y el eje de la incisión, se le pide el tórico —que es lo que permite
 * comparar su columna con EVO Toric y Barrett Toric—. Si falta cualquiera de los
 * cuatro, su modo no tórico da esfera y refracción prevista igual de bien.
 */
export function modoParaKane(entradas: Pick<EntradasCalculadora, 'valores'>): ModoDeKane {
  return puedePedirseToricoAKane(entradas.valores) ? 'TORICO' : 'NO_TORICO'
}

/** Los campos del formulario que corresponden a ese modo y ese ojo. */
export function camposDeKane(
  modo: ModoDeKane,
  lado: 'OD' | 'OS',
): Partial<Record<keyof EntradasCalculadora['valores'], LocalizadorCampo>> {
  return modo === 'TORICO' ? CAMPOS_TORICOS[lado] : CAMPOS_POR_OJO[lado]
}

const SEL = {
  /** Desde D44 (27/08/2026): el nombre real si el caso lo tiene; si no, el código local. */
  paciente: '#Patient',
  /** Si el caso lo tiene, SÍ se rellena (D41, 25/08/2026). */
  cirujano: '#Surgeon',
  /** El código local del caso, para no perder la referencia (D44). Antes se dejaba vacío. */
  identificador: '#ID',
  /** El índice queratométrico. Es una lista y Kane lo marca obligatorio. */
  indice: '#index',
  /**
   * El sexo son DOS CASILLAS, no una lista.
   *
   * `gender_1` es M y `gender_2` es F, y ninguna tiene `id`: hay que ir por el
   * `name`. Esto desmiente lo que se había supuesto —un desplegable esperando
   * «Female»/«Male»— y es la razón de no haber enviado nada hasta verlo.
   *
   * ⚠️ Y se pulsa **la ETIQUETA, no la casilla**. Son grupos de botones de
   * Bootstrap: el `<input type=checkbox>` va DENTRO de un `<label class="btn">`, y
   * lo que se ve y se pulsa es la etiqueta. Marcar el input con `check()` **no
   * funciona** —está tapado— y Kane responde «Biological sex is required».
   * Comprobado en una ejecución real contra su web.
   */
  sexoHombre: 'label.btn:has(input[name="gender_1"])',
  sexoMujer: 'label.btn:has(input[name="gender_2"])',
  /**
   * El interruptor tórico / no tórico, por ojo.
   *
   * **Non-toric ya viene marcado por defecto** (`checked="checked"` y la etiqueta
   * con clase `act`), así que lo normal es NO TOCARLO. Intentar marcarlo lo
   * alternaba a Toric, y eso volvía a pintar AL, K1, K2 y ACD —en modo tórico K1 y
   * K2 llevan además el eje—, así que los valores ya escritos se perdían. Kane
   * respondía «AL between 18.0 and 35.0 mm required» con el campo en blanco.
   *
   * Solo se pulsa si NO estuviera en no tórico, y se comprueba antes.
   */
  etiquetaNoTorico: {
    OD: 'label.btn:has(input[name="nontoric_1"])',
    OS: 'label.btn:has(input[name="nontoric_2"])',
  },
  radioNoTorico: { OD: 'input[name="nontoric_1"]', OS: 'input[name="nontoric_2"]' },
  calcular: 'input[type="button"][value="Calculate"]',
  /**
   * «Processing…» mientras Kane calcula. Es la SEÑAL de que aún no hay nada.
   *
   * Hay una por ojo, así que se acota por posición: la primera es el derecho.
   */
  esperandoResultado: '.res_tab3_wait',
  /** El interruptor a modo tórico, por ojo. */
  etiquetaTorico: {
    OD: 'label.btn:has(input[name="toric_1"])',
    OS: 'label.btn:has(input[name="toric_2"])',
  },
  radioTorico: { OD: 'input[name="toric_1"]', OS: 'input[name="toric_2"]' },
  /** El desplegable de modelo de lente, por ojo. Comprobado el 26/08/2026. */
  modelo: { OD: '#type1', OS: '#type2' },
} as const

/**
 * Los índices queratométricos que ofrece Kane, con el valor de su opción.
 *
 * Es una lista CERRADA de cinco, así que nuestro `INDICE_QUERATOMETRICO` no se
 * puede escribir: hay que elegir la opción que le corresponde. Si el informe trae
 * un índice que Kane no ofrece, **no se elige ninguno** y se deja el que Kane
 * tiene por defecto, diciéndolo — inventar el más parecido cambiaría lo que
 * significan las K sin avisar.
 */
const INDICES_DE_KANE: readonly { readonly valor: string; readonly indice: number }[] = [
  { valor: '0', indice: 1.3375 },
  { valor: '1', indice: 1.332 },
  { valor: '2', indice: 1.3315 },
  { valor: '3', indice: 1.336 },
  { valor: '4', indice: 1.338 },
]

/**
 * Cómo se sabe que estamos en la puerta y no en la calculadora.
 *
 * Comprobado el 12/08/2026 abriendo la página **sin aceptar nada**:
 *
 *  - `iolformula.com` REDIRIGE a `iolformula.com/agreement/`.
 *  - Ese documento tiene **cero campos de formulario**.
 *  - Su título es «Terms of Use – Kane Formula» y su texto termina en «I Agree».
 *  - Dice: «This site is protected by reCAPTCHA».
 *
 * Por eso la señal principal es **la dirección**, no el texto del botón: la URL
 * no depende del idioma ni de cómo esté maquetado el botón, y el botón real lo
 * pinta JavaScript (en el HTML servido no hay ninguno visible con ese texto).
 */
const PUERTA = {
  /** La dirección de la pantalla de condiciones. Señal principal. */
  rutaAcuerdo: /\/agreement/i,
  /** Respaldo por texto, por si algún día cambia la ruta. */
  textoTerminos: /terms of use/i,
  /** Lo que aparece cuando YA se ha pasado la puerta. */
  textoCalculadora: /calculate/i,
}

/**
 * Cuántos campos editables hacen falta para creerse que esto es la calculadora.
 *
 * Es una señal ESTRUCTURAL y no un identificador, porque el formulario está
 * detrás del acuerdo y no se ha podido ver. Pero distingue perfectamente lo que
 * hay que distinguir: la calculadora de la pantalla de condiciones —que tiene
 * cero campos, medido— y de una página a medio cargar.
 *
 * Cuando `pnpm reconocer:kane` dé los identificadores reales, esto se sustituye
 * por el `id` de un campo concreto y la señal pasa a ser exacta.
 */
const CAMPOS_MINIMOS_DEL_FORMULARIO = 4

/**
 * ¿Estamos en la puerta de las condiciones?
 *
 * Se exporta —igual que la de abajo— porque la transición tras la aceptación
 * humana es la parte que más falla y hay que poder probarla sin abrir Kane, con
 * páginas sintéticas que imiten las tres pantallas.
 */
export async function enLaPuertaDeKane(pagina: Page): Promise<boolean> {
  try {
    // La dirección manda: no depende del idioma ni de cómo esté pintado el
    // botón. Medido: `iolformula.com` redirige a `/agreement/`.
    if (PUERTA.rutaAcuerdo.test(pagina.url())) return true
    const texto = await pagina.innerText('body')
    return PUERTA.textoTerminos.test(texto) && !PUERTA.textoCalculadora.test(texto)
  } catch {
    // La página puede estar navegando ahora mismo. Eso NO es «no hay puerta».
    return false
  }
}

/**
 * ¿Está la CALCULADORA delante, de verdad y lista para escribir?
 *
 * **Esta función es la corrección del fallo.** Antes se esperaba a
 * `!enLaPuerta()` —la NEGACIÓN de la puerta— y después se dormía 2,5 segundos.
 * Fallaba así:
 *
 *  - La negación se cumple **en el instante en que la URL deja de ser
 *    `/agreement/`**, o sea en medio de la navegación. En ese momento la página
 *    puede estar en blanco.
 *  - El `waitForTimeout(2500)` hacía de «ya habrá cargado». Si tardaba más,
 *    `rellenar()` no encontraba ningún campo, devolvía 0, y el adaptador
 *    concluía **ADAPTER_BROKEN: «ejecuta pnpm reconocer:kane»**.
 *
 * O sea: **una transición lenta se presentaba como un conector roto.** La persona
 * aceptaba bien y el programa le decía que el conector estaba mal.
 *
 * Ahora se exige que se cumplan **las tres** cosas, y ninguna es un reloj:
 *
 *  1. La dirección ya NO es la del acuerdo.
 *  2. Hay campos editables y un control de calcular.
 *  3. El primer campo **se puede escribir de verdad**.
 *
 * La tercera importa: un formulario pintado pero deshabilitado, o tapado por una
 * capa de carga, daría cero campos rellenados y volvería a parecer un conector
 * roto.
 */
export async function calculadoraDeKaneLista(pagina: Page): Promise<boolean> {
  try {
    if (PUERTA.rutaAcuerdo.test(pagina.url())) return false

    const hay = await pagina.evaluate((minimo) => {
      const visible = (el: Element): boolean => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }
      const editables = [...document.querySelectorAll('input, select')].filter((el) => {
        const tipo = el.getAttribute('type')
        return visible(el) && tipo !== 'hidden' && tipo !== 'submit' && tipo !== 'button'
      })
      const calcular = [
        ...document.querySelectorAll('button, input[type=submit], input[type=button], a'),
      ].some((el) => {
        const texto =
          (el as HTMLElement).innerText || (el as HTMLInputElement).value || el.textContent || ''
        return visible(el) && /calculate|calcular/i.test(texto)
      })
      return editables.length >= minimo && calcular
    }, CAMPOS_MINIMOS_DEL_FORMULARIO)

    if (!hay) return false

    const primero = pagina
      .locator('input:not([type=hidden]):not([type=submit]):not([type=button])')
      .first()
    return await primero.isEditable({ timeout: 2000 }).catch(() => false)
  } catch {
    return false
  }
}

/**
 * Lee una fila de la tabla tórica de Kane.
 *
 * Sus dos celdas, tal y como las escribe (capturado el 13/08/2026):
 *
 *     "Non-toric (0.00)"   "0.42 D Axis 80"
 *     "T2 (1.00)"          "0.24 D Axis 170"
 *     "T3 (1.50)"          "0.57 D Axis 170"
 *
 * O sea: **la designación con su cilindro entre paréntesis**, y el astigmatismo que
 * quedaría con su eje. La primera fila no es una lente tórica: es la opción de no
 * poner ninguna, y se conserva porque es justo la que dice cuánto astigmatismo se
 * deja sin corregir.
 *
 * Si una celda no encaja con esta forma se devuelve `null` y la fila se descarta.
 * No se adivina qué quería decir.
 */
export function leerFilaToricaDeKane(celdas: readonly (string | undefined)[]): {
  readonly designacion: string
  readonly cilindro: number
  readonly cilindroResidual?: number
  readonly ejeResidual?: number
} | null {
  const izquierda = (celdas[0] ?? '').trim()
  const derecha = (celdas[1] ?? '').trim()

  const m = /^(.+?)\s*\(\s*([-+]?[\d.,]+)\s*\)\s*$/.exec(izquierda)
  if (!m?.[1] || m[2] === undefined) return null
  const cilindro = leerNumeroDeTexto(m[2])
  if (cilindro === undefined) return null

  // El residual es opcional a propósito: la designación y su cilindro son el dato
  // principal, y una fila sin residual legible sigue valiendo.
  const residual = leerNumeroDeTexto(/([-+]?[\d.,]+)\s*D\b/i.exec(derecha)?.[1])
  const eje = leerNumeroDeTexto(/Axis\s*([\d.,]+)/i.exec(derecha)?.[1])

  return {
    designacion: m[1].trim(),
    cilindro,
    ...(residual !== undefined ? { cilindroResidual: residual } : {}),
    ...(eje !== undefined ? { ejeResidual: eje } : {}),
  }
}

/** Una fila leída de una tabla de resultados de Kane, tal cual sale del DOM. */
export interface FilaDeKane {
  readonly celdas: readonly (string | undefined)[]
  /** Si Kane le ha puesto `table-active`. */
  readonly destacada: boolean
}

/**
 * Convierte las tablas de Kane en opciones de lente.
 *
 * Está aparte del adaptador, y a propósito: así la regla que más importa de todo
 * este fichero se puede **probar sin navegador**. La regla es esta:
 *
 *   ⚠️ **Ninguna opción tórica se marca como recomendada. Nunca.**
 *
 * No es una precaución teórica. Comprobado contra la web de Kane el 13/08/2026: su
 * tabla de potencias esféricas lleva `table-active` en una fila, y su tabla tórica
 * **no la lleva en ninguna**. Kane enseña cuánto astigmatismo quedaría con cada
 * potencia tórica y deja la elección a quien opera.
 *
 * Por eso `destacada` de las filas tóricas **ni se mira**. Si algún día Kane
 * empezara a marcar una, este código seguiría sin elegirla: preferimos enseñar las
 * opciones y que decida una persona antes que trasladar una recomendación clínica
 * que no hemos verificado que signifique lo que parece.
 */
export function construirOpcionesDeKane(
  filasDePotencia: readonly FilaDeKane[],
  filasToricas: readonly FilaDeKane[],
): { readonly opciones: readonly OpcionLente[]; readonly toricasLeidas: number } {
  const opciones: OpcionLente[] = []

  // Las potencias esféricas. Una fila sin número no es una opción.
  for (const fila of filasDePotencia) {
    const esfera = leerNumeroDeTexto(fila.celdas[0])
    if (esfera === undefined) continue
    opciones.push({
      esfera,
      refraccionPrevista: leerNumeroDeTexto(fila.celdas[1]),
      recomendada: fila.destacada,
    })
  }

  // Las tóricas van con la esfera que Kane SÍ destaca, porque las dos tablas
  // describen el mismo cálculo y no dos alternativos.
  const esferaDestacada = opciones.find((o) => o.recomendada)?.esfera
  let toricasLeidas = 0
  for (const fila of filasToricas) {
    const t = leerFilaToricaDeKane(fila.celdas)
    if (t === null) continue
    toricasLeidas++
    opciones.push({
      ...(esferaDestacada !== undefined ? { esfera: esferaDestacada } : {}),
      cilindro: t.cilindro,
      designacion: t.designacion,
      ...(t.cilindroResidual !== undefined ? { cilindroResidual: t.cilindroResidual } : {}),
      ...(t.ejeResidual !== undefined ? { ejeResidual: t.ejeResidual } : {}),
      // Aquí está la regla. `fila.destacada` no se usa.
      recomendada: false,
    })
  }

  return { opciones, toricasLeidas }
}

export class AdaptadorKane implements AdaptadorCalculadora {
  readonly calculadora = 'KANE' as const
  readonly nombre = 'Kane'
  readonly url = URL
  /**
   * Con ventana siempre: la persona tiene que poder aceptar las condiciones y,
   * si aparece, resolver la comprobación anti-robot.
   */
  readonly requiereNavegadorVisible = true

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    const problemas: string[] = []
    if (entradas.valores.AL === undefined) problemas.push('Falta la longitud axial.')
    if (entradas.valores.CONSTANTE_A === undefined) problemas.push('Falta la constante A.')
    return problemas
  }

  async ejecutar(ctx: ContextoEjecucion): Promise<ResultadoCalculadora> {
    const inicio = Date.now()
    const pagina = await ctx.contexto.newPage()

    try {
      ctx.progreso({ calculadora: this.calculadora, fase: 'NAVEGANDO', mensaje: 'Abriendo Kane…' })
      await pagina.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })

      await this.pasarCondiciones(pagina, ctx)

      ctx.progreso({
        calculadora: this.calculadora,
        fase: 'RELLENANDO',
        mensaje: 'Rellenando los datos en Kane…',
      })
      const { puestos: rellenados, modeloEncontrado } = await this.rellenar(pagina, ctx.entradas)

      if (rellenados === 0) {
        throw new ErrorAdaptador(
          'ADAPTER_BROKEN',
          'No se han encontrado los campos de la calculadora de Kane. El conector necesita actualizarse: ejecuta «pnpm reconocer:kane» para que aprenda el formulario actual.',
          'RELLENANDO',
          'campos por etiqueta',
        )
      }

      // Se comprueba lo escrito ANTES de calcular. Sin esto, un campo que se
      // repinta deja el formulario a medias y el fallo aparece cuatro pasos más
      // adelante disfrazado de «no hay tabla de resultados».
      const mal = await this.comprobarLoEscrito(pagina, ctx.entradas, modeloEncontrado)
      if (mal.length > 0) {
        throw new ErrorAdaptador(
          'ADAPTER_BROKEN',
          `Los datos no se han quedado escritos en el formulario de Kane: ${mal.join('; ')}. ` +
            'El conector necesita actualizarse: ejecuta «pnpm reconocer:kane».',
          'RELLENANDO',
          'valores del formulario',
        )
      }

      ctx.progreso({
        calculadora: this.calculadora,
        fase: 'CALCULANDO',
        mensaje: 'Calculando en Kane…',
      })
      await this.pulsarCalcular(pagina)

      ctx.progreso({
        calculadora: this.calculadora,
        fase: 'LEYENDO_RESULTADO',
        mensaje: 'Leyendo el resultado de Kane…',
      })
      return await this.leerResultado(pagina, ctx, inicio, modeloEncontrado)
    } catch (error) {
      return await this.aFallo(pagina, ctx, error, inicio)
    } finally {
      await pagina.close().catch(() => undefined)
    }
  }

  private async enLaPuerta(pagina: Page): Promise<boolean> {
    return enLaPuertaDeKane(pagina)
  }

  private async formularioListo(pagina: Page): Promise<boolean> {
    return calculadoraDeKaneLista(pagina)
  }

  /**
   * La puerta de las condiciones de uso.
   *
   * El programa **NO pulsa «I Agree»** y no lo va a hacer: es un contrato entre
   * el autor de la fórmula y quien la usa. Tampoco toca el reCAPTCHA.
   *
   * Lo que sí hace, y es todo lo que hace: **mantener abierta esta misma ventana
   * y este mismo contexto**, decirle a la persona que le toca, y esperar a que
   * la calculadora esté delante. No se abre una pestaña nueva ni se recarga: si
   * se recargara, se perdería lo que la persona acaba de aceptar.
   */
  private async pasarCondiciones(pagina: Page, ctx: ContextoEjecucion): Promise<void> {
    if (!(await this.enLaPuerta(pagina))) {
      // Kane recuerda la aceptación en el perfil del navegador, así que lo normal
      // a partir de la segunda vez es entrar directo. Aun así se espera a que el
      // formulario esté listo: entrar directo tampoco es instantáneo.
      await esperarAlUsuario(pagina, () => this.formularioListo(pagina), {
        limiteMs: 30_000,
        cancelado: ctx.cancelado,
      })
      return
    }

    ctx.progreso({
      calculadora: this.calculadora,
      fase: 'ESPERANDO_AL_USUARIO',
      requiereUsuario: true,
      mensaje:
        'KANE REQUIERE TU INTERVENCIÓN. En la ventana del navegador que se ha abierto —esta, no tu Chrome de siempre— tienes que leer y pulsar «I Agree». ' +
        'Es un acuerdo legal entre el autor de la fórmula y ti, así que solo puedes aceptarlo tú. ' +
        'Si además aparece una comprobación anti-robot, resuélvela también tú. ' +
        'Calculator Vilamar sigue solo en cuanto la calculadora esté en pantalla, y no tendrás que repetirlo en los próximos cálculos.',
    })

    // Se espera a que el FORMULARIO esté listo, no a que desaparezca la puerta.
    // Es la diferencia entre «ha empezado a navegar» y «ya puedo escribir».
    const listo = await esperarAlUsuario(pagina, () => this.formularioListo(pagina), {
      limiteMs: 300_000,
      cancelado: ctx.cancelado,
    })

    if (listo) return

    // No ha llegado a estar listo. Los dos motivos son MUY distintos y no se
    // pueden presentar igual: uno lo arregla el usuario y el otro no.
    if (await this.enLaPuerta(pagina)) {
      throw new ErrorAdaptador(
        'NEEDS_USER_ACTION',
        'Kane sigue en su pantalla de condiciones: no se ha aceptado. Tiene que ser en la ventana que abre Calculator Vilamar — ' +
          'si lo has aceptado en tu Chrome de siempre, esa aceptación no cuenta aquí, porque es otro navegador con otras cookies. ' +
          'Puedes reintentar solo Kane cuando quieras: el resto de resultados no se pierde.',
        'ESPERANDO_AL_USUARIO',
      )
    }

    // Salió del acuerdo y aun así no apareció la calculadora. Eso ya no es cosa
    // del usuario: la página no coincide con lo que el conector espera.
    throw new ErrorAdaptador(
      'ADAPTER_BROKEN',
      'Se han aceptado las condiciones, pero después no ha aparecido el formulario de la calculadora. ' +
        'La página puede haber cambiado: ejecuta «pnpm reconocer:kane» para que el conector aprenda cómo es ahora.',
      'ESPERANDO_AL_USUARIO',
      'campos del formulario de Kane',
    )
  }

  /**
   * Busca un campo por identificador o, si no se conoce, por su etiqueta.
   * Devuelve `null` si no aparece: no se escribe a ciegas en el primer hueco.
   */
  private async localizar(pagina: Page, loc: LocalizadorCampo): Promise<Locator | null> {
    if (loc.selector) {
      const porSelector = pagina.locator(loc.selector)
      if ((await porSelector.count()) > 0) return porSelector.first()
    }
    for (const etiqueta of loc.etiquetas) {
      // Por orden de fiabilidad: etiqueta asociada, texto de ayuda dentro del
      // campo, y por último el campo que sigue a una celda con ese texto, que
      // es el patrón de los formularios montados sobre tablas.
      const candidatos = [
        pagina.getByLabel(etiqueta),
        pagina.getByPlaceholder(etiqueta),
        pagina.locator('td', { hasText: etiqueta }).locator('xpath=following::input[1]'),
      ]
      for (const candidato of candidatos) {
        try {
          if ((await candidato.count()) > 0) return candidato.first()
        } catch {
          // Un localizador que no aplica en esta página: se prueba el siguiente.
        }
      }
    }
    return null
  }

  /**
   * Rellena el formulario y devuelve cuántos campos ha podido poner.
   *
   * El orden importa y no es casual:
   *
   *  1. **«Non-toric»** primero. Este producto no rellena la parte tórica de
   *     Kane, y marcarlo deja el formulario en el estado que se va a usar.
   *  2. **El modelo de lente ANTES que la constante A**, igual que en EVO:
   *     elegirlo puede sobrescribirla. Así la del caso es la que queda.
   *  3. **Los números al final.**
   */
  private async rellenar(
    pagina: Page,
    entradas: EntradasCalculadora,
  ): Promise<{ puestos: number; modeloEncontrado: boolean }> {
    let puestos = 0

    // ── Lo que no es de un ojo ────────────────────────────────────────────
    // Kane exige un nombre de paciente. Desde D44 (27/08/2026), si el caso
    // tiene el nombre del paciente es ese el que se manda, con el código
    // local en el identificador; si no hay nombre, el código va al nombre,
    // como antes. El cirujano, si el caso lo tiene, se rellena (D41).
    await pagina.fill(SEL.paciente, entradas.nombrePaciente ?? entradas.codigoCaso).catch(() => undefined)
    await pagina.fill(SEL.identificador, entradas.codigoCaso).catch(() => undefined)
    if (entradas.nombreCirujano) {
      await pagina.fill(SEL.cirujano, entradas.nombreCirujano).catch(() => undefined)
    }

    if (await this.ponerSexo(pagina, entradas)) puestos++
    if (await this.ponerIndice(pagina, entradas)) puestos++

    // ── El lado del ojo que toca ──────────────────────────────────────────
    const lado = entradas.ojo

    // Lo que cambia la FORMA del formulario va antes de escribir nada: si se
    // toca después, lo escrito se pierde al repintarse.
    const modo = modoParaKane(entradas)
    await this.asegurarModo(pagina, lado, modo)

    // El modelo, si el caso lo tiene y está en la lista de Kane para este ojo.
    // Elegirlo puede cambiar el modo del formulario por su cuenta (ver "El
    // modelo de lente" en la cabecera) — por eso el modo se reafirma justo
    // después, antes de escribir ningún número.
    let modeloEncontrado = false
    if (entradas.modeloLente) {
      modeloEncontrado = await this.elegirModelo(pagina, lado, entradas.modeloLente)
      if (modeloEncontrado) await this.asegurarModo(pagina, lado, modo)
    }

    for (const [campo, loc] of Object.entries(camposDeKane(modo, lado))) {
      // El A-Constant que Kane ha rellenado solo, al elegir el modelo, no se
      // pisa con el escrito a mano — igual que en EVO.
      if (campo === 'CONSTANTE_A' && modeloEncontrado) continue
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      if (valor === undefined) continue // ausente no se rellena, ni con un 0
      const destino = await this.localizar(pagina, loc)
      if (!destino) continue
      try {
        await destino.fill(valor.toFixed(loc.decimales), { timeout: 5000 })
        puestos++
      } catch {
        // Un campo que no admite escritura no tumba el resto. En el modo tórico
        // esto pasa de verdad y está previsto: Kane tiene un campo para el eje de
        // K2 pero no deja escribirlo, porque lo deriva perpendicular al de K1.
      }
    }
    return { puestos, modeloEncontrado }
  }

  /** Elige el modelo si Kane lo tiene en su lista, para ese ojo. Devuelve si lo encontró. */
  private async elegirModelo(pagina: Page, lado: 'OD' | 'OS', modelo: string): Promise<boolean> {
    try {
      const selector = SEL.modelo[lado]
      const opciones = await pagina.locator(`${selector} option`).allTextContents()
      const encontrado = opciones.find(
        (o) => o.trim().toLowerCase() === modelo.trim().toLowerCase(),
      )
      if (!encontrado) return false
      await pagina.selectOption(selector, { label: encontrado })
      return true
    } catch {
      return false
    }
  }

  /**
   * Comprueba lo escrito volviéndolo a LEER del formulario.
   *
   * Existe por un fallo real: se rellenaban AL, K1, K2 y ACD, algo repintaba esos
   * campos, y se pulsaba «Calculate» con el formulario medio vacío. Kane devolvía
   * sus propios avisos —«AL between 18.0 and 35.0 mm required»— y por aquí se veía
   * como «no hay tabla de resultados», o sea como un conector roto.
   *
   * Escribir y no comprobar es fiarse de que nada haya tocado la página entre
   * medias. En una web ajena con JavaScript propio, eso no se puede dar por hecho.
   */
  private async comprobarLoEscrito(
    pagina: Page,
    entradas: EntradasCalculadora,
    modeloEncontrado: boolean,
  ): Promise<readonly string[]> {
    const mal: string[] = []
    const campos = camposDeKane(modoParaKane(entradas), entradas.ojo)
    for (const [campo, loc] of Object.entries(campos)) {
      // El A-Constant que ha puesto Kane solo, al elegir el modelo, no es el
      // que escribimos nosotros — no es un fallo, es lo que se pidió.
      if (campo === 'CONSTANTE_A' && modeloEncontrado) continue
      const esperado = entradas.valores[campo as keyof typeof entradas.valores]
      if (esperado === undefined || !loc.selector) continue
      const puesto = await pagina
        .inputValue(loc.selector, { timeout: 3000 })
        .catch(() => '(no se ha podido leer)')
      // Se comparan como números: da igual «3.18» que «3.180».
      const comoNumero = Number(puesto.replace(',', '.'))
      if (!Number.isFinite(comoNumero) || Math.abs(comoNumero - esperado) > 0.005) {
        mal.push(`${campo}: se escribió ${esperado} y el formulario dice «${puesto}»`)
      }
    }
    return mal
  }

  /**
   * Deja el ojo en el modo que se va a usar, «Non-toric» o «Toric».
   *
   * Solo pulsa si hace falta de verdad, porque pulsar por costumbre alterna el
   * modo y repinta los campos —que es exactamente lo que hay que evitar antes de
   * escribir—. Kane viene en no tórico, así que en ese modo casi nunca hace nada.
   */
  private async asegurarModo(pagina: Page, lado: 'OD' | 'OS', modo: ModoDeKane): Promise<void> {
    const radio = modo === 'TORICO' ? SEL.radioTorico[lado] : SEL.radioNoTorico[lado]
    const etiqueta = modo === 'TORICO' ? SEL.etiquetaTorico[lado] : SEL.etiquetaNoTorico[lado]
    return this.pulsarModo(pagina, lado, modo, radio, etiqueta)
  }

  private async pulsarModo(
    pagina: Page,
    lado: 'OD' | 'OS',
    modo: ModoDeKane,
    radioDelModo: string,
    etiquetaDelModo: string,
  ): Promise<void> {
    // ⚠️ NO se pregunta por `isChecked` del radio, y esto costó una ejecución
    // entera de diagnóstico: los dos radios tienen **nombres distintos**
    // (`nontoric_1` y `toric_1`), así que no forman un grupo excluyente. El de no
    // tórico sigue `checked` en el DOM aunque Kane esté enseñando el modo tórico.
    //
    // La señal de verdad es la CLASE de la etiqueta: `act` en la activa y
    // `not-active` en la otra.
    const activa = pagina.locator(`label.btn.act:has(${radioDelModo})`)
    try {
      if ((await activa.count()) > 0) return

      // Hace falta cambiarlo. Y hay un motivo por el que puede llegar en tórico
      // aunque nadie lo haya pedido: **Kane recuerda el estado del formulario en
      // el perfil del navegador**, que se comparte entre ejecuciones para no
      // repetir el acuerdo. Un cambio de una vez anterior sigue ahí.
      await pagina.click(etiquetaDelModo, { timeout: 5000 })
      // Y se comprueba que ha cambiado de verdad, en vez de suponerlo.
      await activa.first().waitFor({ state: 'attached', timeout: 5000 })
    } catch {
      const comoSeLlama = modo === 'TORICO' ? 'Toric' : 'Non-toric'
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        `No se ha podido dejar el ${lado} en modo «${comoSeLlama}» en Kane. El conector necesita actualizarse: ejecuta «pnpm reconocer:kane».`,
        'RELLENANDO',
        etiquetaDelModo,
      )
    }
  }

  /**
   * Marca el sexo. Son dos CASILLAS, no una lista.
   *
   * `gender_1` es M y `gender_2` es F, y ninguna tiene `id`. Si el sexo no está en
   * el caso no se marca nada: el dominio ya impide llegar aquí sin él, porque la
   * ficha de Kane lo declara obligatorio.
   */
  private async ponerSexo(pagina: Page, entradas: EntradasCalculadora): Promise<boolean> {
    if (entradas.sexo === undefined) return false
    const selector = entradas.sexo === 'MUJER' ? SEL.sexoMujer : SEL.sexoHombre
    try {
      // Se PULSA la etiqueta. Marcar la casilla de dentro no funciona: está
      // tapada por ella, y Kane responde «Biological sex is required».
      await pagina.click(selector, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Elige el índice queratométrico, si el informe lo trae y Kane lo ofrece.
   *
   * Es una lista cerrada de cinco valores. Si el informe trae uno que no está,
   * **no se elige nada**: se deja el que Kane tiene por defecto. Coger el más
   * parecido cambiaría lo que significan las K sin que nadie se entere.
   */
  private async ponerIndice(pagina: Page, entradas: EntradasCalculadora): Promise<boolean> {
    const nuestro = entradas.valores.INDICE_QUERATOMETRICO
    if (nuestro === undefined) return false
    const opcion = INDICES_DE_KANE.find((i) => Math.abs(i.indice - nuestro) < 0.00005)
    if (!opcion) return false
    try {
      await pagina.selectOption(SEL.indice, opcion.valor, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Pulsa «Calculate».
   *
   * El control real es `<input type="button" value="Calculate">` — **no un
   * `submit`**, que es lo que se había supuesto. Se prueba primero por su
   * selector exacto y después por su papel, que también funciona para un input de
   * tipo botón.
   */
  private async pulsarCalcular(pagina: Page): Promise<void> {
    const candidatos = [
      pagina.locator(SEL.calcular),
      pagina.getByRole('button', { name: /^\s*calculate\s*$/i }),
      pagina.locator('input[type=button][value*="alculate" i]'),
    ]
    for (const c of candidatos) {
      try {
        if ((await c.count()) > 0) {
          await c.first().click({ timeout: 10_000 })
          return
        }
      } catch {
        // siguiente candidato
      }
    }
    throw new ErrorAdaptador(
      'ADAPTER_BROKEN',
      'No se ha encontrado el botón de calcular de Kane. El conector necesita actualizarse: ejecuta «pnpm reconocer:kane».',
      'CALCULANDO',
      SEL.calcular,
    )
  }
  /**
   * Lee lo que Kane ha devuelto. **Contra su pantalla real**, capturada el
   * 12/08/2026 después de una ejecución completa.
   *
   * Así es por dentro:
   *
   *     <div class="res_tab3_wait">Processing… <img waiting.gif></div>   ← mientras calcula
   *     <div class="res_nontoric">                                       ← el resultado
   *       <table class="res_tab3">
   *         <thead><th>IOL Power (D)</th><th>Refraction (D)</th></thead>
   *         <tbody class="res_tab3_lines">
   *           <tr><td>23.5</td><td>-1.47</td></tr>
   *           …
   *           <tr class="table-active"><td>21.5</td><td>-0.06</td></tr>  ← LA SUYA
   *
   * Y hay **una sección por ojo**: la primera es el derecho y la segunda el
   * izquierdo, igual que el formulario.
   */
  private async leerResultado(
    pagina: Page,
    ctx: ContextoEjecucion,
    inicio: number,
    modeloEncontrado: boolean,
  ): Promise<ResultadoCalculadora> {
    const indiceDelOjo = ctx.entradas.ojo === 'OD' ? 0 : 1
    const modo = modoParaKane(ctx.entradas)

    // 1 — Esperar a la SEÑAL REAL: que «Processing…» se esconda. No un reloj.
    await pagina
      .locator(SEL.esperandoResultado)
      .nth(indiceDelOjo)
      .waitFor({ state: 'hidden', timeout: 90_000 })
      .catch(() => {
        throw new ErrorAdaptador(
          'EXTERNAL_ERROR',
          'Kane se ha quedado calculando y no ha terminado. Puedes reintentar solo Kane; el resto de resultados se conserva.',
          'LEYENDO_RESULTADO',
          SEL.esperandoResultado,
        )
      })

    // 1 bis — Que «Processing…» se esconda no significa que la tabla ya esté
    // PINTADA. Medido con capturas reales: el DOM ya tenía las filas rellenas
    // cuando se leían (el resultado numérico siempre salía bien), pero la
    // foto tomada justo aquí salía con la tabla en blanco — la cabecera de
    // entradas sí se veía, la tabla de potencias no. Se espera a la señal
    // real siguiente: que la primera celda de la tabla de ESE ojo tenga
    // texto. Si no llega, se sigue igual: el `evaluate` de después decide si
    // de verdad no hay filas, exactamente como antes de este cambio.
    const selectorPrimeraCelda = (torico: boolean): string =>
      torico ? 'table.res_tab32 tbody tr td' : 'tbody.res_tab3_lines tr td'
    await pagina
      .waitForFunction(
        ({ indice, torico, selector }) => {
          const bloques = document.querySelectorAll(torico ? '.res_toric' : '.res_nontoric')
          const celda = bloques[indice]?.querySelector(selector)
          return celda instanceof HTMLElement && celda.innerText.trim() !== ''
        },
        { indice: indiceDelOjo, torico: modo === 'TORICO', selector: selectorPrimeraCelda(modo === 'TORICO') },
        { timeout: 15_000 },
      )
      .catch(() => {
        // No se lanza aquí: si de verdad no hay filas, el paso siguiente lo
        // dice con un error que ya explica qué hacer.
      })

    // 2 — Leer las tablas de ESE ojo, y de paso lo que la web dice haber recibido.
    //
    // En tórico la pantalla es distinta: el bloque es `.res_toric` y en vez de una
    // tabla hay DOS, porque Kane separa las dos decisiones —qué potencia esférica y
    // qué potencia tórica—.
    const leido = await pagina.evaluate(
      ({ indice, torico }) => {
        const bloques = document.querySelectorAll(torico ? '.res_toric' : '.res_nontoric')
        const bloque = bloques[indice]
        const eco = (clase: string): string => {
          const t = document.querySelectorAll(`table.${clase}`)[indice]
          return t instanceof HTMLElement ? t.innerText.replace(/\s+/g, ' ').trim() : ''
        }
        const filasDe = (selector: string) =>
          [...(bloque?.querySelectorAll(selector) ?? [])].map((f) => ({
            celdas: [...(f as HTMLTableRowElement).cells].map((c) => c.innerText.trim()),
            // Kane marca SU opción con esta clase. Es una marca semántica, no una
            // posición: por eso se puede usar sin inventar nada.
            destacada: (f as HTMLElement).classList.contains('table-active'),
          }))
        return {
          cuantosBloques: bloques.length,
          filas: filasDe(torico ? 'table.res_tab32 tbody tr' : 'tbody.res_tab3_lines tr'),
          filasToricas: torico ? filasDe('table.res_tab42 tbody tr') : [],
          entradas: eco('res_tab1'),
          parametros: eco('res_tab2'),
        }
      },
      { indice: indiceDelOjo, torico: modo === 'TORICO' },
    )

    // 3 — Convertir las tablas en opciones. La regla de «ninguna tórica se marca
    // como recomendada» vive en `construirOpcionesDeKane`, que se prueba sin
    // navegador.
    const { opciones, toricasLeidas } = construirOpcionesDeKane(leido.filas, leido.filasToricas)

    if (modo === 'TORICO' && toricasLeidas === 0) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Se le ha pedido a Kane el cálculo tórico pero no ha devuelto ninguna opción tórica legible. ' +
          'Su pantalla de resultados puede haber cambiado: ejecuta «pnpm reconocer:kane».',
        'LEYENDO_RESULTADO',
        'table.res_tab42 tbody tr',
      )
    }

    if (opciones.length === 0) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Kane no ha devuelto ninguna potencia de lente reconocible. Su pantalla de resultados puede haber cambiado: ejecuta «pnpm reconocer:kane».',
        'LEYENDO_RESULTADO',
        'table.res_tab3 tbody.res_tab3_lines',
      )
    }

    // 4 — Guarda contra leer el ojo equivocado.
    //
    // La sección se elige por su posición, así que esto no es paranoia: Kane
    // repite las entradas en `res_tab1`, y si la AL que enseña no es la que se le
    // mandó, estamos leyendo el otro ojo. Un resultado del ojo equivocado
    // parecería perfectamente válido.
    const alEnviada = ctx.entradas.valores.AL
    const alSegunKane = /AL:\s*([\d.,]+)/i.exec(leido.entradas)?.[1]
    const comoNumero = alSegunKane === undefined ? undefined : Number(alSegunKane.replace(',', '.'))

    if (alEnviada !== undefined && comoNumero !== undefined) {
      if (Math.abs(comoNumero - alEnviada) > 0.005) {
        throw new ErrorAdaptador(
          'ADAPTER_BROKEN',
          `Kane dice haber calculado con una longitud axial de ${comoNumero} y se le envió ${alEnviada}. No se usa este resultado: podría ser del otro ojo.`,
          'LEYENDO_RESULTADO',
          'table.res_tab1',
        )
      }
    } else if (leido.cuantosBloques > 1) {
      // No se ha podido comprobar el eco Y hay resultados de los dos ojos en la
      // pantalla. Entonces el índice es la ÚNICA razón para creer que este bloque es
      // el del ojo que se pidió, y eso no basta: un resultado del ojo equivocado se
      // vería perfectamente válido. Se para en vez de arriesgarse.
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Kane ha devuelto resultados de los dos ojos y no se ha podido comprobar cuál es el de este. ' +
          'No se usa ninguno: preferimos no darte un resultado antes que darte el del otro ojo. ' +
          'Ejecuta «pnpm reconocer:kane» para que el conector aprenda cómo es su pantalla ahora.',
        'LEYENDO_RESULTADO',
        'table.res_tab1',
      )
    }

    // 5 — La recomendada, SOLO si Kane ha marcado una.
    //
    // Si no marca ninguna, se queda sin recomendada y se conservan todas las
    // opciones. Antes se marcaba la fila del medio «porque suele ir en el
    // centro», lo cual era inventarse una recomendación clínica.
    const recomendada = opciones.find((o) => o.recomendada)

    const entradasSegunLaWeb: Record<string, string> = {}
    if (leido.entradas !== '') entradasSegunLaWeb['Biometría'] = leido.entradas
    if (leido.parametros !== '') entradasSegunLaWeb['Parámetros'] = leido.parametros
    entradasSegunLaWeb['Ojo'] = ctx.entradas.ojo === 'OD' ? 'OD (right)' : 'OS (left)'
    entradasSegunLaWeb['Modo'] = modo === 'TORICO' ? 'Tórico' : 'No tórico'

    const aviso =
      ctx.entradas.modeloLente !== undefined && !modeloEncontrado
        ? `Kane no tiene el modelo «${ctx.entradas.modeloLente}» en su lista: se le ha enviado la constante A escrita en el caso.`
        : undefined

    // Lo que hay que decir del tórico, y decirlo bien: Kane da las opciones y NO
    // elige. Callarlo dejaría las casillas de cilindro vacías sin explicación, y
    // vacío se lee como «ha fallado» cuando en realidad es «Kane no se pronuncia».
    const sobreToricas =
      modo === 'TORICO'
        ? `Kane da ${toricasLeidas} opciones tóricas con el astigmatismo que quedaría con cada una, pero **no destaca ninguna**: la elección de la potencia tórica la deja a quien opera. Por eso las casillas de cilindro de su columna están vacías y no porque falte el dato.`
        : 'A Kane se le ha pedido el cálculo NO tórico, porque falta alguno de los datos que su modo tórico necesita (eje de K1, eje de K2, SIA y eje de la incisión). Da esfera y refracción prevista, no cilindro.'

    // La captura se toma aquí, con el eco del AL ya comprobado contra el ojo
    // que se pidió: es la evidencia sin interpretar de lo que ha devuelto Kane.
    const capturaId = await capturarResultado(pagina, ctx, this.calculadora)

    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      // Con potencias y una recomendada marcada por Kane, el resultado está
      // completo. Sin recomendada sigue siendo útil, pero se dice que es parcial.
      estado: recomendada !== undefined ? 'SUCCESS' : 'PARTIAL',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones,
      ...(recomendada !== undefined ? { recomendada } : {}),
      entradasSegunLaWeb,
      mensaje:
        [
          aviso,
          sobreToricas,
          recomendada === undefined
            ? 'Kane no ha destacado ninguna potencia, así que no se marca ninguna como recomendada. Están todas.'
            : undefined,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      capturaId,
    }
  }

  private async aFallo(
    pagina: Page,
    ctx: ContextoEjecucion,
    error: unknown,
    inicio: number,
  ): Promise<ResultadoCalculadora> {
    const esAdaptador = error instanceof ErrorAdaptador
    const captura = await pagina.screenshot({ fullPage: true }).catch(() => undefined)
    const diagnosticoId = await ctx.guardarDiagnostico({
      calculadora: this.calculadora,
      fase: esAdaptador ? error.fase : 'CALCULANDO',
      url: pagina.url(),
      selectorEsperado: esAdaptador ? error.selectorEsperado : undefined,
      errorTecnico: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      captura,
    })

    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      estado: esAdaptador ? error.estado : 'EXTERNAL_ERROR',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones: [],
      mensaje: esAdaptador
        ? error.mensajeUsuario
        : 'Kane no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentar solo Kane.',
      diagnosticoId,
    }
  }
}
