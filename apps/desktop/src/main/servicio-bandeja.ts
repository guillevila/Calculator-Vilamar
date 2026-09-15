/**
 * servicio-bandeja.ts — La cola de avisos de los delegados (D81, 15/09/2026;
 * carpeta de entrada por prioridad D84, 16/09/2026).
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
 * `rutaFoto` apuntando a su copia ya archivada — «Empezar» la carga sola.
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

function archivosValidos(carpeta: string): readonly string[] {
  try {
    return readdirSync(carpeta).filter((nombre) => {
      const ruta = join(carpeta, nombre)
      return statSync(ruta).isFile() && EXTENSIONES_VALIDAS.has(extname(nombre).toLowerCase())
    })
  } catch {
    return []
  }
}

/** El mismo nombre si está libre; si no, «nombre (2).ext», «nombre (3).ext»… */
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
    /** Con qué foto de la carpeta de entrada nace enganchada (D84). Sin ella, una entrada a mano. */
    readonly rutaFoto?: string | null
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
      rutaFoto: datos.rutaFoto ?? null,
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
   * Busca fotos nuevas en la carpeta de entrada (D84): una suelta en la
   * raíz cuenta como prioridad Normal (para no perderla si todavía no se
   * clasificó); una en Alta/Normal/Baja, con esa prioridad. Cada una se
   * archiva en «Importadas» —así una segunda búsqueda no la vuelve a
   * traer— y se crea una entrada de bandeja enganchada a su copia
   * archivada. Un fallo con UN fichero (por ejemplo, todavía sincronizando
   * desde OneDrive) no para el resto: se salta y sigue con los demás.
   */
  buscarFotosNuevas(): readonly EntradaBandeja[] {
    const raiz = this.carpetaEntrada()
    if (!raiz) throw new Error('Todavía no has elegido una carpeta de entrada.')
    const importadas = join(raiz, CARPETA_IMPORTADAS)
    mkdirSync(importadas, { recursive: true })

    const candidatos: { readonly ruta: string; readonly prioridad: PrioridadBandeja }[] = [
      ...archivosValidos(raiz).map((nombre) => ({
        ruta: join(raiz, nombre),
        prioridad: 'NORMAL' as const,
      })),
      ...(Object.entries(NOMBRE_CARPETA_PRIORIDAD) as [PrioridadBandeja, string][]).flatMap(
        ([prioridad, carpeta]) => {
          const rutaCarpeta = join(raiz, carpeta)
          return archivosValidos(rutaCarpeta).map((nombre) => ({
            ruta: join(rutaCarpeta, nombre),
            prioridad,
          }))
        },
      ),
    ]

    const actuales = leerBandeja(this.dep.carpetas)
    const nuevas: EntradaBandeja[] = []
    for (const candidato of candidatos) {
      try {
        const nombreOriginal = basename(candidato.ruta)
        const destino = rutaLibre(importadas, nombreOriginal)
        renameSync(candidato.ruta, destino)
        nuevas.push({
          id: this.dep.nuevoId(),
          delegado: 'Carpeta de entrada',
          descripcion: nombreOriginal.slice(
            0,
            nombreOriginal.length - extname(nombreOriginal).length,
          ),
          prioridad: candidato.prioridad,
          notas: '',
          creadoEn: this.dep.ahora().toISOString(),
          casoCodigo: null,
          enviado: false,
          rutaFoto: destino,
        })
      } catch (e) {
        console.error(`[carpeta de entrada] no se pudo importar ${candidato.ruta}`, e)
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
