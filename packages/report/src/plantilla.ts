/**
 * plantilla.ts — El informe, como HTML.
 *
 * Se genera HTML y lo imprime a PDF el propio Electron (`printToPDF`). Es la
 * decisión más simple que cumple todo: no añade ninguna dependencia, no compila
 * nada nativo —la lección más caneada de este proyecto— y permite maquetar con
 * CSS normal.
 *
 * Esta función es PURA: recibe datos y devuelve una cadena. Por eso se puede
 * probar sin abrir Electron ni generar un PDF.
 *
 * Qué NO sale nunca en este informe: el nombre del paciente, su fecha de
 * nacimiento ni su número de historia. El informe se identifica por el código
 * local del caso. Se puede auditar entrada → calculadora → salida sin saber de
 * quién es el ojo.
 */

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Comparativa,
  Lateralidad,
  Medida,
  OjoBiometrico,
  Aviso,
} from '@vilamar/domain'
import {
  camposPresentes,
  definicionDe,
  describirProcedencia,
  fichaDe,
  formatearConUnidad,
  NOMBRE_DISPOSITIVO,
  nombreLateralidad,
  TEXTO_ORIGEN,
  textoDeOrigen,
  loAportaElCirujano,
  origenDe,
  textoEstado,
} from '@vilamar/domain'

export interface DatosInforme {
  readonly caso: Caso
  readonly version: string
  readonly generadoEn: string
  readonly comparativas: readonly Comparativa[]
  readonly avisos: readonly Aviso[]
  /** Campos que cada calculadora necesitaba y no había. */
  readonly ausenciasRelevantes: readonly {
    readonly calculadora: Calculadora
    readonly ojo: Lateralidad
    readonly campos: readonly CampoBiometrico[]
  }[]
}

/** Escapa el texto para que nada de lo que venga de fuera pueda inyectar HTML. */
export function esc(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}

/**
 * De dónde salió el dato, con el mismo vocabulario que la pantalla de revisión.
 *
 * Que el informe y la pantalla digan lo mismo no es cosmética: quien lee el PDF
 * meses después tiene que poder reconocer lo que vio al revisar. Tres palabras
 * distintas para lo mismo obligan a traducir mentalmente, y ahí es donde se
 * cuelan los malentendidos.
 */
function etiquetaOrigen(medida: Medida): string {
  const origen = origenDe(medida)
  const clase =
    origen === 'CORREGIDO'
      ? 'marca-corregido'
      : origen === 'APORTADO'
        ? 'marca-manual'
        : // Un dato derivado NO se pinta como uno leído. Meses después, quien
          // audite este PDF tiene que poder distinguir de un vistazo lo que
          // ponía el informe de lo que calculó el programa.
          origen === 'DERIVADO_DEL_INFORME'
          ? 'marca-derivado'
          : 'marca-extraido'
  return `<span class="marca ${clase}">${esc(TEXTO_ORIGEN[origen as Exclude<typeof origen, 'NO_CONSTA'>])}</span>`
}

function filaMedida(ojo: OjoBiometrico, campo: CampoBiometrico): string {
  const def = definicionDe(campo)
  const medida = ojo.medidas[campo]
  if (!medida) {
    // Sin valor, el texto dice de quién se esperaba el dato. «NO ENCONTRADO» a
    // secas hacía parecer un fallo de lectura un campo que el informe
    // sencillamente no trae, o que decide el cirujano.
    return `<tr class="ausente">
      <td>${esc(def.etiqueta)}</td>
      <td class="valor">${esc(textoDeOrigen('NO_CONSTA', loAportaElCirujano(campo)))}</td>
      <td>—</td>
      <td>—</td>
    </tr>`
  }
  // Un dato corregido enseña las dos cosas: lo que se usó y lo que ponía. Sin
  // eso, el informe diría «escrito a mano» sin poder explicar frente a qué, y no
  // se podría auditar si la corrección fue un arreglo o un desliz.
  const original = medida.original
    ? `<br><span class="original">Leído originalmente: ${esc(
        formatearConUnidad(campo, medida.original.valor),
      )}</span>${
        medida.original.procedencia.evidencia
          ? `<br><span class="evidencia">«${esc(medida.original.procedencia.evidencia.texto)}»</span>`
          : ''
      }`
    : ''
  return `<tr>
    <td>${esc(def.etiqueta)}</td>
    <td class="valor">${esc(formatearConUnidad(campo, medida.valor))}</td>
    <td>${etiquetaOrigen(medida)}</td>
    <td class="procedencia">${esc(describirProcedencia(medida.procedencia))}${
      medida.procedencia.evidencia
        ? `<br><span class="evidencia">«${esc(medida.procedencia.evidencia.texto)}»</span>`
        : ''
    }${original}</td>
  </tr>`
}

function seccionEntradas(caso: Caso, ojo: OjoBiometrico): string {
  const presentes = camposPresentes(ojo)
  // Se enseñan los campos que hay, agrupados, y no todo el catálogo: un informe
  // con 24 filas de «NO ENCONTRADO» no ayuda a nadie.
  const orden: CampoBiometrico[] = [
    'AL',
    'K1',
    'K1_EJE',
    'K2',
    'K2_EJE',
    'TK1',
    'TK1_EJE',
    'TK2',
    'TK2_EJE',
    'ACD',
    'AQD',
    'LT',
    'CCT',
    'WTW',
    'PK1',
    'PK1_EJE',
    'PK2',
    'PK2_EJE',
    'REFRACCION_OBJETIVO',
    'SIA',
    'EJE_INCISION',
    'CONSTANTE_A',
    'FACTOR_LENTE',
    'INDICE_QUERATOMETRICO',
  ]
  const aEnseñar = orden.filter((c) => presentes.includes(c))

  const documento = caso.documentos.find(
    (d) => d.id === ojo.medidas[aEnseñar[0] as CampoBiometrico]?.procedencia.documentoId,
  )
  const dispositivo = documento?.dispositivoDetectado?.dispositivo

  return `<section class="ojo">
    <h2>${esc(nombreLateralidad(ojo.lateralidad))}</h2>
    <p class="fuente">
      ${dispositivo ? `Informe detectado: <strong>${esc(NOMBRE_DISPOSITIVO[dispositivo])}</strong>` : 'Aparato no reconocido'}
      ${documento ? ` · fichero <code>${esc(documento.nombre)}</code>` : ''}
    </p>
    <table class="datos">
      <thead>
        <tr><th>Dato</th><th>Valor confirmado</th><th>Origen</th><th>Detalle</th></tr>
      </thead>
      <tbody>
        ${aEnseñar.map((c) => filaMedida(ojo, c)).join('\n')}
      </tbody>
    </table>
  </section>`
}

function celda(valor: number | undefined, sufijo = ''): string {
  if (valor === undefined) return '<td class="na">N/A</td>'
  return `<td>${esc(valor.toFixed(2))}${sufijo}</td>`
}

function celdaEje(valor: number | undefined): string {
  if (valor === undefined) return '<td class="na">N/A</td>'
  return `<td>${esc(valor.toFixed(0))}°</td>`
}

function tablaComparativa(c: Comparativa): string {
  const cols = c.celdas
  return `<section class="comparativa">
    <h2>Comparación · ${esc(nombreLateralidad(c.ojo))}</h2>
    <table class="tabla-comparativa">
      <thead>
        <tr><th></th>${cols.map((x) => `<th>${esc(x.nombre)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        <tr><th>Esfera de la lente</th>${cols.map((x) => celda(x.esfera, ' D')).join('')}</tr>
        <tr><th>Cilindro</th>${cols.map((x) => celda(x.cilindro, ' D')).join('')}</tr>
        <tr><th>Eje de la lente</th>${cols.map((x) => celdaEje(x.eje)).join('')}</tr>
        <tr><th>Modelo tórico</th>${cols
          .map((x) =>
            x.designacion ? `<td>${esc(x.designacion)}</td>` : '<td class="na">N/A</td>',
          )
          .join('')}</tr>
        <tr><th>Refracción prevista</th>${cols.map((x) => celda(x.refraccionPrevista, ' D')).join('')}</tr>
        <tr><th>Cilindro residual</th>${cols.map((x) => celda(x.cilindroResidual, ' D')).join('')}</tr>
        <tr><th>Eje residual</th>${cols.map((x) => celdaEje(x.ejeResidual)).join('')}</tr>
        <tr class="fila-estado"><th>Estado</th>${cols
          .map((x) => `<td>${esc(textoEstado(x.estado))}</td>`)
          .join('')}</tr>
      </tbody>
    </table>

    ${observaciones(c)}
  </section>`
}

function observaciones(c: Comparativa): string {
  const grupos: { titulo: string; tipos: Comparativa['observaciones'][number]['tipo'][] }[] = [
    { titulo: 'Concordancias', tipos: ['CONCORDANCIA'] },
    { titulo: 'Discrepancias', tipos: ['DISCREPANCIA'] },
    { titulo: 'Avisos y lo que no se pudo ejecutar', tipos: ['AVISO', 'FALLO'] },
  ]
  return grupos
    .map((g) => {
      const items = c.observaciones.filter((o) => g.tipos.includes(o.tipo))
      if (items.length === 0) return ''
      return `<div class="observaciones obs-${esc(g.tipos[0]?.toLowerCase())}">
        <h3>${esc(g.titulo)}</h3>
        <ul>${items.map((o) => `<li>${esc(o.texto)}</li>`).join('')}</ul>
      </div>`
    })
    .join('')
}

function seccionAuditoria(caso: Caso): string {
  const filas: string[] = []
  for (const [clave, r] of Object.entries(caso.resultados)) {
    const eco = r.entradasSegunLaWeb
    if (!eco || Object.keys(eco).length === 0) continue
    filas.push(`<tr>
      <td>${esc(fichaDe(r.calculadora).nombre)}</td>
      <td>${esc(r.ojo)}</td>
      <td class="eco">${Object.entries(eco)
        .map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`)
        .join('<br>')}</td>
    </tr>`)
    void clave
  }
  if (filas.length === 0) return ''
  return `<section class="auditoria">
    <h2>Qué dice cada calculadora haber recibido</h2>
    <p class="nota">
      Esto no es lo que Calculator Vilamar cree haber enviado: es lo que cada web
      ha mostrado en su propia pantalla como datos de entrada. Permite comprobar
      que entrada y resultado se corresponden.
    </p>
    <table class="datos"><thead><tr><th>Calculadora</th><th>Ojo</th><th>Entradas según la web</th></tr></thead>
    <tbody>${filas.join('')}</tbody></table>
  </section>`
}

function seccionAusencias(datos: DatosInforme): string {
  if (datos.ausenciasRelevantes.length === 0) return ''
  return `<section class="ausencias">
    <h2>Datos que faltaban</h2>
    <ul>
      ${datos.ausenciasRelevantes
        .map(
          (a) =>
            `<li><strong>${esc(fichaDe(a.calculadora).nombre)}</strong> (${esc(a.ojo)}): ${a.campos
              .map((c) => esc(definicionDe(c).etiqueta))
              .join(', ')}</li>`,
        )
        .join('')}
    </ul>
  </section>`
}

function seccionAvisos(avisos: readonly Aviso[]): string {
  const relevantes = avisos.filter((a) => a.nivel === 'INVALID' || a.nivel === 'WARNING')
  if (relevantes.length === 0) return ''
  return `<section class="avisos">
    <h2>Advertencias sobre los datos</h2>
    <ul>
      ${relevantes
        .map(
          (a) =>
            `<li class="nivel-${esc(a.nivel.toLowerCase())}"><strong>${esc(a.ojo)}</strong> · ${esc(a.mensaje)}</li>`,
        )
        .join('')}
    </ul>
  </section>`
}

const ESTILOS = `
  :root {
    --azul: #153F74;
    --gris: #6F6F6F;
    --linea: #DDE3EA;
    --fondo-suave: #F5F7FA;
    --rojo: #A32B2B;
    --ambar: #8A6100;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 10.5pt;
    color: #1B1B1B;
    line-height: 1.45;
  }
  header.principal {
    border-bottom: 3px solid var(--azul);
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  header.principal h1 {
    margin: 0;
    font-size: 17pt;
    color: var(--azul);
    letter-spacing: -0.2px;
  }
  .meta { color: var(--gris); font-size: 9pt; margin-top: 4px; }
  .meta strong { color: #1B1B1B; }
  h2 {
    font-size: 12pt;
    color: var(--azul);
    margin: 20px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--linea);
  }
  h3 { font-size: 10pt; margin: 10px 0 4px; color: var(--azul); }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td {
    text-align: left;
    padding: 5px 7px;
    border-bottom: 1px solid var(--linea);
    vertical-align: top;
  }
  thead th {
    background: var(--fondo-suave);
    color: var(--azul);
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  td.valor { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  tr.ausente td.valor { color: var(--ambar); font-weight: 600; }
  td.na { color: var(--gris); }
  .procedencia { color: var(--gris); font-size: 8.5pt; }
  .evidencia { font-family: Consolas, monospace; font-size: 8pt; color: var(--gris); }
  .marca {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 9px;
    font-size: 8pt;
    white-space: nowrap;
  }
  .marca-extraido { background: #E8F0F8; color: var(--azul); }
  .marca-corregido{background:#fde8cf;color:#8a4b00}
    .original{color:#6f6f6f;font-style:italic}
    .marca-manual { background: #FFF3D6; color: var(--ambar); }
  .marca-derivado { background: #EFE8F8; color: #5B3B8A; }
  .fuente { color: var(--gris); font-size: 9pt; margin: 0 0 8px; }
  code { font-family: Consolas, monospace; font-size: 8.5pt; }
  .tabla-comparativa td, .tabla-comparativa th { font-variant-numeric: tabular-nums; }
  .tabla-comparativa tbody th { width: 30%; font-weight: 600; color: #333; }
  .fila-estado td { font-size: 8.5pt; color: var(--gris); }
  .observaciones ul { margin: 4px 0 8px; padding-left: 18px; }
  .observaciones li { margin-bottom: 2px; }
  .obs-discrepancia h3 { color: var(--ambar); }
  .obs-aviso h3, .obs-fallo h3 { color: var(--rojo); }
  .nivel-invalid { color: var(--rojo); }
  .nivel-warning { color: var(--ambar); }
  .nota { color: var(--gris); font-size: 8.5pt; margin: 0 0 8px; }
  .eco { font-size: 8.5pt; color: #333; }
  footer.principal {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid var(--linea);
    color: var(--gris);
    font-size: 8.5pt;
  }
  footer.principal strong { color: #1B1B1B; }
  section { page-break-inside: avoid; }
`

/**
 * Genera el HTML del informe.
 *
 * El aviso del pie no es un adorno legal: es la frase que evita que este
 * documento se lea como una recomendación de Calculator Vilamar. Los números
 * son de Kane, EVO y Barrett; aquí solo se han puesto juntos.
 */
export function generarHtmlInforme(datos: DatosInforme): string {
  const { caso, comparativas } = datos
  const ojos = (['OD', 'OS'] as const)
    .map((l) => caso.ojos[l])
    .filter((o): o is OjoBiometrico => o !== undefined)

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Calculator Vilamar · ${esc(caso.codigo)}</title>
<style>${ESTILOS}</style>
</head>
<body>

<header class="principal">
  <h1>Calculator Vilamar</h1>
  <div class="meta">
    Versión <strong>${esc(datos.version)}</strong> ·
    generado el <strong>${esc(fecha(datos.generadoEn))}</strong> ·
    caso <strong>${esc(caso.codigo)}</strong>
    ${caso.lente?.modelo ? ` · lente <strong>${esc(caso.lente.modelo)}</strong>` : ''}
  </div>
</header>

<h2>Datos confirmados</h2>
<p class="nota">
  Todos los datos de esta sección los ha revisado y confirmado una persona antes
  de enviarse. Se indica de dónde salió cada uno.
</p>
${ojos.map((o) => seccionEntradas(caso, o)).join('\n')}

${seccionAvisos(datos.avisos)}

${comparativas.map((c) => tablaComparativa(c)).join('\n')}

${seccionAusencias(datos)}

${seccionAuditoria(caso)}

<footer class="principal">
  <p>
    <strong>Los resultados de este informe proceden de las calculadoras externas
    Kane (iolformula.com), EVO Toric (evoiolcalculator.com) y Barrett Toric
    (ASCRS / APACRS).</strong>
    Calculator Vilamar no calcula potencias de lente: rellena esas calculadoras
    con los datos confirmados, recoge lo que devuelven y lo presenta junto.
  </p>
  <p>
    Las comparaciones de este documento son descriptivas. Calculator Vilamar no
    emite ninguna recomendación clínica y no sustituye el criterio del cirujano.
  </p>
  <p>
    Documento generado en local. No contiene el nombre, la fecha de nacimiento ni
    el número de historia de ninguna persona: el caso se identifica por su código
    local <strong>${esc(caso.codigo)}</strong>.
  </p>
</footer>

</body>
</html>`
}
