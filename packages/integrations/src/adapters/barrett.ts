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
 *  4. Exige «Patient Name». Desde D44 (27/08/2026) se le manda el nombre real
 *     del paciente si el caso lo tiene; si no, el código local, como antes.
 *     «Patient ID» se queda vacío — no se ha comprobado su selector real, y
 *     su formulario solo carga con ventana visible (ver punto 2), lo que
 *     complica la sonda. «Doctor Name», si el caso lo tiene, se rellena (D41).
 *
 *  5. Elegir el modelo de lente rellena solo el factor de lente y la constante
 *     A, y lo hace con un envío del formulario. Hay que esperarlo.
 *
 *  6. Los resultados NO salen en la misma pestaña: hay que abrir la pestaña
 *     «Toric IOL», que es otro envío del formulario dentro del iframe.
 *
 *  7. Por defecto usa «Predicted PCA» —un modelo teórico de córnea
 *     posterior— y nunca pide la medida real. Existe una variante,
 *     `AdaptadorBarrettToric(true)` → `BARRETT_TORIC_CON_CARA_POSTERIOR`
 *     (D45, 27/08/2026), que marca «Measured PCA» y rellena su panel con
 *     PK1/PK2. La secuencia completa, comprobada en vivo con ayuda del
 *     dueño del proyecto —no está documentada en ningún sitio y no se
 *     encuentra mirando solo el HTML inicial—, tiene NUEVE pasos y cruza
 *     dos pestañas:
 *       (a) rellenar el formulario normal y pulsar «Calculate» (`Button1`)
 *           — solo entonces aparece el interruptor «Measured PCA»;
 *       (b) marcarlo, lo que revela el panel «Measured Posterior Cornea»;
 *       (c) rellenar sus 4 campos (Flat K / eje, Steep K / eje);
 *       (d) pulsar el «Calculate» DE ESE PANEL, que es un botón distinto
 *           (`Button4`, no `Button1`);
 *       (e) abrir la pestaña «Toric IOL»;
 *       (f) pulsar «Calculate» otra vez —ahí sí es `Button1`, que existe de
 *           nuevo en esa pestaña—;
 *       (g) abrir «Toric IOL» una segunda vez, que es cuando el resultado
 *           realmente refleja «Measured PCA» en vez de «Predicted PCA».
 *     Sin el paso (d)-(f) con el botón correcto, el panel queda relleno
 *     pero el cálculo se sigue haciendo con «Predicted PCA» — un fallo
 *     silencioso que ya ocurrió una vez en este adaptador. Y aunque los
 *     nueve pasos estén bien, esta web es lenta y el postback del paso (g)
 *     a veces no ha terminado cuando Playwright ya quiere leer — eso
 *     también ocurrió una vez, con un caso real (mismo cilindro y eje en
 *     las dos hojas) — por eso `abrirPestanaResultados` espera un margen
 *     mayor en esta variante antes de leer la tabla.
 *
 *     ⚠️ Se intentó, y se abandonó, comprobar que el texto «Measured PCA»
 *     hubiera aparecido de verdad antes de aceptar el resultado —cuatro
 *     formas distintas de buscarlo, todas rechazando cálculos que ya
 *     estaban bien—: esa etiqueta se ve en pantalla pero no está en el
 *     texto real de la página (`innerText`), probablemente por ser una
 *     imagen o contenido generado por CSS. Ver el log de lecciones,
 *     2026-08-27 (noche), antes de intentarlo otra vez de la misma forma.
 */

import type { Calculadora, EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Frame, Page } from 'playwright'

import { capturarResultado } from '../captura.js'
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
  /** «Doctor Name». Comprobado con `pnpm reconocer barrett` el 25/08/2026. Ver D41. */
  cirujano: '#MainContent_DoctorName',
  modeloLente: '#MainContent_IOLModel',
  constanteA: '#MainContent_Aconstant',
  factorLente: '#MainContent_LensFactor',
  ojoDerecho: '#MainContent_Rad1',
  ojoIzquierdo: '#MainContent_Rad2',
  calcular: '#MainContent_Button1',
  anclaFormulario: '#MainContent_AxLength',
  tablaPotencias: '#MainContent_GridView1',
  tablaToricas: '#MainContent_GridView2',
  /**
   * «Measured PCA» — comprobado en vivo el 27/08/2026, con ayuda del dueño
   * del proyecto: **solo aparece después del primer «Calculate»**, no en el
   * formulario recién cargado. Antes de eso no existe en la página.
   */
  medidaPCA: '#MainContent_RadioButtonList3_1',
  /**
   * El panel «Measured Posterior Cornea» que aparece al marcar `medidaPCA`.
   * «K Convention» ya viene en «Keratometry (D)» por defecto —el mismo
   * convenio en el que el dominio guarda PK1/PK2—, así que no hace falta
   * tocarlo.
   */
  flatKPosterior: '#MainContent_K1_PC',
  ejeFlatPosterior: '#MainContent_A1_PC',
  steepKPosterior: '#MainContent_K2_PC',
  ejeSteepPosterior: '#MainContent_PCTK_Axis',
  /**
   * «Device» — con qué aparato se midió la córnea posterior. Solo aparece
   * dentro de este mismo panel, tras marcar `medidaPCA` (comprobado en vivo
   * el 01/09/2026). Por defecto está en «IOLMaster 700 TK»; si el aparato
   * real es otro y este programa sabe cuál es su nombre exacto aquí
   * (`dispositivoCaraPosterior`, ver `preparar-entradas.ts`), se cambia.
   */
  dispositivoPosterior: '#MainContent_Device',
  /**
   * El «Calculate» del panel de córnea posterior medida. NO es el mismo
   * botón que `calcular` (`Button1`) — comprobado en vivo el 27/08/2026:
   * un volcado sin filtrar de todos los botones de la página lo confirmó
   * como `Button4`. Usar `Button1` aquí deja el panel relleno pero sin
   * enviar, y el resultado sale igual que en «Predicted PCA».
   */
  calcularCaraPosterior: '#MainContent_Button4',
  enlaceToricIol: 'Toric IOL',
} as const

export class AdaptadorBarrettToric implements AdaptadorCalculadora {
  /**
   * Si es `true`, este adaptador marca «Measured PCA» y rellena su panel de
   * córnea posterior — un paso extra que Barrett no hace nunca por defecto
   * (D45, 27/08/2026). Los dos modos comparten todo el código: mismo
   * formulario, mismos selectores, solo cambia si se da ese paso de más.
   */
  constructor(private readonly conCaraPosterior: boolean = false) {}

  get calculadora(): Calculadora {
    return this.conCaraPosterior ? 'BARRETT_TORIC_CON_CARA_POSTERIOR' : 'BARRETT_TORIC'
  }

  get nombre(): string {
    return this.conCaraPosterior ? 'Barrett Toric (con córnea posterior)' : 'Barrett Toric'
  }

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

      if (this.conCaraPosterior) {
        progreso({
          calculadora: this.calculadora,
          fase: 'RELLENANDO',
          mensaje: 'Marcando la córnea posterior medida en Barrett…',
        })
        await this.rellenarCaraPosterior(calc, pagina, entradas)
      }

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

    // Barrett exige nombre. Desde D44 (27/08/2026), si el caso tiene el
    // nombre del paciente es ese el que se manda; si no, el código local.
    await calc.fill(SEL.nombrePaciente, entradas.nombrePaciente ?? entradas.codigoCaso)

    // El cirujano, si el caso lo tiene (D41). Que el campo no exista o no
    // admita el valor no puede tirar el cálculo.
    if (entradas.nombreCirujano) {
      await calc.fill(SEL.cirujano, entradas.nombreCirujano).catch(() => undefined)
    }

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

  /**
   * Marca «Measured PCA» y rellena su panel de córnea posterior — el paso
   * extra que solo da esta variante (D45). Si el caso no trae PK1 o PK2 no
   * hace nada: Barrett se queda en «Predicted PCA», como siempre.
   *
   * El panel solo existe DESPUÉS del primer «Calculate» — comprobado en vivo,
   * no en el formulario recién cargado — y por eso se llama aquí, entre el
   * primer clic en Calculate y la lectura del resultado.
   *
   * Igual que en EVO (ver `evo.ts`): el dominio no garantiza que PK1 sea
   * siempre el meridiano más plano, así que aquí también se ordena por
   * módulo antes de rellenar «Flat K» / «Steep K» — no se asume el orden que
   * traiga el caso.
   *
   * ⚠️ Antes, marcar «Measured PCA» y rellenar su panel iba todo con
   * `.catch(() => undefined)`: si el radio o el panel no estaban listos
   * todavía, el fallo se tragaba en silencio y el segundo «Calculate» volvía
   * a salir en «Predicted PCA» —el mismo resultado que sin córnea posterior,
   * pero con pinta de haber funcionado—. Ahora, si el panel no aparece o un
   * campo no se puede rellenar, esto lanza `ADAPTER_BROKEN`: un fallo visible
   * es mejor que un resultado que parece correcto y no lo es.
   */
  private async rellenarCaraPosterior(
    calc: Frame,
    pagina: Page,
    entradas: EntradasCalculadora,
  ): Promise<void> {
    const { PK1, PK2, PK1_EJE, PK2_EJE } = entradas.valores
    if (PK1 === undefined || PK2 === undefined) return

    try {
      await calc.click(SEL.medidaPCA)
      await calc.locator(SEL.flatKPosterior).waitFor({ state: 'visible', timeout: 15_000 })
    } catch (error) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Barrett ha calculado con «Predicted PCA», pero no se ha encontrado el panel de «Measured PCA» para meter la córnea posterior medida. Puede que la web haya cambiado.',
        'RELLENANDO',
        SEL.medidaPCA,
        error,
      )
    }

    if (entradas.dispositivoCaraPosterior !== undefined) {
      await calc.selectOption(SEL.dispositivoPosterior, { label: entradas.dispositivoCaraPosterior })
    }

    const plano = Math.abs(PK1) <= Math.abs(PK2) ? { k: PK1, eje: PK1_EJE } : { k: PK2, eje: PK2_EJE }
    const curvo = Math.abs(PK1) <= Math.abs(PK2) ? { k: PK2, eje: PK2_EJE } : { k: PK1, eje: PK1_EJE }

    await calc.fill(SEL.flatKPosterior, Math.abs(plano.k).toFixed(2))
    if (plano.eje !== undefined) await calc.fill(SEL.ejeFlatPosterior, plano.eje.toFixed(0))
    await calc.fill(SEL.steepKPosterior, Math.abs(curvo.k).toFixed(2))
    if (curvo.eje !== undefined) await calc.fill(SEL.ejeSteepPosterior, curvo.eje.toFixed(0))

    // El panel de córnea posterior tiene su propio «Calculate» (`Button4`,
    // no `Button1`). Después hay que entrar en la pestaña «Toric IOL» y
    // volver a pulsar «Calculate» —ahí sí es `Button1`, que en esa pestaña
    // vuelve a existir— para que el cálculo se rehaga con «Measured PCA».
    // La comprobación de que de verdad quedó en «Measured PCA» (y no en
    // «Predicted PCA») la hace `abrirPestanaResultados`, con el último clic
    // en «Toric IOL» que ya hacía este adaptador para cualquier cálculo.
    try {
      await calc.click(SEL.calcularCaraPosterior, { timeout: 15_000 })
      await pagina.waitForTimeout(3000)
      await calc.getByRole('link', { name: SEL.enlaceToricIol }).first().click({ timeout: 15_000 })
      await pagina.waitForTimeout(3000)
      await calc.click(SEL.calcular, { timeout: 15_000 })
      await pagina.waitForTimeout(3000)
    } catch (error) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'Barrett ha aceptado la córnea posterior medida, pero no se ha podido completar la secuencia de recálculo. Puede que la web haya cambiado.',
        'RELLENANDO',
        SEL.calcularCaraPosterior,
        error,
      )
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
      // Con córnea posterior medida esto llega después de una secuencia de
      // varios postbacks seguidos (D45); un margen mayor cuesta unos segundos
      // más y evita leer la tabla a medio repintar.
      await pagina.waitForTimeout(this.conCaraPosterior ? 6000 : 4000)
    } catch (error) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'No se ha encontrado la pestaña de resultados de Barrett. Puede que la web haya cambiado.',
        'LEYENDO_RESULTADO',
        'enlace «Toric IOL»',
        error,
      )
    }

    // ⚠️ Aquí hubo, y se quitó, una comprobación que esperaba a ver el texto
    // «Measured PCA» (o, después, el estado marcado de su interruptor) antes
    // de dar el cálculo por bueno — pensada para detectar si un postback
    // lento dejaba el resultado en «Predicted PCA» sin avisar. Se abandonó
    // porque **nunca funcionó**, con cuatro formas distintas de buscarlo, y
    // en las cuatro rechazaba cálculos que ya estaban bien: capturas y el
    // texto completo de la página, tomados en el momento exacto del fallo,
    // mostraban la tabla de «Measured PCA» con los números correctos. Esa
    // etiqueta se ve a simple vista pero no se encontró ninguna forma
    // fiable de leerla por programa —todo apunta a que es una imagen o un
    // contenido generado por CSS, invisible para `innerText`—, y el
    // interruptor del panel no está disponible una vez se ha cambiado a la
    // pestaña «Toric IOL». Perseguir una señal que no se puede leer hacía
    // más daño que no comprobar nada: convertía cálculos correctos en
    // fallos. La única red de seguridad que queda es la de siempre,
    // `leerResultado`: si las tablas llegan vacías, avisa; si llegan con
    // datos, se leen tal cual — igual que en cualquier otro cálculo de
    // Barrett.
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

    // La tabla de tóricas da cilindro de lente y astigmatismo residual, por
    // designación (T3, T4…). Se guarda una por designación —no solo la de la
    // opción destacada— porque el criterio propio de Calculator Vilamar
    // (D43) puede acabar eligiendo una esfera distinta a la que Barrett
    // destaca, y esa otra esfera **tiene su propia designación** en la
    // misma tabla de potencias: sin este dato, esa esfera se enseñaría sin
    // cilindro ni eje, aunque Barrett sí los haya dado.
    const toricasPorDesignacion = new Map<
      string,
      { cilindro: number | undefined; cilindroResidual: number | undefined; ejeResidual: number | undefined }
    >()
    for (const fila of toricas.slice(1)) {
      const designacion = fila[0]?.trim()
      if (!designacion) continue
      const residual = leerCilindroConEje(fila[2])
      toricasPorDesignacion.set(designacion.toLowerCase(), {
        cilindro: leerNumeroDeTexto(fila[1]),
        cilindroResidual: residual.magnitud,
        ejeResidual: residual.eje,
      })
    }

    opciones.forEach((opcion, i) => {
      const toricaDeEsta = opcion.designacion
        ? toricasPorDesignacion.get(opcion.designacion.toLowerCase())
        : undefined
      if (!toricaDeEsta) return
      opciones[i] = {
        ...opcion,
        cilindro: toricaDeEsta.cilindro,
        cilindroResidual: toricaDeEsta.cilindroResidual,
        ejeResidual: toricaDeEsta.ejeResidual,
        // Barrett no publica un «eje de la lente» aparte: usa el del
        // astigmatismo residual. No se inventa uno.
        eje: toricaDeEsta.ejeResidual,
      }
    })

    const recomendada: OpcionLente | undefined = opciones[indiceDestacada]

    const entradasSegunLaWeb: Record<string, string> = {}
    if (neto) entradasSegunLaWeb['Astigmatismo neto'] = `${neto.magnitud} D @ ${neto.eje}°`

    // La captura se toma de la página entera: el resultado vive en el iframe
    // «Toric IOL», que ya está visible dentro de `pagina` en este punto.
    const capturaId = await capturarResultado(pagina, ctx, this.calculadora)

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
      mensaje: recomendada
        ? undefined
        : 'Barrett ha calculado, pero no se ha podido leer la opción destacada.',
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
        : 'Barrett no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentar solo Barrett.',
      diagnosticoId,
    }
  }
}
