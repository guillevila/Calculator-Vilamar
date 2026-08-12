/**
 * flujo.spec.ts — Arranca la aplicación de verdad y recorre el flujo.
 *
 * No usa dobles: abre Electron, pulsa con el ratón y comprueba lo que se ve en
 * pantalla. Es la única prueba que puede detectar que un botón existe pero no
 * se puede pulsar, o que la ventana no llega a abrirse.
 *
 * Lo que esta prueba NO hace: hablar con Kane, EVO ni Barrett. Depender de tres
 * webs ajenas dejaría el control en rojo cada vez que una de ellas tuviera un
 * mal día. Las sondas contra las webs reales se lanzan a mano.
 *
 * ⚠️ `ELECTRON_RUN_AS_NODE` — si está puesta en el entorno, Electron arranca
 * como si fuera Node y NO abre ninguna ventana, sin decir nada. Es un fallo
 * mudo que ya costó un rato en este proyecto, así que se quita explícitamente
 * al lanzarlo.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const raizApp = join(fileURLToPath(import.meta.url), '..', '..')

let app: ElectronApplication
let ventana: Page
let carpetaDatos: string

// El tipo de `window.vilamar` ya lo declara el renderer en `api.ts`; aquí solo
// se importa para no duplicarlo (dos declaraciones distintas del mismo global
// son un error de compilación).
import type { ApiVilamar } from '../src/compartido/ipc.js'
declare global {
  interface Window {
    readonly vilamar?: ApiVilamar
  }
}

test.beforeAll(async () => {
  // Cada ejecución sobre una carpeta de datos desechable: no se tocan los
  // casos reales del usuario.
  carpetaDatos = mkdtempSync(join(tmpdir(), 'vilamar-e2e-'))

  const entorno: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') entorno[k] = v
  }

  app = await electron.launch({
    args: [join(raizApp, 'out', 'main', 'index.js'), `--user-data-dir=${carpetaDatos}`],
    env: entorno,
  })
  ventana = await app.firstWindow()
  await ventana.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  try {
    rmSync(carpetaDatos, { recursive: true, force: true })
  } catch {
    // en Windows a veces el proceso todavía tiene un fichero abierto
  }
})

test('la ventana se abre y enseña el punto de partida', async () => {
  await expect(ventana.locator('h1')).toHaveText('Calculator Vilamar')
  await expect(ventana.getByTestId('zona-soltar')).toBeVisible()
  await expect(ventana.getByRole('button', { name: 'Elegir archivo' })).toBeVisible()
  await ventana.screenshot({ path: 'test-results/01-inicio.png' })
})

test('se pueden escribir los datos a mano y se validan mientras escribes', async () => {
  // Se pulsa con el RATÓN, no con JavaScript: si el botón estuviera tapado por
  // otro elemento, esto fallaría y un `element.click()` no.
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await expect(ventana.getByTestId('campo-AL')).toBeVisible()

  // Un dato imposible tiene que marcarse y BLOQUEAR, sin corregirse solo.
  await ventana.getByTestId('campo-AL').fill('240.7')
  await ventana.getByTestId('campo-K1').click()
  await expect(ventana.locator('text=/no cambia datos por su cuenta/i').first()).toBeVisible()
  await expect(ventana.getByTestId('confirmar')).toBeDisabled()
  // El valor se queda como se escribió.
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('240.7')
  await ventana.screenshot({ path: 'test-results/02-dato-imposible.png' })

  // Corregido, deja continuar.
  await ventana.getByTestId('campo-AL').fill('24.07')
  await ventana.getByTestId('campo-K1').click()
  await expect(ventana.getByTestId('confirmar')).toBeEnabled()
})

test('un campo vacío dice quién lo tiene que aportar, no «no encontrado»', async () => {
  // Era el problema de fondo: «NO ENCONTRADO» mezclaba «el informe no lo trae»
  // con «esto lo pones tú», y hacía parecer que la lectura había fallado.
  const wtw = ventana.getByTestId('campo-WTW')
  await expect(wtw).toHaveValue('')
  // WTW lo mide el aparato: si no está, es que ese informe no lo trae.
  await expect(wtw).toHaveAttribute('placeholder', 'No consta en el informe')
  await expect(ventana.getByTestId('origen-WTW')).toHaveText('No consta en el informe')

  // El SIA no viene en ninguna biometría: lo decide quien opera.
  await expect(ventana.getByTestId('origen-SIA')).toHaveText('Pendiente de aportar')

  // Y en ningún sitio se dice ya «no encontrado».
  await expect(ventana.locator('text=/NO ENCONTRADO/i')).toHaveCount(0)
})

test('un dato que el informe no traía se puede APORTAR a mano', async () => {
  // Es lo que se pidió: que los datos que no vengan del informe se puedan meter
  // a mano. Y al hacerlo, el origen lo dice: aportado, no corregido.
  const wtw = ventana.getByTestId('campo-WTW')
  await wtw.fill('11.9')
  await ventana.getByTestId('campo-CCT').click()
  await expect(wtw).toHaveValue('11.9')
  await expect(ventana.getByTestId('origen-WTW')).toHaveText('Aportado')
  // No se inventa un «leído originalmente»: no había nada que conservar.
  await expect(ventana.getByTestId('original-WTW')).toHaveCount(0)
  await ventana.screenshot({ path: 'test-results/09-dato-aportado.png' })

  // Borrarlo lo devuelve a no constar, no lo deja a cero.
  await ventana.getByTestId('borrar-WTW').click()
  await expect(wtw).toHaveValue('')
  await expect(ventana.getByTestId('origen-WTW')).toHaveText('No consta en el informe')
})

test('cada campo dice cuánta falta hace, y avisa antes de confirmar', async () => {
  // «Obligatorio» a secas sería mentira: depende de qué calculadora quieras.
  await expect(ventana.getByTestId('exigencia-AL')).toHaveText('Obligatorio')
  // El SIA solo lo pide Barrett, y se nombra: es lo que hace la frase útil.
  await expect(ventana.getByTestId('exigencia-SIA')).toContainText('Barrett')
  await expect(ventana.getByTestId('exigencia-LT')).toHaveText('Opcional')
  // Y lo que sorprende: hay campos que se leen y no se envían a ninguna parte.
  await expect(ventana.getByTestId('exigencia-AQD')).toContainText(/no se envía/i)

  // El aviso llega ANTES de pulsar. Antes esto solo se sabía después de que el
  // navegador recorriera las tres webs: 47 segundos para saber que faltaba algo.
  const aviso = ventana.getByTestId('aviso-faltan-requeridos')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('Barrett')
  await ventana.screenshot({ path: 'test-results/10-exigencia.png' })

  // Y no bloquea: calcular con dos de tres es un resultado legítimo.
  await expect(ventana.getByTestId('confirmar')).toBeEnabled()
})

test('el flujo completo llega hasta la pantalla de cálculo', async () => {
  // Los datos mínimos que pide EVO, escritos a mano.
  const datos: [string, string][] = [
    ['campo-AL', '24.07'],
    ['campo-K1', '41.22'],
    ['campo-K1_EJE', '175'],
    ['campo-K2', '42.52'],
    ['campo-K2_EJE', '85'],
    ['campo-ACD', '3.18'],
    ['campo-LT', '4.53'],
    ['campo-CCT', '530'],
    ['campo-REFRACCION_OBJETIVO', '0'],
    ['campo-SIA', '0.3'],
    ['campo-EJE_INCISION', '90'],
    ['campo-CONSTANTE_A', '119'],
  ]
  for (const [id, valor] of datos) {
    await ventana.getByTestId(id).fill(valor)
    await ventana.getByTestId(id).press('Enter')
  }

  await ventana.screenshot({ path: 'test-results/03-revision.png', fullPage: true })

  await ventana.getByTestId('confirmar').click()

  // Se llega a la pantalla de cálculo con las tres calculadoras listadas.
  await expect(ventana.getByTestId('calc-EVO_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-BARRETT_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-KANE')).toBeVisible()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()
  await ventana.screenshot({ path: 'test-results/04-calculo.png', fullPage: true })
})

test('la interfaz no enseña jerga técnica al usuario', async () => {
  const texto = (await ventana.locator('body').innerText()).toLowerCase()
  for (const jerga of ['locator(', 'timeouterror', 'undefined', 'null pointer', 'stack trace']) {
    expect(texto, `la pantalla enseña «${jerga}»`).not.toContain(jerga)
  }
})

/**
 * Esta prueba existe por un fallo concreto: al subir un informe, **el fichero
 * llegaba vacío**. Los bytes viajaban por IPC —y en el caso de «Elegir archivo»,
 * ida y vuelta— y se perdían por el camino. Todo lo que se veía después («la
 * imagen no se puede decodificar», «no se encuentran datos») eran síntomas.
 *
 * Ahora solo viaja la RUTA y el proceso principal lee el fichero. Esta prueba
 * comprueba justamente eso: que un fichero de verdad, con contenido de verdad,
 * llega entero y se lee.
 */
test('un informe subido llega con su contenido y se lee', async () => {
  test.setTimeout(180_000)

  // Un informe sintético con capa de texto: se lee sin OCR, así que la prueba no
  // depende de tener descargados los datos del idioma.
  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1100, height: 700 } })
  await p.setContent(`<body style="font-family:Arial;padding:40px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <div style="display:flex;gap:90px">
      <pre>OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
LT             4.53 mm
CCT             530 um</pre>
      <pre>OS
AL            24.01 mm
K1            40.27 D @ 8
K2            42.68 D @ 98
ACD (epi)      3.23 mm
LT             4.48 mm
CCT             533 um</pre>
    </div></body>`)
  const rutaPdf = join(carpetaDatos, 'informe-sintetico.pdf')
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()

  // El fichero existe y NO está vacío. Si esto falla, el resto no significa nada.
  expect(statSync(rutaPdf).size).toBeGreaterThan(1000)

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()

  // Se llama al mismo canal que usa la aplicación al arrastrar un fichero.
  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'informe-sintetico.pdf', ruta }]),
    rutaPdf,
  )

  expect(resultado, 'el proceso principal no ha devuelto nada').toBeTruthy()
  const resumen = resultado?.resumenes?.[0]
  expect(resumen?.nombreDispositivo, 'no ha reconocido el ANTERION').toContain('ANTERION')
  expect(resumen?.ojosEncontrados, 'no ha encontrado los dos ojos').toEqual(['OD', 'OS'])
  expect(
    resumen?.avisos.join(' '),
    'ha avisado de que no encuentra datos, y sí los hay',
  ).not.toMatch(/no se ha podido leer ningún dato|está vacío/i)

  // Y los valores son los que pone el informe.
  const od = resultado?.caso?.ojos?.OD?.medidas
  expect(od?.AL?.valor).toBe(24.07)
  expect(od?.K1?.valor).toBe(41.22)
  expect(od?.K1_EJE?.valor).toBe(175)
  const os = resultado?.caso?.ojos?.OS?.medidas
  expect(os?.AL?.valor).toBe(24.01)
  expect(os?.K1?.valor).toBe(40.27)

  await ventana.screenshot({ path: 'test-results/05-informe-cargado.png', fullPage: true })
})

/**
 * Un ANTERION antiguo, de los que no imprimen la ACD.
 *
 * Es el caso que motivó la capa de normalización, y se prueba de punta a punta
 * —PDF de verdad, proceso principal de verdad, pantalla de verdad— porque las
 * piezas sueltas ya están probadas en el dominio: lo que aquí puede fallar es
 * que la ACD se calcule y luego no se enseñe, o se enseñe como si la trajera el
 * informe. Las tres calculadoras necesitan la ACD; sin ella no hay producto.
 */
test('un ANTERION sin ACD la calcula, y la pantalla dice que la ha calculado', async () => {
  test.setTimeout(180_000)

  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1100, height: 700 } })
  // Sin línea de ACD. Sí AQD y grosor corneal: 2.65 + 0.530 = 3.18 mm.
  await p.setContent(`<body style="font-family:Arial;padding:40px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <pre>OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
AQD (endo)     2.65 mm
LT             4.53 mm
CCT             530 um</pre></body>`)
  const rutaPdf = join(carpetaDatos, 'anterion-sin-acd.pdf')
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()
  expect(statSync(rutaPdf).size).toBeGreaterThan(1000)

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  // Se entra a la pantalla de revisión ANTES de cargar. Llamar al canal de carga
  // desde aquí actualiza el caso —la pantalla se suscribe a sus cambios— pero no
  // hace avanzar el paso del asistente, que es estado del propio navegador.
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await expect(ventana.getByTestId('campo-ACD')).toBeVisible()

  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'anterion-sin-acd.pdf', ruta }]),
    rutaPdf,
  )

  const od = resultado?.caso?.ojos?.OD?.medidas
  // La ACD existe aunque el informe no la traiga…
  expect(od?.ACD?.valor, 'no ha calculado la ACD').toBe(3.18)
  expect(od?.ACD?.procedencia?.metodo, 'la ACD no está marcada como derivada').toBe('DERIVADO')
  // …y los datos de los que salió siguen ahí, sin haberse consumido.
  expect(od?.AQD?.valor).toBe(2.65)
  expect(od?.CCT?.valor).toBe(530)

  // Lo que ve el usuario: ni «Del informe» ni «Aportado», y la cuenta debajo.
  await expect(ventana.getByTestId('origen-ACD')).toHaveText('Derivado del informe')
  await expect(ventana.getByTestId('derivacion-ACD')).toContainText('AQD 2.65 mm')
  await expect(ventana.getByTestId('derivacion-ACD')).toContainText('530 µm')
  await expect(ventana.getByTestId('campo-ACD')).toHaveValue('3.18')
  // La AQD sí la trae el papel, y se dice.
  await expect(ventana.getByTestId('origen-AQD')).toHaveText('Del informe')

  // Y no se da por buena sola: hay que comprobarla antes de poder confirmar.
  await expect(ventana.getByTestId('comprobar-ACD')).toBeVisible()

  await ventana.screenshot({ path: 'test-results/11-acd-derivada.png', fullPage: true })
})

/**
 * La tabla de lentes del informe, de punta a punta.
 *
 * Es el recorrido entero de la regla: un PDF de verdad con cuatro modelos y
 * cuatro constantes → ninguna elegida → se elige una → aparece SU constante →
 * se cambia de lente → cambia la constante → se elige una que no está → no hereda
 * nada.
 *
 * Las piezas están probadas en el dominio. Lo que aquí puede fallar es lo que
 * ninguna prueba de dominio ve: que la constante se lea bien pero no llegue a la
 * pantalla, o que llegue la de la lente equivocada.
 */
test('las lentes del informe: cada constante con su modelo', async () => {
  test.setTimeout(180_000)

  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1100, height: 900 } })
  // ⚠️ Modelos reales pero números INVENTADOS. No sale de ningún informe de
  // ninguna persona: reproduce la forma en que este aparato presenta la tabla.
  await p.setContent(`<body style="font-family:Arial;padding:40px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <pre>Cataract App

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
CCT             530 um

IOL calculation

LUX SMART
SRK/T: 118.5

ZEISS AT ELANA 841P
SRK/T: 119.6

Bausch&amp;Lomb Akreos AO MI60
SRK/T: 119.1

Bausch&amp;Lomb enVista MX60
SRK/T: 119.2</pre></body>`)
  const rutaPdf = join(carpetaDatos, 'anterion-lentes.pdf')
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'anterion-lentes.pdf', ruta }]),
    rutaPdf,
  )

  // Las cuatro llegan, cada una con la suya.
  const lentes = resultado?.caso?.lentesDelInforme ?? []
  expect(lentes.map((l) => l.constanteA)).toEqual([118.5, 119.6, 119.1, 119.2])

  // Y NINGUNA se ha convertido en la constante A del ojo.
  expect(resultado?.caso?.ojos?.OD?.medidas?.CONSTANTE_A).toBeUndefined()
  await expect(ventana.getByTestId('lentes-del-informe')).toBeVisible()
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('')
  await ventana.screenshot({ path: 'test-results/12-lentes-informe.png', fullPage: true })

  // Elegir Akreos trae 119.1 —la suya— y sale como dato del informe.
  await ventana.getByTestId('lente-informe-bausch-lomb-akreos-ao-mi60').click()
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('119.1')
  await expect(ventana.getByTestId('origen-CONSTANTE_A')).toHaveText('Del informe')

  // Cambiar a enVista cambia la constante. No se queda la anterior.
  await ventana.getByTestId('lente-informe-bausch-lomb-envista-mx60').click()
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('119.2')

  // Y LUX SMART, la suya.
  await ventana.getByTestId('lente-informe-lux-smart').click()
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('118.5')

  // Una lente que NO está en el informe no hereda ninguna constante.
  await ventana.getByTestId('selector-lente').selectOption('Alcon Vivity')
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('')
  await expect(ventana.getByTestId('origen-CONSTANTE_A')).toHaveText('Pendiente de aportar')
  await expect(ventana.getByTestId('aviso-lente').first()).toContainText(
    /no aparece en el informe/i,
  )

  await ventana.screenshot({ path: 'test-results/13-lente-no-esta.png', fullPage: true })
})

/**
 * El otro camino: el contenido del fichero, que es el que usa el arrastre cuando
 * Electron no da la ruta. Se comprobó que un `Uint8Array` sobrevive íntegro al
 * IPC; esta prueba lo fija para que no se rompa sin que nadie se entere.
 */
test('un informe enviado por contenido también llega entero', async () => {
  test.setTimeout(120_000)

  const rutaPdf = join(carpetaDatos, 'por-contenido.pdf')
  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1000, height: 500 } })
  await p.setContent(`<body style="font-family:Arial;padding:36px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <pre>OD
AL            24.07 mm
K1            41.22 D @ 175
ACD (epi)      3.18 mm</pre></body>`)
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()

  const bytes = [...readFileSync(rutaPdf)]
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()

  const resultado = await ventana.evaluate(
    async (numeros) =>
      window.vilamar?.cargarDocumentos([
        { nombre: 'por-contenido.pdf', datos: new Uint8Array(numeros) },
      ]),
    bytes,
  )

  expect(resultado?.resumenes?.[0]?.nombreDispositivo).toContain('ANTERION')
  expect(resultado?.caso?.ojos?.OD?.medidas?.AL?.valor).toBe(24.07)
  expect(resultado?.caso?.ojos?.OD?.medidas?.K1?.valor).toBe(41.22)
})

/**
 * Un fichero vacío tiene que decirse EN CUANTO se abre.
 *
 * Es el fallo que costó dos rondas de diagnóstico: un archivo de 0 bytes se
 * aceptaba sin decir nada y reventaba cuatro pasos más adelante, disfrazado de
 * «la imagen no se puede decodificar».
 */
test('un archivo vacío se dice claramente, y no como un error de imagen', async () => {
  const rutaVacia = join(carpetaDatos, 'vacio.jpeg')
  writeFileSync(rutaVacia, '')

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'vacio.jpeg', ruta }]),
    rutaVacia,
  )

  const avisos = resultado?.resumenes?.[0]?.avisos.join(' ') ?? ''
  expect(avisos).toMatch(/está vacío/i)
  expect(avisos).toMatch(/0 bytes/)
  // Y NO se le echa la culpa al reconocimiento de imagen.
  expect(avisos).not.toMatch(/decodificar|decoded|attempting to read/i)
})
