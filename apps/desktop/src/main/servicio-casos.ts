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

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Lateralidad,
  Aviso,
  ResultadoCalculadora,
} from '@vilamar/domain'
import {
  casoNuevo as crearCasoNuevo,
  confirmar,
  confirmarMedida,
  conMedida,
  conOjo,
  conResultado,
  crearMedida,
  formatoDeNombre,
  NOMBRE_DISPOSITIVO,
  ojoDe,
  ojosDelCaso,
  sinMedida,
  validarOjo,
} from '@vilamar/domain'
import type { DocumentoEntrada, ProveedorExtraccion } from '@vilamar/extraction'
import { extraerDocumento } from '@vilamar/extraction'
import type { EventoProgreso } from '@vilamar/integrations'
import { ejecutarCalculadoras, necesitaVentana } from '@vilamar/integrations'
import { generarHtmlInforme, recopilarInforme } from '@vilamar/report'
import type { Browser } from 'playwright'

import type { ArchivoEntrante, EstadoCalculo, ResumenExtraccion } from '../compartido/ipc.js'
import type { Carpetas } from './almacen.js'
import { guardarCaso, guardarDocumento, nuevoId, siguienteCodigo } from './almacen.js'
import type { Diagnosticador } from './diagnostico.js'

export interface DependenciasServicio {
  readonly carpetas: Carpetas
  readonly proveedor: ProveedorExtraccion
  readonly diagnosticador: Diagnosticador
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

export class ServicioCasos {
  private caso: Caso | null = null
  private cancelar = false

  constructor(private readonly dep: DependenciasServicio) {}

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
    return this.establecer(crearCasoNuevo(nuevoId(), codigo, ahora.toISOString()))
  }

  // ── Documentos ───────────────────────────────────────────────────────────

  /**
   * Carga documentos y los lee.
   *
   * Cada documento se lee por separado y NO se asume ninguna relación entre
   * ellos: si dos informes traen el mismo ojo, el segundo no pisa al primero
   * en silencio — se avisa y se queda el primero, que es lo que el usuario ya
   * ha visto en pantalla.
   */
  async cargarDocumentos(
    archivos: readonly ArchivoEntrante[],
  ): Promise<{ caso: Caso; resumenes: readonly ResumenExtraccion[] }> {
    let caso = this.caso ?? this.nuevo()
    const resumenes: ResumenExtraccion[] = []

    for (const archivo of archivos) {
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

      const guardado = guardarDocumento(this.dep.carpetas, archivo.nombre, archivo.datos)
      const entrada: DocumentoEntrada = {
        id: guardado.id,
        nombre: archivo.nombre,
        formato,
        datos: archivo.datos,
      }

      let resultado: Awaited<ReturnType<typeof extraerDocumento>>
      try {
        resultado = await extraerDocumento(entrada, this.dep.proveedor, { ahora: () => this.iso() })
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

      caso = {
        ...caso,
        documentos: [
          ...caso.documentos,
          {
            id: guardado.id,
            nombre: archivo.nombre,
            tipo: formato === 'pdf' ? 'PDF' : 'IMAGEN',
            formato,
            tamanoBytes: archivo.tamanoBytes,
            paginas: Math.max(1, resultado.ojos ? 1 : 1),
            cargadoEn: this.iso(),
            dispositivoDetectado: resultado.dispositivo,
            ojosDetectados: Object.keys(resultado.ojos) as Lateralidad[],
          },
        ],
      }

      for (const [lado, leido] of Object.entries(resultado.ojos)) {
        const lateralidad = lado as Lateralidad
        const yaHabia = caso.ojos[lateralidad]
        if (yaHabia && Object.keys(yaHabia.medidas).length > 0) {
          // Dos documentos con el mismo ojo. NO se mezclan solos: eso sería dar
          // por hecho que son de la misma persona.
          avisos.push(
            `Ya había datos del ${lateralidad} de otro documento. Los de «${archivo.nombre}» NO se han mezclado: revísalos y edítalos a mano si quieres usarlos.`,
          )
          continue
        }
        caso = conOjo(caso, leido, this.iso())
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
   * Cambia o borra un dato a mano.
   *
   * `valor === null` BORRA el dato: es la forma correcta de decir «esto no lo
   * sabemos». No se pone a cero.
   *
   * Un dato editado a mano queda confirmado por definición: lo acaba de
   * escribir una persona mirándolo.
   */
  editarMedida(lado: Lateralidad, campo: CampoBiometrico, valor: number | null): Caso {
    const caso = this.exigirCaso()
    const ojo = ojoDe(caso, lado)
    const actualizado =
      valor === null
        ? sinMedida(ojo, campo)
        : conMedida(
            ojo,
            crearMedida(campo, lado, valor, { metodo: 'MANUAL', registradoEn: this.iso() }, true),
          )
    return this.establecer(conOjo(caso, actualizado, this.iso()))
  }

  confirmarCampo(lado: Lateralidad, campo: CampoBiometrico): Caso {
    const caso = this.exigirCaso()
    return this.establecer(conOjo(caso, confirmarMedida(ojoDe(caso, lado), campo), this.iso()))
  }

  /**
   * Confirma el caso entero.
   *
   * Es el acto explícito de una persona que abre la puerta hacia las webs. Si
   * hay algún dato IMPOSIBLE, no se confirma: hay que corregirlo antes.
   */
  confirmarTodo(): Caso {
    let caso = this.exigirCaso()

    const invalidos = ojosDelCaso(caso)
      .flatMap((l) => validarOjo(ojoDe(caso, l)))
      .filter((a) => a.nivel === 'INVALID')
    if (invalidos.length > 0) {
      throw new Error(
        `Hay ${invalidos.length} dato(s) que no pueden ser correctos. Corrígelos antes de continuar: ${invalidos
          .map((a) => a.mensaje)
          .join(' ')}`,
      )
    }

    for (const lado of ojosDelCaso(caso)) {
      let ojo = ojoDe(caso, lado)
      for (const campo of Object.keys(ojo.medidas) as CampoBiometrico[]) {
        ojo = confirmarMedida(ojo, campo)
      }
      caso = conOjo(caso, ojo, this.iso())
    }
    return this.establecer(confirmar(caso, this.iso()))
  }

  validar(): readonly Aviso[] {
    const caso = this.caso
    if (!caso) return []
    return ojosDelCaso(caso).flatMap((l) => [...validarOjo(ojoDe(caso, l))])
  }

  elegirLente(fabricante: string, modelo: string): Caso {
    const caso = this.exigirCaso()
    return this.establecer({
      ...caso,
      lente: { fabricante, modelo },
      actualizadoEn: this.iso(),
    })
  }

  // ── Cálculo ──────────────────────────────────────────────────────────────

  async calcular(
    lado: Lateralidad,
    calculadoras?: readonly Calculadora[],
  ): Promise<readonly ResultadoCalculadora[]> {
    let caso = this.exigirCaso()
    this.cancelar = false

    const lista = calculadoras ?? (['EVO_TORIC', 'BARRETT_TORIC', 'KANE'] as const)
    caso = this.establecer({ ...caso, estado: 'CALCULANDO', actualizadoEn: this.iso() })

    const conVentana = necesitaVentana(lista)
    let navegador: Browser | null = null

    try {
      navegador = await this.dep.abrirNavegador(conVentana)
      const resultados = await ejecutarCalculadoras({
        caso,
        ojo: lado,
        calculadoras: lista,
        navegador,
        progreso: (evento: EventoProgreso) =>
          this.dep.emitirProgreso({
            calculadora: evento.calculadora,
            ojo: lado,
            fase: evento.fase,
            mensaje: evento.mensaje,
            requiereUsuario: evento.requiereUsuario ?? false,
          }),
        alTerminarUna: (resultado) => {
          // Se guarda en cuanto llega. Si algo revienta después, lo ya obtenido
          // no se pierde: es la base de poder reintentar solo una.
          caso = this.establecer(conResultado(this.caso ?? caso, resultado, this.iso()))
        },
        ahora: () => this.iso(),
        guardarDiagnostico: this.dep.diagnosticador.guardar,
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

  async generarPdf(): Promise<{ ruta: string }> {
    const caso = this.exigirCaso()
    const datos = recopilarInforme(caso, {
      version: this.dep.version,
      generadoEn: this.iso(),
    })
    const html = generarHtmlInforme(datos)

    const marca = this.iso().replace(/[:.]/g, '-').slice(0, 19)
    const destino = join(this.dep.carpetas.informes, `${caso.codigo}_${marca}.pdf`)

    // Se guarda también el HTML: si el PDF falla, el informe no se pierde.
    writeFileSync(destino.replace(/\.pdf$/, '.html'), html, 'utf8')
    await this.dep.imprimirPdf(html, destino)
    return { ruta: destino }
  }
}
