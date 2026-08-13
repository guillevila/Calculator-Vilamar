/**
 * comparar.ts — Poner los tres resultados uno al lado del otro.
 *
 * Lo que este módulo PUEDE decir:
 *   «Kane y EVO coinciden en +21.0 D.»
 *   «2 de 3 calculadoras eligen +21.0 D.»
 *   «El rango entre las esferas destacadas es 0.50 D.»
 *   «Barrett no pudo ejecutarse porque falta el WTW.»
 *
 * Lo que este módulo NO puede decir, ni ahora ni nunca:
 *   «Debes implantar +21.0 D.»
 *   «Nuestra recomendación es…»
 *
 * Calculator Vilamar compara. No hace de cuarta calculadora ni de médico. Si
 * algún día alguien añade aquí una frase que aconseje, estará cambiando lo que
 * es el producto, no mejorándolo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## Por qué una celda no es un número
 *
 * Este fichero tenía una línea que era una recomendación clínica disfrazada de
 * comodidad:
 *
 *     const op = r.recomendada ?? r.opciones.find((o) => o.recomendada) ?? r.opciones[0]
 *                                                                       └────────────┘
 *
 * Ese último tramo **elegía una lente**. Si una calculadora devolvía siete
 * potencias y no señalaba ninguna, la tabla enseñaba la primera —la más alta— con
 * el mismo aspecto que si la web la hubiera destacado. Nadie podía distinguir
 * «esto lo dice Kane» de «esto lo ha elegido el programa».
 *
 * No bastaba con borrar el `?? r.opciones[0]`, porque entonces la celda quedaba
 * vacía y **vacío significaba dos cosas distintas**:
 *
 *   - la calculadora no da ese dato (Kane no publica el eje de la lente);
 *   - la calculadora da VARIAS alternativas y no señala ninguna.
 *
 * De ahí `DatoComparativo`: cada celda declara en cuál de los tres estados está,
 * y **no hay forma de escribir un número sin decir de dónde sale**. La interfaz y
 * el PDF no tienen que adivinarlo, y no pueden equivocarse los dos por separado.
 */

import type { Calculadora, OpcionLente, ResultadoCalculadora } from '../modelo/calculadoras.js'
import { fichaDe } from '../modelo/calculadoras.js'
import type { Lateralidad } from '../modelo/lateralidad.js'

/**
 * Lo que se puede decir de un campo de la tabla comparativa.
 *
 * Tres estados, y ninguno se puede confundir con otro:
 *
 *  - `VALOR` — hay un número, y sale de la opción que **la web señaló** (o de la
 *    única que devolvió). Es el único estado que puede entrar en una comparación
 *    entre calculadoras.
 *  - `VARIAS` — la calculadora ha devuelto varias alternativas para este campo y
 *    **no ha señalado ninguna**. No es un error: es que la elección es de quien
 *    opera. El detalle las lista todas.
 *  - `NO_DISPONIBLE` — ninguna de las opciones trae este dato. La calculadora no
 *    lo publica, o no se sabe leer todavía.
 *
 * ⚠️ **`VARIAS` y `NO_DISPONIBLE` no son lo mismo y no se pintan igual.** Poner
 * un recuento en el cilindro cuando ninguna de las opciones trae cilindro hace
 * pensar que hay tres cilindros. Era el primer fallo que hubo que arreglar.
 *
 * ## Por qué `VARIAS` trae su propio texto
 *
 * El segundo fallo fue más fino: **«3 opciones» repetido en cinco filas seguidas**
 * tampoco decía nada. Tres opciones ¿de qué? Puesto en la fila del cilindro
 * seguía sonando a «tres cilindros», que es justo lo que se quería evitar.
 *
 * Ahora una de las filas —la que de verdad IDENTIFICA las alternativas— dice qué
 * son: «3 alternativas tóricas». Las demás, cuyo valor depende de cuál de las tres
 * se consulte, dicen «Ver alternativas» y remiten al detalle.
 *
 * El texto viaja DENTRO del dato, no lo compone cada pantalla. Así la interfaz y
 * el PDF no pueden decir cosas distintas de lo mismo, que es exactamente lo que
 * pasó la primera vez.
 */
export type DatoComparativo<T = number> =
  | { readonly estado: 'VALOR'; readonly valor: T }
  | {
      readonly estado: 'VARIAS'
      readonly cuantas: number
      /** Qué poner en la casilla: «3 alternativas tóricas» o «Ver alternativas». */
      readonly etiqueta: string
      /** Si esta es la fila que nombra las alternativas. Las demás remiten a ella. */
      readonly lasNombra: boolean
    }
  | { readonly estado: 'NO_DISPONIBLE' }

/**
 * Qué ha dado la calculadora, mirado como decisión y no como número.
 *
 * `DESTACADA` es el único caso en el que existe «el resultado de la
 * calculadora». En los demás existen **opciones**, que es otra cosa.
 */
export type SeleccionDeLaCalculadora =
  /** La web ha señalado una opción de verdad. Solo entonces se llama destacada. */
  | { readonly clase: 'DESTACADA'; readonly opcion: OpcionLente }
  /**
   * Ha devuelto exactamente una. Se puede enseñar —es su única salida— pero **no
   * se llama destacada**, porque la web no ha dicho nada al respecto.
   */
  | { readonly clase: 'UNICA'; readonly opcion: OpcionLente }
  /** Varias, sin señalar ninguna. No se elige por ella. */
  | { readonly clase: 'VARIAS'; readonly cuantas: number }
  /** No se ejecutó, falló, o no devolvió ninguna opción. */
  | { readonly clase: 'SIN_RESULTADO' }

export interface CeldaComparativa {
  readonly calculadora: Calculadora
  readonly nombre: string
  readonly ejecutada: boolean
  readonly estado: ResultadoCalculadora['estado'] | 'NO_EJECUTADA'
  /** De dónde sale —o por qué no sale— lo que se enseña en esta columna. */
  readonly seleccion: SeleccionDeLaCalculadora
  readonly esfera: DatoComparativo
  readonly cilindro: DatoComparativo
  readonly eje: DatoComparativo
  readonly designacion: DatoComparativo<string>
  readonly refraccionPrevista: DatoComparativo
  readonly cilindroResidual: DatoComparativo
  readonly ejeResidual: DatoComparativo
  /**
   * Todas las opciones que devolvió la calculadora, en su orden.
   *
   * Van en la celda para que el detalle enseñe **exactamente lo que vino de la
   * web**, sin que la interfaz tenga que volver al resultado por su cuenta y sin
   * que nadie pueda recomponer una selección por el camino.
   */
  readonly opciones: readonly OpcionLente[]
  /** Por qué no hay datos, en lenguaje normal. */
  readonly motivo?: string
}

export type TipoObservacion = 'CONCORDANCIA' | 'DISCREPANCIA' | 'AVISO' | 'FALLO'

export interface Observacion {
  readonly tipo: TipoObservacion
  readonly texto: string
}

export interface Comparativa {
  readonly ojo: Lateralidad
  readonly celdas: readonly CeldaComparativa[]
  readonly observaciones: readonly Observacion[]
  /**
   * Cuántas calculadoras dieron un resultado utilizable.
   *
   * Cuenta también las que devolvieron varias opciones sin señalar ninguna: eso
   * es un resultado, aunque no sea una elección.
   */
  readonly conResultado: number
  /** Cuántas se pueden comparar entre sí, o sea cuántas tienen esfera con VALOR. */
  readonly comparables: number
}

const TEXTO_ESTADO: Record<ResultadoCalculadora['estado'] | 'NO_EJECUTADA', string> = {
  SUCCESS: 'Correcto',
  PARTIAL: 'Resultado incompleto',
  NEEDS_USER_ACTION: 'Necesita que hagas algo en el navegador',
  MISSING_INPUTS: 'Faltan datos',
  EXTERNAL_ERROR: 'La web no respondió como se esperaba',
  ADAPTER_BROKEN: 'La web ha cambiado y hay que actualizar el conector',
  NO_EJECUTADA: 'No se ha lanzado',
}

export function textoEstado(estado: ResultadoCalculadora['estado'] | 'NO_EJECUTADA'): string {
  return TEXTO_ESTADO[estado]
}

const SIN_DATO = { estado: 'NO_DISPONIBLE' } as const

/**
 * Decide qué ha dado la calculadora, **sin elegir nada por ella**.
 *
 * ⚠️ Aquí está la regla que no se toca: una opción es destacada **solo** si la web
 * la señaló. `r.recomendada` lo pone el adaptador al ver la marca de la web —en
 * Kane, la clase `table-active` de la fila—, y `o.recomendada` es esa misma marca
 * en cada opción. No hay tercera vía:
 *
 *  - ni la primera, ni la última, ni la del medio;
 *  - ni la de refracción más cercana a cero;
 *  - ni la más cercana al objetivo.
 *
 * Todas esas serían una regla nuestra, y una regla nuestra convierte a Calculator
 * Vilamar en quien elige la lente.
 */
export function seleccionDe(r: ResultadoCalculadora): SeleccionDeLaCalculadora {
  const utilizable = r.estado === 'SUCCESS' || r.estado === 'PARTIAL'
  if (!utilizable || r.opciones.length === 0) return { clase: 'SIN_RESULTADO' }

  const destacada = r.recomendada ?? r.opciones.find((o) => o.recomendada)
  if (destacada !== undefined) return { clase: 'DESTACADA', opcion: destacada }

  const unica = r.opciones.length === 1 ? r.opciones[0] : undefined
  if (unica !== undefined) return { clase: 'UNICA', opcion: unica }

  return { clase: 'VARIAS', cuantas: r.opciones.length }
}

/**
 * Qué se puede decir de UN campo, dada la selección y las opciones.
 *
 * El orden de las preguntas es el que hace que «no hay dato» y «hay varias» no se
 * confundan:
 *
 *  1. Si la web señaló una opción (o solo hay una) y **esa** trae el dato → el dato.
 *  2. Si no, se mira si alguna opción lo trae:
 *     - ninguna → `NO_DISPONIBLE`. Es el caso de Kane y el eje de la lente: no lo
 *       publica, así que no hay «3 opciones» que enseñar.
 *     - todas, y todas con el mismo valor → ese valor. No hay nada que elegir:
 *       salga la que salga, el dato es el mismo.
 *     - varias, y distintas → `VARIAS`. Ahí sí hay alternativas de verdad.
 */
function datoDe<T>(
  seleccion: SeleccionDeLaCalculadora,
  opciones: readonly OpcionLente[],
  leer: (o: OpcionLente) => T | undefined,
): DatoComparativo<T> {
  if (seleccion.clase === 'SIN_RESULTADO') return SIN_DATO

  if (seleccion.clase === 'DESTACADA' || seleccion.clase === 'UNICA') {
    const v = leer(seleccion.opcion)
    if (v !== undefined) return { estado: 'VALOR', valor: v }
    // La opción señalada no trae este campo. Puede que otras sí —Kane señala una
    // potencia esférica y aparte da alternativas tóricas con su cilindro—, así que
    // se sigue mirando en vez de dar el dato por perdido.
  }

  const presentes = opciones.map(leer).filter((v): v is T => v !== undefined)
  if (presentes.length === 0) return SIN_DATO

  const distintos = new Set(presentes.map((v) => String(v)))
  if (distintos.size === 1 && presentes.length === opciones.length) {
    return { estado: 'VALOR', valor: presentes[0] as T }
  }

  // La etiqueta se pone después, cuando se ven todos los campos a la vez: hasta
  // entonces no se sabe cuál de ellos nombra las alternativas.
  return { estado: 'VARIAS', cuantas: presentes.length, etiqueta: '', lasNombra: false }
}

/** El número de una celda, solo si es un VALOR. Para las comparaciones. */
function soloValor(d: DatoComparativo): number | undefined {
  return d.estado === 'VALOR' ? d.valor : undefined
}

/** Los campos de una celda que pueden estar en `VARIAS`, y qué clase de alternativa son. */
const CAMPOS_COMPARADOS = [
  // El orden importa: el primero que esté en VARIAS es el que las nombra. Va
  // primero la designación —«Non-toric», «T3», «T4»— porque es lo que de verdad
  // identifica una alternativa tórica; el cilindro después, por si la web da
  // potencias tóricas sin ponerles nombre.
  { campo: 'designacion', clase: 'tóricas' },
  { campo: 'cilindro', clase: 'tóricas' },
  { campo: 'eje', clase: 'tóricas' },
  { campo: 'cilindroResidual', clase: 'tóricas' },
  { campo: 'ejeResidual', clase: 'tóricas' },
  { campo: 'esfera', clase: 'de potencia' },
  { campo: 'refraccionPrevista', clase: 'de potencia' },
] as const

type CampoComparado = (typeof CAMPOS_COMPARADOS)[number]['campo']

/**
 * Pone el texto de cada casilla que está en `VARIAS`.
 *
 * Existe porque un recuento repetido no informa. Con cinco filas diciendo «3
 * opciones» seguidas, la pregunta que queda es «tres opciones ¿de qué?», y en la
 * fila del cilindro se sigue leyendo como «tres cilindros».
 *
 * Así que **una fila las nombra y las demás remiten a ella**:
 *
 *     Cilindro             Ver alternativas
 *     Modelo tórico        3 alternativas tóricas     ← la que las nombra
 *     Cilindro residual    Ver alternativas
 *     Eje residual         Ver alternativas
 *
 * La que las nombra es la primera de `CAMPOS_COMPARADOS` que esté en `VARIAS`, y
 * de ahí sale también si son tóricas o de potencia. No se inventa nada: si las
 * alternativas llevan designación, son tóricas; si lo que cambia es la esfera, son
 * de potencia.
 */
function etiquetar(
  campos: Record<CampoComparado, DatoComparativo<never>>,
): Record<CampoComparado, DatoComparativo<never>> {
  const nombradora = CAMPOS_COMPARADOS.find(({ campo }) => campos[campo].estado === 'VARIAS')
  if (!nombradora) return campos

  const cabecera = campos[nombradora.campo]
  if (cabecera.estado !== 'VARIAS') return campos
  const titulo = `${cabecera.cuantas} alternativas ${nombradora.clase}`

  const salida = { ...campos }
  for (const { campo } of CAMPOS_COMPARADOS) {
    const d = campos[campo]
    if (d.estado !== 'VARIAS') continue
    const lasNombra = campo === nombradora.campo
    salida[campo] = {
      ...d,
      lasNombra,
      // «Ver alternativas» y no un recuento: el número ya está dicho una vez, y
      // repetirlo en cada fila es lo que lo volvía ruido.
      etiqueta: lasNombra ? titulo : 'Ver alternativas',
    }
  }
  return salida
}

function aCelda(calculadora: Calculadora, r: ResultadoCalculadora | undefined): CeldaComparativa {
  const nombre = fichaDe(calculadora).nombre
  if (!r) {
    return {
      calculadora,
      nombre,
      ejecutada: false,
      estado: 'NO_EJECUTADA',
      seleccion: { clase: 'SIN_RESULTADO' },
      esfera: SIN_DATO,
      cilindro: SIN_DATO,
      eje: SIN_DATO,
      designacion: SIN_DATO,
      refraccionPrevista: SIN_DATO,
      cilindroResidual: SIN_DATO,
      ejeResidual: SIN_DATO,
      opciones: [],
    }
  }

  const seleccion = seleccionDe(r)
  const ops = r.opciones

  // Se calculan todos los campos primero y se etiquetan después: hasta verlos
  // juntos no se sabe cuál de ellos nombra las alternativas.
  const campos = etiquetar({
    designacion: datoDe(seleccion, ops, (o) => o.designacion) as DatoComparativo<never>,
    cilindro: datoDe(seleccion, ops, (o) => o.cilindro) as DatoComparativo<never>,
    eje: datoDe(seleccion, ops, (o) => o.eje) as DatoComparativo<never>,
    cilindroResidual: datoDe(seleccion, ops, (o) => o.cilindroResidual) as DatoComparativo<never>,
    ejeResidual: datoDe(seleccion, ops, (o) => o.ejeResidual) as DatoComparativo<never>,
    esfera: datoDe(seleccion, ops, (o) => o.esfera) as DatoComparativo<never>,
    refraccionPrevista: datoDe(
      seleccion,
      ops,
      (o) => o.refraccionPrevista,
    ) as DatoComparativo<never>,
  })

  return {
    calculadora,
    nombre,
    ejecutada: true,
    estado: r.estado,
    seleccion,
    esfera: campos.esfera as DatoComparativo,
    cilindro: campos.cilindro as DatoComparativo,
    eje: campos.eje as DatoComparativo,
    designacion: campos.designacion as DatoComparativo<string>,
    refraccionPrevista: campos.refraccionPrevista as DatoComparativo,
    cilindroResidual: campos.cilindroResidual as DatoComparativo,
    ejeResidual: campos.ejeResidual as DatoComparativo,
    opciones: ops,
    motivo: r.mensaje,
  }
}

/** Distancia entre dos ejes entendidos como orientación (0–90). */
export function distanciaEntreEjes(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 180
  return bruta > 90 ? 180 - bruta : bruta
}

function formatearD(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)} D`
}

/**
 * Agrupa valores que son iguales y cuenta cuántas calculadoras los eligen.
 * Se compara con dos decimales para que 21 y 21.00 sean el mismo valor.
 */
function agrupar(valores: readonly { calculadora: string; valor: number }[]) {
  const grupos = new Map<string, { valor: number; quienes: string[] }>()
  for (const v of valores) {
    const clave = v.valor.toFixed(2)
    const g = grupos.get(clave)
    if (g) g.quienes.push(v.calculadora)
    else grupos.set(clave, { valor: v.valor, quienes: [v.calculadora] })
  }
  return [...grupos.values()].sort((a, b) => b.quienes.length - a.quienes.length)
}

function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Construye la comparativa de un ojo.
 *
 * `resultados` puede tener huecos: una calculadora que no se ejecutó, o que
 * falló, aparece igualmente en la tabla con su motivo. Un fallo no borra a las
 * demás.
 *
 * **Solo se comparan entre sí los campos en estado `VALOR`.** Una calculadora que
 * ha devuelto varias alternativas sin señalar ninguna no entra en «coinciden en
 * 21.50 D»: no se sabe cuál es la suya, y meterla obligaría a elegir una.
 */
export function compararOjo(
  ojo: Lateralidad,
  resultados: Partial<Record<Calculadora, ResultadoCalculadora>>,
  ordenColumnas: readonly Calculadora[] = ['KANE', 'EVO_TORIC', 'BARRETT_TORIC'],
): Comparativa {
  const celdas = ordenColumnas.map((c) => aCelda(c, resultados[c]))
  const observaciones: Observacion[] = []
  const conDatos = celdas.filter((c) => c.esfera.estado === 'VALOR')

  // ── Esferas ───────────────────────────────────────────────────────────────
  if (conDatos.length >= 2) {
    const esferas = conDatos.map((c) => ({
      calculadora: c.nombre,
      valor: soloValor(c.esfera) as number,
    }))
    const grupos = agrupar(esferas)
    const mayoritario = grupos[0]

    if (mayoritario && mayoritario.quienes.length === conDatos.length) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `Las ${conDatos.length} calculadoras coinciden en ${formatearD(mayoritario.valor)} de esfera.`,
      })
    } else if (mayoritario && mayoritario.quienes.length >= 2) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto:
          `${enumerar(mayoritario.quienes)} coinciden en ${formatearD(mayoritario.valor)} ` +
          `(${mayoritario.quienes.length} de ${conDatos.length}).`,
      })
    }

    const valores = esferas.map((e) => e.valor)
    const rango = Math.max(...valores) - Math.min(...valores)
    if (rango > 0) {
      observaciones.push({
        tipo: rango >= 0.5 ? 'DISCREPANCIA' : 'CONCORDANCIA',
        texto: `El rango entre las esferas destacadas es ${rango.toFixed(2)} D.`,
      })
    }
  } else if (conDatos.length === 1) {
    observaciones.push({
      tipo: 'AVISO',
      texto: `Solo una calculadora ha dado una esfera comparable (${conDatos[0]?.nombre}). No hay nada con lo que compararla.`,
    })
  }

  // ── Cilindro ──────────────────────────────────────────────────────────────
  const conCilindro = celdas.filter((c) => c.cilindro.estado === 'VALOR')
  if (conCilindro.length >= 2) {
    const grupos = agrupar(
      conCilindro.map((c) => ({ calculadora: c.nombre, valor: soloValor(c.cilindro) as number })),
    )
    const mayoritario = grupos[0]
    if (mayoritario && mayoritario.quienes.length >= 2) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `${enumerar(mayoritario.quienes)} coinciden en un cilindro de ${mayoritario.valor.toFixed(2)} D.`,
      })
    } else {
      observaciones.push({
        tipo: 'DISCREPANCIA',
        texto: `Cada calculadora propone un cilindro distinto: ${conCilindro
          .map((c) => `${c.nombre} ${(soloValor(c.cilindro) as number).toFixed(2)} D`)
          .join(', ')}.`,
      })
    }
  }

  // ── Eje ───────────────────────────────────────────────────────────────────
  const conEje = celdas.filter((c) => c.eje.estado === 'VALOR')
  if (conEje.length >= 2) {
    let maxima = 0
    let entre: [string, string] = ['', '']
    for (let i = 0; i < conEje.length; i++) {
      for (let j = i + 1; j < conEje.length; j++) {
        const a = conEje[i]
        const b = conEje[j]
        if (!a || !b) continue
        const d = distanciaEntreEjes(soloValor(a.eje) as number, soloValor(b.eje) as number)
        if (d > maxima) {
          maxima = d
          entre = [a.nombre, b.nombre]
        }
      }
    }
    if (maxima === 0) {
      observaciones.push({
        tipo: 'CONCORDANCIA',
        texto: `Todas las calculadoras coinciden en el eje (${soloValor(conEje[0]!.eje)}°).`,
      })
    } else {
      observaciones.push({
        tipo: maxima >= 5 ? 'DISCREPANCIA' : 'CONCORDANCIA',
        texto: `${entre[0]} y ${entre[1]} difieren ${maxima.toFixed(0)}° en el eje.`,
      })
    }
  }

  // ── Las que han devuelto alternativas sin señalar ninguna ──────────────────
  //
  // Se dice, y se dice sin alarma: no es un fallo. La calculadora ha calculado y
  // ha devuelto varias salidas porque la elección no es suya. Callarlo dejaría la
  // columna con huecos sin explicación, que es como se leyó al probarlo.
  for (const c of celdas) {
    if (c.seleccion.clase !== 'VARIAS') continue
    observaciones.push({
      tipo: 'AVISO',
      texto:
        `${c.nombre} ha devuelto ${c.seleccion.cuantas} alternativas y no ha señalado ninguna como preferente. ` +
        'Están todas en el detalle; la elección no la hace el programa.',
    })
  }

  // ── Lo que no salió ───────────────────────────────────────────────────────
  for (const c of celdas) {
    if (c.seleccion.clase !== 'SIN_RESULTADO') continue
    const explicacion = c.motivo ? ` ${c.motivo}` : ''
    observaciones.push({
      tipo: c.estado === 'NO_EJECUTADA' ? 'AVISO' : 'FALLO',
      texto: `${c.nombre}: ${textoEstado(c.estado).toLowerCase()}.${explicacion}`,
    })
  }

  return {
    ojo,
    celdas,
    observaciones,
    conResultado: celdas.filter((c) => c.seleccion.clase !== 'SIN_RESULTADO').length,
    comparables: conDatos.length,
  }
}
