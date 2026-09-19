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
 */

import { basename, extname, join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'

import type { EntradaBandeja, PrioridadBandeja } from '@vilamar/domain'
import { CARPETA_IMPORTADAS, NOMBRE_CARPETA_PRIORIDAD, ordenarBandeja } from '@vilamar/domain'

import type { Carpetas } from '@vilamar/casos'
import {
  guardarBandeja,
  guardarCarpetaEntrada,
  leerBandeja,
  leerCarpetaEntrada,
} from '@vilamar/casos'

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

/** Un candidato a aviso nuevo: uno o varios ficheros que se mueven juntos a «Importadas». */
interface CandidatoImportacion {
  readonly rutaOrigen: string
  readonly esCarpeta: boolean
  readonly prioridad: PrioridadBandeja
  /** Solo cuando `esCarpeta`: los nombres de fichero que hay dentro, para reconstruir sus rutas tras moverla. */
  readonly archivosDentro: readonly string[]
}

function candidatosDe(
  ubicacion: string,
  prioridad: PrioridadBandeja,
): readonly CandidatoImportacion[] {
  const { archivos, subcarpetas } = listarEntradas(ubicacion)
  const deArchivos = archivos.map((nombre): CandidatoImportacion => ({
    rutaOrigen: join(ubicacion, nombre),
    esCarpeta: false,
    prioridad,
    archivosDentro: [],
  }))
  const deSubcarpetas = subcarpetas.flatMap((nombre): readonly CandidatoImportacion[] => {
    const rutaSub = join(ubicacion, nombre)
    const dentro = archivosValidos(rutaSub)
    // Una subcarpeta vacía, o sin ninguna foto válida todavía, no genera
    // ningún aviso — se espera a que tenga algo que traer.
    if (dentro.length === 0) return []
    return [{ rutaOrigen: rutaSub, esCarpeta: true, prioridad, archivosDentro: dentro }]
  })
  return [...deArchivos, ...deSubcarpetas]
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
   * Busca fotos nuevas en la carpeta de entrada (D84/D86): un fichero
   * suelto en la raíz cuenta como prioridad Normal (para no perderlo si
   * todavía no se clasificó); en Alta/Normal/Baja, con esa prioridad.
   * Una SUBCARPETA (el nombre del paciente, típicamente) agrupa todas sus
   * fotos en un solo aviso. Cada candidato —fichero o carpeta entera— se
   * archiva en «Importadas» tal cual, así una segunda búsqueda no lo
   * vuelve a traer, y se crea una entrada de bandeja enganchada a sus
   * copias ya archivadas. Un fallo con UN candidato (por ejemplo, todavía
   * sincronizando desde OneDrive) no para el resto: se salta y sigue con
   * los demás.
   */
  buscarFotosNuevas(): readonly EntradaBandeja[] {
    const raiz = this.carpetaEntrada()
    if (!raiz) throw new Error('Todavía no has elegido una carpeta de entrada.')
    const importadas = join(raiz, CARPETA_IMPORTADAS)
    mkdirSync(importadas, { recursive: true })

    // La raíz SOLO mira ficheros sueltos, nunca subcarpetas: «Alta»,
    // «Normal», «Baja» e «Importadas» son subcarpetas suyas, y tratarlas
    // como si fueran una carpeta de paciente cualquiera las agrupaba
    // ENTERAS en un aviso —moviendo, por duplicado, lo que ya iba a mover
    // el escaneo de cada prioridad de abajo— (fallo encontrado al escribir
    // el test correspondiente, nunca llegó a manos del dueño). La
    // agrupación por subcarpeta (D86) solo tiene sentido DENTRO de una
    // prioridad ya elegida.
    const candidatos: readonly CandidatoImportacion[] = [
      ...archivosValidos(raiz).map((nombre): CandidatoImportacion => ({
        rutaOrigen: join(raiz, nombre),
        esCarpeta: false,
        prioridad: 'NORMAL',
        archivosDentro: [],
      })),
      ...(Object.entries(NOMBRE_CARPETA_PRIORIDAD) as [PrioridadBandeja, string][]).flatMap(
        ([prioridad, carpeta]) => candidatosDe(join(raiz, carpeta), prioridad),
      ),
    ]

    const actuales = leerBandeja(this.dep.carpetas)
    const nuevas: EntradaBandeja[] = []
    for (const candidato of candidatos) {
      try {
        const nombreOriginal = basename(candidato.rutaOrigen)
        const destino = rutaLibre(importadas, nombreOriginal)
        renameSync(candidato.rutaOrigen, destino)
        const rutasFotos = candidato.esCarpeta
          ? candidato.archivosDentro.map((nombre) => join(destino, nombre))
          : [destino]
        const descripcion = candidato.esCarpeta
          ? nombreOriginal
          : nombreOriginal.slice(0, nombreOriginal.length - extname(nombreOriginal).length)
        nuevas.push({
          id: this.dep.nuevoId(),
          delegado: 'Carpeta de entrada',
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
