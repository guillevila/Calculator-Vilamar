/**
 * kane.ts — Adaptador de la fórmula de Kane.
 *
 *   https://www.iolformula.com
 *
 * ⚠️ ESTADO: ESCRITO PERO NO VERIFICADO CONTRA EL FORMULARIO REAL.
 *
 * Y el motivo importa, porque no es pereza:
 *
 *  1. Kane no enseña su calculadora hasta que se acepta un **acuerdo de
 *     licencia** («I Agree»). Es un contrato legal entre el autor y quien lo
 *     usa. Calculator Vilamar **no lo acepta en nombre de nadie**: lo tiene que
 *     pulsar una persona, en su navegador, una vez.
 *
 *  2. La web declara estar protegida por reCAPTCHA. No se rodea, no se resuelve
 *     por detrás y no se falsea el navegador. Si aparece una comprobación, la
 *     hace la persona.
 *
 * Como consecuencia, no se ha podido mirar el formulario de dentro para copiar
 * sus identificadores —que es como se han escrito los otros dos adaptadores—.
 * Este adaptador busca los campos por su ETIQUETA, que es lo más robusto que se
 * puede hacer sin haber visto el HTML, y si no los encuentra lo dice claramente
 * en vez de inventarse un resultado.
 *
 * Para dejarlo verificado hacen falta dos minutos de una persona:
 *
 *     pnpm reconocer:kane
 *
 * abre Kane con ventana, la persona acepta las condiciones, y la sonda guarda
 * en `local/reconocimiento/` la lista real de campos. Con eso se rellena
 * `MAPA_KANE` de abajo y el adaptador queda cerrado.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Locator, Page } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador, esperarAlUsuario } from '../contrato.js'
import { leerNumeroDeTexto } from '../normalizar.js'

const URL = 'https://www.iolformula.com'

/**
 * Cómo encontrar cada campo, por orden de preferencia.
 *
 * Cuando `pnpm reconocer:kane` dé los identificadores reales, se añaden aquí
 * como `selector` y pasan a tener prioridad sobre las etiquetas.
 */
interface LocalizadorCampo {
  /** Identificador CSS exacto, si se conoce. Es lo primero que se prueba. */
  readonly selector?: string
  /** Etiquetas por las que buscar el campo. */
  readonly etiquetas: readonly RegExp[]
  readonly decimales: number
}

const MAPA_KANE: Partial<Record<keyof EntradasCalculadora['valores'], LocalizadorCampo>> = {
  AL: { etiquetas: [/axial\s*length/i, /\bAL\b/i], decimales: 2 },
  K1: { etiquetas: [/^\s*K1/i, /flat\s*k/i], decimales: 2 },
  K2: { etiquetas: [/^\s*K2/i, /steep\s*k/i], decimales: 2 },
  K1_EJE: { etiquetas: [/k1\s*axis/i, /flat\s*axis/i], decimales: 0 },
  K2_EJE: { etiquetas: [/k2\s*axis/i, /steep\s*axis/i], decimales: 0 },
  ACD: { etiquetas: [/\bACD\b/i, /anterior\s*chamber/i], decimales: 2 },
  LT: { etiquetas: [/lens\s*thickness/i, /\bLT\b/i], decimales: 2 },
  CCT: { etiquetas: [/\bCCT\b/i, /central\s*corneal/i], decimales: 0 },
  WTW: { etiquetas: [/white\s*to\s*white/i, /\bWTW\b/i], decimales: 2 },
  REFRACCION_OBJETIVO: { etiquetas: [/target\s*refraction/i, /\btarget\b/i], decimales: 2 },
  CONSTANTE_A: { etiquetas: [/a[\s-]*constant/i], decimales: 2 },
}

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
      const rellenados = await this.rellenar(pagina, ctx.entradas)

      if (rellenados === 0) {
        throw new ErrorAdaptador(
          'ADAPTER_BROKEN',
          'No se han encontrado los campos de la calculadora de Kane. El conector necesita actualizarse: ejecuta «pnpm reconocer:kane» para que aprenda el formulario actual.',
          'RELLENANDO',
          'campos por etiqueta',
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
      return await this.leerResultado(pagina, ctx, inicio)
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

  /** Rellena lo que encuentre y devuelve cuántos campos ha podido poner. */
  private async rellenar(pagina: Page, entradas: EntradasCalculadora): Promise<number> {
    let puestos = 0
    for (const [campo, loc] of Object.entries(MAPA_KANE)) {
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      if (valor === undefined || !loc) continue // ausente no se rellena
      const destino = await this.localizar(pagina, loc)
      if (!destino) continue
      try {
        await destino.fill(valor.toFixed(loc.decimales), { timeout: 5000 })
        puestos++
      } catch {
        // Un campo que no admite escritura no tumba el resto.
      }
    }
    return puestos
  }

  private async pulsarCalcular(pagina: Page): Promise<void> {
    const candidatos = [
      pagina.getByRole('button', { name: /calculate/i }),
      pagina.getByRole('button', { name: /calcular/i }),
      pagina.locator('input[type=submit][value*="alculate" i]'),
    ]
    for (const c of candidatos) {
      try {
        if ((await c.count()) > 0) {
          await c.first().click({ timeout: 10_000 })
          await pagina.waitForTimeout(5000)
          return
        }
      } catch {
        // siguiente candidato
      }
    }
    throw new ErrorAdaptador(
      'ADAPTER_BROKEN',
      'No se ha encontrado el botón de calcular de Kane. El conector necesita actualizarse.',
      'CALCULANDO',
      'botón «Calculate»',
    )
  }

  /**
   * Lee lo que Kane haya devuelto.
   *
   * Sin haber visto la pantalla de resultados real, esto lee la tabla más
   * plausible y, si no encuentra nada reconocible, devuelve PARTIAL con lo que
   * haya. Lo que NO hace es rellenar campos por inferencia.
   */
  private async leerResultado(
    pagina: Page,
    ctx: ContextoEjecucion,
    inicio: number,
  ): Promise<ResultadoCalculadora> {
    const tablas = await pagina
      .locator('table')
      .evaluateAll((ts) =>
        ts
          .map((t) => {
            const tabla = t as HTMLTableElement
            const r = tabla.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return null
            return [...tabla.rows].map((fila) => [...fila.cells].map((c) => c.innerText.trim()))
          })
          .filter((x): x is string[][] => x !== null),
      )
      .catch(() => [] as string[][][])

    const opciones: OpcionLente[] = []
    for (const tabla of tablas) {
      const cabecera = (tabla[0] ?? []).join(' ').toLowerCase()
      if (!/iol|power|lens/.test(cabecera)) continue
      for (const fila of tabla.slice(1)) {
        const esfera = leerNumeroDeTexto(fila[0])
        if (esfera === undefined) continue
        opciones.push({
          esfera,
          refraccionPrevista: leerNumeroDeTexto(fila[1]),
          recomendada: false,
        })
      }
      if (opciones.length > 0) break
    }

    if (opciones.length === 0) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Kane no ha devuelto una tabla de resultados reconocible. El conector todavía no está ajustado a su pantalla: ejecuta «pnpm reconocer:kane» tras aceptar sus condiciones.',
        'LEYENDO_RESULTADO',
        'tabla de resultados',
      )
    }

    // NO se marca ninguna recomendada.
    //
    // Antes se marcaba la fila del medio «porque las tablas de potencias suelen
    // llevar la elegida en el centro». Eso era **inventarse una recomendación
    // clínica a partir de la posición de una fila**, que es de lo peor que puede
    // hacer este programa: sale un número destacado que nadie ha recomendado.
    //
    // Una opción solo se marca si Kane la señala de verdad —con un texto, una
    // clase o una marca visual comprobable—, y para saber cómo lo señala hace
    // falta haber visto su pantalla de resultados. Mientras tanto: `undefined`,
    // y se conservan TODAS las opciones para que decida quien mira.
    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      estado: 'PARTIAL',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones,
      mensaje:
        'Resultado leído de Kane con un conector que todavía no se ha podido verificar contra su formulario real. ' +
        'No se destaca ninguna opción: no se sabe todavía cómo señala Kane la suya, y elegir una por su posición sería inventarla. ' +
        'Contrasta estos números con la pantalla del navegador antes de usarlos.',
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
