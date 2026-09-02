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
  // Los informes ya no van dentro de `carpetaDatos` (D57, 01/09/2026): por
  // defecto la app real los guarda en el Escritorio de quien la usa. Sin
  // esto, cada ejecución de esta prueba escribiría PDF de prueba en el
  // Escritorio de verdad de quien la lance.
  entorno['VILAMAR_CARPETA_INFORMES'] = join(carpetaDatos, 'informes')

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

test('la vía manual pasa por el cuestionario simplificado antes de la revisión', async () => {
  // Las dos opciones de inicio están igual de visibles, no una escondida.
  await expect(ventana.getByTestId('tarjeta-manual')).toBeVisible()

  // Se pulsa con el RATÓN, no con JavaScript: si el botón estuviera tapado por
  // otro elemento, esto fallaría y un `element.click()` no.
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await expect(ventana.getByTestId('manual-campo-AL')).toBeVisible()

  // Nombre del doctor y del paciente: ninguno de los dos exige nada del otro.
  await ventana.getByLabel('Nombre del doctor').fill('Dra. Prueba E2E')
  await ventana.getByLabel('Nombre del paciente').fill('Caso Sintético E2E')

  // El target ya se enseña en 0 sin haberlo tocado (D38).
  await expect(ventana.getByTestId('manual-campo-REFRACCION_OBJETIVO')).toHaveValue('0')

  // El cuestionario no valida sobre la marcha —eso vive en la pantalla de
  // revisión, a la que se llega después— así que aquí se escribe un valor
  // válido y se comprueba que viaja.
  await ventana.getByTestId('manual-campo-AL').fill('24.07')
  await ventana.getByTestId('manual-campo-AL').press('Tab')
  await ventana.getByTestId('manual-continuar').click()

  await expect(ventana.getByTestId('campo-AL')).toHaveValue('24.07')
  // El target sigue en 0 y ya está confirmado (es un dato manual): no debe
  // quedar pendiente de revisar.
  await expect(ventana.getByTestId('origen-REFRACCION_OBJETIVO')).toHaveText('Aportado')
  await expect(ventana.getByTestId('comprobar-REFRACCION_OBJETIVO')).toHaveCount(0)
  await ventana.screenshot({ path: 'test-results/02-desde-cuestionario.png' })

  // El nombre del cirujano se guarda en el caso, aunque la pantalla de
  // revisión no lo enseñe (D41: solo viaja hacia las calculadoras).
  const caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.nombreCirujano).toBe('Dra. Prueba E2E')
  expect(caso?.nombrePaciente).toBe('Caso Sintético E2E')
})

test('un dato imposible se marca y BLOQUEA, sin corregirse solo', async () => {
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

  // La constante A la decide el cirujano según la lente: no la trae ningún
  // biómetro. (El SIA y el eje de incisión ya no sirven de ejemplo aquí:
  // D46 les da un valor de partida de 0.25/135 en cuanto se entra a mano.)
  await expect(ventana.getByTestId('origen-CONSTANTE_A')).toHaveText('Pendiente de aportar')

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

  // Se llega a la pantalla de cálculo con las cinco casillas listadas
  // (EVO y Barrett, Predicted y Measured PCA, más Kane — D45/D48).
  await expect(ventana.getByTestId('calc-EVO_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-BARRETT_TORIC')).toBeVisible()
  await expect(ventana.getByTestId('calc-KANE')).toBeVisible()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()
  await ventana.screenshot({ path: 'test-results/04-calculo.png', fullPage: true })
})

test('«Volver a los datos» deja corregir antes de calcular, sin perder nada', async () => {
  // Petición expresa del dueño del proyecto (01/09/2026): poder volver al
  // formulario a cambiar un dato antes de que se conecte a ninguna web.
  await ventana.getByTestId('volver-a-revisar').click()
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('24.07')

  // Se corrige un solo dato...
  await ventana.getByTestId('campo-AL').fill('24.10')
  await ventana.getByTestId('campo-AL').press('Enter')

  // ...y se puede volver a confirmar y llegar de nuevo a la pantalla de
  // cálculo, con el dato corregido y el resto intacto.
  await ventana.getByTestId('confirmar').click()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()

  const caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.ojos?.OD?.[0]?.medidas?.AL?.valor).toBe(24.1)
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
  const od = resultado?.caso?.ojos?.OD?.[0]?.medidas
  expect(od?.AL?.valor).toBe(24.07)
  expect(od?.K1?.valor).toBe(41.22)
  expect(od?.K1_EJE?.valor).toBe(175)
  const os = resultado?.caso?.ojos?.OS?.[0]?.medidas
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
  // hace avanzar el paso del asistente, que es estado del propio navegador. Se
  // pasa por el cuestionario simplificado (sin rellenarlo) solo para llegar
  // hasta ahí con el ratón.
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await ventana.getByTestId('manual-continuar').click()
  await expect(ventana.getByTestId('campo-ACD')).toBeVisible()

  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'anterion-sin-acd.pdf', ruta }]),
    rutaPdf,
  )

  const od = resultado?.caso?.ojos?.OD?.[0]?.medidas
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
  await ventana.getByTestId('manual-continuar').click()
  const resultado = await ventana.evaluate(
    async (ruta) => window.vilamar?.cargarDocumentos([{ nombre: 'anterion-lentes.pdf', ruta }]),
    rutaPdf,
  )

  // Las cuatro llegan, cada una con la suya.
  const lentes = resultado?.caso?.lentesDelInforme ?? []
  expect(lentes.map((l) => l.constanteA)).toEqual([118.5, 119.6, 119.1, 119.2])

  // Y NINGUNA se ha convertido en la constante A del ojo.
  expect(resultado?.caso?.ojos?.OD?.[0]?.medidas?.CONSTANTE_A).toBeUndefined()
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

test('lente alternativa: compara sin volver a escribir los datos, y no arrastra la constante de la otra', async () => {
  // Petición expresa del dueño del proyecto (01/09/2026). Se retoma el
  // informe con las cuatro lentes que dejó cargado la prueba anterior.
  await ventana.getByTestId('lente-informe-bausch-lomb-akreos-ao-mi60').click()
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('119.1')

  // Se aparca una segunda lente, del catálogo de las calculadoras — no
  // hace falta que esté en el informe para poder aparcarla.
  await ventana.getByTestId('selector-lente-secundaria').selectOption('B&L LuxSmart')
  await expect(ventana.getByTestId('lente-secundaria-elegida')).toContainText('B&L LuxSmart')

  // La principal y su constante NO han cambiado por elegir la aparcada.
  await expect(ventana.getByTestId('campo-CONSTANTE_A')).toHaveValue('119.1')
  let caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.lente?.modelo).toBe('Bausch&Lomb Akreos AO MI60')
  expect(caso?.lenteSecundaria?.modelo).toBe('B&L LuxSmart')

  await ventana.screenshot({ path: 'test-results/14-lente-alternativa.png', fullPage: true })

  // Se activa: pasa a ser la que se calcula, y la que era principal queda
  // aparcada en su lugar.
  await ventana.getByTestId('intercambiar-lentes').click()
  await expect(ventana.getByTestId('lente-elegida')).toContainText('B&L LuxSmart')

  caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.lente?.modelo).toBe('B&L LuxSmart')
  expect(caso?.lenteSecundaria?.modelo).toBe('Bausch&Lomb Akreos AO MI60')
  // «B&L LuxSmart» no está en este informe: no hereda la constante de
  // Akreos ni la de ninguna otra.
  expect(caso?.ojos?.OD?.[0]?.medidas?.CONSTANTE_A).toBeUndefined()

  await ventana.screenshot({ path: 'test-results/15-lentes-intercambiadas.png', fullPage: true })
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
  expect(resultado?.caso?.ojos?.OD?.[0]?.medidas?.AL?.valor).toBe(24.07)
  expect(resultado?.caso?.ojos?.OD?.[0]?.medidas?.K1?.valor).toBe(41.22)
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

/**
 * Fallo real reportado por el dueño del proyecto (02/09/2026): un caso con
 * OD y OS, calculó y el PDF de OS salió «sin resultados», sin ningún aviso
 * de por qué.
 *
 * La causa: OS tenía dos aparatos con una discrepancia real entre sus K2,
 * y nunca se reconoció — pero «Confirmar» solo miraba la discrepancia del
 * ojo que se estuviera viendo en ese momento (D47 solo comprobaba el ojo
 * activo). Confirmando mientras se revisaba OD (sin discrepancia), el botón
 * estaba habilitado, y `calcular()` descartó en silencio las casillas de OS
 * (D51: una discrepancia sin reconocer no bloquea el resto del caso) — sin
 * que nadie hubiera visto ni reconocido esa discrepancia.
 */
test('una discrepancia sin reconocer en OS bloquea «Confirmar» aunque se esté mirando OD', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()

  await ventana.getByLabel('Nombre del doctor').fill('Dra. Prueba E2E')
  await ventana.getByLabel('Nombre del paciente').fill('Caso Sintético E2E')

  // OD: un solo aparato, con algo de dato — no hace falta más para esta prueba.
  await ventana.getByTestId('manual-campo-AL').fill('24.00')
  await ventana.getByTestId('manual-campo-AL').press('Tab')

  // OS: dos aparatos con un K2 que discrepa de verdad (diferencia > 0.5 D).
  await ventana.getByTestId('manual-ojo-OS').click()
  await ventana.getByTestId('manual-campo-K2').fill('44.00')
  await ventana.getByTestId('manual-campo-K2').press('Tab')

  await ventana.getByTestId('manual-anadir-aparato').click()
  await ventana.getByTestId('manual-anadir-aparato-select').selectOption('OCULUS Pentacam')
  await ventana.getByTestId('manual-anadir-aparato-confirmar').click()
  await ventana.getByTestId('manual-campo-K2').fill('45.20')
  await ventana.getByTestId('manual-campo-K2').press('Tab')

  await ventana.getByTestId('manual-continuar').click()

  // La revisión aterriza en OD por defecto — el mismo escenario del fallo
  // real: se confirma mirando el ojo que NO tiene ningún problema, sin
  // haber visto nunca la alarma de OS.
  await expect(ventana.getByTestId('revision-ojo-OD')).toHaveClass(/activo/)
  await expect(ventana.getByTestId('alarma-discrepancia')).toHaveCount(0)
  await expect(ventana.getByTestId('confirmar')).toBeDisabled()
  await expect(ventana.getByTestId('aviso-discrepancia-otro-ojo')).toContainText('izquierdo')

  // Solo al ir a OS y reconocer la discrepancia se puede confirmar.
  await ventana.getByTestId('revision-ojo-OS').click()
  await ventana.getByTestId('reconocer-discrepancia').click()
  await expect(ventana.getByTestId('confirmar')).toBeEnabled()
})

/**
 * «Casos guardados» (02/09/2026, petición expresa del dueño del proyecto):
 * antes de esto no había ninguna forma de volver a un caso una vez cerrada
 * la aplicación — solo existía «el que está abierto ahora mismo», en
 * memoria. `guardarCaso`/`leerCaso`/`listarCasos` ya guardaban cada caso en
 * disco desde el principio; faltaba la pantalla para elegir cuál abrir.
 */
test('un caso guardado se puede volver a abrir, con sus datos intactos', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await ventana.getByLabel('Nombre del doctor').fill('Dra. Casos Guardados')
  await ventana.getByLabel('Nombre del paciente').fill('Paciente Casos Guardados')
  await ventana.getByTestId('manual-campo-AL').fill('23.55')
  await ventana.getByTestId('manual-campo-AL').press('Tab')
  await ventana.getByTestId('manual-continuar').click()

  const creado = await ventana.evaluate(() => window.vilamar?.casoActual())
  const codigo = creado?.codigo
  expect(codigo).toBeTruthy()

  // Se cierra el caso actual (como si se hubiera reiniciado la aplicación:
  // «Nuevo cálculo» dijo adiós al que estaba en memoria) y se busca en la
  // lista de guardados.
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByTestId('tarjeta-casos-guardados').getByRole('button').click()
  await expect(ventana.getByTestId('tabla-casos-guardados')).toBeVisible()

  // Escribir datos y pulsar «Continuar» no confirma el caso —eso es una
  // acción explícita, en la revisión— así que el estado sigue siendo el de
  // un caso recién creado.
  const fila = ventana.locator('tr', { hasText: codigo ?? '' })
  await expect(fila).toContainText('Paciente Casos Guardados')
  await expect(fila).toContainText('Nuevo cálculo')
  await fila.getByRole('button', { name: 'Abrir' }).click()

  // Aterriza en revisión, con el dato tal cual se dejó.
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('23.55')
  const reabierto = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(reabierto?.codigo).toBe(codigo)
  expect(reabierto?.nombrePaciente).toBe('Paciente Casos Guardados')
})

/**
 * Fallo real reportado por el dueño del proyecto (02/09/2026): al abrir un
 * caso terminado, aterriza en «4. Resultados» y no encontraba cómo volver a
 * los datos para corregir algo — la barra de pasos de arriba solo era un
 * indicador, sin ningún sitio que llevara de vuelta salvo un botón escondido
 * más abajo en la pantalla. «Entonces, ¿de qué me sirve?», tal cual.
 *
 * Ahora los pasos YA RECORRIDOS de esa barra se pueden volver a pulsar —
 * nunca uno futuro, que saltaría por delante de lo que falta.
 */
test('los pasos ya recorridos de la barra de arriba se pueden volver a pulsar', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()
  await ventana.getByLabel('Nombre del doctor').fill('Dra. Pasos E2E')
  await ventana.getByLabel('Nombre del paciente').fill('Paciente Pasos E2E')
  await ventana.getByTestId('manual-campo-AL').fill('23.80')
  await ventana.getByTestId('manual-campo-AL').press('Tab')
  await ventana.getByTestId('manual-continuar').click()
  await ventana.getByTestId('confirmar').click()

  // En «3. Calcular»: el paso «4. Resultados», que todavía no se ha
  // alcanzado, no se puede pulsar — saltaría por delante.
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()
  await expect(ventana.getByTestId('paso-RESULTADOS')).toBeDisabled()

  // Pero «2. Revisar datos», ya recorrido, sí — y vuelve con el dato intacto.
  await ventana.getByTestId('paso-REVISION').click()
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('23.8')

  // Y desde ahí, «3. Calcular» lleva otra vez adelante — el caso ya había
  // llegado a «Calcular» antes, así que volver no lo «olvida».
  await ventana.getByTestId('paso-CALCULANDO').click()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()
  // Y «4. Resultados», que de verdad no se ha alcanzado nunca, sigue sin poder pulsarse.
  await expect(ventana.getByTestId('paso-RESULTADOS')).toBeDisabled()
})

/**
 * Petición expresa del dueño del proyecto (02/09/2026), probando a cargar
 * fotos leídas por un lector externo: la pantalla de revisión (para un
 * documento cargado) no tenía forma de añadir un segundo aparato, y el
 * orden de los campos no coincidía con el del cuestionario manual — las
 * dos vías de entrada tienen que llevar a la misma experiencia.
 * `SelectorAparato.tsx` es ahora el mismo componente en las dos pantallas.
 */
test('la pantalla de revisión (documento cargado) permite añadir un segundo aparato, igual que el manual', async () => {
  const { chromium } = await import('playwright')
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 1100, height: 700 } })
  await p.setContent(`<body style="font-family:Arial;padding:40px;font-size:12pt">
    <h1>HEIDELBERG ENGINEERING ANTERION</h1>
    <pre>OD
AL            23.90 mm
K1            41.00 D @ 10
K2            42.50 D @ 100
ACD (epi)      3.10 mm</pre>
    </body>`)
  const rutaPdf = join(carpetaDatos, 'informe-otro-aparato.pdf')
  await p.pdf({ path: rutaPdf, format: 'A4', printBackground: true })
  await nav.close()

  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  const resultado = await ventana.evaluate(
    async (ruta) =>
      window.vilamar?.cargarDocumentos([{ nombre: 'informe-otro-aparato.pdf', ruta }]),
    rutaPdf,
  )
  expect(resultado?.caso?.ojos?.OD?.[0]?.medidas?.AL?.valor).toBe(23.9)

  // Cargar el documento por el canal, sin pasar por la ventana, no cambia
  // de pantalla sola — se entra en la revisión con el paso de la barra
  // (D64: siempre pulsable en cuanto hay un caso).
  await ventana.getByTestId('paso-REVISION').click()

  // El botón para añadir un segundo biómetro, antes solo en el cuestionario
  // manual, ahora también está aquí.
  await expect(ventana.getByTestId('manual-anadir-aparato')).toBeVisible()
  await ventana.getByTestId('manual-anadir-aparato').click()
  await ventana.getByTestId('manual-anadir-aparato-select').selectOption('OCULUS Pentacam')
  await ventana.getByTestId('manual-anadir-aparato-confirmar').click()

  // Elegir un aparato nuevo no crea el dataset todavía —solo cambia cuál
  // está activo, igual que en el cuestionario manual—, así que el campo
  // arranca vacío: sin pisar el primero.
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('')

  // En cuanto se escribe el primer dato, el dataset nuevo existe de
  // verdad y aparece como pestaña — sin que el original desaparezca.
  await ventana.getByTestId('campo-AL').fill('24.50')
  await ventana.getByTestId('campo-AL').press('Tab')
  await expect(ventana.getByTestId('manual-aparato-OCULUS Pentacam')).toBeVisible()

  const aparatoOriginal = (await ventana.evaluate(() => window.vilamar?.casoActual()))?.ojos?.OD?.[0]
    ?.aparato
  expect(aparatoOriginal).toBeTruthy()
  await expect(ventana.getByTestId(`manual-aparato-${aparatoOriginal}`)).toBeVisible()

  // Y volver al aparato original enseña SU dato, no el 24.50 del nuevo.
  await ventana.getByTestId(`manual-aparato-${aparatoOriginal}`).click()
  await expect(ventana.getByTestId('campo-AL')).toHaveValue('23.9')

  // Y el orden de los campos coincide con el cuestionario manual: AL y las
  // dos K, antes que la constante A (que vive en «Lente e incisión», no en
  // «Decisiones del cirujano» como antes).
  const etiquetas = await ventana.getByTestId(/^campo-/).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')),
  )
  const posAL = etiquetas.indexOf('campo-AL')
  const posConstanteA = etiquetas.indexOf('campo-CONSTANTE_A')
  const posPK1 = etiquetas.indexOf('campo-PK1')
  expect(posAL).toBeLessThan(posConstanteA)
  expect(posConstanteA).toBeLessThan(posPK1)
})

/**
 * Petición expresa del dueño del proyecto (02/09/2026): al meter la
 * constante A de un ojo, que aparezca sola en el otro — casi siempre es la
 * misma lente en los dos — sin tener que escribirla dos veces. Pero nunca
 * pisando lo que ya haya: ni la del otro ojo si ya tenía la suya, ni al
 * revés.
 */
test('la constante A escrita en un ojo se copia sola al otro, sin pisar la que ya hubiera (D66)', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()

  // OD: un dato de biometría y la constante.
  await ventana.getByTestId('manual-campo-AL').fill('24.00')
  await ventana.getByTestId('manual-campo-AL').press('Tab')
  await ventana.getByTestId('manual-campo-CONSTANTE_A').fill('119.10')
  await ventana.getByTestId('manual-campo-CONSTANTE_A').press('Tab')

  // OS todavía no tiene ningún dato: no hay nada que copiar todavía.
  await ventana.getByTestId('manual-ojo-OS').click()
  await expect(ventana.getByTestId('manual-campo-CONSTANTE_A')).toHaveValue('')

  // En cuanto OS tiene su primer dato, hereda la constante de OD sola.
  await ventana.getByTestId('manual-campo-AL').fill('24.30')
  await ventana.getByTestId('manual-campo-AL').press('Tab')
  await expect(ventana.getByTestId('manual-campo-CONSTANTE_A')).toHaveValue('119.1')

  // Si la persona la cambia a propósito en OS, esa es la que se queda — y
  // la de OD, que se escribió antes, tampoco se toca.
  await ventana.getByTestId('manual-campo-CONSTANTE_A').fill('118.50')
  await ventana.getByTestId('manual-campo-CONSTANTE_A').press('Tab')

  const caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.ojos?.OD?.[0]?.medidas?.CONSTANTE_A?.valor).toBe(119.1)
  expect(caso?.ojos?.OS?.[0]?.medidas?.CONSTANTE_A?.valor).toBe(118.5)
})

/**
 * Petición expresa del dueño del proyecto (02/09/2026): con datos completos
 * en los dos ojos, poder elegir calcular los dos a la vez o solo uno, en
 * vez de lanzar siempre las dos calculadoras aunque solo haga falta una.
 */
test('se puede elegir calcular los dos ojos o solo uno (D66)', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()

  const datosOjo: [string, string][] = [
    ['manual-campo-AL', '24.07'],
    ['manual-campo-K1', '41.22'],
    ['manual-campo-K1_EJE', '175'],
    ['manual-campo-K2', '42.52'],
    ['manual-campo-K2_EJE', '85'],
    ['manual-campo-ACD', '3.18'],
    ['manual-campo-LT', '4.53'],
    ['manual-campo-CCT', '530'],
    ['manual-campo-REFRACCION_OBJETIVO', '0'],
    ['manual-campo-SIA', '0.3'],
    ['manual-campo-EJE_INCISION', '90'],
    ['manual-campo-CONSTANTE_A', '119'],
  ]
  for (const [id, valor] of datosOjo) {
    await ventana.getByTestId(id).fill(valor)
    await ventana.getByTestId(id).press('Tab')
  }

  await ventana.getByTestId('manual-ojo-OS').click()
  for (const [id, valor] of datosOjo) {
    // La constante A ya llegó copiada de OD (ver el test anterior).
    if (id === 'manual-campo-CONSTANTE_A') continue
    await ventana.getByTestId(id).fill(valor)
    await ventana.getByTestId(id).press('Tab')
  }
  await expect(ventana.getByTestId('manual-campo-CONSTANTE_A')).toHaveValue('119')

  await ventana.getByTestId('identificacion-cirujano').fill('Dra. Prueba')
  await ventana.getByTestId('identificacion-cirujano').press('Tab')
  await ventana.getByTestId('identificacion-paciente').fill('Paciente de prueba')
  await ventana.getByTestId('identificacion-paciente').press('Tab')

  await ventana.getByTestId('manual-continuar').click()
  await ventana.getByTestId('confirmar').click()
  await expect(ventana.getByTestId('lanzar-calculo')).toBeVisible()

  // Con datos en los dos ojos aparece el selector, con «Los dos ojos»
  // activo de partida — el comportamiento de siempre, para no sorprender a
  // quien no lo toca.
  await expect(ventana.getByTestId('alcance-ojos-AMBOS')).toBeVisible()
  await expect(ventana.getByTestId('alcance-ojos-OD')).toBeVisible()
  await expect(ventana.getByTestId('alcance-ojos-OS')).toBeVisible()
  await expect(ventana.getByTestId('lanzar-calculo')).not.toContainText('solo')

  await ventana.getByTestId('alcance-ojos-OD').click()
  await expect(ventana.getByTestId('lanzar-calculo')).toContainText('solo OD')
})

/**
 * Petición expresa del dueño del proyecto (02/09/2026), a partir de dos
 * pantallazos de EVO y Kane: un ojo con córnea alterada por LASIK/PRK/RK
 * previo o queratocono necesita un campo especial en EVO y Kane, y una
 * calculadora ENTERAMENTE DISTINTA en vez de Barrett Toric —Barrett True K
 * Toric—, porque la fórmula normal de Barrett da un resultado erróneo ahí.
 *
 * Solo se prueba aquí la parte de INTERFAZ (el selector, y que aparece/
 * desaparece lo que tiene que aparecer/desaparecer) — el bloqueo mutuo entre
 * las dos calculadoras de Barrett ya está probado a fondo en
 * `preparar-entradas.test.ts`, en el dominio, sin necesitar la aplicación
 * entera. No se pulsa «Calcular» aquí a propósito: aunque el bloqueo pasa
 * antes de abrir ninguna página, pulsarlo abre igualmente un navegador real
 * —Barrett exige ventana visible—, y esta prueba no depende de eso para
 * comprobar lo que le toca comprobar.
 */
test('el selector de córnea especial, y sus dos campos de LASIK, solo aparecen cuando hacen falta (D67)', async () => {
  await ventana.getByRole('button', { name: 'Nuevo cálculo' }).click()
  await ventana.getByRole('button', { name: 'Escribir los datos a mano' }).click()

  await ventana.getByTestId('manual-campo-AL').fill('24.07')
  await ventana.getByTestId('manual-campo-AL').press('Tab')

  // Sin tocar nada, la córnea especial está en «Ninguna» y las dos
  // refracciones de LASIK no se enseñan: no son un dato que casi nadie
  // necesite.
  await expect(ventana.getByTestId('situacion-corneal-select')).toHaveValue('')
  await expect(ventana.getByTestId('manual-campo-REFRACCION_PRE_LASIK')).toHaveCount(0)

  // Se marca OD como queratocono. Los dos campos de LASIK aparecen solos
  // (opcionales: no hace falta rellenarlos para seguir), y el aviso explica
  // qué cambia para Barrett.
  await ventana.getByTestId('situacion-corneal-select').selectOption('QUERATOCONO')
  await expect(ventana.getByTestId('manual-campo-REFRACCION_PRE_LASIK')).toBeVisible()
  await expect(ventana.getByTestId('manual-campo-REFRACCION_POST_LASIK')).toBeVisible()
  await expect(ventana.getByTestId('situacion-corneal-aviso')).toContainText('True K Toric')

  const caso = await ventana.evaluate(() => window.vilamar?.casoActual())
  expect(caso?.ojos?.OD?.[0]?.situacionCorneal).toBe('QUERATOCONO')

  // Cambiando a «Ninguna» otra vez, los dos campos vuelven a esconderse —
  // no se enseña un hueco vacío que confunda al usar el formulario normal.
  await ventana.getByTestId('situacion-corneal-select').selectOption('')
  await expect(ventana.getByTestId('manual-campo-REFRACCION_PRE_LASIK')).toHaveCount(0)

  // Y en OS, sin haber tocado nada, sigue siendo «Ninguna»: es un dato por
  // ojo, no del caso entero.
  await ventana.getByTestId('manual-ojo-OS').click()
  await expect(ventana.getByTestId('situacion-corneal-select')).toHaveValue('')
})
