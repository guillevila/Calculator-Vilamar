/**
 * lentes.ts — Leer la tabla de modelos de lente y sus constantes.
 *
 * Es un parser aparte del de medidas por una razón de fondo: **una constante A no
 * es una medida del ojo, es una propiedad del modelo de lente.** El motor de
 * `nucleo.ts` está hecho para «esta etiqueta va a este campo», y aquí lo que hay
 * que leer es una RELACIÓN entre dos cosas: un nombre y un número. Meterlo en la
 * tabla de reglas habría producido lo que este cambio existe para evitar — una
 * `CONSTANTE_A` suelta, sin saber de qué lente es.
 *
 * Y no se aplica a cualquier documento. El formato lo dice el perfil del aparato,
 * porque un número junto a «SRK/T» solo significa «la constante de la lente de
 * arriba» si sabemos que el informe está montado así.
 */

import type { FormatoTablaLentes } from '@vilamar/domain'
import { definicionDe, interpretarLateralidad } from '@vilamar/domain'

/** Una lente leída del documento, todavía sin convertir en `LenteDetectada`. */
export interface LenteLeida {
  readonly modelo: string
  readonly fabricante?: string
  readonly constanteA?: number
  readonly etiquetaConstante?: string
  /** Las dos líneas del informe de las que salió, juntas. Es la evidencia. */
  readonly evidencia: string
  readonly pagina: number
  readonly regla: string
}

/**
 * Fabricantes que se sabe cómo se escriben en estos informes.
 *
 * Solo sirve para SEPARAR el fabricante del modelo cuando el informe los escribe
 * juntos, y es deliberadamente corta: si un nombre no está aquí, el modelo se
 * queda entero y el fabricante sin rellenar. Eso no rompe nada —el emparejamiento
 * compara el nombre completo— y es preferible a partir un nombre por la mitad
 * adivinando dónde acaba la marca.
 */
const FABRICANTES: readonly string[] = [
  'Bausch & Lomb',
  'Bausch&Lomb',
  'Bausch and Lomb',
  'B&L',
  'Johnson & Johnson',
  'Johnson&Johnson',
  'J&J',
  'ZEISS',
  'Carl Zeiss',
  'Alcon',
  'Rayner',
  'HOYA',
  'PhysIOL',
  'Teleon',
  'Oculentis',
  'SIFI',
]

/**
 * Reconoce la constante de una fórmula dentro de una línea.
 *
 * Solo SRK/T por ahora, que es lo que imprime el informe que se está usando. Añadir
 * otra fórmula es añadirla aquí **y decidir si su constante es una constante A**:
 * no todas las fórmulas usan el mismo tipo de constante, y tratarlas por igual
 * sería el error que este fichero evita.
 */
const CONSTANTE_DE_FORMULA = /\b(SRK\s*\/?\s*T)\b\s*[:=]?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*$/i

/** Una línea que es claramente una medida del ojo, no el nombre de una lente. */
const PARECE_UNA_MEDIDA = /\d+[.,]\d+\s*(?:mm|D|um|µm|°)\b/i

/** Etiquetas de campos biométricos, para no confundirlas con un modelo de lente. */
const PARECE_UNA_ETIQUETA =
  /^\s*(?:AL|K1|K2|TK1|TK2|ACD|AQD|LT|CCT|WTW|PK1|PK2|nk|Target|Refraction|SIA|Axis|Eje)\b/i

/**
 * Lee las lentes de un documento.
 *
 * Devuelve una lista vacía cuando el formato es `NINGUNA`, sin mirar el texto. Es
 * la guarda que impide que la regla se vuelva genérica: un informe no reconocido
 * puede tener «SRK/T» por veinte motivos distintos.
 */
export function extraerLentes(
  texto: string,
  formato: FormatoTablaLentes,
  pagina: number,
  confianza?: number,
): readonly LenteLeida[] {
  if (formato === 'NINGUNA') return []
  return porConstanteDeFormula(texto, pagina, confianza)
}

/**
 * Formato «modelo arriba, constante debajo».
 *
 * Se recorre buscando la CONSTANTE, no el modelo, y luego se mira hacia atrás. Al
 * revés no funcionaría: no hay forma de saber que «LUX SMART» es un modelo de
 * lente hasta que se ve que debajo lleva una constante. Buscar primero nombres
 * plausibles convertiría en modelo cualquier línea de texto suelta del informe.
 */
function porConstanteDeFormula(
  texto: string,
  pagina: number,
  _confianza?: number,
): readonly LenteLeida[] {
  // Aquí NO se usa `normalizarLineas`: hace falta conservar el orden y la
  // vecindad de las líneas, que es justamente lo que relaciona el modelo con su
  // constante. Se limpian los espacios pero no se descarta ninguna línea.
  //
  // El espacio duro (U+00A0) va con su escape y no como carácter, igual que en
  // `nucleo.ts`: los PDF y el OCR los producen a montones, pero puesto tal cual
  // en el código es un carácter invisible que nadie ve al leerlo.
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/[\t\u00A0 ]+/g, ' ').trim())

  const limite = definicionDe('CONSTANTE_A').limite
  const salida: LenteLeida[] = []

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]!
    const m = CONSTANTE_DE_FORMULA.exec(linea)
    if (!m?.[1] || !m[2]) continue

    const valor = Number(m[2].replace(',', '.'))
    // Fuera del rango que declaran las propias calculadoras (112–125) esto NO es
    // una constante A, sea lo que sea. Se descarta la entrada entera: media
    // relación no vale para nada.
    if (!Number.isFinite(valor) || valor < limite.min || valor > limite.max) continue

    // El modelo puede ir delante de la constante en la misma línea…
    const delante = linea
      .slice(0, m.index)
      .trim()
      .replace(/[:\-–]\s*$/, '')
    // …o en la línea de arriba, saltándose las vacías.
    const encontrado = esNombreDeLente(delante) ? delante : nombreHaciaArriba(lineas, i)
    if (encontrado === null) continue

    const { fabricante, modelo } = separarFabricante(encontrado)
    salida.push({
      modelo,
      ...(fabricante !== undefined ? { fabricante } : {}),
      constanteA: valor,
      etiquetaConstante: normalizarEtiqueta(m[1]),
      evidencia: encontrado === delante ? linea : `${encontrado} — ${linea}`,
      pagina,
      regla: 'Tabla de lentes: constante por fórmula',
    })
  }

  return salida
}

/** El nombre de lente más cercano hacia arriba, saltando líneas vacías. */
function nombreHaciaArriba(lineas: readonly string[], desde: number): string | null {
  for (let j = desde - 1; j >= 0 && desde - j <= 4; j--) {
    const candidata = lineas[j]!
    if (candidata === '') continue
    // La primera línea no vacía decide. Si no es un nombre de lente, no se sigue
    // buscando: seguir hacia arriba emparejaría una constante con un nombre que
    // está tres líneas más allá y pertenece a otra cosa.
    return esNombreDeLente(candidata) ? candidata : null
  }
  return null
}

/**
 * ¿Puede esta línea ser el nombre de un modelo de lente?
 *
 * Es una criba de exclusión a propósito: no se intenta reconocer nombres de lente
 * —son cientos y cambian—, se descarta lo que seguro que no lo es. Cualquier cosa
 * que se cuele saldrá en pantalla como una lente del informe con su evidencia al
 * lado, así que una persona lo ve; lo que no puede pasar es lo contrario, que una
 * constante se quede sin modelo o se pegue al modelo equivocado.
 */
function esNombreDeLente(linea: string): boolean {
  const t = linea.trim()
  if (t.length < 3 || t.length > 60) return false
  // Tiene que tener letras: «119.2» no es un modelo.
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2}/.test(t)) return false
  // Otra línea de constante por fórmula, no un modelo.
  //
  // Se reconoce por su FORMA —«nombre corto: número»— y no por una lista de
  // nombres de fórmula. Dos motivos: una lista se queda corta en cuanto un
  // informe usa una fórmula que no está en ella, y además meter nombres de
  // fórmula aquí acerca este paquete a saber qué calculadoras existen, que es
  // justo lo que la arquitectura le prohíbe.
  if (/^[A-Za-z][\w\s/.'-]{0,24}\s*[:=]\s*[-+]?\d/.test(t)) return false
  // Una medida del ojo o la etiqueta de un campo.
  if (PARECE_UNA_MEDIDA.test(t)) return false
  if (PARECE_UNA_ETIQUETA.test(t)) return false
  // Una marca de ojo: «OD», «OS», «Right».
  if (interpretarLateralidad(t) !== null) return false
  // Cabeceras del informe.
  if (
    /^(?:HEIDELBERG|ANTERION|ZEISS IOLMaster|OCULUS|Cataract App|Metrics App|Report|Página|Page)\b/i.test(
      t,
    )
  ) {
    return false
  }
  return true
}

/** Separa la marca del modelo, solo si la marca está en la lista conocida. */
function separarFabricante(nombre: string): {
  readonly fabricante?: string
  readonly modelo: string
} {
  const t = nombre.trim()
  for (const f of FABRICANTES) {
    if (t.toLowerCase().startsWith(f.toLowerCase())) {
      const resto = t
        .slice(f.length)
        .replace(/^[\s:-]+/, '')
        .trim()
      // Si no queda modelo detrás, la línea era solo la marca: no es una lente.
      if (resto === '') return { modelo: t }
      return { fabricante: f, modelo: t }
    }
  }
  return { modelo: t }
}

/** «SRK / T» y «SRK/T» son lo mismo. Se guarda en la forma que se lee mejor. */
function normalizarEtiqueta(bruta: string): string {
  return bruta
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^SRK\/?T$/, 'SRK/T')
}
