/**
 * servicio-bandeja.ts — La cola de avisos de los delegados (D81, 15/09/2026;
 * carpeta de entrada por prioridad D84, 16/09/2026; varias fotos por
 * paciente D86, 17/09/2026).
 *
 * Aparte de `ServicioCasos`, igual que `ServicioDoctores`: una entrada de la
 * bandeja no pertenece a ningún caso hasta que alguien empieza a
 * trabajarla (`vincularCaso`). El estado de ESE trabajo —revisando,
 * calculando, terminado— nunca se duplica aquí: la interfaz lo lee del
 * propio caso (`listarCasosGuardados`), mirando `casoCodigo`.
 *
 * **La carpeta de entrada** (D84): el dueño guarda en OneDrive, compartida
 * con el móvil, las fotos de biometría que le llegan por WhatsApp, ya
 * clasificadas a mano en tres subcarpetas por prioridad
 * (`NOMBRE_CARPETA_PRIORIDAD`). `buscarFotosNuevas()` las detecta, las
 * archiva en «Importadas» (para no volver a crear el mismo aviso si se
 * busca dos veces) y crea una entrada de bandeja por cada una, con
 * `rutasFotos` apuntando a sus copias ya archivadas — «Empezar» las carga
 * todas juntas.
 *
 * **Varias fotos del mismo paciente** (D86): un fichero suelto dentro de
 * Alta/Normal/Baja sigue siendo UN aviso con UNA foto, como hasta ahora.
 * Pero si dentro hay una SUBCARPETA (el dueño la crea a mano, con el
 * nombre del paciente), todas las fotos que tenga dentro se agrupan en
 * UN solo aviso — la subcarpeta entera se archiva junto, tal cual, dentro
 * de «Importadas». Antes de esto, una subcarpeta se ignoraba del todo:
 * `buscarFotosNuevas()` solo miraba ficheros sueltos, nunca lo que hubiera
 * dentro de una carpeta — fallo real reportado por el dueño (17/09/2026).
 *
 * **Carpeta por doctor** (D102, 24/09/2026): cualquier subcarpeta de la raíz
 * que no sea Alta/Normal/Baja/Importadas se trata como la carpeta de UN
 * doctor — dentro puede tener sus propias Alta/Normal/Baja (mismo criterio
 * de fichero-suelto-o-subcarpeta-de-paciente de siempre en cada una), o
 * fotos/subcarpetas de paciente directamente dentro (cuentan como Normal).
 * Se le crean las cuatro subcarpetas de siempre si no las tenía. El nombre
 * de la carpeta del doctor viaja como `delegado` de cada aviso —así se ve
 * en la Bandeja sin ningún cambio de interfaz—, y su archivo va a la
 * «Importadas» de ESE doctor, nunca a la de la raíz. Antes de esto, la raíz
 * solo miraba ficheros sueltos y sus tres subcarpetas de prioridad:
 * cualquier otra subcarpeta —la de un doctor— se ignoraba del todo, y con
 * ella, cualquier paciente que tuviera dentro. Fallo real reportado por el
 * dueño (24/09/2026): con varios pacientes del mismo doctor sueltos en una
 * sola carpeta, la app los juntaba en un único aviso como si fueran uno.
 */

import { basename, extname, join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'

import type { EntradaBandeja, PrioridadBandeja } from '@vilamar/domain'
import { CARPETA_IMPORTADAS, NOMBRE_CARPETA_PRIORIDAD, ordenarBandeja } from '@vilamar/domain'

import type { Carpetas } from './almacen.js'
import {
  guardarBandeja,
  guardarCarpetaEntrada,
  leerBandeja,
  leerCarpetaEntrada,
} from './almacen.js'

/** Mismas extensiones que admite «Elegir archivo» en la pantalla de inicio. */
const EXTENSIONES_VALIDAS = new Set(['.pdf', '.jpg', '.jpeg', '.png'])

function esArchivoValido(nombre: string): boolean {
  return EXTENSIONES_VALIDAS.has(extname(nombre).toLowerCase())
}

/** Los ficheros válidos sueltos, sin bajar a ninguna subcarpeta. */
function archivosValidos(carpeta: string): readonly string[] {
  try {
    return readdirSync(carpeta).filter(
      (nombre) => statSync(join(carpeta, nombre)).isFile() && esArchivoValido(nombre),
    )
  } catch {
    return []
  }
}

/**
 * Lo que hay directamente dentro de una carpeta (D86): los ficheros
 * válidos sueltos, aparte de las subcarpetas — cada subcarpeta es una
 * candidata a «varias fotos del mismo paciente», y se resuelve aparte
 * (mirando qué hay dentro de ELLA, un solo nivel, nunca más).
 */
function listarEntradas(carpeta: string): {
  readonly archivos: readonly string[]
  readonly subcarpetas: readonly string[]
} {
  try {
    const archivos: string[] = []
    const subcarpetas: string[] = []
    for (const nombre of readdirSync(carpeta)) {
      const st = statSync(join(carpeta, nombre))
      if (st.isFile() && esArchivoValido(nombre)) archivos.push(nombre)
      else if (st.isDirectory()) subcarpetas.push(nombre)
    }
    return { archivos, subcarpetas }
  } catch {
    return { archivos: [], subcarpetas: [] }
  }
}

/** El mismo nombre si está libre; si no, «nombre (2)[.ext]», «nombre (3)[.ext]»… Vale igual para un fichero que para una carpeta entera. */
function rutaLibre(carpeta: string, nombreOriginal: string): string {
  const extension = extname(nombreOriginal)
  const base = nombreOriginal.slice(0, nombreOriginal.length - extension.length)
  let candidato = join(carpeta, nombreOriginal)
  let contador = 2
  while (existsSync(candidato)) {
    candidato = join(carpeta, `${base} (${contador})${extension}`)
    contador += 1
  }
  return candidato
}

/** El nombre genérico de quien manda un aviso que no viene de la carpeta de ningún doctor en concreto. */
const DELEGADO_SIN_DOCTOR = 'Carpeta de entrada'

/** Los nombres reservados dentro de la carpeta de un doctor (D102): nunca se confunden con un paciente. */
const NOMBRES_RESERVADOS: ReadonlySet<string> = new Set([
  ...Object.values(NOMBRE_CARPETA_PRIORIDAD),
  CARPETA_IMPORTADAS,
])

/** Un candidato a aviso nuevo: uno o varios ficheros que se mueven juntos a «Importadas». */
interface CandidatoImportacion {
  readonly rutaOrigen: string
  readonly esCarpeta: boolean
  readonly prioridad: PrioridadBandeja
  /** Quién manda el aviso — el nombre de la carpeta del doctor, o el genérico si no venía de ninguna (D102). */
  readonly delegado: string
  /** Dónde archivarlo — la «Importadas» del doctor si venía de su carpeta, o la de la raíz si no. */
  readonly carpetaImportadas: string
  /** Solo cuando `esCarpeta`: los nombres de fichero que hay dentro, para reconstruir sus rutas tras moverla. */
  readonly archivosDentro: readonly string[]
}

function candidatosDe(
  ubicacion: string,
  prioridad: PrioridadBandeja,
  delegado: string,
  carpetaImportadas: string,
): readonly CandidatoImportacion[] {
  const { archivos, subcarpetas } = listarEntradas(ubicacion)
  const deArchivos = archivos.map((nombre): CandidatoImportacion => ({
    rutaOrigen: join(ubicacion, nombre),
    esCarpeta: false,
    prioridad,
    delegado,
    carpetaImportadas,
    archivosDentro: [],
  }))
  const deSubcarpetas = subcarpetas.flatMap((nombre): readonly CandidatoImportacion[] => {
    const rutaSub = join(ubicacion, nombre)
    const dentro = archivosValidos(rutaSub)
    // Una subcarpeta vacía, o sin ninguna foto válida todavía, no genera
    // ningún aviso — se espera a que tenga algo que traer.
    if (dentro.length === 0) return []
    return [
      {
        rutaOrigen: rutaSub,
        esCarpeta: true,
        prioridad,
        delegado,
        carpetaImportadas,
        archivosDentro: dentro,
      },
    ]
  })
  return [...deArchivos, ...deSubcarpetas]
}

/**
 * Todo lo que hay en la carpeta de UN doctor (D102, 24/09/2026): sus fotos
 * sueltas y sus subcarpetas de paciente directamente dentro (prioridad
 * Normal, igual que en la raíz), más sus tres subcarpetas de prioridad
 * (Alta/Normal/Baja), cada una con el mismo criterio de siempre —fichero
 * suelto o subcarpeta de paciente—. Se le crean las cuatro subcarpetas de
 * siempre (Alta/Normal/Baja/Importadas) si todavía no las tenía, igual
 * que se hace al elegir la carpeta de entrada por primera vez.
 */
function candidatosDeDoctor(carpetaDoctor: string, delegado: string): readonly CandidatoImportacion[] {
  for (const nombre of [...Object.values(NOMBRE_CARPETA_PRIORIDAD), CARPETA_IMPORTADAS]) {
    mkdirSync(join(carpetaDoctor, nombre), { recursive: true })
  }
  const carpetaImportadas = join(carpetaDoctor, CARPETA_IMPORTADAS)

  const { archivos, subcarpetas } = listarEntradas(carpetaDoctor)
  const deArchivosSueltos = archivos.map((nombre): CandidatoImportacion => ({
    rutaOrigen: join(carpetaDoctor, nombre),
    esCarpeta: false,
    prioridad: 'NORMAL',
    delegado,
    carpetaImportadas,
    archivosDentro: [],
  }))
  const deSubcarpetasDePaciente = subcarpetas
    .filter((nombre) => !NOMBRES_RESERVADOS.has(nombre))
    .flatMap((nombre): readonly CandidatoImportacion[] => {
      const rutaSub = join(carpetaDoctor, nombre)
      const dentro = archivosValidos(rutaSub)
      if (dentro.length === 0) return []
      return [
        {
          rutaOrigen: rutaSub,
          esCarpeta: true,
          prioridad: 'NORMAL',
          delegado,
          carpetaImportadas,
          archivosDentro: dentro,
        },
      ]
    })
  const deLasPrioridades = (
    Object.entries(NOMBRE_CARPETA_PRIORIDAD) as [PrioridadBandeja, string][]
  ).flatMap(([prioridad, carpeta]) =>
    candidatosDe(join(carpetaDoctor, carpeta), prioridad, delegado, carpetaImportadas),
  )

  return [...deArchivosSueltos, ...deSubcarpetasDePaciente, ...deLasPrioridades]
}

export class ServicioBandeja {
  constructor(
    private readonly dep: {
      readonly carpetas: Carpetas
      readonly nuevoId: () => string
      readonly ahora: () => Date
    },
  ) {}

  listar(): readonly EntradaBandeja[] {
    return ordenarBandeja(leerBandeja(this.dep.carpetas))
  }

  crear(datos: {
    readonly delegado: string
    readonly descripcion: string
    readonly prioridad: PrioridadBandeja
    readonly notas: string
    /** Con qué fotos de la carpeta de entrada nace enganchada (D84/D86). Sin ellas, una entrada a mano. */
    readonly rutasFotos?: readonly string[]
  }): readonly EntradaBandeja[] {
    const delegado = datos.delegado.trim()
    if (delegado === '') throw new Error('Falta decir de qué delegado viene el aviso.')
    const entrada: EntradaBandeja = {
      id: this.dep.nuevoId(),
      delegado,
      descripcion: datos.descripcion.trim(),
      prioridad: datos.prioridad,
      notas: datos.notas.trim(),
      creadoEn: this.dep.ahora().toISOString(),
      casoCodigo: null,
      enviado: false,
      rutasFotos: datos.rutasFotos ?? [],
    }
    const siguientes = [...leerBandeja(this.dep.carpetas), entrada]
    guardarBandeja(this.dep.carpetas, siguientes)
    return ordenarBandeja(siguientes)
  }

  editar(
    id: string,
    datos: {
      readonly delegado?: string
      readonly descripcion?: string
      readonly prioridad?: PrioridadBandeja
      readonly notas?: string
    },
  ): readonly EntradaBandeja[] {
    return this.actualizar(id, (entrada) => ({
      ...entrada,
      ...(datos.delegado !== undefined ? { delegado: datos.delegado.trim() } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion.trim() } : {}),
      ...(datos.prioridad !== undefined ? { prioridad: datos.prioridad } : {}),
      ...(datos.notas !== undefined ? { notas: datos.notas.trim() } : {}),
    }))
  }

  /** Engancha esta entrada a un caso real — desde aquí, su estado se lee del caso. */
  vincularCaso(id: string, casoCodigo: string): readonly EntradaBandeja[] {
    return this.actualizar(id, (entrada) => ({ ...entrada, casoCodigo }))
  }

  marcarEnviado(id: string, enviado: boolean): readonly EntradaBandeja[] {
    return this.actualizar(id, (entrada) => ({ ...entrada, enviado }))
  }

  eliminar(id: string): readonly EntradaBandeja[] {
    const siguientes = leerBandeja(this.dep.carpetas).filter((e) => e.id !== id)
    guardarBandeja(this.dep.carpetas, siguientes)
    return ordenarBandeja(siguientes)
  }

  /** La carpeta de entrada configurada (D84), o `null` si todavía no se ha elegido ninguna. */
  carpetaEntrada(): string | null {
    return leerCarpetaEntrada(this.dep.carpetas)
  }

  /**
   * Guarda la carpeta y prepara sus subcarpetas —Alta/Normal/Baja e
   * Importadas—, para que ya estén ahí cuando se vaya a meter la primera
   * foto desde el móvil.
   */
  configurarCarpetaEntrada(ruta: string): void {
    guardarCarpetaEntrada(this.dep.carpetas, ruta)
    for (const nombre of [...Object.values(NOMBRE_CARPETA_PRIORIDAD), CARPETA_IMPORTADAS]) {
      mkdirSync(join(ruta, nombre), { recursive: true })
    }
  }

  /**
   * Busca fotos nuevas en la carpeta de entrada (D84/D86/D102): un
   * fichero suelto en la raíz cuenta como prioridad Normal (para no
   * perderlo si todavía no se clasificó); en Alta/Normal/Baja, con esa
   * prioridad. Una SUBCARPETA de la raíz que NO sea Alta/Normal/Baja/
   * Importadas se trata como **la carpeta de un doctor** (D102,
   * 24/09/2026): dentro puede tener sus propias fotos sueltas, sus
   * propias subcarpetas de paciente, y sus propias Alta/Normal/Baja —
   * exactamente la misma estructura que la raíz, un nivel más adentro—,
   * y el nombre de esa carpeta se usa como delegado del aviso, en vez del
   * genérico «Carpeta de entrada». Cada candidato —fichero o carpeta
   * entera— se archiva en la «Importadas» que le toque (la del doctor, o
   * la de la raíz) tal cual, así una segunda búsqueda no lo vuelve a
   * traer, y se crea una entrada de bandeja enganchada a sus copias ya
   * archivadas. Un fallo con UN candidato (por ejemplo, todavía
   * sincronizando desde OneDrive) no para el resto: se salta y sigue con
   * los demás.
   */
  buscarFotosNuevas(): readonly EntradaBandeja[] {
    const raiz = this.carpetaEntrada()
    if (!raiz) throw new Error('Todavía no has elegido una carpeta de entrada.')
    const importadasRaiz = join(raiz, CARPETA_IMPORTADAS)
    mkdirSync(importadasRaiz, { recursive: true })

    // La raíz solo mira ficheros sueltos y subcarpetas de doctor, nunca
    // subcarpetas de paciente directamente: «Alta», «Normal», «Baja» e
    // «Importadas» son subcarpetas suyas, y tratarlas como si fueran una
    // carpeta de paciente cualquiera las agrupaba ENTERAS en un aviso
    // —moviendo, por duplicado, lo que ya iba a mover el escaneo de cada
    // prioridad de abajo— (fallo encontrado al escribir el test
    // correspondiente, nunca llegó a manos del dueño). La agrupación por
    // subcarpeta de paciente (D86) solo tiene sentido DENTRO de una
    // prioridad ya elegida, o directamente dentro de la carpeta de un
    // doctor (D102) — nunca en la raíz misma, donde una subcarpeta sin
    // reconocer solo puede ser la de un doctor.
    const { subcarpetas: subcarpetasRaiz } = listarEntradas(raiz)
    const carpetasDeDoctor = subcarpetasRaiz.filter((nombre) => !NOMBRES_RESERVADOS.has(nombre))

    const candidatos: readonly CandidatoImportacion[] = [
      ...archivosValidos(raiz).map((nombre): CandidatoImportacion => ({
        rutaOrigen: join(raiz, nombre),
        esCarpeta: false,
        prioridad: 'NORMAL',
        delegado: DELEGADO_SIN_DOCTOR,
        carpetaImportadas: importadasRaiz,
        archivosDentro: [],
      })),
      ...(Object.entries(NOMBRE_CARPETA_PRIORIDAD) as [PrioridadBandeja, string][]).flatMap(
        ([prioridad, carpeta]) =>
          candidatosDe(join(raiz, carpeta), prioridad, DELEGADO_SIN_DOCTOR, importadasRaiz),
      ),
      ...carpetasDeDoctor.flatMap((nombreDoctor) =>
        candidatosDeDoctor(join(raiz, nombreDoctor), nombreDoctor),
      ),
    ]

    const actuales = leerBandeja(this.dep.carpetas)
    const nuevas: EntradaBandeja[] = []
    for (const candidato of candidatos) {
      try {
        const nombreOriginal = basename(candidato.rutaOrigen)
        const destino = rutaLibre(candidato.carpetaImportadas, nombreOriginal)
        renameSync(candidato.rutaOrigen, destino)
        const rutasFotos = candidato.esCarpeta
          ? candidato.archivosDentro.map((nombre) => join(destino, nombre))
          : [destino]
        const descripcion = candidato.esCarpeta
          ? nombreOriginal
          : nombreOriginal.slice(0, nombreOriginal.length - extname(nombreOriginal).length)
        nuevas.push({
          id: this.dep.nuevoId(),
          delegado: candidato.delegado,
          descripcion,
          prioridad: candidato.prioridad,
          notas: '',
          creadoEn: this.dep.ahora().toISOString(),
          casoCodigo: null,
          enviado: false,
          rutasFotos,
        })
      } catch (e) {
        console.error(`[carpeta de entrada] no se pudo importar ${candidato.rutaOrigen}`, e)
      }
    }

    const siguientes = [...actuales, ...nuevas]
    guardarBandeja(this.dep.carpetas, siguientes)
    return ordenarBandeja(siguientes)
  }

  private actualizar(
    id: string,
    cambiar: (entrada: EntradaBandeja) => EntradaBandeja,
  ): readonly EntradaBandeja[] {
    const actuales = leerBandeja(this.dep.carpetas)
    if (!actuales.some((e) => e.id === id)) {
      throw new Error('Esa entrada de la bandeja ya no existe.')
    }
    const siguientes = actuales.map((e) => (e.id === id ? cambiar(e) : e))
    guardarBandeja(this.dep.carpetas, siguientes)
    return ordenarBandeja(siguientes)
  }
}
