/**
 * barrett.ts — Adaptador de Barrett Toric.
 *
 *   Página:      https://www.ascrs.org/en/tools/barrett-toric-calculator
 *   Calculadora: https://calc.apacrs.org/toric_calculator20/Toric Calculator.aspx (dentro de un iframe)
 *
 * Es la más incómoda de las tres, y conviene tener claro por qué antes de
 * tocarla. Todo esto está comprobado abriéndola, no supuesto:
 *
 *  1. La calculadora NO está en la página de la ASCRS: está en un iframe de
 *     otro dominio. Entrar directamente a ese dominio devuelve 403 («Just a
 *     moment…»): tiene protección anti-robot. **No se rodea.** Se entra por
 *     donde entra una persona: abriendo la página de la ASCRS.
 *
 *  2. Con el navegador SIN VENTANA el iframe no llega a cargar. Con ventana,
 *     carga. Por eso este adaptador exige navegador visible; no es estética.
 *
 *  3. La ASCRS enseña un aviso de cookies que tapa la página entera y se come
 *     los clics. Se elige RECHAZAR: declinar cookies opcionales no es aceptar
 *     nada en nombre de nadie, y es lo que menos datos comparte.
 *
 *  4. Exige «Patient Name». Se le manda el CÓDIGO LOCAL del caso. «Doctor Name»
 *     y «Patient ID» se quedan vacíos.
 *
 *  5. Elegir el modelo de lente rellena solo el factor de lente y la constante
 *     A, y lo hace con un envío del formulario. Hay que esperarlo.
 *
 *  6. Los resultados NO salen en la misma pestaña: hay que abrir la pestaña
 *     «Toric IOL», que es otro envío del formulario dentro del iframe.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Frame, Page } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador, esperarAlUsuario } from '../contrato.js'
import { leerCilindroConEje, leerNumeroDeTexto } from '../normalizar.js'

const PAGINA_PADRE = 'https://www.ascrs.org/en/tools/barrett-toric-calculator'
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
  // La capa que tapa la página. Es esto lo que hay que ver desaparecer.
  capaCookies: '.cky-overlay',
  nombrePaciente: '#MainContent_PatientName',
  modeloLente: '#MainContent_IOLModel',
  constanteA: '#MainContent_Aconstant',
  factorLente: '#MainContent_LensFactor',
  ojoDerecho: '#MainContent_Rad1',
  ojoIzquierdo: '#MainContent_Rad2',
  calcular: '#MainContent_Button1',
  anclaFormulario: '#MainContent_AxLength',
  tablaPotencias: '#MainContent_GridView1',
  tablaToricas: '#MainContent_GridView2',
} as const

export class AdaptadorBarrettToric implements AdaptadorCalculadora {
  readonly calculadora = 'BARRETT_TORIC' as const
  readonly nombre = 'Barrett Toric'
  readonly url = PAGINA_PADRE
  /** No es una preferencia: sin ventana, el iframe no carga. Comprobado. */
  readonly requiereNavegadorVisible = true

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    const problemas: string[] = []
    if (entradas.valores.CONSTANTE_A === undefined && entradas.valores.FACTOR_LENTE === undefined) {
      problemas.push('Barrett necesita la constante A o el factor de lente.')
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
        mensaje: 'Abriendo Barrett Toric en la web de la ASCRS…',
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
        mensaje: 'Rellenando los datos en Barrett…',
      })
      // Segunda pasada: entre la carga de la página y la del iframe pasan
      // varios segundos, y el aviso puede haber salido en ese hueco.
      await this.rechazarCookies(pagina)
      await this.rellenar(calc, pagina, entradas)

      progreso({
        calculadora: this.calculadora,
        fase: 'CALCULANDO',
        mensaje: 'Calculando en Barrett…',
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

  /**
   * El aviso de cookies tapa la página entera y se come los clics. Se rechaza.
   *
   * No basta con pulsar «Rechazar» una vez: el aviso aparece unos segundos
   * después de cargar la página, y pulsar antes de que esté listo no hace nada.
   * Lo que importa no es haber pulsado, sino que **la capa que tapa ya no esté**,
   * así que se comprueba eso y se reintenta hasta conseguirlo.
   *
   * Esta función ya falló una vez por dar por bueno el clic sin mirar el
   * resultado: el síntoma fue un tiempo de espera agotado al rellenar el primer
   * campo, treinta segundos más tarde y en otro sitio del código.
   */
  private async rechazarCookies(pagina: Page): Promise<void> {
    const boton = pagina.locator(SEL.rechazarCookies).first()
    const capa = pagina.locator(SEL.capaCookies).first()

    // Primero hay que ESPERAR A QUE APAREZCA. Comprobar nada más cargar la
    // página y no verlo no significa que no vaya a salir: sale unos segundos
    // después. Ese fue justamente el fallo — se daba por resuelto antes de que
    // el aviso existiera, y reaparecía a tiempo de comerse el primer clic.
    try {
      await boton.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      return // No hay aviso de cookies en esta visita.
    }

    // Y después, pulsar hasta que la capa que tapa DESAPAREZCA de verdad.
    const limite = Date.now() + 20_000
    while (Date.now() < limite) {
      await boton.click({ timeout: 5000 }).catch(() => undefined)
      await pagina.waitForTimeout(800)
      const sigueTapando = await capa.isVisible().catch(() => false)
      if (!sigueTapando) return
    }
    // Si sigue ahí, se deja continuar: el fallo posterior lo dirá con su
    // captura, y así no se traga el problema en silencio.
  }

  /**
   * Espera al iframe de la calculadora.
   *
   * Si el dominio de la calculadora presenta una comprobación anti-robot, aquí
   * es donde una persona la resuelve en el navegador visible. El programa no la
   * resuelve ni la rodea: espera.
   */
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

    // Primer intento corto: lo normal es que tarde unos segundos.
    const rapido = await esperarAlUsuario(pagina, async () => (await buscar()) !== null, {
      limiteMs: 25_000,
      cancelado: ctx.cancelado,
    })
    if (rapido) {
      calc = await buscar()
      if (calc) return calc
    }

    // No ha cargado sola: puede haber una comprobación esperando a una persona.
    ctx.progreso({
      calculadora: this.calculadora,
      fase: 'ESPERANDO_AL_USUARIO',
      requiereUsuario: true,
      mensaje:
        'BARRETT REQUIERE TU INTERVENCIÓN. Mira el navegador que se ha abierto: puede estar pidiendo una comprobación de seguridad. Complétala y Calculator Vilamar seguirá solo.',
    })

    const conAyuda = await esperarAlUsuario(pagina, async () => (await buscar()) !== null, {
      limiteMs: 180_000,
      cancelado: ctx.cancelado,
    })
    calc = conAyuda ? await buscar() : null
    if (calc) return calc

    throw new ErrorAdaptador(
      'NEEDS_USER_ACTION',
      'La calculadora de Barrett no llegó a cargar. Suele ser una comprobación de seguridad de su web. Puedes reintentar solo Barrett sin perder el resto.',
      'ESPERANDO_AL_USUARIO',
      SEL.anclaFormulario,
    )
  }

  private async rellenar(calc: Frame, pagina: Page, entradas: EntradasCalculadora): Promise<void> {
    await calc.check(entradas.ojo === 'OD' ? SEL.ojoDerecho : SEL.ojoIzquierdo)
    await pagina.waitForTimeout(1500) // el radio hace envío del formulario

    // Elegir el modelo rellena solo la constante A y el factor de lente.
    if (entradas.modeloLente) {
      const puesto = await this.elegirModelo(calc, entradas.modeloLente)
      if (puesto) await pagina.waitForTimeout(1500)
    }

    // Barrett exige nombre: se le da el código local del caso.
    await calc.fill(SEL.nombrePaciente, entradas.codigoCaso)

    // La constante A que traiga el caso manda sobre la que ponga el modelo.
    if (entradas.valores.CONSTANTE_A !== undefined) {
      await calc.fill(SEL.constanteA, entradas.valores.CONSTANTE_A.toFixed(2))
    }
    if (entradas.valores.FACTOR_LENTE !== undefined) {
      await calc.fill(SEL.factorLente, entradas.valores.FACTOR_LENTE.toFixed(2))
    }

    for (const [campo, config] of Object.entries(CAMPOS)) {
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      if (valor === undefined) continue // ausente no se rellena
      await calc.fill(config.selector, valor.toFixed(config.decimales))
    }
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

  /**
   * «Net Astigmatism: 0.72 D @ 81 Degrees», que sale en la pestaña de datos.
   *
   * Se lee del texto completo del marco y no con un localizador por texto: esa
   * frase no está en un elemento propio, así que buscarla como nodo no la
   * encuentra. Es un dato opcional —solo enriquece el informe—, de modo que si
   * no aparece se sigue sin él en lugar de fallar.
   */
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
        'No se ha encontrado la pestaña de resultados de Barrett. Puede que la web haya cambiado.',
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
    // Tras el cambio de pestaña el marco puede ser otro objeto: se vuelve a buscar.
    const calc = pagina.frames().find((m) => m.url().includes(HOST_CALCULADORA))
    if (!calc) {
      throw new ErrorAdaptador(
        'EXTERNAL_ERROR',
        'Se ha perdido la calculadora de Barrett al cambiar de pestaña.',
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

    // Tabla 1: IOL Power | Toric Power | Refraction (S.E.Q.)
    const potencias = await filas(SEL.tablaPotencias)
    // Tabla 2: Toric Power | IOL Cylinder | Residual Astigmatism
    const toricas = await filas(SEL.tablaToricas)

    if (potencias.length <= 1 && toricas.length <= 1) {
      throw new ErrorAdaptador(
        'EXTERNAL_ERROR',
        'Barrett no ha devuelto resultados. Comprueba que los datos son correctos y reinténtalo.',
        'LEYENDO_RESULTADO',
        SEL.tablaPotencias,
      )
    }

    const opciones: OpcionLente[] = []

    // La fila del medio de la tabla de potencias es la que Barrett destaca.
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

    // La tabla de tóricas da cilindro de lente y astigmatismo residual.
    // Se busca la que corresponde a la designación de la opción destacada.
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
          // Barrett no publica un «eje de la lente» aparte: usa el del
          // astigmatismo residual. No se inventa uno.
          eje: ejeResidual,
        }
      : undefined

    if (recomendada) opciones[indiceDestacada] = recomendada

    const entradasSegunLaWeb: Record<string, string> = {}
    if (neto) entradasSegunLaWeb['Astigmatismo neto'] = `${neto.magnitud} D @ ${neto.eje}°`

    // La prueba de que la web dijo esto: una captura de SU pantalla de
    // resultados, convertida en PDF al generar el informe. Que falle no puede
    // tumbar un cálculo que ya ha salido bien — por eso no lleva `throw`.
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
        : 'Barrett ha calculado, pero no se ha podido leer la opción destacada.',
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
        : 'Barrett no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentar solo Barrett.',
      diagnosticoId,
    }
  }
}
