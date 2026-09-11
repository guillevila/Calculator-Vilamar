/**
 * barrett-true-k-toric.ts — Adaptador de Barrett True-K Toric.
 *
 *   Página:      https://www.ascrs.org/en/tools/barrett-true-k-toric-calculator
 *   Calculadora: https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx (dentro de un iframe)
 *
 * Es la calculadora de Barrett para ojos con cirugía refractiva previa
 * (miopía, hipermetropía, queratotomía radial) o queratocono. Comprobado
 * abriendo su formulario real, con ventana (04/09/2026) — sin ventana el
 * iframe no llega a cargar, igual que en Barrett Toric.
 *
 *  1. Es la MISMA plantilla que Barrett Toric: los campos de biometría
 *     (K1/K2 con eje, AL, ACD, SIA, eje de incisión, LT, WTW, modelo de
 *     lente, constante A, factor de lente, nombre del paciente, ojo) usan
 *     LOS MISMOS identificadores. Solo cambian la URL de entrada y el
 *     desplegable de historial.
 *
 *  2. El desplegable «History» (`#MainContent_RefractProcedure`) no tiene
 *     «Ninguna»: esta página existe SOLO para ojos con historia que contar.
 *     Sus cuatro opciones son «Myopic Lasik», «Hyperopic Lasik», «Radial
 *     Keratotomy» y «Keratoconus» — el texto visible ES el valor de la
 *     opción, verificado en el HTML real.
 *
 *  3. Hay una casilla, «Enter Data and Calculate»
 *     (`#MainContent_ConfirmCheckBox`), que este adaptador NO TOCA, y es
 *     deliberado. Empieza deshabilitada y, comprobado en vivo (04/09/2026),
 *     ninguna combinación de campos rellenados ni de envíos de formulario la
 *     habilita —se probó rellenar antes y después del historial, con
 *     pulsaciones de teclado reales y con clics adicionales—. Y no hace
 *     falta: con la casilla deshabilitada y sin marcar, «Calculate» calcula
 *     igual y la pestaña «Toric IOL» sale con los resultados completos. Es
 *     un control vestigial de esta página.
 *
 *  4. Igual que Barrett Toric: exige «Patient Name» (se le manda el código
 *     local del caso), tiene un aviso de cookies que hay que rechazar, y
 *     elegir el modelo de lente rellena sola la constante A y el factor de
 *     lente con un envío del formulario.
 *
 *  5. ⚠️ **Sin verificar todavía, y hay que decirlo con todas las letras**:
 *     el formulario tiene además un radio «K Index» (1.3375 / 1.332) y un
 *     radio «+ve Cylinder» / «-ve Cylinder» que este adaptador NO toca —se
 *     queda con lo que la página trae marcado por defecto—. Comprobado que
 *     por defecto están en 1.3375 y +ve Cylinder, pero NO se ha podido
 *     confirmar si +ve Cylinder es la convención correcta para cómo este
 *     programa introduce el eje. Antes de fiarse de un resultado real,
 *     comprobar ese control a mano en el navegador que se abre.
 *
 *  6. Admite datos de ANTES de la cirugía refractiva si se conocen
 *     (`#MainContent_PreLasik`, `#MainContent_PostLasik`,
 *     `#MainContent_Koptional1/2`, `#MainContent_NetCornealAstig`,
 *     `#MainContent_IOLPower`). Confirmado por el dueño del proyecto
 *     (04/09/2026): en la práctica casi nunca se tienen, así que el modelo
 *     de este programa no los pide y estos campos se dejan vacíos.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { CirugiaRefractivaPrevia } from '@vilamar/domain'
import type { Frame, Page } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador, esperarAlUsuario } from '../contrato.js'
import { leerCilindroConEje, leerNumeroDeTexto } from '../normalizar.js'

const PAGINA_PADRE = 'https://www.ascrs.org/en/tools/barrett-true-k-toric-calculator'
const HOST_CALCULADORA = 'calc.apacrs.org'

const CAMPOS = {
  K1: { selector: '#MainContent_MeasuredK', decimales: 2 },
  K1_EJE: { selector: '#MainContent_MeasuredAxis', decimales: 0 },
  K2: { selector: '#MainContent_MeasuredK0', decimales: 2 },
  K2_EJE: { selector: '#MainContent_MeasuredAxis0', decimales: 0 },
  AL: { selector: '#MainContent_AxLength', decimales: 2 },
  ACD: { selector: '#MainContent_OpticalACD', decimales: 2 },
  REFRACCION_OBJETIVO: { selector: '#MainContent_Refraction', decimales: 2 },
  SIA: { selector: '#MainContent_InducedCyl', decimales: 2 },
  EJE_INCISION: { selector: '#MainContent_IncisionAxis', decimales: 0 },
  LT: { selector: '#MainContent_LensThickness', decimales: 2 },
  WTW: { selector: '#MainContent_WTW', decimales: 2 },
} as const

const SEL = {
  rechazarCookies: '[data-cky-tag="reject-button"]',
  capaCookies: '.cky-overlay',
  nombrePaciente: '#MainContent_PatientName',
  modeloLente: '#MainContent_IOLModel',
  constanteA: '#MainContent_Aconstant',
  factorLente: '#MainContent_LensFactor',
  ojoDerecho: '#MainContent_Rad1',
  ojoIzquierdo: '#MainContent_Rad2',
  historial: '#MainContent_RefractProcedure',
  calcular: '#MainContent_Button1',
  anclaFormulario: '#MainContent_AxLength',
  tablaPotencias: '#MainContent_GridView1',
  tablaToricas: '#MainContent_GridView2',
} as const

/**
 * El desplegable «History», y el texto exacto de cada opción — verificado
 * abriendo el HTML real (04/09/2026): el `value` de cada `<option>` es su
 * propio texto visible, no un código aparte.
 *
 * `NINGUNA` no está: esta calculadora no tiene esa opción, y `validarEntradas`
 * la rechaza antes de llegar aquí.
 */
const HISTORIAL_EN_TRUE_K: Readonly<Partial<Record<CirugiaRefractivaPrevia, string>>> = {
  MIOPICA: 'Myopic Lasik',
  HIPERMETROPICA: 'Hyperopic Lasik',
  RK: 'Radial Keratotomy',
  QUERATOCONO: 'Keratoconus',
}

export class AdaptadorBarrettTrueKToric implements AdaptadorCalculadora {
  readonly calculadora = 'BARRETT_TRUE_K_TORIC' as const
  readonly nombre = 'Barrett True-K Toric'
  readonly url = PAGINA_PADRE
  /** Mismo motivo que Barrett Toric: sin ventana, el iframe no carga. */
  readonly requiereNavegadorVisible = true

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    const problemas: string[] = []
    if (entradas.valores.CONSTANTE_A === undefined && entradas.valores.FACTOR_LENTE === undefined) {
      problemas.push('Barrett True-K Toric necesita la constante A o el factor de lente.')
    }
    if (
      entradas.cirugiaRefractivaPrevia === undefined ||
      entradas.cirugiaRefractivaPrevia === 'NINGUNA'
    ) {
      problemas.push(
        'Barrett True-K Toric es para ojos con cirugía refractiva previa o queratocono. Indícalo en la revisión antes de lanzarla.',
      )
    }
    return problemas
  }

  async ejecutar(ctx: ContextoEjecucion): Promise<ResultadoCalculadora> {
    const inicio = Date.now()
    const { entradas, progreso } = ctx
    const pagina = await ctx.contexto.newPage()

    try {
      progreso({
        calculadora: this.calculadora,
        fase: 'NAVEGANDO',
        mensaje: 'Abriendo Barrett True-K Toric en la web de la ASCRS…',
      })
      await pagina.goto(PAGINA_PADRE, { waitUntil: 'domcontentloaded', timeout: 90_000 })

      await this.rechazarCookies(pagina)

      progreso({
        calculadora: this.calculadora,
        fase: 'PREPARANDO',
        mensaje: 'Esperando a que cargue la calculadora…',
      })
      const calc = await this.esperarCalculadora(pagina, ctx)

      progreso({
        calculadora: this.calculadora,
        fase: 'RELLENANDO',
        mensaje: 'Rellenando los datos en Barrett True-K Toric…',
      })
      // Segunda pasada: entre la carga de la página y la del iframe pasan
      // varios segundos, y el aviso puede haber salido en ese hueco.
      await this.rechazarCookies(pagina)
      await this.rellenar(calc, pagina, entradas)

      progreso({
        calculadora: this.calculadora,
        fase: 'CALCULANDO',
        mensaje: 'Calculando en Barrett True-K Toric…',
      })
      await calc.click(SEL.calcular)
      await pagina.waitForTimeout(3000)

      const neto = await this.leerAstigmatismoNeto(calc)

      progreso({
        calculadora: this.calculadora,
        fase: 'LEYENDO_RESULTADO',
        mensaje: 'Abriendo la pestaña de resultados…',
      })
      await this.abrirPestanaResultados(pagina, calc)

      return await this.leerResultado(pagina, ctx, inicio, neto)
    } catch (error) {
      return await this.aFallo(pagina, ctx, error, inicio)
    } finally {
      await pagina.close().catch(() => undefined)
    }
  }

  /** Mismo mecanismo que Barrett Toric — ver la explicación allí. */
  private async rechazarCookies(pagina: Page): Promise<void> {
    const boton = pagina.locator(SEL.rechazarCookies).first()
    const capa = pagina.locator(SEL.capaCookies).first()

    try {
      await boton.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      return
    }

    const limite = Date.now() + 20_000
    while (Date.now() < limite) {
      await boton.click({ timeout: 5000 }).catch(() => undefined)
      await pagina.waitForTimeout(800)
      const sigueTapando = await capa.isVisible().catch(() => false)
      if (!sigueTapando) return
    }
  }

  /** Mismo mecanismo que Barrett Toric — ver la explicación allí. */
  private async esperarCalculadora(pagina: Page, ctx: ContextoEjecucion): Promise<Frame> {
    const buscar = async (): Promise<Frame | null> => {
      for (const marco of pagina.frames()) {
        if (!marco.url().includes(HOST_CALCULADORA)) continue
        try {
          if ((await marco.locator(SEL.anclaFormulario).count()) > 0) return marco
        } catch {
          // El marco puede estar navegando.
        }
      }
      return null
    }

    let calc = await buscar()
    if (calc) return calc

    const rapido = await esperarAlUsuario(pagina, async () => (await buscar()) !== null, {
      limiteMs: 25_000,
      cancelado: ctx.cancelado,
    })
    if (rapido) {
      calc = await buscar()
      if (calc) return calc
    }

    ctx.progreso({
      calculadora: this.calculadora,
      fase: 'ESPERANDO_AL_USUARIO',
      requiereUsuario: true,
      mensaje:
        'BARRETT TRUE-K TORIC REQUIERE TU INTERVENCIÓN. Mira el navegador que se ha abierto: puede estar pidiendo una comprobación de seguridad. Complétala y Calculator Vilamar seguirá solo.',
    })

    const conAyuda = await esperarAlUsuario(pagina, async () => (await buscar()) !== null, {
      limiteMs: 180_000,
      cancelado: ctx.cancelado,
    })
    calc = conAyuda ? await buscar() : null
    if (calc) return calc

    throw new ErrorAdaptador(
      'NEEDS_USER_ACTION',
      'La calculadora de Barrett True-K Toric no llegó a cargar. Suele ser una comprobación de seguridad de su web. Puedes reintentar solo esta sin perder el resto.',
      'ESPERANDO_AL_USUARIO',
      SEL.anclaFormulario,
    )
  }

  private async rellenar(calc: Frame, pagina: Page, entradas: EntradasCalculadora): Promise<void> {
    await calc.check(entradas.ojo === 'OD' ? SEL.ojoDerecho : SEL.ojoIzquierdo)
    await pagina.waitForTimeout(1500) // el radio hace envío del formulario

    // El desplegable de historial. `validarEntradas` ya ha comprobado que hay
    // un valor y que no es NINGUNA antes de llegar aquí.
    const historial = entradas.cirugiaRefractivaPrevia
      ? HISTORIAL_EN_TRUE_K[entradas.cirugiaRefractivaPrevia]
      : undefined
    if (historial !== undefined) {
      await calc.selectOption(SEL.historial, historial)
      await pagina.waitForTimeout(1500) // también hace envío del formulario
    }

    // Elegir el modelo rellena solo la constante A y el factor de lente.
    if (entradas.modeloLente) {
      const puesto = await this.elegirModelo(calc, entradas.modeloLente)
      if (puesto) await pagina.waitForTimeout(1500)
    }

    await calc.fill(SEL.nombrePaciente, entradas.codigoCaso)

    if (entradas.valores.CONSTANTE_A !== undefined) {
      await calc.fill(SEL.constanteA, entradas.valores.CONSTANTE_A.toFixed(2))
    }
    if (entradas.valores.FACTOR_LENTE !== undefined) {
      await calc.fill(SEL.factorLente, entradas.valores.FACTOR_LENTE.toFixed(2))
    }

    for (const [campo, config] of Object.entries(CAMPOS)) {
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      if (valor === undefined) continue
      await calc.fill(config.selector, valor.toFixed(config.decimales))
    }

    // La casilla «Enter Data and Calculate» (`#MainContent_ConfirmCheckBox`)
    // NO se toca — y es a propósito, tras comprobarlo en vivo (04/09/2026).
    // Empieza deshabilitada, y ninguna combinación de campos rellenados ni de
    // envíos de formulario la habilita: se probó rellenar antes o después del
    // historial, con `fill`, con pulsaciones de teclado reales y con clics
    // adicionales, y siguió deshabilitada siempre. Y no hacía falta: con la
    // casilla deshabilitada y sin marcar, pulsar «Calculate» calcula igual y
    // la pestaña «Toric IOL» sale con los resultados completos. Es un control
    // vestigial de esta página, no una condición para calcular.
  }

  private async elegirModelo(calc: Frame, modelo: string): Promise<boolean> {
    try {
      const opciones = await calc.locator(`${SEL.modeloLente} option`).allTextContents()
      const encontrado = opciones.find(
        (o) => o.trim().toLowerCase() === modelo.trim().toLowerCase(),
      )
      if (!encontrado) return false
      await calc.selectOption(SEL.modeloLente, { label: encontrado })
      return true
    } catch {
      return false
    }
  }

  private async leerAstigmatismoNeto(
    calc: Frame,
  ): Promise<{ magnitud: number; eje: number } | undefined> {
    try {
      const texto = await calc.locator('body').innerText({ timeout: 5000 })
      const linea = /Net\s+Astigmatism[^\n]*/i.exec(texto)?.[0]
      if (!linea) return undefined
      const { magnitud, eje } = leerCilindroConEje(linea)
      if (magnitud === undefined || eje === undefined) return undefined
      return { magnitud, eje }
    } catch {
      return undefined
    }
  }

  private async abrirPestanaResultados(pagina: Page, calc: Frame): Promise<void> {
    try {
      await calc.getByRole('link', { name: 'Toric IOL' }).first().click({ timeout: 15_000 })
      await pagina.waitForTimeout(4000)
    } catch (error) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'No se ha encontrado la pestaña de resultados de Barrett True-K Toric. Puede que la web haya cambiado.',
        'LEYENDO_RESULTADO',
        'enlace «Toric IOL»',
        error,
      )
    }
  }

  private async leerResultado(
    pagina: Page,
    ctx: ContextoEjecucion,
    inicio: number,
    neto: { magnitud: number; eje: number } | undefined,
  ): Promise<ResultadoCalculadora> {
    const calc = pagina.frames().find((m) => m.url().includes(HOST_CALCULADORA))
    if (!calc) {
      throw new ErrorAdaptador(
        'EXTERNAL_ERROR',
        'Se ha perdido la calculadora de Barrett True-K Toric al cambiar de pestaña.',
        'LEYENDO_RESULTADO',
      )
    }

    const filas = async (selector: string): Promise<string[][]> => {
      const tabla = calc.locator(selector)
      if ((await tabla.count()) === 0) return []
      return await tabla.first().evaluate((t) => {
        const tabla = t as HTMLTableElement
        return [...tabla.rows].map((r) => [...r.cells].map((c) => c.innerText.trim()))
      })
    }

    const potencias = await filas(SEL.tablaPotencias)
    const toricas = await filas(SEL.tablaToricas)

    if (potencias.length <= 1 && toricas.length <= 1) {
      throw new ErrorAdaptador(
        'EXTERNAL_ERROR',
        'Barrett True-K Toric no ha devuelto resultados. Comprueba que los datos son correctos y reinténtalo.',
        'LEYENDO_RESULTADO',
        SEL.tablaPotencias,
      )
    }

    const opciones: OpcionLente[] = []

    const filasPotencia = potencias.slice(1)
    const indiceDestacada = Math.floor(filasPotencia.length / 2)

    filasPotencia.forEach((fila, i) => {
      const esfera = leerNumeroDeTexto(fila[0])
      if (esfera === undefined) return
      opciones.push({
        esfera,
        designacion: fila[1]?.trim() || undefined,
        refraccionPrevista: leerNumeroDeTexto(fila[2]),
        recomendada: i === indiceDestacada,
      })
    })

    const destacada = opciones[indiceDestacada]
    let cilindro: number | undefined
    let ejeResidual: number | undefined
    let cilindroResidual: number | undefined

    for (const fila of toricas.slice(1)) {
      const designacion = fila[0]?.trim()
      if (!designacion || !destacada?.designacion) continue
      if (designacion.toLowerCase() !== destacada.designacion.toLowerCase()) continue
      cilindro = leerNumeroDeTexto(fila[1])
      const residual = leerCilindroConEje(fila[2])
      cilindroResidual = residual.magnitud
      ejeResidual = residual.eje
      break
    }

    const recomendada: OpcionLente | undefined = destacada
      ? {
          ...destacada,
          cilindro,
          cilindroResidual,
          ejeResidual,
          eje: ejeResidual,
        }
      : undefined

    if (recomendada) opciones[indiceDestacada] = recomendada

    const entradasSegunLaWeb: Record<string, string> = {}
    if (neto) entradasSegunLaWeb['Astigmatismo neto'] = `${neto.magnitud} D @ ${neto.eje}°`

    const capturaId = await pagina
      .screenshot({ fullPage: true })
      .then((datos) => ctx.guardarCaptura(this.calculadora, ctx.entradas.ojo, datos))
      .catch(() => undefined)

    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      estado: recomendada ? 'SUCCESS' : 'PARTIAL',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones,
      recomendada,
      astigmatismoNeto: neto,
      entradasSegunLaWeb,
      ...(capturaId !== undefined ? { capturaId } : {}),
      mensaje: recomendada
        ? undefined
        : 'Barrett True-K Toric ha calculado, pero no se ha podido leer la opción destacada.',
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
        : 'Barrett True-K Toric no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentar solo esta.',
      diagnosticoId,
    }
  }
}
