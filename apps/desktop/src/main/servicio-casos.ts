/**
 * servicio-casos.ts — El cerebro del proceso principal.
 *
 * Mantiene el caso en curso, lo guarda en disco a cada cambio y coordina las
 * tres piezas: leer documentos, hablar con las calculadoras y sacar el PDF.
 *
 * Todo lo que decide «qué se puede hacer» está en el dominio; aquí solo se
 * orquesta. En particular, este servicio no puede saltarse la confirmación:
 * llama a `prepararEntradas` como todo el mundo.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Dispositivo,
  Doctor,
  Lateralidad,
  OjoBiometrico,
  Aviso,
  RangoFechas,
  ResultadoCalculadora,
  ResumenDashboard,
  Sexo,
  SituacionCornealEspecial,
} from '@vilamar/domain'
import {
  APARATO_PRINCIPAL,
  aparatosDe,
  calcularResumenDashboard,
  CARPETA_IMPORTADAS,
  casosCalculadosDeDoctor,
  COLUMNAS_COMPARATIVA,
  datasetsDe,
  detectarDiscrepancias,
  casoNuevo as crearCasoNuevo,
  confirmar,
  confirmarMedida,
  confirmarTodas,
  conAparatoCaraPosterior,
  conAparatoRenombrado,
  conSituacionCorneal,
  conMedida,
  conOjo,
  conResultado,
  corregirMedida,
  crearMedida,
  aportarSexo,
  confirmarSexo as confirmarSexoDelDominio,
  criterioEsferaPara,
  deducirSexoDelNombre,
  describirLente,
  ejeCurvoDe,
  elegirLente as elegirLenteDelDominio,
  elegirLenteSecundaria as elegirLenteSecundariaDelDominio,
  estimarLenteRecomendada,
  intercambiarLentes as intercambiarLentesDelDominio,
  fichaDe,
  sexoDeducidoDelNombre,
  sexoDelInforme,
  sexoPorDefecto,
  formatoDeNombre,
  necesitaComprobacionHumana,
  nombreLateralidad,
  NOMBRE_DISPOSITIVO,
  ojoDe,
  ojosDelCaso,
  resultadoDe,
  sinMedida,
  sinRepetidas,
  tiene,
  validarOjo,
} from '@vilamar/domain'
import type { DocumentoEntrada, LectorVision, ProveedorExtraccion } from '@vilamar/extraction'
import { extraerDocumento } from '@vilamar/extraction'
import type { EventoProgreso } from '@vilamar/integrations'
import type { TareaCalculo } from '@vilamar/integrations'
import {
  ejecutarCaso,
  necesitaVentana,
  planificarCaso,
  tareasPendientes,
} from '@vilamar/integrations'
import type { ResultadoInforme } from '@vilamar/report'
import { generarHtmlInforme, recopilarInforme } from '@vilamar/report'
import type { Browser } from 'playwright'

import type {
  ArchivoEntrante,
  EstadoCalculo,
  ResumenCasoGuardado,
  ResumenExtraccion,
} from '../compartido/ipc.js'
import type { Carpetas } from './almacen.js'
import {
  guardarCaso,
  guardarDocumento,
  guardarDoctoresExcluidos,
  leerCaso as leerCasoDelAlmacen,
  leerCarpetaEntrada,
  leerDoctoresExcluidos,
  listarCasos as listarCasosDelAlmacen,
  moverCasoABorrados,
  nuevoId,
  siguienteCodigo,
} from './almacen.js'
import type { AlmacenCapturas } from './capturas.js'
import type { Diagnosticador } from './diagnostico.js'

export interface DependenciasServicio {
  readonly carpetas: Carpetas
  readonly proveedor: ProveedorExtraccion
  /**
   * Lector de visión, si lo hay.
   *
   * Opcional porque manda el documento fuera del ordenador. Sin él, la
   * aplicación funciona exactamente como antes.
   */
  readonly lectorVision?: LectorVision | undefined
  readonly diagnosticador: Diagnosticador
  readonly capturas: AlmacenCapturas
  readonly version: string
  readonly ahora: () => Date
  /** Abre el navegador para las calculadoras. Se inyecta para poder probarlo. */
  readonly abrirNavegador: (conVentana: boolean) => Promise<Browser>
  /** Convierte HTML en PDF. Lo hace Electron; se inyecta para poder probarlo. */
  readonly imprimirPdf: (html: string, destino: string) => Promise<void>
  /** Avisos hacia la interfaz. */
  readonly emitirProgreso: (estado: EstadoCalculo) => void
  readonly emitirCaso: (caso: Caso) => void
}

/** La primera línea de un error. Playwright los trae con traza; no ayuda enseñarla. */
function primeraLinea(texto: string): string {
  return texto.split(String.fromCharCode(10))[0] ?? texto
}

/**
 * Un nombre (de paciente, o de doctor — D87, 17/09/2026) convertido en un
 * nombre de carpeta seguro para Windows (petición expresa del dueño,
 * 06/09/2026: un informe por paciente, con sus dos ojos dentro, en vez de
 * todos los pacientes compartiendo la misma carpeta «Ojo derecho»/«Ojo
 * izquierdo»).
 *
 * Quita los caracteres que Windows no admite en un nombre de carpeta
 * (`< > : " / \ | ? *`), los espacios y puntos sueltos al final —Windows
 * tampoco los admite ahí—, y se queda con `sinNombre` si el nombre queda
 * vacío después de limpiarlo (para el paciente, esto no debería darse
 * nunca en la práctica — D61 exige su nombre para poder confirmar un
 * caso —, es una red de seguridad; para el doctor sí es el camino normal
 * cuando no se ha escrito ninguno, ver `NOMBRE_CARPETA_SIN_DOCTOR`).
 */
function nombreDeCarpeta(nombre: string | undefined, sinNombre: string): string {
  const caracteresProhibidos = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
  let limpio = nombre ?? ''
  for (const c of caracteresProhibidos) limpio = limpio.split(c).join(' ')
  limpio = limpio.replace(/\s+/g, ' ').trim()
  while (limpio.endsWith('.') || limpio.endsWith(' ')) limpio = limpio.slice(0, -1)
  return limpio === '' ? sinNombre : limpio
}

/** Cuando el caso no tiene doctor asignado (D87) — mismo texto que ya usa el dashboard para «Sin doctor» (D82). */
const NOMBRE_CARPETA_SIN_DOCTOR = 'Sin doctor'

/**
 * Si `ruta` vive dentro de «Importadas», de la carpeta de entrada
 * configurada (D84/D86), devuelve la propia ruta; si no —un fichero
 * elegido a mano desde cualquier otro sitio del disco, o si no hay
 * carpeta de entrada configurada— devuelve `undefined` (D89, 17/09/2026).
 *
 * Es la comprobación que permite, más tarde, borrar SOLO la copia que el
 * propio programa archivó ahí, nunca un fichero que no es nuestro.
 */
function rutaEnImportadas(carpetas: Carpetas, ruta: string | undefined): string | undefined {
  if (!ruta) return undefined
  const raizEntrada = leerCarpetaEntrada(carpetas)
  if (!raizEntrada) return undefined
  const importadas = join(raizEntrada, CARPETA_IMPORTADAS)
  const rel = relative(importadas, ruta)
  const dentro = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  return dentro ? ruta : undefined
}

/**
 * Junta los campos de dos lecturas del MISMO dataset (D88, 17/09/2026):
 * dos fotos de un mismo ojo, cargadas juntas en la misma llamada a
 * `cargarDocumentos` —una subcarpeta de la carpeta de entrada (D86), o
 * varios ficheros elegidos a la vez— Y con el MISMO dispositivo
 * RECONOCIDO, son fragmentos del MISMO examen, no biómetros distintos.
 * Solo se llama en ese caso concreto —nunca si el dispositivo no se ha
 * podido reconocer, ver `nombreAparatoLibreParaDesconocido`— para no
 * fusionar dos biómetros de verdad distintos que el programa simplemente
 * no supo nombrar. Un campo que ya tenía valor no se pisa —dos fotos del
 * mismo campo no dicen cuál es la buena, así que se avisa y se conserva el
 * primero, igual que el resto del programa nunca pisa un dato en
 * silencio.
 */
/**
 * Un nombre libre para el dataset de un documento cuyo aparato NO se ha
 * podido reconocer, cuando ya hay otro dataset en ese ojo (D88 corregido,
 * 17/09/2026: petición expresa del dueño del proyecto).
 *
 * Un informe no reconocido nunca se fusiona con lo que ya había —a
 * diferencia de uno reconocido con el mismo dispositivo (ver
 * `fusionarMedidas`)—, porque no hay ninguna base para asumir que es el
 * mismo examen: podrían ser perfectamente dos biómetros distintos que el
 * programa simplemente no sabe nombrar. Se etiqueta «Otro» —o «Otro (2)»,
 * «Otro (3)»… si ya había uno— para que la persona lo renombre a mano con
 * el aparato real, igual que hace con el que empieza como «Principal».
 */
function nombreAparatoLibreParaDesconocido(previos: readonly OjoBiometrico[]): string {
  const base = 'Otro'
  if (!previos.some((o) => o.aparato === base)) return base
  let n = 2
  while (previos.some((o) => o.aparato === `${base} (${n})`)) n++
  return `${base} (${n})`
}

function fusionarMedidas(
  existente: OjoBiometrico,
  leido: OjoBiometrico,
  nombreArchivo: string,
): { readonly fusionado: OjoBiometrico; readonly avisos: readonly string[] } {
  const avisos: string[] = []
  const medidas = { ...existente.medidas }
  for (const [campo, medida] of Object.entries(leido.medidas)) {
    if (!medida) continue
    const clave = campo as CampoBiometrico
    if (medidas[clave] !== undefined) {
      avisos.push(
        `«${nombreArchivo}» también trae ${campo} para el ${existente.lateralidad}; se ha mantenido el valor de la foto anterior.`,
      )
      continue
    }
    medidas[clave] = medida
  }
  return { fusionado: { ...existente, medidas }, avisos }
}

export class ServicioCasos {
  private caso: Caso | null = null
  private cancelar = false

  constructor(private readonly dep: DependenciasServicio) {}

  /**
   * Lee un documento con el mejor lector que haya configurado.
   *
   * Si hay lector de visión se usa ese, porque entiende el documento en vez de
   * adivinar letras. Si falla —sin internet, clave caducada, cuenta sin saldo—
   * **no se pierde el documento**: se lee en local y se dice qué ha pasado.
   * Dejar a alguien sin poder leer su informe porque una API está caída sería
   * un mal cambio.
   */
  private async leerDocumento(
    entrada: DocumentoEntrada,
  ): Promise<Awaited<ReturnType<typeof extraerDocumento>>> {
    const vision = this.dep.lectorVision
    if (!vision?.disponible()) {
      return extraerDocumento(entrada, this.dep.proveedor, { ahora: () => this.iso() })
    }
    try {
      return await vision.leer(entrada)
    } catch (error) {
      const local = await extraerDocumento(entrada, this.dep.proveedor, {
        ahora: () => this.iso(),
      })
      return {
        ...local,
        avisos: [
          `No se ha podido usar ${vision.nombre} para leer este informe: ${
            error instanceof Error ? error.message : String(error)
          }. Se ha leído en local, que se equivoca más — revisa cada dato con especial cuidado.`,
          ...local.avisos,
        ],
      }
    }
  }

  private iso(): string {
    return this.dep.ahora().toISOString()
  }

  private establecer(caso: Caso): Caso {
    this.caso = caso
    guardarCaso(this.dep.carpetas, caso)
    this.dep.emitirCaso(caso)
    return caso
  }

  /** El caso en curso, o error si no hay. Evita repetir la comprobación. */
  private exigirCaso(): Caso {
    if (!this.caso) throw new Error('No hay ningún cálculo abierto.')
    return this.caso
  }

  obtener(): Caso | null {
    return this.caso
  }

  nuevo(): Caso {
    const ahora = this.dep.ahora()
    const codigo = siguienteCodigo(this.dep.carpetas, ahora)
    const cuando = ahora.toISOString()
    // Sexo con un valor de partida (D68, 03/09/2026): así un caso no se queda
    // bloqueado si se olvida marcarlo. `conDatosDePaciente` lo sustituye en
    // cuanto un documento trae el dato real o se puede deducir del nombre.
    return this.establecer({
      ...crearCasoNuevo(nuevoId(), codigo, cuando),
      sexo: sexoPorDefecto(cuando),
    })
  }

  /**
   * Los casos ya guardados, más recientes primero — para volver a abrir uno
   * (02/09/2026, petición expresa del dueño del proyecto: no había ninguna
   * forma de recuperar un caso una vez cerrada la aplicación, solo «el que
   * está abierto ahora mismo»).
   *
   * Lee cada fichero entero para sacar estos cuatro campos porque no hay
   * ningún índice aparte que mantener sincronizado — con los casos de un
   * único cirujano esto es instantáneo, y si algún fichero está dañado o a
   * medio escribir, se descarta sin tirar la lista entera.
   */
  listarCasosGuardados(): readonly ResumenCasoGuardado[] {
    return listarCasosDelAlmacen(this.dep.carpetas)
      .map((codigo) => leerCasoDelAlmacen(this.dep.carpetas, codigo))
      .filter((c): c is Caso => c !== null)
      .map((c) => ({
        codigo: c.codigo,
        estado: c.estado,
        actualizadoEn: c.actualizadoEn,
        ...(c.nombrePaciente ? { nombrePaciente: c.nombrePaciente } : {}),
      }))
  }

  /**
   * Cuántas lentes se han calculado, por doctor y por modelo (D82,
   * 15/09/2026). No hay nada nuevo que leer: el doctor y la lente ya viven
   * dentro de cada caso guardado, en el mismo sitio que el resto de sus
   * datos — esto solo recorre `casos/` y cuenta, igual que
   * `listarCasosGuardados()`.
   *
   * @param rango Filtra por fecha (D83, 16/09/2026) — sin él, el total de
   *   siempre. Los doctores excluidos (ver `excluirDoctorDeEstadisticas`)
   *   se aplican siempre, con o sin rango.
   */
  resumenDashboard(rango?: RangoFechas): ResumenDashboard {
    const casos = listarCasosDelAlmacen(this.dep.carpetas)
      .map((codigo) => leerCasoDelAlmacen(this.dep.carpetas, codigo))
      .filter((c): c is Caso => c !== null)
    return calcularResumenDashboard(casos, {
      ...(rango ? { rango } : {}),
      doctoresExcluidos: leerDoctoresExcluidos(this.dep.carpetas),
    })
  }

  /** Doctores cuyos casos no cuentan en el dashboard (D83, 16/09/2026). */
  listarDoctoresExcluidos(): readonly string[] {
    return leerDoctoresExcluidos(this.dep.carpetas)
  }

  /**
   * Un caso de prueba, o metido por error, no tiene por qué borrarse para
   * dejar de contar en las estadísticas: basta con excluir su doctor.
   * Nunca toca ningún `Caso` real — es puramente un filtro del dashboard.
   */
  excluirDoctorDeEstadisticas(nombre: string): readonly string[] {
    const limpio = nombre.trim()
    if (limpio === '') return this.listarDoctoresExcluidos()
    const actuales = leerDoctoresExcluidos(this.dep.carpetas)
    if (actuales.some((n) => n.toLowerCase() === limpio.toLowerCase())) return actuales
    const siguientes = [...actuales, limpio]
    guardarDoctoresExcluidos(this.dep.carpetas, siguientes)
    return siguientes
  }

  /** Deshace una exclusión — sus casos vuelven a contar. */
  incluirDoctorEnEstadisticas(nombre: string): readonly string[] {
    const siguientes = leerDoctoresExcluidos(this.dep.carpetas).filter(
      (n) => n.toLowerCase() !== nombre.trim().toLowerCase(),
    )
    guardarDoctoresExcluidos(this.dep.carpetas, siguientes)
    return siguientes
  }

  /**
   * Elimina del dashboard, de verdad, los casos «lente calculada» de un
   * doctor (D85, 16/09/2026) — no solo excluirlos de las estadísticas
   * (`excluirDoctorDeEstadisticas`), sino sacarlos de `casos/`. Son
   * exactamente los mismos casos que forman su barra ahora mismo —el
   * mismo `rango` que se esté mirando, si hay uno—, nunca más: lo que se
   * ve es lo que se borra.
   *
   * **No los borra para siempre.** Los mueve a `casos-borrados/<día>/`,
   * igual que se hizo a mano la primera vez que hizo falta esto — un
   * caso de un paciente real no desaparece sin dejar ni rastro por un
   * clic. La confirmación de verdad («¿seguro?») la pide la interfaz
   * antes de llamar aquí.
   *
   * Si el caso que se está editando ahora mismo es uno de los
   * eliminados, se queda en memoria tal cual estaba — no se cierra solo.
   */
  eliminarCasosDeDoctor(nombre: string, rango?: RangoFechas): number {
    const casos = listarCasosDelAlmacen(this.dep.carpetas)
      .map((codigo) => leerCasoDelAlmacen(this.dep.carpetas, codigo))
      .filter((c): c is Caso => c !== null)
    const aEliminar = casosCalculadosDeDoctor(casos, nombre, rango ? { rango } : {})
    const dia = this.iso().slice(0, 10)
    for (const caso of aEliminar) {
      moverCasoABorrados(this.dep.carpetas, caso.codigo, dia)
    }
    return aEliminar.length
  }

  /** Vuelve a abrir un caso guardado, tal y como se dejó. */
  abrirCaso(codigo: string): Caso {
    const caso = leerCasoDelAlmacen(this.dep.carpetas, codigo)
    if (!caso) {
      throw new Error(`No se ha encontrado el caso ${codigo}. Puede que se haya movido o borrado.`)
    }
    return this.establecer(caso)
  }

  // ── Documentos ───────────────────────────────────────────────────────────

  /**
   * Carga documentos y los lee.
   *
   * Dos fotos de un mismo ojo cargadas EN LA MISMA LLAMADA (D88,
   * 17/09/2026: varias fotos de un paciente, juntas en una subcarpeta de la
   * carpeta de entrada —D86— o elegidas a la vez con «Elegir archivo»),
   * CON EL MISMO DISPOSITIVO RECONOCIDO, se entienden como fragmentos del
   * mismo examen y se FUSIONAN en un solo dataset — no se pisan entre sí,
   * se completan: lo que trae una y no la otra se suma; un mismo campo
   * repetido conserva el de la primera foto, con aviso.
   *
   * Con un dispositivo RECONOCIDO distinto, o con cualquiera de los dos
   * SIN reconocer, no se fusiona nunca —corregido el mismo día, a
   * petición expresa del dueño del proyecto: no hay ninguna base para
   * asumir que dos fotos que el programa no sabe identificar son el mismo
   * examen, bien podrían ser dos biómetros de verdad distintos— y cada
   * una se queda como su propio aparato, igual que si hubieran llegado en
   * llamadas separadas (D47): si dos informes traen el mismo ojo, el
   * segundo no pisa al primero en silencio — se avisa y los dos conviven,
   * distinguibles.
   */
  async cargarDocumentos(
    archivos: readonly ArchivoEntrante[],
  ): Promise<{ caso: Caso; resumenes: readonly ResumenExtraccion[] }> {
    let caso = this.caso ?? this.nuevo()
    const resumenes: ResumenExtraccion[] = []
    // Qué dataset ha creado, en ESTE ojo, un documento anterior DE ESTE
    // MISMO LOTE, y con qué dispositivo se detectó — para decidir si el
    // siguiente documento del mismo ojo se fusiona con él (mismo
    // dispositivo: son fragmentos del mismo examen) o crea uno aparte
    // (dispositivo distinto: son de verdad dos biómetros, aunque hayan
    // llegado juntos en la misma selección de ficheros).
    const datasetDeEsteLote: Partial<
      Record<Lateralidad, { aparato: string; dispositivo: Dispositivo }>
    > = {}

    for (const archivo of archivos) {
      // Si viene la ruta, se lee del disco aquí —una sola vez, y sin copiar
      // nada por IPC—. Si viene el contenido, se usa: es el caso de un fichero
      // arrastrado, cuando Electron no da la ruta.
      //
      // Y en los dos casos se comprueba que hay ALGO. Un fichero vacío se dice
      // ahora, no cuatro pasos más adelante disfrazado de «no se puede
      // decodificar la imagen».
      let datos: Uint8Array
      let tamanoBytes: number
      try {
        if (archivo.ruta) {
          datos = new Uint8Array(readFileSync(archivo.ruta))
          tamanoBytes = statSync(archivo.ruta).size
        } else if (archivo.datos) {
          datos = archivo.datos
          tamanoBytes = archivo.datos.length
        } else {
          throw new Error('no se ha recibido ni la ruta ni el contenido del archivo')
        }
      } catch (error) {
        resumenes.push({
          documentoId: '',
          nombreArchivo: archivo.nombre,
          dispositivo: 'DESCONOCIDO',
          nombreDispositivo: 'No se ha podido abrir',
          confianzaDispositivo: 0,
          explicacionOjos: '',
          ojosEncontrados: [],
          avisos: [
            `No se ha podido abrir «${archivo.nombre}». ${error instanceof Error ? error.message : String(error)}`,
          ],
        })
        continue
      }

      if (datos.length === 0) {
        resumenes.push({
          documentoId: '',
          nombreArchivo: archivo.nombre,
          dispositivo: 'DESCONOCIDO',
          nombreDispositivo: 'Archivo vacío',
          confianzaDispositivo: 0,
          explicacionOjos: '',
          ojosEncontrados: [],
          avisos: [
            `«${archivo.nombre}» está vacío: tiene 0 bytes. El archivo original no tiene contenido — ` +
              'ábrelo para comprobarlo y vuelve a guardarlo, o escribe los datos a mano.',
          ],
        })
        continue
      }

      const formato = formatoDeNombre(archivo.nombre)
      if (!formato) {
        resumenes.push({
          documentoId: '',
          nombreArchivo: archivo.nombre,
          dispositivo: 'DESCONOCIDO',
          nombreDispositivo: 'Formato no admitido',
          confianzaDispositivo: 0,
          explicacionOjos: '',
          ojosEncontrados: [],
          avisos: [
            `«${archivo.nombre}» no es un formato que se pueda leer. Admite PDF, JPG y PNG.`,
          ],
        })
        continue
      }

      const guardado = guardarDocumento(this.dep.carpetas, archivo.nombre, datos)
      const entrada: DocumentoEntrada = {
        id: guardado.id,
        nombre: archivo.nombre,
        formato,
        datos,
      }

      let resultado: Awaited<ReturnType<typeof extraerDocumento>>
      try {
        resultado = await this.leerDocumento(entrada)
      } catch (error) {
        resumenes.push({
          documentoId: guardado.id,
          nombreArchivo: archivo.nombre,
          dispositivo: 'DESCONOCIDO',
          nombreDispositivo: 'No se ha podido leer',
          confianzaDispositivo: 0,
          explicacionOjos: '',
          ojosEncontrados: [],
          avisos: [
            `No se ha podido leer «${archivo.nombre}». ${
              error instanceof Error ? error.message : String(error)
            }`,
          ],
        })
        continue
      }

      const avisos = [...resultado.avisos]

      const rutaOrigenEntrada = rutaEnImportadas(this.dep.carpetas, archivo.ruta)
      caso = {
        ...caso,
        documentos: [
          ...caso.documentos,
          {
            id: guardado.id,
            nombre: archivo.nombre,
            tipo: formato === 'pdf' ? 'PDF' : 'IMAGEN',
            formato,
            tamanoBytes,
            paginas: Math.max(1, resultado.ojos ? 1 : 1),
            cargadoEn: this.iso(),
            dispositivoDetectado: resultado.dispositivo,
            ojosDetectados: Object.keys(resultado.ojos) as Lateralidad[],
            ...(rutaOrigenEntrada ? { rutaOrigenEntrada } : {}),
          },
        ],
      }

      // Las lentes que propone el informe. Se ACUMULAN entre documentos en vez de
      // pisarse: subir la biometría y luego un informe de topografía no debe hacer
      // desaparecer los modelos que traía el primero. Las repeticiones exactas se
      // quitan; una misma lente con constantes distintas se conserva, porque esa
      // contradicción hay que verla antes de elegir.
      if (resultado.lentes.length > 0) {
        caso = {
          ...caso,
          lentesDelInforme: sinRepetidas([...(caso.lentesDelInforme ?? []), ...resultado.lentes]),
        }
        avisos.push(
          `El informe propone ${resultado.lentes.length} ${
            resultado.lentes.length === 1 ? 'modelo de lente' : 'modelos de lente'
          } con su constante A: ${resultado.lentes.map(describirLente).join(' · ')}. ` +
            'No se ha elegido ninguna: la constante A depende de qué lente vayas a implantar.',
        )
      }

      // ── El paciente: sexo y, solo para deducirlo, el nombre ──────────────
      //
      // El nombre es el único dato identificativo que este programa guarda, y
      // entró por decisión expresa del dueño del proyecto (12/08/2026) para
      // poder deducir el sexo que pide Kane. No sale del ordenador: a las webs
      // se les sigue mandando el código local del caso.
      caso = this.conDatosDePaciente(caso, resultado, avisos)

      for (const [lado, leido] of Object.entries(resultado.ojos)) {
        const lateralidad = lado as Lateralidad

        // Ya ha llegado, en ESTE MISMO LOTE, otro documento de este ojo con
        // el MISMO dispositivo RECONOCIDO (D88, corregido el mismo día a
        // petición expresa del dueño del proyecto): son fragmentos del
        // mismo examen —por ejemplo, dos fotos porque la pantalla del
        // biómetro no cupo entera en un encuadre— y se fusionan en un solo
        // dataset en vez de crear uno nuevo por cada foto. Si el
        // dispositivo detectado es DISTINTO, o si NINGUNO de los dos se ha
        // podido reconocer (`DESCONOCIDO`), no se fusiona nunca —no hay
        // ninguna base para asumir que son el mismo examen; podrían ser dos
        // biómetros de verdad distintos que el programa no sabe nombrar—:
        // cada uno se queda como su propio aparato, más abajo.
        const delLote = datasetDeEsteLote[lateralidad]
        if (
          delLote !== undefined &&
          delLote.dispositivo === resultado.dispositivo.dispositivo &&
          resultado.dispositivo.dispositivo !== 'DESCONOCIDO'
        ) {
          const existente = ojoDe(caso, lateralidad, delLote.aparato)
          const { fusionado, avisos: avisosFusion } = fusionarMedidas(
            existente,
            leido,
            archivo.nombre,
          )
          avisos.push(...avisosFusion)
          caso = conOjo(caso, this.conValoresPorDefecto(fusionado), this.iso())
          continue
        }

        const previos = datasetsDe(caso, lateralidad)
        // El PRIMER documento de un ojo se queda con `APARATO_PRINCIPAL` —
        // igual que antes de D47—, para que un caso de un solo documento no
        // note ningún cambio: todo lo que lee ese dataset con `ojoDe(caso,
        // ojo)` sin más (la revisión, el cálculo) lo sigue encontrando donde
        // siempre. Solo cuando YA HABÍA algo para ese ojo se etiqueta el
        // dataset nuevo con el aparato que el propio documento dice ser
        // (D47, 27/08/2026) — no hace falta preguntarle nada a nadie, ya se
        // ha detectado al leerlo — para que los dos convivan distinguibles
        // en vez de que uno pise al otro. Esto cubre tanto un documento que
        // llega en una llamada posterior como uno de un dispositivo
        // distinto dentro del mismo lote (el `if` de arriba ya se ha hecho
        // cargo del caso de mismo dispositivo reconocido, que se fusiona).
        //
        // Cuando el dispositivo NO se reconoce, no se usa el texto genérico
        // «Informe no reconocido» tal cual —un segundo documento sin
        // reconocer pisaría al primero, porque los dos pedirían el mismo
        // nombre—: se le da un nombre libre, «Otro»/«Otro (2)»/…, para que
        // la persona lo renombre a mano con el aparato real (D88 corregido,
        // 17/09/2026).
        const aparato =
          previos.length === 0
            ? APARATO_PRINCIPAL
            : resultado.dispositivo.dispositivo === 'DESCONOCIDO'
              ? nombreAparatoLibreParaDesconocido(previos)
              : NOMBRE_DISPOSITIVO[resultado.dispositivo.dispositivo]
        const yaHabiaEseAparato = previos.some((o) => o.aparato === aparato)
        if (yaHabiaEseAparato) {
          avisos.push(
            `Ya había un conjunto de «${aparato}» para el ${lateralidad}; se ha sustituido por los datos de «${archivo.nombre}».`,
          )
        }
        datasetDeEsteLote[lateralidad] = { aparato, dispositivo: resultado.dispositivo.dispositivo }
        caso = conOjo(caso, this.conValoresPorDefecto({ ...leido, aparato }), this.iso())
      }

      resumenes.push({
        documentoId: guardado.id,
        nombreArchivo: archivo.nombre,
        dispositivo: resultado.dispositivo.dispositivo,
        nombreDispositivo: NOMBRE_DISPOSITIVO[resultado.dispositivo.dispositivo],
        confianzaDispositivo: resultado.dispositivo.confianza,
        explicacionOjos: resultado.explicacionOjos,
        ojosEncontrados: Object.keys(resultado.ojos) as Lateralidad[],
        avisos,
      })
    }

    caso = { ...caso, estado: 'EN_REVISION', actualizadoEn: this.iso() }
    return { caso: this.establecer(caso), resumenes }
  }

  // ── Revisión ─────────────────────────────────────────────────────────────

  /**
   * Escribe o borra un dato a mano.
   *
   * Cubre las dos cosas que hace una persona en la pantalla de revisión, y el
   * dominio las distingue solo:
   *
   *  - **Aportar** un dato que el informe no traía. No había nada que conservar.
   *  - **Corregir** uno que sí traía. Entonces **se guarda lo que decía el
   *    informe**, con su evidencia, y el dato pasa a enseñarse como corregido.
   *
   * Antes esto construía una `Medida` nueva de cero, y eso **destruía el valor
   * original**: el informe final decía «escrito a mano» sin poder explicar frente
   * a qué. Ahora lo hace `corregirMedida`, que conserva el rastro.
   *
   * `valor === null` BORRA el dato: es la forma correcta de decir «esto no lo
   * sabemos». No se pone a cero. Y borra también el original, porque el campo
   * vuelve a no constar.
   *
   * Un dato escrito a mano queda confirmado por definición: lo acaba de escribir
   * una persona mirándolo.
   *
   * @param aparato De qué biómetro es este dato (D47, 27/08/2026). Sin
   *   especificarlo, `APARATO_PRINCIPAL` — el único que hay en un caso que no
   *   usa varios. Si ese aparato todavía no existe para este ojo, se crea
   *   vacío al escribir este primer campo.
   */
  editarMedida(
    lado: Lateralidad,
    campo: CampoBiometrico,
    valor: number | null,
    aparato: string = APARATO_PRINCIPAL,
  ): Caso {
    const caso = this.exigirCaso()
    const yaExistiaElDataset = aparatosDe(caso, lado).includes(aparato)
    const ojo = ojoDe(caso, lado, aparato)
    const actualizado =
      valor === null ? sinMedida(ojo, campo) : corregirMedida(ojo, campo, valor, this.iso())
    let conElOjo = conOjo(caso, actualizado, this.iso())
    const ladosTocados: Lateralidad[] = [lado]
    const otroLado: Lateralidad = lado === 'OD' ? 'OS' : 'OD'

    // El eje de K2 es, por definición clínica, el de K1 más 90° — las dos
    // queratometrías son perpendiculares entre sí (petición expresa del
    // dueño del proyecto, 20/09/2026, «para ser más rápida»). Se rellena
    // solo al escribir el eje de K1, nunca al revés, y solo si K2 todavía
    // no tenía su propio eje — un astigmatismo irregular, poco común pero
    // real, puede necesitar uno distinto, y eso nunca se pisa.
    if (campo === 'K1_EJE' && valor !== null) {
      const ojoActual = ojoDe(conElOjo, lado, aparato)
      if (ojoActual.medidas.K2_EJE === undefined) {
        conElOjo = conOjo(
          conElOjo,
          corregirMedida(ojoActual, 'K2_EJE', (valor + 90) % 180, this.iso()),
          this.iso(),
        )
      }
    }

    // La constante A es casi siempre la misma lente en los dos ojos
    // (petición expresa del dueño, 02/09/2026). Se propaga sola entre los
    // dos datasets del mismo aparato, en el sentido que corresponda según
    // cuál se acaba de tocar — nunca pisa un valor que YA hubiera, venga de
    // donde venga (a mano o del catálogo), así que borrarla en un ojo no la
    // hace reaparecer sola.
    if (campo === 'CONSTANTE_A' && valor !== null) {
      // 1. Se acaba de escribir aquí: si el otro ojo ya tiene este mismo
      //    aparato pero sin su propia constante, se copia hacia allí.
      const otroOjo = ojoDe(conElOjo, otroLado, aparato)
      if (
        aparatosDe(conElOjo, otroLado).includes(aparato) &&
        otroOjo.medidas.CONSTANTE_A === undefined
      ) {
        conElOjo = conOjo(conElOjo, corregirMedida(otroOjo, campo, valor, this.iso()), this.iso())
        ladosTocados.push(otroLado)
      }
    } else if (campo !== 'CONSTANTE_A' && !yaExistiaElDataset && valor !== null) {
      // 2. Se acaba de crear un dataset nuevo con este primer dato: si el
      //    otro ojo ya tenía este mismo aparato CON su constante puesta, se
      //    hereda aquí — solo en el momento de crearse, nunca en ediciones
      //    posteriores (para no revivir una que la persona borró a propósito).
      const constanteDelOtro = ojoDe(conElOjo, otroLado, aparato).medidas.CONSTANTE_A
      if (constanteDelOtro !== undefined) {
        conElOjo = conOjo(
          conElOjo,
          corregirMedida(
            ojoDe(conElOjo, lado, aparato),
            'CONSTANTE_A',
            constanteDelOtro.valor,
            this.iso(),
          ),
          this.iso(),
        )
      } else {
        // 3. Ni siquiera el otro ojo la tiene: si ya se había elegido una
        //    lente con constante conocida del catálogo (D69) ANTES de que
        //    este dataset existiera, `elegirLente()` no pudo escribirla en
        //    su momento —no había ojo al que engancharla—, así que se
        //    aplica ahora, en el mismo movimiento que crea el dataset. Es
        //    el caso real reportado por el dueño: elegir la lente antes de
        //    escribir ningún dato del ojo.
        const delCatalogo = conElOjo.lente?.constanteDelCatalogo
        if (delCatalogo !== undefined) {
          conElOjo = conOjo(
            conElOjo,
            conMedida(
              ojoDe(conElOjo, lado, aparato),
              crearMedida(
                'CONSTANTE_A',
                lado,
                delCatalogo.valor,
                { metodo: 'CATALOGO', registradoEn: this.iso() },
                true,
              ),
            ),
            this.iso(),
          )
        }
      }
    }

    // El SIA, su eje de incisión y el objetivo de refracción también suelen
    // ser los mismos en los dos ojos de la misma visita (petición expresa
    // del dueño del proyecto, 15/09/2026) — se heredan del otro ojo igual
    // que la constante A (caso 2 de arriba): SOLO en el momento de crear el
    // dataset nuevo, nunca en ediciones posteriores, y nunca pisando el
    // campo que la persona acaba de escribir con este mismo `editarMedida`
    // (si ese campo es uno de los tres, ya lleva el valor recién tecleado).
    // La lente ya es del caso entero, no de cada ojo (D33), así que no hace
    // falta copiarla aquí — «Lente» de la revisión ya la comparten los dos.
    if (!yaExistiaElDataset && valor !== null) {
      const CAMPOS_HEREDABLES_DEL_OTRO_OJO: readonly CampoBiometrico[] = [
        'SIA',
        'EJE_INCISION',
        'REFRACCION_OBJETIVO',
      ]
      const otroOjoParaHeredar = ojoDe(conElOjo, otroLado, aparato)
      for (const campoHeredable of CAMPOS_HEREDABLES_DEL_OTRO_OJO) {
        if (campoHeredable === campo) continue
        const delOtro = otroOjoParaHeredar.medidas[campoHeredable]
        if (delOtro === undefined) continue
        conElOjo = conOjo(
          conElOjo,
          corregirMedida(ojoDe(conElOjo, lado, aparato), campoHeredable, delOtro.valor, this.iso()),
          this.iso(),
        )
      }
    }

    // Un reconocimiento de discrepancia viejo no puede tapar una discrepancia
    // nueva: cualquier edición de un ojo lo borra, y hace falta volver a
    // comprobar (D47).
    const restantes = { ...conElOjo.discrepanciasReconocidas }
    for (const l of ladosTocados) delete restantes[l]
    return this.establecer({ ...conElOjo, discrepanciasReconocidas: restantes })
  }

  /**
   * Con qué aparato se midió la córnea posterior de este dataset, si es
   * distinto del aparato general (02/09/2026, corrige D58): EVO y Barrett
   * enseñan su propio desplegable para esto, separado del resto del
   * formulario, porque a veces la córnea posterior se mide con otro
   * instrumento que el resto de la biometría. `undefined` la quita: vuelve
   * a usar el aparato general, como siempre.
   */
  editarAparatoCaraPosterior(
    lado: Lateralidad,
    aparato: string,
    aparatoCaraPosterior: string | undefined,
  ): Caso {
    const caso = this.exigirCaso()
    const ojo = ojoDe(caso, lado, aparato)
    const actualizado = conAparatoCaraPosterior(ojo, aparatoCaraPosterior)
    return this.establecer(conOjo(caso, actualizado, this.iso()))
  }

  /**
   * Si este ojo tiene una córnea alterada por cirugía refractiva previa o
   * queratocono (D67, 02/09/2026). `undefined` la quita y vuelve a ser un
   * ojo normal.
   */
  editarSituacionCorneal(
    lado: Lateralidad,
    aparato: string,
    situacionCorneal: SituacionCornealEspecial | undefined,
  ): Caso {
    const caso = this.exigirCaso()
    const ojo = ojoDe(caso, lado, aparato)
    const actualizado = conSituacionCorneal(ojo, situacionCorneal)
    return this.establecer(conOjo(caso, actualizado, this.iso()))
  }

  /**
   * Resuelve el sexo del paciente a partir de lo que traiga el documento.
   *
   * Por orden, y el orden es la fiabilidad:
   *
   *  1. **Lo que imprime el informe** («Sex: Female»). Es un dato leído.
   *  2. **Deducido del nombre**, si el informe no lo dice. Queda marcado como
   *     derivado y SIN confirmar, así que no sale hacia Kane hasta que una
   *     persona lo mire — es la D32 aplicándose, no una excepción.
   *
   * Lo que ya hubiera en el caso NO se pisa: si una persona ya lo eligió, manda
   * ella.
   */
  private conDatosDePaciente(
    caso: Caso,
    resultado: Awaited<ReturnType<typeof extraerDocumento>>,
    avisos: string[],
  ): Caso {
    const p = resultado.paciente
    let salida = caso

    if (p.nombre !== undefined && salida.nombrePaciente === undefined) {
      salida = { ...salida, nombrePaciente: p.nombre }
    }

    // El valor de partida (D68) no cuenta como «ya lo puso alguien»: si el
    // documento trae el dato real, o se puede deducir del nombre, tiene que
    // poder sustituirlo. Solo se respeta si ya lo eligió una persona o si
    // salió de otro documento/deducción anterior.
    if (salida.sexo !== undefined && salida.sexo.procedencia.metodo !== 'DEFECTO') return salida

    if (p.sexo !== undefined) {
      salida = {
        ...salida,
        sexo: sexoDelInforme(p.sexo, {
          metodo: resultado.metodo,
          documentoId: resultado.documentoId,
          dispositivoId: resultado.dispositivo.dispositivo,
          registradoEn: this.iso(),
          ...(p.evidenciaSexo !== undefined
            ? { evidencia: { texto: p.evidenciaSexo, pagina: 1 } }
            : {}),
        }),
      }
      return salida
    }

    const nombre = salida.nombrePaciente
    if (nombre === undefined) return salida

    const deducido = deducirSexoDelNombre(nombre)
    if (deducido === null) {
      // No se adivina. Un nombre unisex o poco común se queda sin deducir, y esa
      // es la respuesta correcta: lo elige una persona. Se queda con el valor
      // de partida (D68) para no bloquear el cálculo, pero se avisa igual.
      avisos.push(
        'No se ha podido deducir el sexo del nombre del informe, y Kane lo pide. Se ha dejado «Hombre» por defecto: cámbialo en la pantalla de revisión si no es correcto.',
      )
      return salida
    }

    salida = {
      ...salida,
      sexo: sexoDeducidoDelNombre(
        deducido,
        { documentoId: resultado.documentoId, dispositivoId: resultado.dispositivo.dispositivo },
        this.iso(),
      ),
    }
    avisos.push(
      `El informe no dice el sexo, así que se ha deducido del nombre. Sale sin confirmar a propósito: compruébalo antes de calcular, porque un nombre no siempre lo determina.`,
    )
    return salida
  }

  /**
   * El objetivo de refracción (target) arranca en 0; el SIA y su eje de
   * incisión, en 0.25 D @ 135°. Los tres, editables.
   *
   * Concreta D38 (`SYSTEM_VISION.md`): petición expresa del dueño del
   * proyecto, tras exponerle que es la primera vez que este programa rellena
   * un dato ausente en vez de dejarlo vacío — la mayoría de sus casos van a
   * emetropía y usan un SIA parecido, y no quiere escribirlos a mano en cada
   * uno. Ampliada el 27/08/2026 (mismo dueño, misma petición) para el SIA y
   * su eje: no hace falta un aviso nuevo, es el mismo riesgo ya aceptado.
   *
   * Son valores `MANUAL` normales, así que `corregirMedida` ya los deja
   * confirmados sin más (como cualquier dato escrito a mano): no hace falta
   * ningún mecanismo nuevo de confirmación, y si el cirujano los cambia
   * después es una edición manual normal, igual de confirmada.
   *
   * NO pisan un valor que el propio informe ya trajera («Del informe»):
   * solo rellenan el hueco cuando el documento de verdad no dice nada — y el
   * SIA nunca lo trae un aparato (ningún biómetro lo mide), así que aquí
   * nunca hay nada real que pisar.
   */
  private conValoresPorDefecto(ojo: OjoBiometrico): OjoBiometrico {
    let salida = ojo
    if (!tiene(salida, 'REFRACCION_OBJETIVO')) {
      salida = corregirMedida(salida, 'REFRACCION_OBJETIVO', 0, this.iso())
    }
    if (!tiene(salida, 'SIA')) salida = corregirMedida(salida, 'SIA', 0.25, this.iso())
    if (!tiene(salida, 'EJE_INCISION')) {
      salida = corregirMedida(salida, 'EJE_INCISION', 135, this.iso())
    }
    return salida
  }

  /**
   * Escribe a mano el nombre del paciente y/o del cirujano.
   *
   * Es el equivalente, para estos dos campos de texto del caso, de
   * `editarMedida` para una medida: la vía manual (`FormularioManual`) los
   * escribe aquí porque no vienen de ningún documento. Un campo que no se
   * manda en `datos` conserva lo que hubiera — así se puede guardar uno sin
   * pisar el otro.
   */
  establecerIdentificacion(datos: {
    readonly nombrePaciente?: string
    readonly nombreCirujano?: string
  }): Caso {
    const caso = this.exigirCaso()
    return this.establecer({
      ...caso,
      ...(datos.nombrePaciente !== undefined ? { nombrePaciente: datos.nombrePaciente } : {}),
      ...(datos.nombreCirujano !== undefined ? { nombreCirujano: datos.nombreCirujano } : {}),
      actualizadoEn: this.iso(),
    })
  }

  /**
   * Aplica un doctor guardado (D80, 15/09/2026) al caso en curso: pone su
   * nombre en la identificación y, si tiene SIA y/o eje de incisión
   * guardados, los escribe en todos los ojos/aparatos que el caso ya
   * tenga — por `editarMedida`, así que queda confirmado igual que si la
   * persona lo hubiera tecleado a mano, y arrastra su misma herencia entre
   * los dos ojos (D77). Un doctor sin SIA/eje guardados todavía (uno
   * recién añadido, sin editar) no toca esos campos: se quedan con el
   * valor de partida de siempre (D38: 0.25 D y 135°).
   *
   * **Un ojo que TODAVÍA no tiene ningún dataset** (fallo real reportado
   * por el dueño, 15/09/2026: eligió el doctor antes de escribir ningún
   * dato, y el SIA se quedó en el 0.25 de partida) también recibe el
   * SIA/eje del doctor, creándole un dataset con el aparato principal —
   * igual que si la persona hubiera escrito ahí el primer dato a mano—,
   * para que el valor salga ya puesto en cuanto se elige el doctor, sin
   * tener que esperar a la primera medida de biometría. Si el doctor no
   * tiene ni SIA ni eje guardados, no se crea ningún dataset de más: no
   * hay nada que sembrar.
   */
  aplicarDoctor(doctor: Doctor): Caso {
    let caso = this.establecerIdentificacion({ nombreCirujano: doctor.nombre })
    const traeAlgo = doctor.sia !== null || doctor.ejeIncision !== null
    for (const lado of ['OD', 'OS'] as const) {
      const existentes = aparatosDe(caso, lado)
      const aparatos = existentes.length > 0 ? existentes : traeAlgo ? [APARATO_PRINCIPAL] : []
      for (const aparato of aparatos) {
        if (doctor.sia !== null) caso = this.editarMedida(lado, 'SIA', doctor.sia, aparato)
        if (doctor.ejeIncision !== null) {
          caso = this.editarMedida(lado, 'EJE_INCISION', doctor.ejeIncision, aparato)
        }
      }
    }
    return caso
  }

  /** Elige el sexo a mano. Conserva lo que hubiera antes, como cualquier dato. */
  elegirSexo(sexo: Sexo): Caso {
    const caso = this.exigirCaso()
    return this.establecer({
      ...caso,
      sexo: aportarSexo(caso.sexo, sexo, this.iso()),
      actualizadoEn: this.iso(),
    })
  }

  /** Da por bueno el sexo que se dedujo. Es lo que abre la puerta hacia Kane. */
  confirmarSexo(): Caso {
    const caso = this.exigirCaso()
    if (!caso.sexo) return caso
    return this.establecer({
      ...caso,
      sexo: confirmarSexoDelDominio(caso.sexo),
      actualizadoEn: this.iso(),
    })
  }

  confirmarCampo(
    lado: Lateralidad,
    campo: CampoBiometrico,
    aparato: string = APARATO_PRINCIPAL,
  ): Caso {
    const caso = this.exigirCaso()
    return this.establecer(
      conOjo(caso, confirmarMedida(ojoDe(caso, lado, aparato), campo), this.iso()),
    )
  }

  /**
   * Confirma de golpe todos los datos pendientes de UN dataset —el ojo y
   * aparato que se está mirando en pantalla ahora mismo, nunca el caso
   * entero— (petición expresa del dueño del proyecto, 06/09/2026, tras
   * usar el lector con IA sobre un caso real y encontrar 34 datos que
   * comprobar de uno en uno).
   *
   * A propósito NO existe un «confirmar todo el caso» equivalente: una
   * sesión anterior lo probó (con el OCR) y lo deshizo —«un clic que
   * confirma todo cumple la letra de la invariante pero se salta la
   * intención», lección registrada en `.claude/skills/lessons-learned/log.md`
   * (11/08/2026, noche)—. Lo que cambia aquí no es esa regla: la interfaz
   * exige una casilla explícita («he comparado cada dato con el informe»)
   * antes de poder pulsar este botón, así que sigue habiendo un gesto
   * consciente — solo dejó de ser uno por cada fila.
   */
  confirmarTodoElOjo(lado: Lateralidad, aparato: string = APARATO_PRINCIPAL): Caso {
    const caso = this.exigirCaso()
    return this.establecer(conOjo(caso, confirmarTodas(ojoDe(caso, lado, aparato)), this.iso()))
  }

  /**
   * Confirma el caso.
   *
   * Es el acto explícito de una persona que abre la puerta hacia las webs.
   *
   * Dos cosas que NO hace, y que importan:
   *
   *  - No confirma si hay algún dato IMPOSIBLE. Hay que corregirlo antes.
   *  - **No confirma en bloque los datos leídos por OCR.** Esos hay que
   *    comprobarlos uno a uno, porque el reconocimiento produce números
   *    equivocados con aspecto de correctos —medido: 24.81 donde ponía 24.01, con
   *    un 93 % de fiabilidad— y un solo clic para aceptarlos todos convertiría la
   *    revisión obligatoria en un trámite.
   *  - **Tampoco confirma en bloque los datos derivados.** Una ACD obtenida de
   *    AQD + CCT es aritmética exacta sobre dos números que nadie ha comprobado
   *    todavía, y va a las tres calculadoras.
   */
  /**
   * Confirma TODOS los datasets de TODOS los ojos del caso de una vez —el
   * botón «Confirmar» de siempre. Desde D47 (27/08/2026) un ojo puede tener
   * varios aparatos en paralelo, así que esto recorre cada uno de ellos, no
   * solo el principal: de lo contrario, el segundo biómetro de un ojo se
   * quedaría sin confirmar en silencio, aunque el botón dijera «Confirmar».
   *
   * Esto NO es lo mismo que «todos los aparatos están listos para calcular»:
   * cada uno se calcula cuando el suyo lo esté (`sePuedeConfirmarDataset`,
   * `prepararEntradas`), independientemente de los demás — es la
   * independencia por aparato que pidió el dueño del proyecto.
   */
  confirmarTodo(): Caso {
    let caso = this.exigirCaso()

    const todosLosDatasets = ojosDelCaso(caso).flatMap((l) => datasetsDe(caso, l))
    const invalidos = todosLosDatasets.flatMap(validarOjo).filter((a) => a.nivel === 'INVALID')
    if (invalidos.length > 0) {
      throw new Error(
        `Hay ${invalidos.length} dato(s) que no pueden ser correctos. Corrígelos antes de continuar: ${invalidos
          .map((a) => a.mensaje)
          .join(' ')}`,
      )
    }

    for (const lado of ojosDelCaso(caso)) {
      for (const dataset of datasetsDe(caso, lado)) {
        let ojo = dataset
        for (const campo of Object.keys(ojo.medidas) as CampoBiometrico[]) {
          const medida = ojo.medidas[campo]
          // Lo leído por una máquina y lo calculado por el programa se quedan
          // sin confirmar: lo tiene que marcar la persona campo por campo.
          if (medida && necesitaComprobacionHumana(medida.procedencia)) continue
          ojo = confirmarMedida(ojo, campo)
        }
        caso = conOjo(caso, ojo, this.iso())
      }
    }
    return this.establecer(confirmar(caso, this.iso()))
  }

  /**
   * Discrepancias entre los aparatos de un mismo ojo, ya confirmados (D47).
   *
   * Se avisa y no se corrige nada solo: es a la persona a quien le toca mirar
   * si dos biómetros que no coinciden es un problema de verdad o no.
   */
  discrepanciasDe(lado: Lateralidad): ReturnType<typeof detectarDiscrepancias> {
    const caso = this.exigirCaso()
    return detectarDiscrepancias(datasetsDe(caso, lado))
  }

  /**
   * La persona ha mirado la discrepancia de este ojo y decide seguir
   * adelante de todos modos. Es la acción explícita que exige D47 antes de
   * poder calcular ese ojo — «avisa y bloquea; corrige la persona», aplicado
   * aquí entre aparatos.
   */
  reconocerDiscrepancia(lado: Lateralidad): Caso {
    const caso = this.exigirCaso()
    return this.establecer({
      ...caso,
      discrepanciasReconocidas: { ...caso.discrepanciasReconocidas, [lado]: true },
      actualizadoEn: this.iso(),
    })
  }

  /**
   * Cambia el nombre de un aparato ya existente, sin tocar sus medidas
   * (petición expresa del dueño, 27/08/2026) — deja elegir o escribir de
   * qué biómetro es el primer aparato de un ojo, sin necesitar añadir un
   * segundo. `conAparatoRenombrado` ya rechaza chocar con un nombre que use
   * otro aparato del mismo ojo; ese rechazo llega tal cual a la interfaz.
   */
  renombrarAparato(lado: Lateralidad, aparatoViejo: string, aparatoNuevo: string): Caso {
    const caso = this.exigirCaso()
    return this.establecer(conAparatoRenombrado(caso, lado, aparatoViejo, aparatoNuevo, this.iso()))
  }

  /** ¿Hay una discrepancia de este ojo sin que nadie la haya reconocido todavía? */
  private tieneDiscrepanciaSinReconocer(caso: Caso, lado: Lateralidad): boolean {
    if (caso.discrepanciasReconocidas?.[lado] === true) return false
    return detectarDiscrepancias(datasetsDe(caso, lado)).length > 0
  }

  validar(): readonly Aviso[] {
    const caso = this.caso
    if (!caso) return []
    return ojosDelCaso(caso).flatMap((l) => [...validarOjo(ojoDe(caso, l))])
  }

  /**
   * Elige el modelo de lente y, con él, resuelve su constante A.
   *
   * Toda la lógica está en el dominio (`elegirLenteDelDominio`), y a propósito: es
   * el único sitio donde una constante de la tabla del informe se convierte en la
   * `CONSTANTE_A` del caso. Si este servicio escribiera la constante por su cuenta,
   * habría dos caminos y uno de ellos podría dejarla emparejada con la lente
   * equivocada.
   *
   * Los avisos **se devuelven con la operación**, no se guardan en el servicio:
   * explican por qué no se ha puesto una constante o por qué se ha quitado la
   * anterior, y eso pertenece a esta acción concreta. Guardarlos como estado los
   * dejaría colgando después de que dejaran de ser verdad.
   */
  elegirLente(
    fabricante: string,
    modelo: string,
    nombreEnEvo?: string,
    nombreEnKane?: string,
    constanteConocida?: number,
  ): {
    caso: Caso
    avisos: readonly string[]
    emparejamiento: 'ENCONTRADA' | 'AMBIGUA' | 'NO_ESTA'
  } {
    const caso = this.exigirCaso()
    const r = elegirLenteDelDominio(
      caso,
      { fabricante, modelo, nombreEnEvo, nombreEnKane, constanteConocida },
      this.iso(),
    )
    return {
      caso: this.establecer(r.caso),
      avisos: r.avisos,
      emparejamiento: r.emparejamiento.estado,
    }
  }

  /**
   * Aparca una segunda lente candidata, para poder comparar con la misma
   * biometría sin volver a escribirla (D55, 01/09/2026). No participa en
   * ningún cálculo hasta que `intercambiarLentes()` la activa.
   *
   * Sin `eleccion`, la quita.
   */
  elegirLenteSecundaria(eleccion?: {
    fabricante?: string
    modelo: string
    nombreEnEvo?: string
    nombreEnKane?: string
    constanteConocida?: number
  }): Caso {
    const caso = this.exigirCaso()
    return this.establecer(elegirLenteSecundariaDelDominio(caso, eleccion, this.iso()))
  }

  /**
   * Activa la lente aparcada — pasa a ser `lente`, con su propia constante
   * A, y la que era `lente` pasa a `lenteSecundaria` — y borra los
   * resultados ya calculados, porque eran de la lente anterior (D55,
   * 01/09/2026). El caso vuelve a `CONFIRMADO`: hace falta un cálculo
   * nuevo antes de generar otro PDF.
   */
  intercambiarLentes(): {
    caso: Caso
    avisos: readonly string[]
  } {
    const caso = this.exigirCaso()
    const r = intercambiarLentesDelDominio(caso, this.iso())
    return { caso: this.establecer(r.caso), avisos: r.avisos }
  }

  // ── Cálculo ──────────────────────────────────────────────────────────────

  /**
   * Calcula el caso, o solo el dataset que se indique: cada calculadora, para
   * cada ojo y aparato que tenga datos.
   *
   * Antes esto recibía un `lado` y calculaba solo ese, así que un caso con los
   * dos ojos confirmados dejaba el segundo sin calcular y había que volver a
   * lanzar el flujo. No era un fallo de ninguna web: es que **nadie pedía el
   * segundo ojo**. Ahora la lista de casillas la construye el orquestador a
   * partir del caso.
   *
   * @param filtro Restringe a un ojo y/o un aparato concretos (D47,
   *   27/08/2026) — es lo que permite calcular un biómetro mientras otro del
   *   mismo ojo sigue a medias, sin esperar a que los dos estén listos. Sin
   *   especificarlo, se intenta todo lo que el caso tenga.
   */
  async calcular(
    calculadoras?: readonly Calculadora[],
    filtro?: { readonly ojo?: Lateralidad; readonly aparato?: string },
  ): Promise<readonly ResultadoCalculadora[]> {
    const caso = this.exigirCaso()
    const opciones = {
      ...(calculadoras !== undefined ? { calculadoras } : {}),
      ...(filtro?.ojo !== undefined ? { ojos: [filtro.ojo] } : {}),
      ...(filtro?.aparato !== undefined ? { aparatos: [filtro.aparato] } : {}),
    }
    const planificadas = planificarCaso(
      caso,
      Object.keys(opciones).length > 0 ? opciones : undefined,
    )

    // Un ojo con una discrepancia entre sus aparatos sin reconocer no calcula
    // — ni siquiera el aparato que "parece" estar bien, porque la duda es
    // justo cuál de los dos lo está (D47). Pero eso no tiene por qué frenar
    // el resto del caso: se descarta solo la casilla de ese ojo y se sigue
    // con las demás (petición expresa del dueño, 28/08/2026 — antes, una
    // discrepancia pendiente en un ojo bloqueaba TODO el cálculo, incluido
    // el otro ojo, que no tenía nada que ver). Solo si no queda nada que
    // calcular se avisa con un error: si no, el silencio se explicaría solo
    // con la alarma que ya se vio al revisar ese ojo.
    const base = planificadas.filter((t) => !this.tieneDiscrepanciaSinReconocer(caso, t.ojo))
    if (base.length === 0 && planificadas.length > 0) {
      const ojosBloqueados = [...new Set(planificadas.map((t) => t.ojo))].join(', ')
      throw new Error(
        `Hay una discrepancia entre los aparatos del ${ojosBloqueados} sin comprobar. ` +
          'Revísala y reconócela antes de calcular ese ojo.',
      )
    }

    return this.ejecutar(base)
  }

  /**
   * Vuelve a ejecutar lo que falló, y solo lo que falló.
   *
   * Es la semántica que faltaba: «Reintentar» significa **repetir una casilla
   * que no salió**, no conseguir el segundo ojo. Sin argumentos reintenta todo
   * lo pendiente; con `calculadora` reintenta los ojos de esa que no tengan
   * resultado aprovechable; con las dos cosas, esa casilla exacta.
   *
   * Un resultado que ya salió bien **no se repite**, así que no se puede
   * duplicar ni perder por reintentar al lado.
   */
  async reintentar(
    calculadora?: Calculadora,
    ojo?: Lateralidad,
    aparato: string = APARATO_PRINCIPAL,
  ): Promise<readonly ResultadoCalculadora[]> {
    const caso = this.exigirCaso()

    // Una casilla concreta se ejecuta aunque su estado no sea de los que se
    // reintentan solos: si el usuario la señala, es que quiere justo esa.
    if (calculadora !== undefined && ojo !== undefined) {
      return this.ejecutar([{ calculadora, ojo, aparato }])
    }

    return this.ejecutar(
      tareasPendientes(
        caso,
        calculadora !== undefined ? { calculadoras: [calculadora] } : undefined,
      ),
    )
  }

  /**
   * El motor común: abre el navegador, ejecuta las casillas y va guardando.
   *
   * Cada resultado se guarda **en cuanto llega**. Si algo revienta a mitad, lo
   * ya obtenido no se pierde — que es lo que hace posible reintentar solo lo que
   * falló en vez de empezar de cero.
   */
  private async ejecutar(
    tareas: readonly TareaCalculo[],
  ): Promise<readonly ResultadoCalculadora[]> {
    let caso = this.exigirCaso()
    this.cancelar = false

    if (tareas.length === 0) return []

    caso = this.establecer({ ...caso, estado: 'CALCULANDO', actualizadoEn: this.iso() })

    const conVentana = necesitaVentana([...new Set(tareas.map((t) => t.calculadora))])
    let navegador: Browser | null = null

    try {
      try {
        navegador = await this.dep.abrirNavegador(conVentana)
      } catch (error) {
        // Chromium bloquea el perfil: dos navegadores no pueden usar el mismo a la
        // vez. Pasa si quedó una ventana abierta de un cálculo anterior o si se
        // está ejecutando una sonda. Sin esto, el usuario veía un error de
        // Chromium en crudo y no tenía forma de saber qué hacer.
        throw new Error(
          'No se ha podido abrir el navegador porque su perfil está en uso. ' +
            'Cierra la ventana del navegador que abrió el cálculo anterior —o la sonda «pnpm reconocer:kane» si la tienes abierta— y vuelve a intentarlo. ' +
            `Detalle: ${error instanceof Error ? primeraLinea(error.message) : String(error)}`,
        )
      }
      const resultados = await ejecutarCaso({
        caso,
        tareas,
        navegador,
        progreso: (evento: EventoProgreso) =>
          this.dep.emitirProgreso({
            calculadora: evento.calculadora,
            // El ojo lo pone el orquestador en cada aviso. Sin eso, la pantalla
            // enseñaría «Calculando en EVO…» dos veces sin decir de cuál.
            ojo: evento.ojo ?? tareas[0]!.ojo,
            fase: evento.fase,
            mensaje: evento.mensaje,
            requiereUsuario: evento.requiereUsuario ?? false,
          }),
        alTerminarUna: (resultado, tarea) => {
          caso = this.establecer(
            conResultado(this.caso ?? caso, resultado, this.iso(), tarea.aparato),
          )
        },
        ahora: () => this.iso(),
        guardarDiagnostico: this.dep.diagnosticador.guardar,
        guardarCaptura: this.dep.capturas.guardar,
        cancelado: () => this.cancelar,
      })

      this.establecer({
        ...(this.caso ?? caso),
        estado: 'COMPLETADO',
        actualizadoEn: this.iso(),
      })
      return resultados
    } finally {
      await navegador?.close().catch(() => undefined)
    }
  }

  cancelarCalculo(): void {
    this.cancelar = true
  }

  // ── Informe ──────────────────────────────────────────────────────────────

  /**
   * Un PDF por ojo (D47, 27/08/2026) — petición expresa del dueño del
   * proyecto: antes era un único PDF con los dos ojos del caso juntos; ahora
   * cada ojo saca el suyo, y dentro de él, si tiene varios aparatos, los
   * cálculos de todos aparecen seguidos con su propio cuadro comparativo al
   * final (`hojaResumenFinal`, en `@vilamar/report`, ya los junta solo con
   * pasarle los resultados de ese ojo).
   *
   * Un caso de un solo ojo saca un único PDF, igual que antes de D47.
   *
   * **Un ojo con datos pero sin NINGÚN resultado no saca PDF, siempre que
   * ALGÚN otro ojo del caso sí tenga alguno** (petición expresa del dueño
   * del proyecto, 15/09/2026). `ojosDelCaso()` devuelve todos los ojos con
   * DATOS de biometría, tenga o no resultado calculado — antes se sacaba
   * igual un PDF por cada uno, así que elegir calcular solo OD (D66,
   * «Ojos a calcular») generaba de todos modos un segundo PDF de OS,
   * vacío, si ese ojo tenía datos (de una foto cargada, por ejemplo) pero
   * nunca se había calculado. Mismo criterio que D49 ya usa dentro de
   * cada informe para las CASILLAS que nunca se pidieron: la señal de
   * «nunca se pidió» es que no hay ningún `ResultadoCalculadora`
   * guardado, no que el ojo no tuviera datos.
   *
   * La condición «que ALGÚN otro ojo sí tenga resultados» importa: un
   * caso que todavía no ha calculado NADA (los dos ojos sin resultados)
   * no es «un ojo que se dejó fuera a propósito» — es, sencillamente, un
   * informe pedido antes de calcular, y eso sigue sacando su PDF con
   * todo «no calculado», como siempre.
   *
   * **Una carpeta por doctor** (D87, 17/09/2026): antes todos los
   * doctores compartían la misma carpeta de informes, así que con el
   * tiempo se mezclaban los PDF de todo el mundo — petición expresa del
   * dueño, con su propio flujo real: recibe la foto de un doctor,
   * calcula, y quiere el PDF ya archivado en la carpeta de ESE doctor.
   * Dentro de la carpeta del doctor, dos subcarpetas: «Datos previos»
   * —una copia de los documentos originales que se cargaron, la biometría
   * de antes de calcular— y «Calculados» —los PDF, con su misma
   * estructura de siempre (una carpeta por paciente y, dentro, una por
   * ojo)—. «Datos previos» solo tiene sentido si el caso vino de un
   * documento cargado (`cargarDocumentos`); un caso escrito a mano no
   * tiene ningún original que archivar.
   */
  async generarPdf(): Promise<{ rutas: readonly { ojo: Lateralidad; ruta: string }[] }> {
    const caso = this.exigirCaso()
    const todosLosResultados = this.recopilarResultadosParaInforme(caso)
    const marca = this.iso().replace(/[:.]/g, '-').slice(0, 19)
    const hayAlgunResultado = todosLosResultados.length > 0
    const ojosConResultados = ojosDelCaso(caso).filter(
      (ojo) => !hayAlgunResultado || todosLosResultados.some((r) => r.ojo === ojo),
    )

    const carpetaDoctor = join(
      this.dep.carpetas.informes,
      nombreDeCarpeta(caso.nombreCirujano, NOMBRE_CARPETA_SIN_DOCTOR),
    )
    this.archivarDatosPrevios(caso, carpetaDoctor)

    const rutas: { ojo: Lateralidad; ruta: string }[] = []
    for (const ojo of ojosConResultados) {
      const datos = recopilarInforme(caso, {
        version: this.dep.version,
        generadoEn: this.iso(),
        resultados: todosLosResultados.filter((r) => r.ojo === ojo),
        soloOjo: ojo,
      })
      const html = generarHtmlInforme(datos)
      // Dentro de la carpeta del doctor: una por paciente y, dentro, una
      // por ojo — antes todos los pacientes compartían la misma carpeta
      // «Ojo derecho»/«Ojo izquierdo», así que con el tiempo se
      // mezclaban los informes de gente distinta (petición expresa del
      // dueño, 06/09/2026). Varias visitas del mismo paciente caen en la
      // misma carpeta, porque el nombre del archivo ya lleva el código
      // del caso y la fecha, así que nunca se pisan entre sí.
      const carpetaOjo = join(
        carpetaDoctor,
        'Calculados',
        nombreDeCarpeta(caso.nombrePaciente, caso.codigo),
        nombreLateralidad(ojo),
      )
      mkdirSync(carpetaOjo, { recursive: true })
      const destino = join(carpetaOjo, `${caso.codigo}_${ojo}_${marca}.pdf`)

      // Se guarda también el HTML: si el PDF falla, el informe no se pierde.
      writeFileSync(destino.replace(/\.pdf$/, '.html'), html, 'utf8')
      await this.dep.imprimirPdf(html, destino)
      rutas.push({ ojo, ruta: destino })
    }
    return { rutas }
  }

  /**
   * Una copia de los documentos originales del caso —la biometría de
   * antes de calcular— en `<carpetaDoctor>/Datos previos/<paciente>/`
   * (D87, 17/09/2026). El original interno (`documentos/`, indexado por
   * hash de contenido, D30) no se toca ni se mueve: esto es solo una
   * copia legible por su nombre de verdad, para que el dueño la
   * encuentre sin tener que abrir la aplicación. Si ya se copió antes
   * (`generarPdf()` puede llamarse varias veces sobre el mismo caso), no
   * se repite. Un documento que ya no esté en el almacén interno —caso
   * raro, movido o borrado a mano— no impide generar el PDF: se avisa
   * por consola y se sigue con los demás.
   *
   * **Además, si el documento venía de «Importadas» (D89, 17/09/2026),
   * se borra de ahí en cuanto la copia de arriba existe de verdad** —
   * petición expresa del dueño del proyecto: una vez calculado el caso,
   * la foto ya está a salvo en «Datos previos», así que dejarla también
   * en «Importadas» solo la duplica y hace que esa carpeta crezca sin
   * parar. El orden importa: se copia primero, se borra después, y solo
   * si la copia salió bien —nunca al revés—. Si esa foto vivía en una
   * subcarpeta agrupada (D86, varias fotos de un mismo paciente) y queda
   * vacía tras borrar la última, la subcarpeta también se quita.
   */
  private archivarDatosPrevios(caso: Caso, carpetaDoctor: string): void {
    if (caso.documentos.length === 0) return
    const carpetaPaciente = join(
      carpetaDoctor,
      'Datos previos',
      nombreDeCarpeta(caso.nombrePaciente, caso.codigo),
    )
    mkdirSync(carpetaPaciente, { recursive: true })
    for (const documento of caso.documentos) {
      try {
        const extension = documento.nombre.toLowerCase().split('.').pop() ?? 'bin'
        const origen = join(this.dep.carpetas.documentos, `${documento.id}.${extension}`)
        const destino = join(carpetaPaciente, documento.nombre)
        if (!existsSync(destino)) copyFileSync(origen, destino)
        if (existsSync(destino)) this.borrarDeImportadas(documento.rutaOrigenEntrada)
      } catch (e) {
        console.error(`[datos previos] no se pudo archivar ${documento.nombre}`, e)
      }
    }
  }

  /**
   * Borra la copia de «Importadas» de una foto ya archivada en «Datos
   * previos» (D89, 17/09/2026), y su subcarpeta de grupo (D86) si queda
   * vacía. `rutaOrigenEntrada` solo existe cuando el documento venía de
   * ahí (`rutaEnImportadas`, más arriba) — un fichero elegido a mano
   * desde cualquier otro sitio nunca llega hasta aquí. Cualquier fallo
   * —el fichero ya no está, o no hay permiso— se avisa por consola y no
   * interrumpe el resto del archivado.
   *
   * La propia carpeta «Importadas» NUNCA se borra, aunque quede vacía
   * —solo sus subcarpetas de grupo (D86)—: es la carpeta que gestiona la
   * aplicación, y tiene que seguir existiendo para la siguiente «Buscar
   * fotos nuevas».
   */
  private borrarDeImportadas(rutaOrigenEntrada: string | undefined): void {
    if (!rutaOrigenEntrada || !existsSync(rutaOrigenEntrada)) return
    const raizEntrada = leerCarpetaEntrada(this.dep.carpetas)
    if (!raizEntrada) return
    const importadas = join(raizEntrada, CARPETA_IMPORTADAS)
    try {
      unlinkSync(rutaOrigenEntrada)
      const carpeta = dirname(rutaOrigenEntrada)
      if (carpeta !== importadas && readdirSync(carpeta).length === 0) rmdirSync(carpeta)
    } catch (e) {
      console.error(`[importadas] no se pudo borrar ${rutaOrigenEntrada}`, e)
    }
  }

  /**
   * Lo que el informe enseña de cada casilla (calculadora × ojo × aparato,
   * D47): la captura ya en base64, la lente que se destacó y, si no hubo
   * resultado utilizable, por qué. Solo aquí hay `fs` — `recopilarInforme` y
   * `generarHtmlInforme` son funciones puras y no lo tocan.
   *
   * **Una casilla que SÍ se intentó nunca se omite en silencio** (D39): si
   * se seleccionó calcularla y falló —falta un dato, la web no respondió,
   * lo que sea— entra igual, con `fallo` en vez de `dataUri`, explicando la
   * ausencia en su propia página.
   *
   * **Una casilla que NUNCA se pidió calcular sí se omite** (petición
   * expresa del dueño, 27/08/2026): si en la pantalla de cálculo (D40) solo
   * se marcaron una o dos de las tres calculadoras, la tercera no tiene
   * ningún `ResultadoCalculadora` guardado —`resultadoDe` da `undefined`—,
   * y eso es justo la señal de «no se pidió», distinta de «se pidió y no
   * salió». Sin esto, un caso calculado solo con EVO sacaba igualmente hojas
   * de Barrett y Kane diciendo «no se ha calculado», llenando el PDF de
   * páginas sobre calculadoras que nadie quería usar.
   */
  private recopilarResultadosParaInforme(caso: Caso): readonly ResultadoInforme[] {
    const resultados: ResultadoInforme[] = []
    const anadirCasilla = (c: Calculadora, ojo: Lateralidad, aparato: string): void => {
      const r = resultadoDe(caso, c, ojo, aparato)
      if (r === undefined) return

      if (r.estado === 'SUCCESS' || r.estado === 'PARTIAL') {
        const png = r.capturaId ? this.dep.capturas.leer(r.capturaId) : null
        // La estimación es SIEMPRE el criterio propio (D43), de acuerdo con la
        // opción que la web haya destacado o no — nunca `r.recomendada`, que es
        // lo que la calculadora eligió. Las dos cosas no se confunden: esto es
        // una estimación orientativa y no vinculante, y se enseña como tal. El
        // criterio de esfera depende del MODELO de lente elegido (D52,
        // 29/08/2026): la familia Lux invierte el signo — ver `criterioEsferaPara`.
        const estimada = estimarLenteRecomendada(
          r.opciones,
          ejeCurvoDe(ojoDe(caso, ojo, aparato)),
          criterioEsferaPara(caso.lente?.modelo),
        )
        resultados.push({
          calculadora: c,
          ojo,
          aparato,
          ...(png
            ? { dataUri: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }
            : {}),
          ...(estimada ? { recomendada: estimada } : {}),
        })
        return
      }

      resultados.push({
        calculadora: c,
        ojo,
        aparato,
        fallo: r.mensaje ?? `${fichaDe(c).nombre} no se ha calculado para este ojo.`,
      })
    }

    // Aparato a aparato dentro de cada ojo (petición expresa del dueño,
    // 27/08/2026): todas las calculadoras de un biómetro seguidas, y luego
    // las del siguiente — no todo EVO primero y Kane al final mezclando
    // aparatos. Dentro de cada aparato, las cinco casillas de siempre, en el
    // mismo orden que la comparativa en pantalla (`COLUMNAS_COMPARATIVA`):
    // desde que cada variante de córnea posterior (D45) se pide por su
    // cuenta con su propio botón (D48, 28/08/2026), ya no hace falta mirar
    // si ese dataset tiene PK1 o PK2 aquí — la que nunca se calculó
    // simplemente no sale, porque `anadirCasilla` omite lo que no tiene
    // resultado (D49).
    for (const ojo of ojosDelCaso(caso)) {
      for (const aparato of aparatosDe(caso, ojo)) {
        for (const c of COLUMNAS_COMPARATIVA) {
          anadirCasilla(c, ojo, aparato)
        }
      }
    }
    return resultados
  }
}
