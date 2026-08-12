/**
 * live.ts — Prueba los adaptadores DE VERDAD contra las webs reales.
 *
 * Esto no forma parte del CI y no debe formar parte nunca: si una de las tres
 * webs tiene un mal día, el control se pondría en rojo por algo que no es
 * nuestro. Se lanza a mano cuando hace falta comprobar que un adaptador sigue
 * encajando con su web:
 *
 *     pnpm live                 # las tres
 *     pnpm live evo             # solo EVO
 *     pnpm live evo barrett     # dos
 *     pnpm live --headless      # sin ventana (Barrett fallará: la necesita)
 *
 * Usa el fixture SINTÉTICO del proyecto. Ningún dato es de una persona.
 *
 * Recorre el camino completo del producto —dominio, confirmación, orquestador,
 * adaptadores— y no una versión simplificada: si esto funciona, la aplicación
 * hace lo mismo por dentro.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Calculadora, Caso } from '@vilamar/domain'
import {
  casoNuevo,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  crearMedida,
  fichaDe,
  ojoVacio,
} from '@vilamar/domain'
import { ejecutarCaso, necesitaVentana } from '@vilamar/integrations'

const CUANDO = new Date().toISOString()
const SALIDA = join(process.cwd(), 'local', 'live')
mkdirSync(SALIDA, { recursive: true })

const args = process.argv.slice(2)
const headless = args.includes('--headless')
const pedidas = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase())

const MAPA: Record<string, Calculadora> = {
  evo: 'EVO_TORIC',
  barrett: 'BARRETT_TORIC',
  kane: 'KANE',
}
const calculadoras: Calculadora[] =
  pedidas.length > 0
    ? pedidas.map((p) => {
        const c = MAPA[p]
        if (!c) throw new Error(`No conozco «${p}». Opciones: evo, barrett, kane.`)
        return c
      })
    : ['EVO_TORIC', 'BARRETT_TORIC', 'KANE']

/** El fixture sintético del proyecto: ojo derecho. */
function casoDePrueba(): Caso {
  let ojo = ojoVacio('OD')
  for (const [campo, valor] of [
    ['AL', 24.07],
    ['K1', 41.22],
    ['K1_EJE', 175],
    ['K2', 42.52],
    ['K2_EJE', 85],
    ['ACD', 3.18],
    ['LT', 4.53],
    ['CCT', 530],
    ['WTW', 11.9],
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0],
    ['EJE_INCISION', 0],
    ['CONSTANTE_A', 119.0],
  ] as const) {
    ojo = conMedida(
      ojo,
      crearMedida(campo, 'OD', valor, { metodo: 'MANUAL', registradoEn: CUANDO }),
    )
  }
  ojo = confirmarTodas(ojo)
  const base: Caso = {
    ...casoNuevo('live', 'CV-PRUEBA-001', CUANDO),
    lente: { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
    // Kane lo exige. Escrito a mano y confirmado, como lo haría una persona en la
    // pantalla de revisión. NO es de nadie: el caso entero es sintético.
    sexo: {
      valor: 'MUJER',
      procedencia: { metodo: 'MANUAL', registradoEn: CUANDO },
      confirmadoPorUsuario: true,
    },
  }
  return confirmar(conOjo(base, ojo, CUANDO), CUANDO)
}

const caso = casoDePrueba()
const conVentana = !headless && necesitaVentana(calculadoras)

console.log('─'.repeat(70))
console.log('  SONDA EN VIVO — adaptadores contra las webs reales')
console.log(`  Calculadoras : ${calculadoras.map((c) => fichaDe(c).nombre).join(', ')}`)
console.log(`  Navegador    : ${conVentana ? 'con ventana' : 'sin ventana'}`)
console.log('  Datos        : fixture sintético (no son de ninguna persona)')
console.log('─'.repeat(70))

const { chromium } = await import('playwright')

/** El perfil del navegador de la aplicación. El mismo, para no repetir acuerdos. */
function perfilDeLaAplicacion(): string {
  if (process.env.VILAMAR_PERFIL) return process.env.VILAMAR_PERFIL
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
  return join(base, 'calculator-vilamar', 'sesion-navegador')
}

const perfil = perfilDeLaAplicacion()
console.log(`  Perfil       : ${perfil}`)
const contextoPersistente = await chromium.launchPersistentContext(perfil, {
  headless: !conVentana,
  viewport: { width: 1500, height: 1050 },
})
const navegador = {
  newContext: async () => contextoPersistente,
  close: async () => contextoPersistente.close(),
} as unknown as import('playwright').Browser

const resultados = await ejecutarCaso({
  caso,
  ojos: ['OD'],
  calculadoras,
  navegador,
  progreso: (e) => {
    const marca = e.requiereUsuario ? '  ⚠ ' : '  · '
    console.log(`${marca}[${fichaDe(e.calculadora).nombre}] ${e.fase}: ${e.mensaje}`)
  },
  alTerminarUna: (r) => {
    const icono = r.estado === 'SUCCESS' ? '✓' : r.estado === 'PARTIAL' ? '~' : '✕'
    console.log(
      `  ${icono} ${fichaDe(r.calculadora).nombre}: ${r.estado} (${r.duracionMs ?? '?'} ms)`,
    )
  },
  ahora: () => new Date().toISOString(),
  guardarDiagnostico: async (d) => {
    const id = `${d.calculadora}-${Date.now()}`
    writeFileSync(
      join(SALIDA, `${id}.json`),
      JSON.stringify({ ...d, captura: d.captura ? '(png aparte)' : null }, null, 2),
    )
    if (d.captura) writeFileSync(join(SALIDA, `${id}.png`), d.captura)
    console.log(`    diagnóstico guardado: local/live/${id}.*`)
    return id
  },
  cancelado: () => false,
})

await navegador.close()

console.log('')
console.log('═'.repeat(70))
console.log('  RESULTADOS')
console.log('═'.repeat(70))
for (const r of resultados) {
  const ficha = fichaDe(r.calculadora)
  console.log('')
  console.log(`▸ ${ficha.nombre} — ${r.estado}`)
  if (r.mensaje) console.log(`  ${r.mensaje}`)
  if (r.recomendada) {
    const o = r.recomendada
    console.log(
      `  Recomendada: esfera ${o.esfera ?? 'N/A'} · cilindro ${o.cilindro ?? 'N/A'} · eje ${
        o.eje ?? 'N/A'
      } · modelo ${o.designacion ?? 'N/A'}`,
    )
    console.log(
      `  Prevista   : refracción ${o.refraccionPrevista ?? 'N/A'} · residual ${
        o.cilindroResidual ?? 'N/A'
      } @ ${o.ejeResidual ?? 'N/A'}`,
    )
  }
  if (r.opciones.length > 0) console.log(`  Opciones leídas: ${r.opciones.length}`)
  if (r.astigmatismoNeto) {
    console.log(
      `  Astigmatismo neto: ${r.astigmatismoNeto.magnitud} D @ ${r.astigmatismoNeto.eje}°`,
    )
  }
  if (r.entradasSegunLaWeb) {
    for (const [k, v] of Object.entries(r.entradasSegunLaWeb)) console.log(`  [web] ${k}: ${v}`)
  }
}

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log('')
console.log(`Guardado en local/live/resultados.json`)
