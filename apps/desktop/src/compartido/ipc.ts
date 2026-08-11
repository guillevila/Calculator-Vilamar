/**
 * ipc.ts — El contrato entre la interfaz y el proceso principal.
 *
 * Los dos lados importan este fichero, así que un cambio aquí rompe la
 * compilación de los dos a la vez. Es lo que se quiere: un contrato que se
 * puede desincronizar en silencio es la clase de fallo que más cuesta
 * encontrar en este tipo de aplicación.
 */

import type {
  Calculadora,
  Caso,
  Lateralidad,
  CampoBiometrico,
  Aviso,
  ResultadoCalculadora,
} from '@vilamar/domain'

/**
 * Un fichero que se va a leer, identificado por su RUTA en el disco.
 *
 * Aquí no viajan bytes, y es a propósito. La primera versión mandaba el
 * contenido del fichero por IPC —y en el caso de «Elegir archivo» lo mandaba dos
 * veces: el proceso principal lo leía, lo enviaba a la pantalla y la pantalla lo
 * devolvía—. En ese viaje el contenido **se perdía**: llegaba un fichero de 0
 * bytes, y todos los errores que salían después (que la imagen no se podía
 * decodificar, que no se encontraban datos) eran síntomas de eso.
 *
 * Mandando la ruta, el fichero se lee UNA vez, en el sitio que tiene acceso al
 * disco, y no hay nada que se pueda perder por el camino.
 */
export interface ArchivoEntrante {
  readonly nombre: string
  readonly ruta: string
}

export interface ResumenExtraccion {
  readonly documentoId: string
  readonly nombreArchivo: string
  readonly dispositivo: string
  readonly nombreDispositivo: string
  readonly confianzaDispositivo: number
  readonly explicacionOjos: string
  readonly ojosEncontrados: readonly Lateralidad[]
  readonly avisos: readonly string[]
}

export interface EstadoCalculo {
  readonly calculadora: Calculadora
  readonly ojo: Lateralidad
  readonly fase: string
  readonly mensaje: string
  readonly requiereUsuario: boolean
}

/** Lo que la interfaz puede pedirle al proceso principal. */
export interface ApiVilamar {
  readonly version: () => Promise<string>

  readonly casoNuevo: () => Promise<Caso>
  readonly casoActual: () => Promise<Caso | null>

  /** Lee los documentos que están en esas rutas. */
  readonly cargarDocumentos: (
    rutas: readonly string[],
  ) => Promise<{ readonly caso: Caso; readonly resumenes: readonly ResumenExtraccion[] }>

  /**
   * Abre el diálogo del sistema, y lee lo que se elija.
   *
   * Todo ocurre en el proceso principal: el contenido de los ficheros no pasa por
   * la pantalla ni una sola vez.
   */
  readonly elegirYCargarDocumentos: () => Promise<{
    readonly caso: Caso
    readonly resumenes: readonly ResumenExtraccion[]
  } | null>

  /**
   * La ruta en disco de un fichero arrastrado a la ventana.
   *
   * El objeto `File` del navegador no la lleva; hay que pedírsela a Electron.
   */
  readonly rutaDeArchivo: (fichero: File) => string

  readonly editarMedida: (
    ojo: Lateralidad,
    campo: CampoBiometrico,
    valor: number | null,
  ) => Promise<Caso>

  readonly confirmarCampo: (ojo: Lateralidad, campo: CampoBiometrico) => Promise<Caso>
  readonly confirmarTodo: () => Promise<Caso>
  readonly validar: () => Promise<readonly Aviso[]>
  readonly elegirLente: (fabricante: string, modelo: string) => Promise<Caso>

  /** Lanza las calculadoras. Los avances llegan por `alProgresar`. */
  readonly calcular: (
    ojo: Lateralidad,
    calculadoras?: readonly Calculadora[],
  ) => Promise<readonly ResultadoCalculadora[]>

  readonly cancelarCalculo: () => Promise<void>

  /** Genera el PDF y devuelve dónde lo ha guardado. */
  readonly generarPdf: () => Promise<{ readonly ruta: string }>
  readonly abrirCarpetaInformes: () => Promise<void>

  /** Suscripciones. Devuelven una función para darse de baja. */
  readonly alProgresar: (escucha: (estado: EstadoCalculo) => void) => () => void
  readonly alCambiarCaso: (escucha: (caso: Caso) => void) => () => void
}

/** Nombres de los canales. En un solo sitio para que no se escriban a mano. */
export const CANALES = {
  version: 'vilamar:version',
  casoNuevo: 'vilamar:caso-nuevo',
  casoActual: 'vilamar:caso-actual',
  cargarDocumentos: 'vilamar:cargar-documentos',
  elegirYCargarDocumentos: 'vilamar:elegir-y-cargar',
  editarMedida: 'vilamar:editar-medida',
  confirmarCampo: 'vilamar:confirmar-campo',
  confirmarTodo: 'vilamar:confirmar-todo',
  validar: 'vilamar:validar',
  elegirLente: 'vilamar:elegir-lente',
  calcular: 'vilamar:calcular',
  cancelarCalculo: 'vilamar:cancelar-calculo',
  generarPdf: 'vilamar:generar-pdf',
  abrirCarpetaInformes: 'vilamar:abrir-carpeta-informes',
  progreso: 'vilamar:progreso',
  casoCambiado: 'vilamar:caso-cambiado',
} as const
