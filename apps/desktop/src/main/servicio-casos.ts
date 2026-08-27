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

import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  Calculadora,
  CampoBiometrico,
  Caso,
  Lateralidad,
  OjoBiometrico,
  Aviso,
  ResultadoCalculadora,
  Sexo,
} from '@vilamar/domain'
import {
  CALCULADORAS,
  VARIANTE_CARA_POSTERIOR,
  casoNuevo as crearCasoNuevo,
  confirmar,
  confirmarMedida,
  conOjo,
  conResultado,
  corregirMedida,
  aportarSexo,
  confirmarSexo as confirmarSexoDelDominio,
  deducirSexoDelNombre,
  describirLente,
  ejeCurvoDe,
  elegirLente as elegirLenteDelDominio,
  estimarLenteRecomendada,
  fichaDe,
  sexoDeducidoDelNombre,
  sexoDelInforme,
  formatoDeNombre,
  necesitaComprobacionHumana,
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

import type { ArchivoEntrante, EstadoCalculo, ResumenExtraccion } from '../compartido/ipc.js'
import type { Carpetas } from './almacen.js'
import { guardarCaso, guardarDocumento, nuevoId, siguienteCodigo } from './almacen.js'
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
        const yaHabia = caso.ojos[lateralidad]
        if (yaHabia && Object.keys(yaHabia.medidas).length > 0) {
          // Dos documentos con el mismo ojo. NO se mezclan solos: eso sería dar
          // por hecho que son de la misma persona.
          avisos.push(
            `Ya había datos del ${lateralidad} de otro documento. Los de «${archivo.nombre}» NO se han mezclado: revísalos y edítalos a mano si quieres usarlos.`,
          )
          continue
        }
        caso = conOjo(caso, this.conValoresPorDefecto(leido), this.iso())
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
   */
  editarMedida(lado: Lateralidad, campo: CampoBiometrico, valor: number | null): Caso {
    const caso = this.exigirCaso()
    const ojo = ojoDe(caso, lado)
    const actualizado =
      valor === null ? sinMedida(ojo, campo) : corregirMedida(ojo, campo, valor, this.iso())
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

    if (salida.sexo !== undefined) return salida

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
      // es la respuesta correcta: lo elige una persona.
      avisos.push(
        'No se ha podido deducir el sexo del nombre del informe, y Kane lo pide. Elígelo tú en la pantalla de revisión.',
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

  confirmarCampo(lado: Lateralidad, campo: CampoBiometrico): Caso {
    const caso = this.exigirCaso()
    return this.establecer(conOjo(caso, confirmarMedida(ojoDe(caso, lado), campo), this.iso()))
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
        const medida = ojo.medidas[campo]
        // Lo leído por una máquina y lo calculado por el programa se quedan sin
        // confirmar: lo tiene que marcar la persona campo por campo.
        if (medida && necesitaComprobacionHumana(medida.procedencia)) continue
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
  ): {
    caso: Caso
    avisos: readonly string[]
    emparejamiento: 'ENCONTRADA' | 'AMBIGUA' | 'NO_ESTA'
  } {
    const caso = this.exigirCaso()
    const r = elegirLenteDelDominio(caso, { fabricante, modelo }, this.iso())
    return {
      caso: this.establecer(r.caso),
      avisos: r.avisos,
      emparejamiento: r.emparejamiento.estado,
    }
  }

  // ── Cálculo ──────────────────────────────────────────────────────────────

  /**
   * Calcula el CASO ENTERO: cada calculadora, para cada ojo que tenga datos.
   *
   * Antes esto recibía un `lado` y calculaba solo ese, así que un caso con los
   * dos ojos confirmados dejaba el segundo sin calcular y había que volver a
   * lanzar el flujo. No era un fallo de ninguna web: es que **nadie pedía el
   * segundo ojo**. Ahora la lista de casillas la construye el orquestador a
   * partir del caso.
   */
  async calcular(calculadoras?: readonly Calculadora[]): Promise<readonly ResultadoCalculadora[]> {
    const caso = this.exigirCaso()
    const base = planificarCaso(caso, calculadoras !== undefined ? { calculadoras } : undefined)
    return this.ejecutar(this.conVariantesDeCaraPosterior(caso, base))
  }

  /**
   * Añade, junto a cada casilla de una calculadora con variante de córnea
   * posterior (D45 — EVO se la quita, Barrett se la añade), la casilla de esa
   * variante — pero solo en los ojos que de verdad tienen PK1 o PK2. Un ojo
   * sin córnea posterior medida no necesita comparación: sería calcular lo
   * mismo dos veces.
   */
  private conVariantesDeCaraPosterior(
    caso: Caso,
    tareas: readonly TareaCalculo[],
  ): readonly TareaCalculo[] {
    return tareas.flatMap((t) => {
      const variante = VARIANTE_CARA_POSTERIOR[t.calculadora]
      if (!variante) return [t]
      const ojo = ojoDe(caso, t.ojo)
      return tiene(ojo, 'PK1') || tiene(ojo, 'PK2')
        ? [t, { calculadora: variante.calculadora, ojo: t.ojo }]
        : [t]
    })
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
  ): Promise<readonly ResultadoCalculadora[]> {
    const caso = this.exigirCaso()

    // Una casilla concreta se ejecuta aunque su estado no sea de los que se
    // reintentan solos: si el usuario la señala, es que quiere justo esa.
    if (calculadora !== undefined && ojo !== undefined) {
      return this.ejecutar([{ calculadora, ojo }])
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
        alTerminarUna: (resultado) => {
          caso = this.establecer(conResultado(this.caso ?? caso, resultado, this.iso()))
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

  async generarPdf(): Promise<{ ruta: string }> {
    const caso = this.exigirCaso()
    const datos = recopilarInforme(caso, {
      version: this.dep.version,
      generadoEn: this.iso(),
      resultados: this.recopilarResultadosParaInforme(caso),
    })
    const html = generarHtmlInforme(datos)

    const marca = this.iso().replace(/[:.]/g, '-').slice(0, 19)
    const destino = join(this.dep.carpetas.informes, `${caso.codigo}_${marca}.pdf`)

    // Se guarda también el HTML: si el PDF falla, el informe no se pierde.
    writeFileSync(destino.replace(/\.pdf$/, '.html'), html, 'utf8')
    await this.dep.imprimirPdf(html, destino)
    return { ruta: destino }
  }

  /**
   * Lo que el informe enseña de cada casilla (calculadora × ojo): la captura
   * ya en base64, la lente que se destacó y, si no hubo resultado
   * utilizable, por qué. Solo aquí hay `fs` — `recopilarInforme` y
   * `generarHtmlInforme` son funciones puras y no lo tocan.
   *
   * **Ninguna casilla se omite en silencio.** Antes esto se saltaba
   * (`continue`) las que no tenían éxito; ahora entran igual, con `fallo` en
   * vez de `dataUri`, para que el informe explique la ausencia en la propia
   * página en vez de que desaparezca sin explicación.
   */
  private recopilarResultadosParaInforme(caso: Caso): readonly ResultadoInforme[] {
    const resultados: ResultadoInforme[] = []
    const anadirCasilla = (c: Calculadora, ojo: Lateralidad): void => {
      const r = resultadoDe(caso, c, ojo)

      if (r && (r.estado === 'SUCCESS' || r.estado === 'PARTIAL')) {
        const png = r.capturaId ? this.dep.capturas.leer(r.capturaId) : null
        // La estimación es SIEMPRE el criterio propio (D43), de acuerdo con la
        // opción que la web haya destacado o no — nunca `r.recomendada`, que es
        // lo que la calculadora eligió. Las dos cosas no se confunden: esto es
        // una estimación orientativa y no vinculante, y se enseña como tal.
        const estimada = estimarLenteRecomendada(r.opciones, ejeCurvoDe(ojoDe(caso, ojo)))
        resultados.push({
          calculadora: c,
          ojo,
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
        fallo: r?.mensaje ?? `${fichaDe(c).nombre} no se ha calculado para este ojo.`,
      })
    }

    // Calculadora a calculadora, como siempre (D39) — y dentro de cada ojo,
    // si esa calculadora tiene variante de córnea posterior (D45) y el ojo de
    // verdad tiene PK1 o PK2, las dos hojas salen seguidas: la que NO tiene
    // córnea posterior primero, la que SÍ la tiene después — da igual cuál de
    // las dos sea la calculadora base y cuál la variante (EVO se la quita a
    // la base; Barrett se la añade). Un ojo sin esos datos no saca la
    // variante: nunca se intentó, y meterla igualmente enseñaría un aviso de
    // fallo sobre algo que no hacía falta calcular.
    for (const c of CALCULADORAS) {
      for (const ojo of ojosDelCaso(caso)) {
        const variante = VARIANTE_CARA_POSTERIOR[c]
        if (!variante) {
          anadirCasilla(c, ojo)
          continue
        }
        const datos = ojoDe(caso, ojo)
        const hayCaraPosterior = tiene(datos, 'PK1') || tiene(datos, 'PK2')
        const orden: readonly Calculadora[] =
          variante.sentido === 'SIN' ? [variante.calculadora, c] : [c, variante.calculadora]
        for (const clave of orden) {
          if (clave === variante.calculadora && !hayCaraPosterior) continue
          anadirCasilla(clave, ojo)
        }
      }
    }
    return resultados
  }
}
