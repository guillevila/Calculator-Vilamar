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
 *  - Exige un nombre de paciente. Se le manda el CÓDIGO LOCAL del caso.
 *    El identificador de paciente y el cirujano se quedan VACÍOS.
 *  - Elegir el modelo de lente RELLENA SOLA la constante A — comprobado en
 *    vivo, «B&L Envy» pone 119.24 sin que se le mande nada. Si EVO reconoce
 *    el modelo, esa es SU constante y no se pisa con la del caso: es mejor
 *    que cualquier número que pudiéramos darle nosotros. Solo se manda la
 *    constante del caso cuando el modelo no está en su lista. Al terminar se
 *    lee lo que la web dice haber usado, sea cual sea el camino.
 *  - Tras calcular, la web repite las entradas en pantalla (`#Labelpara1` y
 *    `#Labelpara2`). Se leen y se guardan: es lo que hace auditable el informe,
 *    porque se apunta lo que ella dice haber recibido, no lo que creemos
 *    haberle mandado.
 */

import type { EntradasCalculadora, OpcionLente, ResultadoCalculadora } from '@vilamar/domain'
import type { Page } from 'playwright'

import type { AdaptadorCalculadora, ContextoEjecucion } from '../contrato.js'
import { ErrorAdaptador } from '../contrato.js'
import { leerNumeroDeTexto } from '../normalizar.js'

const URL = 'https://www.evoiolcalculator.com/toric.aspx'

/** Cada campo del modelo, dónde va en esta web y con cuántos decimales. */
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
  PK1: { selector: '#txtPK1', decimales: 2 },
  PK1_EJE: { selector: '#TxtPK1axis', decimales: 0 },
  PK2: { selector: '#txtPK2', decimales: 2 },
  PK2_EJE: { selector: '#TxtPK2axis', decimales: 0 },
} as const

const SEL = {
  nombre: '#TextBoxName',
  ojoDerecho: '#RadioButtonRLEye_0',
  ojoIzquierdo: '#RadioButtonRLEye_1',
  modeloTorico: '#DropDownToric',
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
    // EVO exige un nombre. Se le da el código local del caso, que es un
    // identificador de este programa y no un dato del paciente.
    await pagina.fill(SEL.nombre, entradas.codigoCaso)

    await pagina.check(entradas.ojo === 'OD' ? SEL.ojoDerecho : SEL.ojoIzquierdo)

    // El modelo va ANTES que la constante A. Si EVO reconoce el modelo,
    // RELLENA SOLA su propia constante para esa lente — comprobado en vivo:
    // «B&L Envy» pone 119.24 sin que se le mande nada. Esa constante es la
    // que EVO publica para su fórmula, y es mejor que cualquier número que
    // pudiéramos mandarle nosotros, así que si el modelo se ha encontrado NO
    // se pisa: se deja que sea EVO quien decida. Solo se manda la constante
    // del caso cuando EVO no tiene esa lente en su lista, que es la única
    // situación en la que no tiene ninguna propia que ofrecer.
    let modeloEncontrado = false
    if (entradas.modeloLente) {
      modeloEncontrado = await this.elegirModelo(pagina, entradas.modeloLente)
      // No encontrarlo no es motivo para abortar: EVO calcula igual con la
      // constante A que se le mande a continuación. Queda dicho en el resultado.
    }

    for (const [campo, config] of Object.entries(CAMPOS)) {
      if (campo === 'CONSTANTE_A' && modeloEncontrado) continue
      const valor = entradas.valores[campo as keyof typeof entradas.valores]
      // Un campo que no está NO se rellena. No se manda un 0 en su lugar.
      if (valor === undefined) continue
      await pagina.fill(config.selector, valor.toFixed(config.decimales))
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

    // Lo que la web dice haber usado. Es la parte auditable del informe.
    const entradasSegunLaWeb: Record<string, string> = {}
    const eco1 = await texto(SEL.ecoEntradas1)
    const eco2 = await texto(SEL.ecoEntradas2)
    if (eco1) entradasSegunLaWeb['Parámetros'] = eco1
    if (eco2) entradasSegunLaWeb['Biometría'] = eco2
    if (ojoSegunLaWeb) entradasSegunLaWeb['Ojo'] = ojoSegunLaWeb

    const completo = esfera !== undefined && eje !== undefined

    return {
      calculadora: this.calculadora,
      ojo: ctx.entradas.ojo,
      estado: completo ? 'SUCCESS' : 'PARTIAL',
      obtenidoEn: ctx.ahora(),
      duracionMs: Date.now() - inicio,
      opciones: [recomendada, ...alternativas],
      recomendada,
      entradasSegunLaWeb,
      mensaje: completo
        ? undefined
        : 'EVO ha calculado, pero no se han podido leer todos los campos del resultado.',
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
