/**
 * sexo.ts — El sexo del paciente, que no es una medida de un ojo.
 *
 * Kane lo pide en su formulario. Los otros dos no: comprobado el 12/08/2026
 * abriendo EVO —36 campos, ninguno de sexo ni de edad— y en la ficha de Barrett,
 * que está verificada contra su formulario real.
 *
 * ## Por qué NO va dentro de `OjoBiometrico`
 *
 * Porque no es del ojo: es de la persona. Meterlo ahí obligaría a guardarlo dos
 * veces en un caso de dos ojos, y entonces existiría la posibilidad de que el
 * ojo derecho y el izquierdo dijeran cosas distintas. Un modelo que permite
 * representar un imposible acaba representándolo.
 *
 * ## De dónde sale
 *
 * Por orden de fiabilidad, y el orden importa:
 *
 *  1. **Del informe**, si el documento lo imprime («Sex: Female»). Es un dato
 *     leído, con su evidencia, como cualquier otro.
 *  2. **Deducido del nombre del paciente**, a petición expresa del dueño del
 *     proyecto (12/08/2026). Es una DEDUCCIÓN y se marca como tal.
 *  3. **Escrito por una persona**, si no hay ninguna de las dos.
 *
 * ⚠️ **Sobre la deducción, con todas las letras.** Un nombre no determina el
 * sexo: hay nombres unisex, extranjeros, iniciales, y un OCR que lee «Andrea»
 * donde ponía «Andrés». Por eso aquí pasan dos cosas:
 *
 *  - **Si el nombre no se reconoce, NO se adivina.** Se devuelve nada y el campo
 *    queda pendiente de aportar. Echar a suertes «Alex» sería peor que callarse.
 *  - **Lo deducido nunca se autoconfirma.** Es un dato `DERIVADO`, así que
 *    `necesitaComprobacionHumana` es cierta y no sale hacia Kane hasta que una
 *    persona lo mira. No es una regla nueva: es la D32 aplicándose.
 */

import type { Procedencia } from './procedencia.js'

/**
 * Las opciones. Cerradas a propósito, no una cadena libre.
 *
 * Son las dos que usan las fórmulas de cálculo de lente intraocular. Si el
 * formulario de Kane resultara ofrecer más —y eso hay que comprobarlo mirándolo,
 * no suponerlo—, se añaden aquí y el compilador dirá dónde falta tratarlas.
 */
export type Sexo = 'MUJER' | 'HOMBRE'

export const SEXOS: readonly Sexo[] = ['MUJER', 'HOMBRE']

export const TEXTO_SEXO: Readonly<Record<Sexo, string>> = {
  MUJER: 'Mujer',
  HOMBRE: 'Hombre',
}

/**
 * Un dato del CASO —de la persona— que se revisa como cualquier otro.
 *
 * Tiene la misma forma que una `Medida` en lo que importa —valor, procedencia,
 * valor original y confirmación— pero **no es una medida y no se fuerza dentro
 * de una**. Una `Medida` es un número con unidad y rangos de plausibilidad;
 * el sexo no es nada de eso, y reutilizar la estructura solo para aprovechar
 * código habría metido un dato que no es del ojo dentro del mapa del ojo.
 */
export interface DatoDeCaso<T> {
  readonly valor: T
  readonly procedencia: Procedencia
  /** Lo que había antes de que una persona lo cambiara. Igual que en `Medida`. */
  readonly original?: { readonly valor: T; readonly procedencia: Procedencia }
  readonly confirmadoPorUsuario: boolean
}

export type SexoDelCaso = DatoDeCaso<Sexo>

// ═══════════════════════════════════════════════════════════════════════════
//  Deducir el sexo de un nombre
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nombres que se reconocen con seguridad.
 *
 * Es una lista corta y deliberadamente conservadora, no un censo. Su trabajo no
 * es acertar siempre: es **no equivocarse cuando responde**. Todo lo que no esté
 * aquí ni encaje con la regla de abajo se queda sin deducir, y eso es una
 * respuesta correcta.
 *
 * Los nombres unisex NO están, y no es un olvido: «Alex», «Cruz», «Trinidad»,
 * «Reyes», «Guadalupe» o «Andrea» —masculino en italiano— son exactamente los
 * casos en los que hay que preguntar en vez de tirar una moneda.
 */
const NOMBRES: Readonly<Record<string, Sexo>> = {
  // Mujer
  maria: 'MUJER',
  carmen: 'MUJER',
  josefa: 'MUJER',
  isabel: 'MUJER',
  ana: 'MUJER',
  dolores: 'MUJER',
  pilar: 'MUJER',
  teresa: 'MUJER',
  rosa: 'MUJER',
  francisca: 'MUJER',
  antonia: 'MUJER',
  laura: 'MUJER',
  cristina: 'MUJER',
  marta: 'MUJER',
  elena: 'MUJER',
  lucia: 'MUJER',
  sara: 'MUJER',
  paula: 'MUJER',
  raquel: 'MUJER',
  beatriz: 'MUJER',
  silvia: 'MUJER',
  nuria: 'MUJER',
  irene: 'MUJER',
  eva: 'MUJER',
  susana: 'MUJER',
  montserrat: 'MUJER',
  concepcion: 'MUJER',
  mercedes: 'MUJER',
  esther: 'MUJER',
  inmaculada: 'MUJER',
  encarnacion: 'MUJER',
  rocio: 'MUJER',
  alba: 'MUJER',
  claudia: 'MUJER',
  julia: 'MUJER',
  nerea: 'MUJER',
  jennifer: 'MUJER',
  jessica: 'MUJER',
  mary: 'MUJER',
  patricia: 'MUJER',
  linda: 'MUJER',
  barbara: 'MUJER',
  susan: 'MUJER',
  margaret: 'MUJER',
  dorothy: 'MUJER',
  helen: 'MUJER',
  // Hombre
  antonio: 'HOMBRE',
  jose: 'HOMBRE',
  manuel: 'HOMBRE',
  francisco: 'HOMBRE',
  juan: 'HOMBRE',
  david: 'HOMBRE',
  javier: 'HOMBRE',
  daniel: 'HOMBRE',
  carlos: 'HOMBRE',
  miguel: 'HOMBRE',
  rafael: 'HOMBRE',
  pedro: 'HOMBRE',
  angel: 'HOMBRE',
  alejandro: 'HOMBRE',
  fernando: 'HOMBRE',
  sergio: 'HOMBRE',
  pablo: 'HOMBRE',
  jorge: 'HOMBRE',
  alberto: 'HOMBRE',
  luis: 'HOMBRE',
  alvaro: 'HOMBRE',
  adrian: 'HOMBRE',
  diego: 'HOMBRE',
  raul: 'HOMBRE',
  enrique: 'HOMBRE',
  ramon: 'HOMBRE',
  vicente: 'HOMBRE',
  andres: 'HOMBRE',
  ignacio: 'HOMBRE',
  ruben: 'HOMBRE',
  oscar: 'HOMBRE',
  victor: 'HOMBRE',
  john: 'HOMBRE',
  robert: 'HOMBRE',
  michael: 'HOMBRE',
  william: 'HOMBRE',
  richard: 'HOMBRE',
  thomas: 'HOMBRE',
  charles: 'HOMBRE',
  peter: 'HOMBRE',
}

/**
 * Nombres que NO se deducen aunque la morfología parezca clara.
 *
 * Son los que hacen fallar la regla del «-a / -o», y son justo los que más caro
 * salen porque parecen fáciles.
 */
const AMBIGUOS: ReadonlySet<string> = new Set([
  'alex',
  'cruz',
  'trinidad',
  'reyes',
  'guadalupe',
  'andrea',
  'sasha',
  'noa',
  'ariel',
  'jordan',
  'robin',
  'chris',
  'sam',
  'nicola',
  'jose maria',
  'maria jose',
  'jean',
  'lee',
  'morgan',
  'taylor',
  'jamie',
  'pat',
  'dana',
])

export interface SexoDeducido {
  readonly sexo: Sexo
  /** Qué regla lo decidió. Va escrito en la derivación, para poder juzgarla. */
  readonly regla: 'nombre conocido' | 'terminación del nombre'
  /** El nombre de pila que se usó. Es la evidencia. */
  readonly nombreUsado: string
}

function limpiar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita las marcas de tilde
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deduce el sexo del nombre de pila, o no deduce nada.
 *
 * Dos reglas, en este orden:
 *
 *  1. **El nombre está en la lista.** Es la fiable.
 *  2. **La terminación**, solo para el español: `-a` mujer, `-o` hombre. Es
 *     mucho más floja y por eso se dice cuál de las dos ha respondido: quien
 *     revise puede fiarse más de una que de otra.
 *
 * Devuelve `null` cuando no está claro, que es la mayoría de las veces con
 * nombres poco comunes. **`null` es una respuesta correcta**, no un fallo: el
 * campo queda pendiente de aportar y lo elige una persona.
 */
export function deducirSexoDelNombre(nombreCompleto: string): SexoDeducido | null {
  const limpio = limpiar(nombreCompleto)
  if (limpio === '') return null

  // El nombre de pila es la primera palabra. Los apellidos no dicen nada del
  // sexo, y en español van detrás.
  const partes = limpio.split(' ').filter((p) => p.length >= 2)
  const pila = partes[0]
  if (pila === undefined) return null

  // Compuestos ambiguos como «José María» o «María José»: se miran las dos
  // primeras palabras antes de decidir nada.
  const dos = partes.slice(0, 2).join(' ')
  if (AMBIGUOS.has(dos) || AMBIGUOS.has(pila)) return null

  const conocido = NOMBRES[pila]
  if (conocido) return { sexo: conocido, regla: 'nombre conocido', nombreUsado: pila }

  // Regla de terminación. Solo para nombres de largo razonable: con tres letras
  // acierta poco y falla mucho.
  if (pila.length >= 4) {
    if (pila.endsWith('a'))
      return { sexo: 'MUJER', regla: 'terminación del nombre', nombreUsado: pila }
    if (pila.endsWith('o'))
      return { sexo: 'HOMBRE', regla: 'terminación del nombre', nombreUsado: pila }
  }

  return null
}

/** Cómo se explica una deducción, para que se pueda juzgar en pantalla. */
export function explicarDeduccion(d: SexoDeducido): string {
  return d.regla === 'nombre conocido'
    ? `Deducido del nombre «${d.nombreUsado}»`
    : `Deducido de la terminación del nombre «${d.nombreUsado}» — compruébalo`
}

// ═══════════════════════════════════════════════════════════════════════════
//  Cómo lo escribe un informe
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interpreta el sexo tal y como lo imprime un informe.
 *
 * Devuelve `null` si no lo reconoce. No se adivina: un informe que ponga algo
 * distinto de lo previsto deja el campo pendiente, que es mejor que traducirlo
 * mal.
 */
export function interpretarSexo(texto: string): Sexo | null {
  const t = limpiar(texto)
  if (/^(f|female|mujer|femenino|femenina|w|weiblich)$/.test(t)) return 'MUJER'
  if (/^(m|male|hombre|masculino|varon|maennlich)$/.test(t)) return 'HOMBRE'
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
//  Cómo se lo decimos a Kane
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El valor que espera Kane para cada sexo.
 *
 * ⚠️ **SIN VERIFICAR CONTRA EL FORMULARIO REAL.** El 12/08/2026 se comprobó que
 * `iolformula.com` redirige a `/agreement/`, un documento con **cero campos**:
 * la calculadora no existe hasta que una persona acepta el acuerdo de licencia,
 * y este programa no lo acepta en nombre de nadie.
 *
 * Estos textos son los que se enviarán, y son una **suposición razonable**, no
 * un dato. Lo que sí está garantizado es que la suposición no puede colarse en
 * silencio: el adaptador de Kane busca el campo por su etiqueta y, si no lo
 * encuentra o no admite el valor, **lo dice** en vez de calcular sin él.
 *
 * Para cerrarlo hacen falta dos minutos de una persona:
 *
 *     pnpm reconocer:kane
 *
 * La sonda imprime las opciones REALES de cada lista del formulario —su `value`
 * y su texto—, y con eso se sustituye esta tabla por lo que Kane espera de
 * verdad.
 */
export const SEXO_EN_KANE: Readonly<Record<Sexo, string>> = {
  MUJER: 'Female',
  HOMBRE: 'Male',
}

/** ¿Está confirmada la equivalencia con Kane? Hoy no, y se dice en pantalla. */
export const EQUIVALENCIA_KANE_VERIFICADA = false

// ═══════════════════════════════════════════════════════════════════════════
//  Construir y corregir el dato
// ═══════════════════════════════════════════════════════════════════════════

/** El sexo tal y como lo imprimía el informe. Origen: del informe. */
export function sexoDelInforme(valor: Sexo, procedencia: Procedencia): SexoDelCaso {
  return { valor, procedencia, confirmadoPorUsuario: false }
}

/**
 * El sexo deducido del nombre. Origen: derivado, y NUNCA autoconfirmado.
 *
 * Lleva escrita la regla que lo decidió, para que quien revise pueda fiarse más
 * de «estaba en la lista» que de «acaba en -a».
 */
export function sexoDeducidoDelNombre(
  d: SexoDeducido,
  base: { readonly documentoId?: string; readonly dispositivoId?: string },
  cuando: string,
): SexoDelCaso {
  return {
    valor: d.sexo,
    procedencia: {
      metodo: 'DERIVADO',
      ...(base.documentoId !== undefined ? { documentoId: base.documentoId } : {}),
      ...(base.dispositivoId !== undefined ? { dispositivoId: base.dispositivoId } : {}),
      registradoEn: cuando,
      derivacion: { deCampos: ['NOMBRE_PACIENTE'], explicacion: explicarDeduccion(d) },
    },
    confirmadoPorUsuario: false,
  }
}

/**
 * Lo escribe una persona, conservando lo que hubiera antes.
 *
 * Mismo criterio que `corregirMedida`: si había un valor, se guarda como
 * original y el dato pasa a ser CORREGIDO. Si no había nada, es APORTADO. Y al
 * corregir dos veces se conserva **lo primero**, no el paso intermedio.
 */
export function aportarSexo(
  anterior: SexoDelCaso | undefined,
  valor: Sexo,
  cuando: string,
): SexoDelCaso {
  const original =
    anterior === undefined
      ? undefined
      : (anterior.original ?? { valor: anterior.valor, procedencia: anterior.procedencia })
  return {
    valor,
    procedencia: { metodo: 'MANUAL', registradoEn: cuando },
    ...(original ? { original } : {}),
    // Lo acaba de escribir una persona mirándolo.
    confirmadoPorUsuario: true,
  }
}

/** Marca el sexo como revisado. Es lo que abre la puerta hacia Kane. */
export function confirmarSexo(s: SexoDelCaso): SexoDelCaso {
  return { ...s, confirmadoPorUsuario: true }
}
