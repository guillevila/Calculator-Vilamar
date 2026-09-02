/**
 * caso.ts — Un cálculo de principio a fin.
 *
 * Un caso es todo lo que pasa desde que se sube un informe hasta que sale el
 * PDF: los documentos, lo que se leyó de ellos, lo que corrigió el cirujano, lo
 * que dijo cada calculadora y qué falló.
 *
 * El estado del caso NO es decorativo: es lo que impide que un dato sin revisar
 * llegue a una calculadora. El paso de `EN_REVISION` a `CONFIRMADO` solo puede
 * darlo una persona.
 */

import type { Calculadora, ResultadoCalculadora } from './calculadoras.js'
import { CALCULADORAS, VARIANTE_CARA_POSTERIOR } from './calculadoras.js'
import type { DocumentoCargado } from './documento.js'
import type { Lateralidad } from './lateralidad.js'
import type { LenteDetectada } from './lente.js'
import type { SexoDelCaso } from './sexo.js'
import type { OjoBiometrico } from './medida.js'
import { APARATO_PRINCIPAL, ojoVacio, todasConfirmadas } from './medida.js'

export type EstadoCaso =
  /** Recién creado, sin nada dentro. */
  | 'BORRADOR'
  /** Hay documentos, todavía sin leer. */
  | 'DOCUMENTOS_CARGADOS'
  /** Se ha leído lo que se ha podido; falta que lo mire una persona. */
  | 'EN_REVISION'
  /** Una persona ha revisado y confirmado los datos. Solo desde aquí se calcula. */
  | 'CONFIRMADO'
  /** Se está hablando con las calculadoras. */
  | 'CALCULANDO'
  /** Ha terminado el ciclo, con éxito total o parcial. */
  | 'COMPLETADO'

export const NOMBRE_ESTADO: Readonly<Record<EstadoCaso, string>> = {
  BORRADOR: 'Nuevo cálculo',
  DOCUMENTOS_CARGADOS: 'Documentos cargados',
  EN_REVISION: 'Pendiente de revisión',
  CONFIRMADO: 'Datos confirmados',
  CALCULANDO: 'Calculando',
  COMPLETADO: 'Terminado',
}

export interface Caso {
  readonly id: string
  /**
   * Código local, corto y legible: «CV-2026-0007».
   *
   * Es un identificador de ESTE programa. No es el número de historia del
   * paciente y no debe serlo nunca: es lo único que se manda a las webs
   * externas cuando exigen un nombre.
   */
  readonly codigo: string
  readonly estado: EstadoCaso
  readonly creadoEn: string
  readonly actualizadoEn: string
  readonly documentos: readonly DocumentoCargado[]
  /**
   * Los conjuntos de medidas de cada ojo — uno por aparato/biómetro (D47,
   * 27/08/2026).
   *
   * Antes de D47 cada ojo tenía como mucho un `OjoBiometrico`. Ahora puede
   * tener varios, en paralelo, cada uno con su propio `aparato`
   * (`OjoBiometrico.aparato`) — el mismo OD leído por el IOLMaster y por el
   * ANTERION son dos entradas distintas de esta misma lista, ninguna pisa a
   * la otra. Un caso que solo usa un aparato tiene siempre exactamente una
   * entrada por ojo, con `aparato: APARATO_PRINCIPAL` — así no cambia nada
   * para quien no necesita varios. Se accede con `ojoDe`/`datasetsDe`, nunca
   * indexando este campo directamente.
   */
  readonly ojos: Readonly<Partial<Record<Lateralidad, readonly OjoBiometrico[]>>>
  /**
   * Resultados por calculadora, ojo y aparato. La clave es
   * `${calculadora}:${ojo}:${aparato}` (`claveResultado`).
   */
  readonly resultados: Readonly<Record<string, ResultadoCalculadora>>
  /**
   * Qué ojos tienen ya reconocida una discrepancia entre sus aparatos (D47,
   * 27/08/2026) — petición expresa del dueño del proyecto: si dos biómetros
   * del mismo ojo dan datos muy distintos, no se calcula sin que una persona
   * lo haya comprobado explícitamente. Se BORRA (no se enseña aquí, lo hace
   * `apps/desktop`) en cuanto se edita cualquier dato de ese ojo, para que un
   * reconocimiento viejo no tape una discrepancia nueva.
   */
  readonly discrepanciasReconocidas?: Readonly<Partial<Record<Lateralidad, boolean>>>
  /** Modelo de lente elegido para este caso — la que se calcula ahora mismo. */
  readonly lente?: LenteElegida
  /**
   * Una segunda lente candidata, para comparar con la misma biometría sin
   * volver a escribir ningún dato (D55, 01/09/2026).
   *
   * **No participa en ningún cálculo mientras esté aquí.** Solo es una
   * elección aparcada — `intercambiarLentes()` es lo único que la activa,
   * y al hacerlo pasa a ser `lente` (con su propia constante A, con las
   * mismas cuatro reglas de `elegirLente`) y la que era `lente` pasa aquí.
   * Nunca hay dos lentes activas a la vez: `lente` es siempre la única que
   * de verdad viaja a las tres calculadoras.
   */
  readonly lenteSecundaria?: LenteElegida
  /**
   * Las lentes que el informe nombra, con la constante que les asocia.
   *
   * Van aquí y **no** por ojo porque la constante A pertenece al modelo de lente,
   * no al ojo: la misma lente se implanta con la misma constante mire quien mire.
   * Que después se use para calcular OD o OS es otra cosa.
   *
   * Ninguna de estas se convierte en `CONSTANTE_A` por su cuenta. Un informe con
   * cuatro lentes tiene cuatro constantes posibles y **ninguna es la del caso**
   * hasta que una persona elige el modelo.
   */
  readonly lentesDelInforme?: readonly LenteDetectada[]
  /**
   * El sexo del paciente. Lo pide Kane; EVO y Barrett no.
   *
   * Va en el CASO y no en el ojo porque es de la persona. En el ojo habría que
   * guardarlo dos veces y podrían acabar diciendo cosas distintas.
   */
  readonly sexo?: SexoDelCaso
  /**
   * El nombre del paciente.
   *
   * Entró al programa el 12/08/2026 solo para deducir el sexo que pide Kane.
   * Desde el 27/08/2026 (D44) **también viaja a las tres calculadoras y al
   * PDF**, en el campo «Patient Name»/«Nombre del paciente» — petición
   * expresa del dueño del proyecto, hecha DOS VECES tras dos avisos
   * explícitos: la primera vez sobre el informe local, la segunda,
   * específica, sobre que esto manda el nombre real a tres servidores
   * externos por internet, algo que ninguna decisión anterior había hecho
   * (ni siquiera D41, que abrió esa puerta solo para el cirujano). El dueño
   * confirmó las dos veces, informado.
   *
   * Sigue habiendo un límite que no se ha tocado: **no entra en el
   * repositorio** — los fixtures siguen siendo sintéticos — y sigue viviendo
   * solo en el fichero JSON del caso, en la carpeta de datos del usuario.
   */
  readonly nombrePaciente?: string
  /**
   * El nombre del cirujano, si se ha escrito.
   *
   * Viaja a las tres calculadoras cuando su formulario tiene un campo
   * «Doctor»/«Surgeon» (D41, 25/08/2026). Desde D44, `nombrePaciente` hace
   * lo mismo — ya no hay una regla que trate a los dos de forma distinta.
   */
  readonly nombreCirujano?: string
  /** Notas del usuario. No se envían a ningún sitio. */
  readonly notas?: string
}

export interface LenteElegida {
  readonly fabricante?: string
  readonly modelo?: string
  /**
   * Cómo se llama ese modelo en el desplegable propio de cada web, cuando
   * difiere del nombre general (petición expresa del dueño, 27/08/2026):
   * el mismo B&L LuxSmart, por ejemplo, es «B&L LuxSmart» en EVO y «B+L
   * LuxSmart Toric» en Kane. Sin especificarlo, cada adaptador busca
   * `modelo` tal cual — sigue funcionando para las lentes que ya se llaman
   * igual en las tres.
   */
  readonly nombreEnEvo?: string
  readonly nombreEnKane?: string
  readonly nombreEnBarrett?: string
  /**
   * Si la `CONSTANTE_A` del caso salió de la tabla de lentes del informe, de qué
   * modelo y con qué valor.
   *
   * No es información redundante: es lo que permite **cambiar de lente sin
   * arrastrar la constante de la anterior**. Al elegir otro modelo hay que saber
   * si la constante que hay pertenecía a la lente vieja —y entonces sobra— o si
   * venía de una línea suelta del informe o la escribió una persona —y entonces
   * se respeta—. Sin esto habría que adivinarlo mirando la evidencia, que es
   * exactamente la clase de deducción frágil que este modelo evita.
   */
  readonly constanteDeLaTabla?: { readonly modelo: string; readonly valor: number }
}

export function claveResultado(
  calculadora: Calculadora,
  ojo: Lateralidad,
  aparato: string = APARATO_PRINCIPAL,
): string {
  return `${calculadora}:${ojo}:${aparato}`
}

export function casoNuevo(id: string, codigo: string, cuando: string): Caso {
  return {
    id,
    codigo,
    estado: 'BORRADOR',
    creadoEn: cuando,
    actualizadoEn: cuando,
    documentos: [],
    ojos: {},
    resultados: {},
  }
}

/** Todos los conjuntos de medidas de un ojo — uno por aparato. Vacío si el ojo no tiene ninguno. */
export function datasetsDe(caso: Caso, lado: Lateralidad): readonly OjoBiometrico[] {
  return caso.ojos[lado] ?? []
}

/** Solo los nombres de los aparatos presentes en ese ojo, para pintar un selector. */
export function aparatosDe(caso: Caso, lado: Lateralidad): readonly string[] {
  return datasetsDe(caso, lado).map((o) => o.aparato)
}

export function ojosDelCaso(caso: Caso): readonly Lateralidad[] {
  return (['OD', 'OS'] as const).filter((l) => datasetsDe(caso, l).length > 0)
}

/**
 * El conjunto de medidas de un ojo y un aparato concretos.
 *
 * Sin especificar `aparato`, coge `APARATO_PRINCIPAL` — el que usan todos los
 * casos que no necesitan varios biómetros (D47). Si ese aparato todavía no
 * existe para este ojo, devuelve un ojo vacío con esa etiqueta, nunca lanza:
 * es el mismo patrón perezoso de siempre, ahora también en esta dimensión.
 */
export function ojoDe(
  caso: Caso,
  lado: Lateralidad,
  aparato: string = APARATO_PRINCIPAL,
): OjoBiometrico {
  return datasetsDe(caso, lado).find((o) => o.aparato === aparato) ?? ojoVacio(lado, aparato)
}

/**
 * Las calculadoras a mostrar en la comparativa, en orden.
 *
 * Desde el 28/08/2026, cada variante de córnea posterior (D45: EVO
 * «Predicted»/«Measured PCA», Barrett «Predicted»/«Measured PCA») es una
 * casilla que se pide por su cuenta, con su propio botón en la pantalla de
 * cálculo — ya no se añade sola detrás de su base cuando el dataset tiene
 * PK1 o PK2. Por eso esta lista ya no depende de ningún caso ni ojo
 * concreto: son las mismas cinco columnas siempre, y la que no se haya
 * pedido para un ojo sale como «no calculada» en su casilla, no desaparece
 * de la tabla — así se ve que existía la opción, no solo lo que se usó.
 *
 * El orden dentro de cada pareja es siempre el mismo — Predicted primero,
 * Measured PCA después — sea cuál sea la base y cuál la variante (EVO se la
 * quita; Barrett se la añade).
 *
 * `BARRETT_TRUE_K_TORIC` (D67, 02/09/2026) se añade al final, junto a las
 * de Barrett: no es una variante de córnea posterior —no forma pareja con
 * ninguna base— sino la calculadora que SUSTITUYE a Barrett Toric entero
 * en un ojo con córnea especial. Sale siempre como columna, igual que las
 * demás: en un ojo sin córnea especial se ve «no calculada», con el motivo
 * exacto (`prepararEntradas()` la bloquea a propósito), en vez de
 * desaparecer y parecer que no existe la opción.
 */
export const COLUMNAS_COMPARATIVA: readonly Calculadora[] = [
  ...CALCULADORAS.flatMap((c) => {
    const variante = VARIANTE_CARA_POSTERIOR[c]
    if (!variante) return [c]
    return variante.sentido === 'SIN' ? [variante.calculadora, c] : [c, variante.calculadora]
  }),
  'BARRETT_TRUE_K_TORIC',
]

/**
 * Añade o sustituye un conjunto de medidas. La clave es `(lateralidad, aparato)`:
 * dos llamadas con el mismo ojo y el mismo aparato sustituyen esa entrada; con
 * aparatos distintos, se guardan las dos, una junto a la otra (D47).
 */
export function conOjo(caso: Caso, ojo: OjoBiometrico, cuando: string): Caso {
  const previos = datasetsDe(caso, ojo.lateralidad)
  const yaEstaba = previos.some((o) => o.aparato === ojo.aparato)
  const actualizados = yaEstaba
    ? previos.map((o) => (o.aparato === ojo.aparato ? ojo : o))
    : [...previos, ojo]
  return {
    ...caso,
    ojos: { ...caso.ojos, [ojo.lateralidad]: actualizados },
    actualizadoEn: cuando,
  }
}

/**
 * Cambia el nombre de un aparato ya existente, sin tocar sus medidas
 * (petición expresa del dueño, 27/08/2026): el primer aparato de un ojo
 * arranca siempre como `APARATO_PRINCIPAL` (D47) y, hasta ahora, la única
 * forma de decir de qué biómetro era de verdad era añadir uno SEGUNDO — con
 * esto se puede elegir o escribir el nombre del primero sin necesitar un
 * segundo aparato.
 *
 * No hace nada si `aparatoViejo` no existe en ese ojo (nada que renombrar)
 * ni si ya coincide con `aparatoNuevo`. **Lanza** si `aparatoNuevo` ya
 * pertenece a OTRO aparato de ese mismo ojo — fusionar dos conjuntos de
 * medidas distintos bajo el mismo nombre perdería uno de los dos en
 * silencio, y eso es justo lo que este programa no hace.
 */
export function conAparatoRenombrado(
  caso: Caso,
  lado: Lateralidad,
  aparatoViejo: string,
  aparatoNuevo: string,
  cuando: string,
): Caso {
  if (aparatoViejo === aparatoNuevo) return caso
  const datasets = datasetsDe(caso, lado)
  if (!datasets.some((o) => o.aparato === aparatoViejo)) return caso
  if (datasets.some((o) => o.aparato === aparatoNuevo)) {
    throw new Error(
      `Ya hay un aparato llamado «${aparatoNuevo}» en ${lado}. Elige otro nombre, o edita ese aparato directamente.`,
    )
  }
  const actualizados = datasets.map((o) =>
    o.aparato === aparatoViejo ? { ...o, aparato: aparatoNuevo } : o,
  )
  return {
    ...caso,
    ojos: { ...caso.ojos, [lado]: actualizados },
    actualizadoEn: cuando,
  }
}

export function conResultado(
  caso: Caso,
  resultado: ResultadoCalculadora,
  cuando: string,
  aparato: string = APARATO_PRINCIPAL,
): Caso {
  return {
    ...caso,
    resultados: {
      ...caso.resultados,
      [claveResultado(resultado.calculadora, resultado.ojo, aparato)]: resultado,
    },
    actualizadoEn: cuando,
  }
}

export function resultadoDe(
  caso: Caso,
  calculadora: Calculadora,
  ojo: Lateralidad,
  aparato: string = APARATO_PRINCIPAL,
): ResultadoCalculadora | undefined {
  return caso.resultados[claveResultado(calculadora, ojo, aparato)]
}

/**
 * ¿Se puede confirmar este dataset concreto (un ojo, un aparato)?
 *
 * Desde D47 (27/08/2026), la confirmación es independiente por aparato —
 * petición expresa del dueño del proyecto: se puede confirmar y calcular un
 * biómetro mientras otro, del mismo ojo, sigue a medias. Ya no existe un
 * único «¿se puede confirmar EL CASO?» que exija todos los ojos y aparatos a
 * la vez.
 */
export function sePuedeConfirmarDataset(caso: Caso, lado: Lateralidad, aparato: string): boolean {
  return todasConfirmadas(ojoDe(caso, lado, aparato))
}

/**
 * ¿Hay al menos un dataset, de algún ojo, ya confirmado?
 *
 * Es la condición mínima para que el caso deje de estar «en revisión» y
 * pueda entrar en la pantalla de cálculo — no exige que TODO esté
 * confirmado, porque desde D47 nunca hace falta: cada dataset se calcula
 * cuando el suyo lo esté, sin esperar a los demás.
 */
export function sePuedeConfirmar(caso: Caso): boolean {
  return ojosDelCaso(caso).some((lado) =>
    datasetsDe(caso, lado).some((o) => sePuedeConfirmarDataset(caso, lado, o.aparato)),
  )
}

/**
 * Marca el caso como CONFIRMADO — la puerta que le deja entrar en la
 * pantalla de cálculo. No es lo mismo que «todo listo para calcular»: eso lo
 * decide, dataset a dataset, `sePuedeConfirmarDataset`.
 */
export function confirmar(caso: Caso, cuando: string): Caso {
  if (!sePuedeConfirmar(caso)) {
    throw new Error(
      'No se puede confirmar un caso sin ningún conjunto de medidas ya revisado. ' +
        'Todo lo que se envía a una calculadora tiene que haberlo mirado una persona.',
    )
  }
  return { ...caso, estado: 'CONFIRMADO', actualizadoEn: cuando }
}

/**
 * ¿Ha pulsado el usuario «Confirmar» en este caso alguna vez?
 *
 * Es la PRIMERA de las dos barreras que hay antes de una web externa, y solo
 * mira el estado del CASO: si hubo al menos un acto explícito de
 * confirmación, para poder entrar en la pantalla de cálculo.
 *
 * La segunda barrera —que CADA campo que se va a enviar esté revisado, para
 * ESE dataset en concreto— vive en `sePuedeConfirmarDataset` y, más abajo en
 * la cadena, en `prepararEntradas`. Se dejan separadas a propósito: esta
 * función no puede sustituir a la fina, porque un caso con un dataset
 * confirmado y otro a medias tiene que dejar calcular el primero y bloquear
 * el segundo, no todo o nada.
 */
export function autorizadoACalcular(caso: Caso): boolean {
  return (
    caso.estado === 'CONFIRMADO' || caso.estado === 'CALCULANDO' || caso.estado === 'COMPLETADO'
  )
}
