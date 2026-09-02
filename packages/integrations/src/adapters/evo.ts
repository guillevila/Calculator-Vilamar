/**
 * evo.ts — Adaptador de EVO Toric.
 *
 *   https://www.evoiolcalculator.com/toric.aspx
 *
 * Cómo es esta web (comprobado abriéndola y rellenándola con el fixture
 * sintético, no de memoria):
 *
 *  - Es un formulario ASP.NET clásico. Calcular es un envío del formulario que
 *    recarga la página entera; el resultado sale en la misma página.
 *  - Los campos tienen identificadores estables y descriptivos (`#txtAL`,
 *    `#txtK1`…). No hay iframes, ni login, ni comprobación anti-robot.
 *  - Exige un nombre de paciente. Desde D44 (27/08/2026) se le manda el
 *    nombre real del paciente, si el caso lo tiene — antes se mandaba el
 *    código local, que ahora va al «Patient Identifier» en su lugar. El
 *    cirujano, si el caso lo tiene, también se rellena (D41).
 *  - Elegir el modelo de lente sobrescribe la constante A con la suya propia.
 *    Si el modelo del caso está en la lista de EVO, se elige y esa constante
 *    se deja tal cual — no se pisa con la escrita a mano (26/08/2026). Si no
 *    está en la lista, se manda la constante A del caso, como siempre. Al
 *    terminar se lee lo que la web dice haber usado, esté o no de acuerdo con
 *    lo que se le mandó.
 *  - Tras calcular, la web repite las entradas en pantalla (`#Labelpara1` y
 *    `#Labelpara2`). Se leen y se guardan: es lo que hace auditable el informe,
 *    porque se apunta lo que ella dice haber recibido, no lo que creemos
 *    haberle mandado.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Page } from 'playwright'

import { capturarResultado } from '../captura.js'
import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador } from '../contrato.js'
import { leerNumeroDeTexto } from '../normalizar.js'

const URL = 'https://www.evoiolcalculator.com/toric.aspx'

/**
 * Cada campo del modelo, dónde va en esta web y con cuántos decimales.
 *
 * `magnitud`: la córnea posterior se guarda en el dominio con el signo tal
 * cual la imprime el aparato —negativo, por convenio clínico habitual—, pero
 * el campo de EVO exige el MÓDULO: comprobado con una captura de diagnóstico
 * real (25/08/2026), donde -6.00 disparaba «Range 3 to 9 D» en rojo y el
 * cálculo se quedaba bloqueado sin ningún error explícito. El signo no se
 * pierde en ningún sitio del programa: solo se le manda a EVO como ella lo
 * pide, aquí y solo aquí.
 *
 * Además, EVO exige que PK1 sea menor que PK2 en módulo —comprobado con un
 * caso real (26/08/2026) que no devolvía nada con PK1 6.00 / PK2 5.90, y
 * funcionaba con esos mismos dos números intercambiados—, aunque su propio
 * aviso en pantalla («* PK1 > PK2») diga justo lo contrario: es engañoso, no
 * se ha supuesto, se ha aislado probando las cuatro combinaciones. Como el
 * dominio no garantiza que PK1 sea siempre el meridiano más plano, `rellenar()`
 * intercambia valor y eje de PK1/PK2 SOLO al mandárselos a EVO, si hiciera
 * falta — el caso conserva sus propios PK1/PK2 sin tocar.
 */
const CAMPOS = {
  AL: { selector: '#txtAL', decimales: 2 },
  K1: { selector: '#txtK1', decimales: 2 },
  K1_EJE: { selector: '#TxtK1Axis', decimales: 0 },
  K2: { selector: '#txtK2', decimales: 2 },
  K2_EJE: { selector: '#TxtK2Axis', decimales: 0 },
  ACD: { selector: '#txtACD', decimales: 2 },
  LT: { selector: '#txtLT', decimales: 2 },
  CCT: { selector: '#txtCCT', decimales: 0 },
  REFRACCION_OBJETIVO: { selector: '#txtRefraction', decimales: 2 },
  CONSTANTE_A: { selector: '#txtAConstant', decimales: 2 },
  SIA: { selector: '#TxtSIA', decimales: 2 },
  EJE_INCISION: { selector: '#TxtSIAaxis', decimales: 0 },
  PK1: { selector: '#txtPK1', decimales: 2, magnitud: true },
  PK1_EJE: { selector: '#TxtPK1axis', decimales: 0 },
  PK2: { selector: '#txtPK2', decimales: 2, magnitud: true },
  PK2_EJE: { selector: '#TxtPK2axis', decimales: 0 },
} as const

const SEL = {
  nombre: '#TextBoxName',
  /** «Patient Identifier». Antes se dejaba vacío; desde D44 lleva el código local. */
  identificador: '#TextBoxID',
  /** «Surgeon». Comprobado con `pnpm reconocer evo` el 25/08/2026. Ver D41. */
  cirujano: '#TextBoxSurgeon',
  ojoDerecho: '#RadioButtonRLEye_0',
  ojoIzquierdo: '#RadioButtonRLEye_1',
  modeloTorico: '#DropDownToric',
  /**
   * «Biometer» — con qué aparato se midió la córnea posterior. Siempre
   * visible en el formulario, no depende de rellenar PK1/PK2 (comprobado en
   * vivo el 01/09/2026). Por defecto está en «IOLMaster 700»; si el aparato
   * real es otro y este programa sabe cuál es su nombre exacto aquí
   * (`dispositivoCaraPosterior`, ver `preparar-entradas.ts`), se cambia.
   */
  dispositivoPosterior: '#DropDownListPK',
  calcular: '#btnCalculate',
  // Resultado
  recomendadaEsfera: '#LabelRecIOL',
  recomendadaTorico: '#LabelRecToric',
  recomendadaDesignacion: '#LblRecT',
  recomendadaEje: '#LabelRecAxis',
  previstaRefraccion: '#LabelPredRef',
  previstaCilindro: '#LabelPredCyl',
  previstaEje: '#LabelPredAxis',
  previstaDesenfoque: '#LabelPredDE',
  ecoEntradas1: '#Labelpara1',
  ecoEntradas2: '#Labelpara2',
  ecoOjo: '#LabelODOS',
  /**
   * EVO enseña el astigmatismo residual en cilindro NEGATIVO por defecto,
   * mientras que Kane y Barrett lo dan en positivo — y con el signo cambia
   * también el eje (transposición óptica: mismo astigmatismo, notación
   * distinta). Comprobado el 26/08/2026: el mismo resultado, con «−ve cyl»
   * marca eje 176° donde con «+ve cyl» marca eje 86°. Se pulsa este botón
   * ANTES de leer nada de cilindro o eje, para que el eje curvo (calculado a
   * partir de K1/K2, que no tiene noción de signo de cilindro) se compare
   * siempre con la misma notación que usan las otras dos calculadoras.
   */
  cilPositivo: '#RadioBtnCyl_1',
} as const

export class AdaptadorEvoToric implements AdaptadorCalculadora {
  readonly calculadora = 'EVO_TORIC' as const
  readonly nombre = 'EVO Toric'
  readonly url = URL
  /** EVO funciona sin ventana. Se deja visible por decisión de producto, no por necesidad. */
  readonly requiereNavegadorVisible = false

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    const problemas: string[] = []
    if (entradas.valores.AL === undefined) problemas.push('Falta la longitud axial.')
    if (entradas.valores.K1 === undefined || entradas.valores.K2 === undefined) {
      problemas.push('Faltan las queratometrías.')
    }
    if (entradas.valores.CONSTANTE_A === undefined) problemas.push('Falta la constante A.')
    return problemas
  }

  async ejecutar(ctx: ContextoEjecucion): Promise<ResultadoCalculadora> {
    const inicio = Date.now()
    const { entradas, progreso } = ctx
    const pagina = await ctx.contexto.newPage()

    try {
      progreso({ calculadora: this.calculadora, fase: 'NAVEGANDO', mensaje: 'Abriendo EVO Toric…' })
      await pagina.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })

      // Si el formulario no está, la web ha cambiado: es reparable, no un fallo del usuario.
      const hayFormulario = (await pagina.locator(SEL.calcular).count()) > 0
      if (!hayFormulario) {
        throw new ErrorAdaptador(
          'ADAPTER_BROKEN',
          'EVO no ha mostrado su formulario. Puede que la página haya cambiado.',
          'NAVEGANDO',
          SEL.calcular,
        )
      }

      progreso({
        calculadora: this.calculadora,
        fase: 'RELLENANDO',
        mensaje: 'Rellenando los datos en EVO…',
      })
      await this.rellenar(pagina, entradas)

      progreso({ calculadora: this.calculadora, fase: 'CALCULANDO', mensaje: 'Calculando en EVO…' })
      await pagina.click(SEL.calcular)
      // El envío recarga la página. Se espera al resultado, no a un tiempo fijo.
      await pagina
        .locator(SEL.recomendadaEsfera)
        .waitFor({ state: 'attached', timeout: 45_000 })
        .catch(() => {
          throw new ErrorAdaptador(
            'EXTERNAL_ERROR',
            'EVO no ha devuelto ningún resultado. Puede que falte algún dato o que la web no haya respondido.',
            'CALCULANDO',
            SEL.recomendadaEsfera,
          )
        })

      progreso({
        calculadora: this.calculadora,
        fase: 'LEYENDO_RESULTADO',
        mensaje: 'Leyendo el resultado de EVO…',
      })
      return await this.leerResultado(pagina, ctx, inicio)
    } catch (error) {
      return await this.aFallo(pagina, ctx, error, inicio)
    } finally {
      await pagina.close().catch(() => undefined)
    }
  }

  private async rellenar(pagina: Page, entradas: EntradasCalculadora): Promise<void> {
    // EVO exige un nombre. Desde D44 (27/08/2026), si el caso tiene el
    // nombre del paciente, es ese el que se manda; si no, el código local,
    // como siempre. El código local va también al «Patient Identifier»
    // —antes vacío a propósito— para no perder la referencia interna.
    await pagina.fill(SEL.nombre, entradas.nombrePaciente ?? entradas.codigoCaso)
    await pagina.fill(SEL.identificador, entradas.codigoCaso).catch(() => undefined)

    // El cirujano, si el caso lo tiene (D41). Que el campo no exista o no
    // admita el valor no puede tirar el cálculo.
    if (entradas.nombreCirujano) {
      await pagina.fill(SEL.cirujano, entradas.nombreCirujano).catch(() => undefined)
    }

    await pagina.check(entradas.ojo === 'OD' ? SEL.ojoDerecho : SEL.ojoIzquierdo)

    // El modelo va ANTES que la constante A: elegirlo la sobrescribe con la
    // suya propia, y si lo encuentra esa es la que se deja — no se pisa con
    // la escrita a mano (26/08/2026, petición expresa).
    const modeloEncontrado = entradas.modeloLente
      ? await this.elegirModelo(pagina, entradas.modeloLente)
      : false

    // EVO exige PK1 < PK2 en módulo para devolver resultado —comprobado con un
    // caso real (26/08/2026) que se quedaba sin calcular con PK1 6.00 y PK2
    // 5.90, y funcionaba con esos mismos números al revés—. El dominio no
    // garantiza que PK1 sea siempre el meridiano más plano: aquí, y solo aquí,
    // se intercambian valor y eje si hiciera falta para cumplir lo que EVO
    // pide. El caso conserva sus PK1/PK2 tal cual los tiene.
    const valoresParaEvo = { ...entradas.valores }
    const { PK1, PK2, PK1_EJE, PK2_EJE } = entradas.valores
    if (PK1 !== undefined && PK2 !== undefined && Math.abs(PK1) > Math.abs(PK2)) {
      valoresParaEvo.PK1 = PK2
      valoresParaEvo.PK2 = PK1
      valoresParaEvo.PK1_EJE = PK2_EJE
      valoresParaEvo.PK2_EJE = PK1_EJE
    }

    for (const [campo, config] of Object.entries(CAMPOS)) {
      if (campo === 'CONSTANTE_A' && modeloEncontrado) continue
      const valor = valoresParaEvo[campo as keyof typeof valoresParaEvo]
      // Un campo que no está NO se rellena. No se manda un 0 en su lugar.
      if (valor === undefined) continue
      const paraEvo = 'magnitud' in config && config.magnitud ? Math.abs(valor) : valor
      await pagina.fill(config.selector, paraEvo.toFixed(config.decimales))
    }

    if (entradas.dispositivoCaraPosterior !== undefined) {
      await pagina.selectOption(SEL.dispositivoPosterior, { label: entradas.dispositivoCaraPosterior })
    }
  }

  /** Elige el modelo si esta web lo tiene en su lista. Devuelve si lo encontró. */
  private async elegirModelo(pagina: Page, modelo: string): Promise<boolean> {
    try {
      const opciones = await pagina.locator(`${SEL.modeloTorico} option`).allTextContents()
      const encontrado = opciones.find(
        (o) => o.trim().toLowerCase() === modelo.trim().toLowerCase(),
      )
      if (!encontrado) return false
      await pagina.selectOption(SEL.modeloTorico, { label: encontrado })
      return true
    } catch {
      return false
    }
  }

  private async leerResultado(
    pagina: Page,
    ctx: ContextoEjecucion,
    inicio: number,
  ): Promise<ResultadoCalculadora> {
    const texto = async (selector: string): Promise<string | undefined> => {
      const loc = pagina.locator(selector)
      if ((await loc.count()) === 0) return undefined
      const t = (await loc.first().textContent()) ?? ''
      return t.trim() === '' ? undefined : t.trim()
    }

    // Cilindro positivo ANTES de leer nada de cilindro o eje (ver SEL.cilPositivo).
    // Solo si hay tabla tórica: un resultado no tórico no tiene este interruptor.
    const primerResidual = '#LblResiCyl1'
    if ((await pagina.locator(primerResidual).count()) > 0) {
      const antes = await texto(primerResidual)
      await pagina.check(SEL.cilPositivo).catch(() => undefined)
      await pagina
        .waitForFunction(
          ([selector, valorAntes]) =>
            document.querySelector(selector as string)?.textContent?.trim() !== valorAntes,
          [primerResidual, antes] as const,
          { timeout: 5000 },
        )
        .catch(() => undefined)
    }

    // Comprobación de seguridad: que la web confirme el ojo que le pedimos.
    // Si dijera otro, el resultado sería del ojo equivocado y parecería válido.
    const ojoSegunLaWeb = await texto(SEL.ecoOjo)
    if (ojoSegunLaWeb && !ojoSegunLaWeb.toUpperCase().includes(ctx.entradas.ojo)) {
      throw new ErrorAdaptador(
        'EXTERNAL_ERROR',
        `EVO ha devuelto el resultado de ${ojoSegunLaWeb} y se le pidió ${ctx.entradas.ojo}. No se usa este resultado.`,
        'LEYENDO_RESULTADO',
        SEL.ecoOjo,
      )
    }

    const esfera = leerNumeroDeTexto(await texto(SEL.recomendadaEsfera))
    const cilindro = leerNumeroDeTexto(await texto(SEL.recomendadaTorico))
    const eje = leerNumeroDeTexto(await texto(SEL.recomendadaEje))
    const designacion = (await texto(SEL.recomendadaDesignacion))?.replace(/[()]/g, '')
    const refraccionPrevista = leerNumeroDeTexto(await texto(SEL.previstaRefraccion))
    const cilindroResidual = leerNumeroDeTexto(await texto(SEL.previstaCilindro))
    const ejeResidual = leerNumeroDeTexto(await texto(SEL.previstaEje))
    const equivalenteDesenfoque = leerNumeroDeTexto(await texto(SEL.previstaDesenfoque))

    const recomendada: OpcionLente = {
      esfera,
      cilindro,
      eje,
      designacion,
      refraccionPrevista,
      cilindroResidual,
      ejeResidual,
      equivalenteDesenfoque,
      recomendada: true,
    }

    // La escalera de potencias que EVO enseña alrededor de la recomendada.
    const alternativas: OpcionLente[] = []
    for (let i = 1; i <= 5; i++) {
      const p = leerNumeroDeTexto(await texto(`#lblResult_IOL${i}`))
      const r = leerNumeroDeTexto(await texto(`#lblResult_Refraction${i}`))
      if (p === undefined) continue
      alternativas.push({ esfera: p, refraccionPrevista: r, recomendada: false })
    }

    // La escalera TÓRICA que EVO enseña alrededor de la recomendada — antes
    // solo se leía la fila que EVO destacaba (arriba, `recomendada`), y el
    // criterio propio (D43) no podía comparar de verdad entre alternativas
    // porque solo tenía una encima de la mesa. IDs comprobados contra la web
    // real el 26/08/2026: `LblToric{i}` (cilindro), `LblToricAxis{i}` (eje
    // residual), `LblResiCyl{i}` (astigmatismo residual).
    const toricas: OpcionLente[] = []
    for (let i = 1; i <= 5; i++) {
      const c = leerNumeroDeTexto(await texto(`#LblToric${i}`))
      if (c === undefined) continue
      toricas.push({
        esfera,
        cilindro: c,
        refraccionPrevista: leerNumeroDeTexto(await texto(`#LblToricRef${i}`)),
        cilindroResidual: leerNumeroDeTexto(await texto(`#LblResiCyl${i}`)),
        ejeResidual: leerNumeroDeTexto(await texto(`#LblToricAxis${i}`)),
        recomendada: false,
      })
    }

    // Lo que la web dice haber usado. Es la parte auditable del informe.
    const entradasSegunLaWeb: Record<string, string> = {}
    const eco1 = await texto(SEL.ecoEntradas1)
    const eco2 = await texto(SEL.ecoEntradas2)
    if (eco1) entradasSegunLaWeb['Parámetros'] = eco1
    if (eco2) entradasSegunLaWeb['Biometría'] = eco2
    if (ojoSegunLaWeb) entradasSegunLaWeb['Ojo'] = ojoSegunLaWeb

    const completo = esfera !== undefined && eje !== undefined

    // La captura se toma aquí, con el resultado ya en pantalla y comprobado el
    // ojo: es la evidencia sin interpretar de lo que ha devuelto la web.
    const capturaId = await capturarResultado(pagina, ctx, this.calculadora)

    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      estado: completo ? 'SUCCESS' : 'PARTIAL',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones: [recomendada, ...alternativas, ...toricas],
      recomendada,
      entradasSegunLaWeb,
      mensaje: completo
        ? undefined
        : 'EVO ha calculado, pero no se han podido leer todos los campos del resultado.',
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
    const fase = esAdaptador ? error.fase : 'CALCULANDO'
    const captura = await pagina.screenshot({ fullPage: true }).catch(() => undefined)

    const diagnosticoId = await ctx.guardarDiagnostico({
      calculadora: this.calculadora,
      fase,
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
        : 'EVO no ha respondido como se esperaba. Tus datos no se han perdido: puedes reintentarlo.',
      diagnosticoId,
    }
  }
}
