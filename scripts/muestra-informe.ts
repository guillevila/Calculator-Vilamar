/**
 * muestra-informe.ts — Genera el informe de ejemplo para poder MIRARLO.
 *
 * Existe por una lección de este proyecto: un diseño se verifica mirándolo, no
 * comprobando que los tests pasan en verde. Esto escribe el HTML y, si hay
 * navegador, una captura y el PDF, en `local/muestra/` (fuera del repositorio).
 *
 * Los datos son los del fixture sintético. No son de ninguna persona.
 *
 *   pnpm muestra:informe
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Caso, Procedencia, ResultadoCalculadora } from '@vilamar/domain'
import {
  casoNuevo,
  confirmar,
  confirmarTodas,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
  ojoVacio,
} from '@vilamar/domain'
import { generarHtmlInforme, recopilarInforme } from '@vilamar/report'

const CUANDO = '2026-08-10T10:00:00.000Z'
/**
 * Procedencia de un dato leído del informe.
 *
 * La evidencia se construye por campo: es lo que hace el extractor de verdad
 * —guarda la línea concreta que reconoció— y si aquí se pusiera la misma para
 * todos, la muestra daría una idea equivocada de cómo se ve el informe.
 */
function delInforme(evidencia: string): Procedencia {
  return {
    metodo: 'TEXTO_PDF',
    documentoId: 'doc-1',
    dispositivoId: 'ANTERION',
    confianza: 0.97,
    registradoEn: CUANDO,
    evidencia: { texto: evidencia, pagina: 1 },
  }
}
const A_MANO: Procedencia = { metodo: 'MANUAL', registradoEn: CUANDO }

function construirCaso(): Caso {
  let od = ojoVacio('OD')
  for (const [campo, valor, evidencia] of [
    ['AL', 24.07, 'AL            24.07 mm'],
    ['K1', 41.22, 'K1            41.22 D @ 175'],
    ['K1_EJE', 175, 'K1            41.22 D @ 175'],
    ['K2', 42.52, 'K2            42.52 D @ 85'],
    ['K2_EJE', 85, 'K2            42.52 D @ 85'],
    ['ACD', 3.18, 'ACD (epi)      3.18 mm'],
    ['AQD', 2.65, 'AQD (endo)     2.65 mm'],
    ['LT', 4.53, 'LT             4.53 mm'],
    ['CCT', 530, 'CCT             530 um'],
    ['WTW', 11.9, 'WTW           11.90 mm'],
  ] as const) {
    od = conMedida(od, crearMedida(campo, 'OD', valor, delInforme(evidencia)))
  }
  for (const [campo, valor] of [
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0.3],
    ['EJE_INCISION', 90],
    ['CONSTANTE_A', 119.2],
  ] as const) {
    od = conMedida(od, crearMedida(campo, 'OD', valor, A_MANO))
  }
  od = confirmarTodas(od)

  // El ojo izquierdo va SIN WTW a propósito: así se ve en el informe la
  // sección de datos que faltaban y cómo se bloquea solo quien lo necesita.
  let os = ojoVacio('OS')
  for (const [campo, valor, evidencia] of [
    ['AL', 24.01, 'AL            24.01 mm'],
    ['K1', 40.27, 'K1            40.27 D @ 8'],
    ['K1_EJE', 8, 'K1            40.27 D @ 8'],
    ['K2', 42.68, 'K2            42.68 D @ 98'],
    ['K2_EJE', 98, 'K2            42.68 D @ 98'],
    ['ACD', 3.23, 'ACD (epi)      3.23 mm'],
    ['LT', 4.48, 'LT             4.48 mm'],
    ['CCT', 533, 'CCT             533 um'],
  ] as const) {
    os = conMedida(os, crearMedida(campo, 'OS', valor, delInforme(evidencia)))
  }
  for (const [campo, valor] of [
    ['REFRACCION_OBJETIVO', 0],
    ['SIA', 0.3],
    ['EJE_INCISION', 90],
    ['CONSTANTE_A', 119.2],
  ] as const) {
    os = conMedida(os, crearMedida(campo, 'OS', valor, A_MANO))
  }
  os = confirmarTodas(os)

  let caso: Caso = {
    ...casoNuevo('muestra', 'CV-2026-0042', CUANDO),
    documentos: [
      {
        id: 'doc-1',
        nombre: 'biometria-sintetica.pdf',
        tipo: 'PDF',
        formato: 'pdf',
        tamanoBytes: 245_760,
        paginas: 1,
        cargadoEn: CUANDO,
        ojosDetectados: ['OD', 'OS'],
        dispositivoDetectado: { dispositivo: 'ANTERION', confianza: 0.92, indicios: ['ANTERION'] },
      },
    ],
    lente: { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
  }
  caso = conOjo(caso, od, CUANDO)
  caso = conOjo(caso, os, CUANDO)
  caso = confirmar(caso, CUANDO)

  const evoOd: ResultadoCalculadora = {
    calculadora: 'EVO_TORIC',
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    duracionMs: 8400,
    opciones: [
      { esfera: 21, refraccionPrevista: 0.49, recomendada: false },
      { esfera: 21.5, refraccionPrevista: 0.16, recomendada: true },
      { esfera: 22, refraccionPrevista: -0.16, recomendada: false },
    ],
    recomendada: {
      esfera: 21.5,
      cilindro: 1,
      eje: 81,
      designacion: 'T2',
      refraccionPrevista: 0.16,
      cilindroResidual: -0.06,
      ejeResidual: 81,
      equivalenteDesenfoque: 0.19,
      recomendada: true,
    },
    entradasSegunLaWeb: {
      Parámetros: 'A Constant: 119.2  Toric Model: Alcon SN6ATx  K Index: 1.3375',
      Biometría: 'AL: 24.07  K1: 41.22 @ 175°  K2: 42.52 @ 85°  ACD: 3.18  LT: 4.53  CCT: 530',
      Ojo: 'OD',
    },
  }

  const barrettOd: ResultadoCalculadora = {
    calculadora: 'BARRETT_TORIC',
    ojo: 'OD',
    estado: 'SUCCESS',
    obtenidoEn: CUANDO,
    duracionMs: 21_900,
    opciones: [
      { esfera: 22, designacion: 'SN6AT2', refraccionPrevista: -0.26, recomendada: false },
      {
        esfera: 21.5,
        designacion: 'SN6AT2',
        refraccionPrevista: 0.1,
        cilindro: 1,
        cilindroResidual: 0.03,
        ejeResidual: 81,
        eje: 81,
        recomendada: true,
      },
      { esfera: 21, designacion: 'SN6AT2', refraccionPrevista: 0.45, recomendada: false },
    ],
    recomendada: {
      esfera: 21.5,
      designacion: 'SN6AT2',
      cilindro: 1,
      eje: 81,
      refraccionPrevista: 0.1,
      cilindroResidual: 0.03,
      ejeResidual: 81,
      recomendada: true,
    },
    astigmatismoNeto: { magnitud: 0.72, eje: 81 },
    entradasSegunLaWeb: { 'Astigmatismo neto': '0.72 D @ 81°' },
  }

  // Kane requiere aceptar sus condiciones: así se ve en el informe un fallo real.
  const kaneOd: ResultadoCalculadora = {
    calculadora: 'KANE',
    ojo: 'OD',
    estado: 'NEEDS_USER_ACTION',
    obtenidoEn: CUANDO,
    opciones: [],
    mensaje:
      'Kane sigue esperando a que aceptes sus condiciones de uso. Puedes reintentar solo Kane cuando quieras: el resto de resultados no se pierde.',
  }

  // En el ojo izquierdo falta el WTW: Barrett lo tiene como opcional, así que
  // calcula; se deja para que se vea la sección de datos que faltaban.
  const evoOs: ResultadoCalculadora = {
    ...evoOd,
    ojo: 'OS',
    recomendada: {
      esfera: 21,
      cilindro: 1.5,
      eje: 8,
      designacion: 'T3',
      refraccionPrevista: -0.02,
      cilindroResidual: -0.21,
      ejeResidual: 98,
      recomendada: true,
    },
    opciones: [{ esfera: 21, recomendada: true }],
    entradasSegunLaWeb: { Ojo: 'OS' },
  }

  for (const r of [evoOd, barrettOd, kaneOd, evoOs]) caso = conResultado(caso, r, CUANDO)
  return caso
}

const SALIDA = join(process.cwd(), 'local', 'muestra')
mkdirSync(SALIDA, { recursive: true })

const caso = construirCaso()
const html = generarHtmlInforme(
  recopilarInforme(caso, { version: '0.1.0', generadoEn: new Date().toISOString() }),
)
const ruta = join(SALIDA, 'informe.html')
writeFileSync(ruta, html, 'utf8')
console.log(`✓ HTML escrito en ${ruta} (${(html.length / 1024).toFixed(1)} KB)`)

// Captura y PDF, para poder mirarlo de verdad.
try {
  const { chromium } = await import('playwright')
  const navegador = await chromium.launch()
  const pagina = await navegador.newPage({ viewport: { width: 900, height: 1400 } })
  await pagina.goto(`file://${ruta.replace(/\\/g, '/')}`)
  await pagina.screenshot({ path: join(SALIDA, 'informe.png'), fullPage: true })
  await pagina.pdf({ path: join(SALIDA, 'informe.pdf'), format: 'A4', printBackground: true })
  await navegador.close()
  console.log(`✓ Captura y PDF en ${SALIDA}`)
} catch (error) {
  console.log(`· Sin captura (${error instanceof Error ? error.message : String(error)})`)
}
