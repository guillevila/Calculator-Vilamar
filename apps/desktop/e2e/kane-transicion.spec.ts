/**
 * kane-transicion.spec.ts — La transición de Kane tras la aceptación humana.
 *
 * Kane no enseña su calculadora hasta que una persona pulsa «I Agree». Ese clic
 * **no se automatiza aquí ni en ningún sitio**: es un contrato legal entre el
 * autor de la fórmula y quien la usa, y tampoco se toca el reCAPTCHA.
 *
 * Estas pruebas no van a iolformula.com. Levantan un **servidor local** que imita
 * sus tres pantallas —la puerta, el hueco de la navegación y la calculadora— con
 * cookies y redirección de verdad, y comprueban que el programa sabe
 * distinguirlas.
 *
 * ## Qué fallo fijan
 *
 * El programa esperaba a que DESAPARECIERA la pantalla de condiciones —la
 * negación— y luego dormía 2,5 segundos. La negación se cumple en el instante en
 * que la URL deja de ser `/agreement/`, o sea **en medio de la navegación**,
 * cuando la página puede estar en blanco. Si el formulario tardaba más de esos
 * 2,5 segundos, el adaptador no encontraba campos y concluía «el conector está
 * roto, ejecuta pnpm reconocer:kane».
 *
 * O sea: **la persona aceptaba bien y el programa le decía que el conector estaba
 * mal.**
 *
 * Va en el proyecto de interfaz y no en los tests unitarios porque necesita un
 * Chromium de verdad, y este es el único trabajo del control que lo instala.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect, test } from '@playwright/test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import { calculadoraDeKaneLista, enLaPuertaDeKane } from '@vilamar/integrations'

let navegador: Browser
let servidor: Server
let base: string

/**
 * La pantalla de condiciones, como es la de verdad.
 *
 * Comprobado el 12/08/2026 abriéndola sin aceptar nada: **cero campos de
 * formulario**, el texto «Terms of Use», el aviso de reCAPTCHA y «I Agree».
 */
const CONDICIONES = `<!doctype html><title>Terms of Use – Kane Formula</title><body>
  <h1>Terms of Use</h1>
  <p>This agreement, between the author and the user, gives the user a licence…</p>
  <p>This site is protected by reCAPTCHA and the Google Privacy Policy apply.</p>
  <a href="/aceptar" id="acepto">I Agree</a>
</body>`

/** La calculadora: campos editables y un control de calcular. */
const CALCULADORA = `<!doctype html><title>Kane Formula</title><body>
  <h1>IOL Calculation</h1>
  <label for="al">Axial Length</label><input id="al">
  <label for="k1">K1</label><input id="k1">
  <label for="k2">K2</label><input id="k2">
  <label for="acd">ACD</label><input id="acd">
  <label for="a">A Constant</label><input id="a">
  <button id="calc">Calculate</button>
</body>`

/** La calculadora pintada pero SIN poder escribir: una capa de carga encima. */
const BLOQUEADA = CALCULADORA.replace(/<input id="(\w+)">/g, '<input id="$1" disabled>')

/**
 * La calculadora que tarda: llega vacía y se rellena 1,5 s después.
 *
 * Es exactamente el hueco donde el programa se adelantaba.
 */
const CON_RETRASO = `<!doctype html><title>Kane Formula</title><body>
  <div id="destino"></div>
  <script>
    setTimeout(function () {
      document.getElementById('destino').innerHTML =
        '<label for="al">Axial Length</label><input id="al">' +
        '<label for="k1">K1</label><input id="k1">' +
        '<label for="k2">K2</label><input id="k2">' +
        '<label for="acd">ACD</label><input id="acd">' +
        '<button id="calc">Calculate</button>'
    }, 1500)
  </script>
</body>`

test.beforeAll(async () => {
  navegador = await chromium.launch()

  // Imita a Kane: `/agreement/` enseña las condiciones y, si la cookie de
  // aceptación está en ESTE navegador, REDIRIGE a la calculadora. Es lo que hace
  // la web de verdad, y es la razón de que la dirección sea la señal principal.
  servidor = createServer((peticion, respuesta) => {
    const ruta = (peticion.url ?? '/').split('?')[0] ?? '/'
    const aceptado = (peticion.headers.cookie ?? '').includes('acepto=si')

    if (ruta === '/aceptar') {
      // La «persona» pulsa I Agree. Este camino lo recorre el test, nunca el
      // programa: aquí se simula lo que hace la web al recibir ese clic.
      respuesta.writeHead(302, {
        'set-cookie': 'acepto=si; Path=/',
        location: '/calculadora',
      })
      respuesta.end()
      return
    }
    if (ruta === '/agreement/con-campos') {
      // Una página que PARECE la calculadora pero vive en la ruta del acuerdo.
      // Sirve para comprobar que la dirección manda sobre la forma.
      respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      respuesta.end(CALCULADORA)
      return
    }
    if (ruta.startsWith('/agreement')) {
      if (aceptado) {
        respuesta.writeHead(302, { location: '/calculadora' })
        respuesta.end()
        return
      }
      respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      respuesta.end(CONDICIONES)
      return
    }
    const cuerpo = ruta === '/lenta' ? CON_RETRASO : ruta === '/bloqueada' ? BLOQUEADA : CALCULADORA
    respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    respuesta.end(cuerpo)
  })

  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await navegador?.close().catch(() => undefined)
  await new Promise<void>((hecho) => servidor.close(() => hecho()))
})

async function abrir(ctx: BrowserContext, ruta: string): Promise<Page> {
  const pagina = await ctx.newPage()
  await pagina.goto(`${base}${ruta}`)
  return pagina
}

test('la pantalla de condiciones se reconoce como la puerta', async () => {
  const ctx = await navegador.newContext()
  const pagina = await abrir(ctx, '/agreement/')

  expect(await enLaPuertaDeKane(pagina)).toBe(true)
  // Y lo importante: NO se toma por la calculadora.
  expect(await calculadoraDeKaneLista(pagina)).toBe(false)
  await ctx.close()
})

test('una página en blanco tras salir del acuerdo NO se toma por la calculadora', async () => {
  // Es el fallo exacto que había: la negación de «estoy en la puerta» se cumple
  // aquí, y con la lógica vieja el programa habría seguido sin encontrar campos.
  const ctx = await navegador.newContext()
  const pagina = await ctx.newPage()
  await pagina.setContent('<!doctype html><title>…</title><body></body>')

  expect(await enLaPuertaDeKane(pagina)).toBe(false)
  expect(await calculadoraDeKaneLista(pagina)).toBe(false)
  await ctx.close()
})

test('la calculadora de verdad se reconoce', async () => {
  const ctx = await navegador.newContext()
  const pagina = await abrir(ctx, '/calculadora')

  expect(await enLaPuertaDeKane(pagina)).toBe(false)
  expect(await calculadoraDeKaneLista(pagina)).toBe(true)
  await ctx.close()
})

test('un formulario pintado pero que no admite escritura NO se da por listo', async () => {
  // Si se diera por listo, se rellenarían cero campos y el adaptador diría que el
  // conector está roto cuando lo único que pasaba es que aún no se podía escribir.
  const ctx = await navegador.newContext()
  const pagina = await abrir(ctx, '/bloqueada')

  expect(await calculadoraDeKaneLista(pagina)).toBe(false)
  await ctx.close()
})

test('estar en la ruta del acuerdo manda, aunque la página tenga campos', async () => {
  // La dirección es la señal PRINCIPAL a propósito, y esta es la prueba que lo
  // fija. Si mañana la pantalla de condiciones ganara un campo de texto y algo
  // que dijera «calculate», la comprobación estructural sola daría un falso sí.
  const ctx = await navegador.newContext()
  const pagina = await abrir(ctx, '/agreement/con-campos')

  expect(await enLaPuertaDeKane(pagina)).toBe(true)
  expect(await calculadoraDeKaneLista(pagina)).toBe(false)
  await ctx.close()
})

test('la transición completa: se espera a la señal real y se sigue en LA MISMA página', async () => {
  const ctx = await navegador.newContext()
  const pagina = await abrir(ctx, '/agreement/')
  expect(await enLaPuertaDeKane(pagina)).toBe(true)

  const identidad = pagina

  // La «persona» pulsa I Agree. Este clic lo da el TEST. El programa nunca lo da.
  await pagina.click('#acepto')
  // El servidor redirige a una calculadora que tarda en pintarse.
  await pagina.goto(`${base}/lenta`)

  // Justo después de navegar ya NO estamos en la puerta… y la calculadora
  // todavía no está lista. Con la lógica vieja, aquí se habría seguido.
  expect(await enLaPuertaDeKane(pagina)).toBe(false)
  expect(await calculadoraDeKaneLista(pagina)).toBe(false)

  // Se espera a la señal real, sin relojes.
  await expect.poll(async () => calculadoraDeKaneLista(pagina), { timeout: 15_000 }).toBe(true)

  // Y seguimos en la misma página y el mismo contexto: ni recarga, ni pestaña
  // nueva. Si se recargara, se perdería lo que la persona acaba de aceptar.
  expect(pagina).toBe(identidad)
  expect(pagina.isClosed()).toBe(false)
  expect(pagina.context()).toBe(ctx)
  await ctx.close()
})

test('aceptar en OTRO navegador no cuenta: son cookies distintas', async () => {
  // La confusión que hay que evitar. Si alguien acepta en su Chrome de siempre,
  // el navegador que abre Calculator Vilamar sigue viendo la puerta, porque es
  // otro almacén de cookies.
  const chromeDeFuera = await navegador.newContext()
  const elDeVilamar = await navegador.newContext()

  // Se acepta SOLO en el navegador de fuera, recorriendo su camino de verdad.
  const fuera = await abrir(chromeDeFuera, '/agreement/')
  await fuera.click('#acepto')
  await fuera.waitForURL(/calculadora/)
  expect(await calculadoraDeKaneLista(fuera)).toBe(true)

  // Y el de Calculator Vilamar sigue en la puerta.
  const dentro = await abrir(elDeVilamar, '/agreement/')
  expect(await enLaPuertaDeKane(dentro)).toBe(true)
  expect(await dentro.locator('#acepto').count()).toBe(1)

  await chromeDeFuera.close()
  await elDeVilamar.close()
})

test('la aceptación SÍ se recuerda dentro del mismo perfil', async () => {
  // La otra cara: en el mismo contexto —que es el perfil persistente de la
  // aplicación— la aceptación vale para el siguiente cálculo y no hay que
  // repetirla.
  //
  // Antes esto era imposible por otro motivo: el orquestador pedía un contexto
  // NUEVO al navegador y ese no hereda el perfil. Medido: 1 cookie en el
  // persistente, 0 en el nuevo.
  const perfil = await navegador.newContext()

  const primera = await abrir(perfil, '/agreement/')
  expect(await enLaPuertaDeKane(primera)).toBe(true)

  // La «persona» acepta: la web deja su cookie en ESTE perfil.
  await primera.click('#acepto')
  await primera.waitForURL(/calculadora/)
  await primera.close()

  // Segundo cálculo, mismo perfil: la puerta ya no aparece.
  const segunda = await abrir(perfil, '/agreement/')
  expect(await enLaPuertaDeKane(segunda)).toBe(false)
  expect(await calculadoraDeKaneLista(segunda)).toBe(true)

  await perfil.close()
})
