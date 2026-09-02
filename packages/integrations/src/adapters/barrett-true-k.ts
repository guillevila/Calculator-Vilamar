/**
 * barrett-true-k.ts — Adaptador de Barrett True K Toric.
 *
 *   Página:      https://www.ascrs.org/en/tools/barrett-true-k-toric-calculator
 *   Calculadora: https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx (dentro de un iframe)
 *
 * Es la calculadora que hay que usar en vez de Barrett Toric —nunca las dos a
 * la vez, ver `prepararEntradas()`, que las excluye mutuamente— cuando el ojo
 * tiene una córnea alterada por cirugía refractiva previa (LASIK/PRK/
 * queratotomía radial) o queratocono (D67, 02/09/2026, petición expresa del
 * dueño del proyecto). Con córnea normal, la fórmula estándar de Barrett Toric
 * da un resultado erróneo en estos ojos: por eso ASCRS publica esta página
 * aparte, no un campo más en el formulario de siempre.
 *
 * Investigado en vivo el 02/09/2026, con datos sintéticos (no un paciente
 * real), antes de escribir una sola línea de este fichero:
 *
 *  1. Misma aplicación ASP.NET que Barrett Toric, MISMO dominio
 *     (`calc.apacrs.org`) y prácticamente los mismos `id` de campo — hasta el
 *     punto de que este adaptador reutiliza los mismos nombres de selector
 *     que `barrett.ts` para todo lo que no es nuevo. La diferencia real son
 *     tres campos de más: el desplegable «History» y las dos refracciones
 *     antes/después del LASIK.
 *  2. Mismas dos tablas de resultado tras abrir la pestaña «Toric IOL»:
 *     `#MainContent_GridView1` (IOL Power | Toric Power | Refraction) y
 *     `#MainContent_GridView2` (Toric Power | IOL Cylinder | Residual
 *     Astigmatism) — comprobado con un cálculo sintético real que devolvió
 *     tres filas en cada una.
 *  3. NO tiene el paso extra de «Measured PCA» que sí tiene
 *     `AdaptadorBarrettToric(true)`: usa siempre «Predicted PCA», igual que
 *     Barrett Toric por defecto. Este programa no ofrece esa variante aquí.
 *  4. La entrada a `www.ascrs.org` (con el prefijo de idioma `/en/`) carga
 *     bien; **sin** ese prefijo la misma ruta devolvió un reto de Cloudflare
 *     («Just a moment…»), así que la URL con `/en/` no es un detalle
 *     cosmético — es la que de verdad evita el bloqueo anti-robot.
 *  5. Mismo aviso de cookies que el resto de la web de la ASCRS: se rechaza
 *     igual que en `barrett.ts`.
 *
 * `RefraccionPreLasik`/`RefraccionPostLasik` son OPCIONALES a propósito
 * (petición expresa del dueño, 02/09/2026): no todo el mundo tiene ese
 * historial a mano, así que no rellenarlos no bloquea el resto del caso —
 * simplemente no se envían, igual que cualquier otro campo opcional ausente.
 */

import type {
  EntradasCalculadora,
  OpcionLente,
  ResultadoCalculadora,
  SituacionCornealEspecial,
} from '@vilamar/domain'
import type { Frame, Page } from 'playwright'

import { capturarResultado } from '../captura.js'
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
  REFRACCION_PRE_LASIK: { selector: '#MainContent_PreLasik', decimales: 2 },
  REFRACCION_POST_LASIK: { selector: '#MainContent_PostLasik', decimales: 2 },
} as const

/** Cómo se llama, en el desplegable «History» de esta web, cada situación corneal. */
const HISTORY_EN_TRUE_K: Record<SituacionCornealEspecial, string> = {
  LASIK_MIOPE: 'Myopic Lasik',
  LASIK_HIPERMETROPE: 'Hyperopic Lasik',
  QUERATOTOMIA_RADIAL: 'Radial Keratotomy',
  QUERATOCONO: 'Keratoconus',
}

const SEL = {
  rechazarCookies: '[data-cky-tag="reject-button"]',
  capaCookies: '.cky-overlay',
  nombrePaciente: '#MainContent_PatientName',
  cirujano: '#MainContent_DoctorName',
  modeloLente: '#MainContent_IOLModel',
  constanteA: '#MainContent_Aconstant',
  factorLente: '#MainContent_LensFactor',
  ojoDerecho: '#MainContent_Rad1',
  ojoIzquierdo: '#MainContent_Rad2',
  /** «History» — la situación corneal especial de este ojo (D67). */
  historia: '#MainContent_RefractProcedure',
  calcular: '#MainContent_Button1',
  anclaFormulario: '#MainContent_AxLength',
  tablaPotencias: '#MainContent_GridView1',
  tablaToricas: '#MainContent_GridView2',
  enlaceToricIol: 'Toric IOL',
} as const

export class AdaptadorBarrettTrueKToric implements AdaptadorCalculadora {
  readonly calculadora = 'BARRETT_TRUE_K_TORIC' as const
  readonly nombre = 'Barrett True K Toric'
  readonly url = PAGINA_PADRE
  /** Igual que Barrett Toric: sin ventana, el iframe no llega a cargar. */
  readonly requiereNavegadorVisible = true

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    const problemas: string[] = []
    if (entradas.valores.CONSTANTE_A === undefined && entradas.valores.FACTOR_LENTE === undefined) {
      problemas.push('Barrett True K Toric necesita la constante A o el factor de lente.')
    }
    if (entradas.situacionCorneal === undefined) {
      // No debería llegar aquí — `prepararEntradas()` ya lo bloquea antes —
      // pero un adaptador no puede confiar solo en que otra capa lo comprobó.
      problemas.push('Falta la situación corneal especial de este ojo.')
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
        mensaje: 'Abriendo Barrett True K Toric en la web de la ASCRS…',
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
        mensaje: 'Rellenando los datos en Barrett True K Toric…',
      })
      // Segunda pasada: entre la carga de la página y la del iframe pasan
      // varios segundos, y el aviso puede haber salido en ese hueco.
      await this.rechazarCookies(pagina)
      await this.rellenar(calc, entradas)

      progreso({
        calculadora: this.calculadora,
        fase: 'CALCULANDO',
        mensaje: 'Calculando en Barrett True K Toric…',
      })
      await calc.click(SEL.calcular)
      await pagina.waitForTimeout(3000)

      const neto = await this.leerAstigmatismoNeto(calc)

      progreso({
        calculadora: this.calculadora,
        fase: 'LEYENDO_RESULTADO',
        mensaje: 'Abriendo la pestaña de resultados…',
      })
      await this.abrirPestanaResultados(calc, pagina)

      return await this.leerResultado(pagina, ctx, inicio, neto)
    } catch (error) {
      return await this.aFallo(pagina, ctx, error, inicio)
    } finally {
      await pagina.close().catch(() => undefined)
    }
  }

  /** Mismo aviso de cookies que el resto de la web de la ASCRS. Ver `barrett.ts`. */
  private async rechazarCookies(pagina: Page): Promise<void> {
    const boton = pagina.locator(SEL.rechazarCookies).first()
    const capa = pagina.locator(SEL.capaCookies).first()

    try {
      await boton.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      return // No hay aviso de cookies en esta visita.
    }

    const limite = Date.now() + 20_000
    while (Date.now() < limite) {
      await boton.click({ timeout: 5000 }).catch(() => undefined)
      await pagina.waitForTimeout(800)
      const sigueTapando = await capa.isVisible().catch(() => false)
      if (!sigueTapando) return
    }
  }

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
        'BARRETT TRUE K TORIC REQUIERE TU INTERVENCIÓN. Mira el navegador que se ha abierto: puede estar pidiendo una comprobación de seguridad. Complétala y Calculator Vilamar seguirá solo.',
    })

    const conAyuda = await esperarAlUsuario(pagina, async () => (await buscar()) !== null, {
      limiteMs: 180_000,
      cancelado: ctx.cancelado,
    })
    calc = conAyuda ? await buscar() : null
    if (calc) return calc

    throw new ErrorAdaptador(
      'NEEDS_USER_ACTION',
      'La calculadora de Barrett True K Toric no llegó a cargar. Suele ser una comprobación de seguridad de su web. Puedes reintentar solo esta sin perder el resto.',
      'ESPERANDO_AL_USUARIO',
      SEL.anclaFormulario,
    )
  }

  private async rellenar(calc: Frame, entradas: EntradasCalculadora): Promise<void> {
    await calc.check(entradas.ojo === 'OD' ? SEL.ojoDerecho : SEL.ojoIzquierdo)

    if (entradas.modeloLente) {
      await this.elegirModelo(calc, entradas.modeloLente)
    }

    await calc.fill(SEL.nombrePaciente, entradas.nombrePaciente ?? entradas.codigoCaso)
    if (entradas.nombreCirujano) {
      await calc.fill(SEL.cirujano, entradas.nombreCirujano).catch(() => undefined)
    }

    if (entradas.valores.CONSTANTE_A !== undefined) {
      await calc.fill(SEL.constanteA, entradas.valores.CONSTANTE_A.toFixed(2))
    }
    if (entradas.valores.FACTOR_LENTE !== undefined) {
      await calc.fill(SEL.factorLente, entradas.valores.FACTOR_LENTE.toFixed(2))
    }

    // La situación corneal, comprobada por `prepararEntradas()` — este
    // adaptador solo se ejecuta cuando ya viene puesta.
    if (entradas.situacionCorneal !== undefined) {
      await calc.selectOption(SEL.historia, { label: HISTORY_EN_TRUE_K[entradas.situacionCorneal] })
    }

    for (const [campo, config] of Object.entries(CAMPOS)) {
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      if (valor === undefined) continue // ausente no se rellena
      await calc.fill(config.selector, valor.toFixed(config.decimales)).catch(() => undefined)
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

  /** «Net Astigmatism», igual que en Barrett Toric. Ver `barrett.ts`. */
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

  private async abrirPestanaResultados(calc: Frame, pagina: Page): Promise<void> {
    try {
      await calc.getByRole('link', { name: SEL.enlaceToricIol }).first().click({ timeout: 15_000 })
      await pagina.waitForTimeout(4000)
    } catch (error) {
      throw new ErrorAdaptador(
        'ADAPTER_BROKEN',
        'No se ha encontrado la pestaña de resultados de Barrett True K Toric. Puede que la web haya cambiado.',
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
        'Se ha perdido la calculadora de Barrett True K Toric al cambiar de pestaña.',
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
        'Barrett True K Toric no ha devuelto resultados. Comprueba que los datos son correctos y reinténtalo.',
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
        eje: toricaDeEsta.ejeResidual,
      }
    })

    const recomendada: OpcionLente | undefined = opciones[indiceDestacada]

    const entradasSegunLaWeb: Record<string, string> = {}
    if (neto) entradasSegunLaWeb['Astigmatismo neto'] = `${neto.magnitud} D @ ${neto.eje}°`
    if (ctx.entradas.situacionCorneal) {
      entradasSegunLaWeb['Córnea especial'] = HISTORY_EN_TRUE_K[ctx.entradas.situacionCorneal]
    }

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
        : 'Barrett True K Toric ha calculado, pero no se ha podido leer la opción destacada.',
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
        : 'Barrett True K Toric no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentar solo esta.',
      diagnosticoId,
    }
  }
}
