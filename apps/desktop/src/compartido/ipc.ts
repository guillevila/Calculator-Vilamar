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
  Sexo,
  Aviso,
  ResultadoCalculadora,
} from '@vilamar/domain'

/**
 * Un fichero que se va a leer. Llega por RUTA o, si no hay ruta, por contenido.
 *
 * Se admiten los dos caminos porque ninguno funciona siempre:
 *
 *  - **La ruta** es lo preferible: el proceso principal lee el fichero una sola
 *    vez, donde tiene acceso al disco, y no se copia nada por IPC. Es lo que se
 *    usa al elegir un fichero con el diálogo del sistema.
 *  - **El contenido** hace falta para los ficheros arrastrados a la ventana:
 *    `webUtils.getPathForFile` a veces devuelve una cadena vacía y entonces no
 *    hay ruta que mandar. Se comprobó que un `Uint8Array` **sí sobrevive
 *    íntegro al IPC** —llega con su tipo, su longitud y sus bytes—, así que es
 *    un camino perfectamente válido; solo copia datos de más.
 *
 * Exactamente uno de los dos tiene que venir.
 */
export interface ArchivoEntrante {
  readonly nombre: string
  readonly ruta?: string
  readonly datos?: Uint8Array
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

  /** Lee los documentos indicados, por ruta o por contenido. */
  readonly cargarDocumentos: (
    archivos: readonly ArchivoEntrante[],
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

  /**
   * Escribe a mano el nombre del paciente y/o del cirujano.
   *
   * Lo usa `FormularioManual`, la vía de entrada 100% manual: estos dos
   * campos no vienen de ningún documento, así que no hay un `editarMedida`
   * que valga (no son `CampoBiometrico`, son del caso, no de un ojo).
   */
  readonly establecerIdentificacion: (datos: {
    readonly nombrePaciente?: string
    readonly nombreCirujano?: string
  }) => Promise<Caso>

  readonly confirmarCampo: (ojo: Lateralidad, campo: CampoBiometrico) => Promise<Caso>

  /** El sexo del paciente. Lo pide Kane; EVO y Barrett no. */
  readonly elegirSexo: (sexo: Sexo) => Promise<Caso>
  /** Da por bueno un sexo deducido del nombre. Sin esto no sale hacia Kane. */
  readonly confirmarSexo: () => Promise<Caso>
  readonly confirmarTodo: () => Promise<Caso>
  readonly validar: () => Promise<readonly Aviso[]>
  /**
   * Elige el modelo de lente y resuelve su constante A desde la tabla del informe.
   *
   * Devuelve los avisos junto al caso, y no solo el caso, porque lo importante de
   * esta operación muchas veces es lo que NO ha hecho: «esa lente no está en el
   * informe, escribe la constante» o «se ha quitado la constante de la lente
   * anterior». Sin eso, la pantalla solo vería un hueco y parecería un fallo.
   */
  readonly elegirLente: (
    fabricante: string,
    modelo: string,
  ) => Promise<{
    readonly caso: Caso
    readonly avisos: readonly string[]
    readonly emparejamiento: 'ENCONTRADA' | 'AMBIGUA' | 'NO_ESTA'
  }>

  /**
   * Calcula el CASO ENTERO: cada calculadora, para cada ojo que tenga datos.
   *
   * Ya no recibe un ojo, y ese era el problema: la pantalla mandaba el de la
   * pestaña activa, así que un caso con OD y OS dejaba el segundo sin calcular.
   * Los avances llegan por `alProgresar`, y cada uno dice de qué ojo habla.
   */
  readonly calcular: (
    calculadoras?: readonly Calculadora[],
  ) => Promise<readonly ResultadoCalculadora[]>

  /**
   * Vuelve a ejecutar lo que falló, y solo lo que falló.
   *
   * Sin argumentos, todo lo pendiente. Con `calculadora`, los ojos de esa que no
   * tengan resultado aprovechable. Con las dos cosas, esa casilla exacta.
   * Lo que ya salió bien no se repite.
   */
  readonly reintentar: (
    calculadora?: Calculadora,
    ojo?: Lateralidad,
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
  establecerIdentificacion: 'vilamar:establecer-identificacion',
  confirmarCampo: 'vilamar:confirmar-campo',
  elegirSexo: 'vilamar:elegir-sexo',
  confirmarSexo: 'vilamar:confirmar-sexo',
  confirmarTodo: 'vilamar:confirmar-todo',
  validar: 'vilamar:validar',
  elegirLente: 'vilamar:elegir-lente',
  calcular: 'vilamar:calcular',
  reintentar: 'vilamar:reintentar',
  cancelarCalculo: 'vilamar:cancelar-calculo',
  generarPdf: 'vilamar:generar-pdf',
  abrirCarpetaInformes: 'vilamar:abrir-carpeta-informes',
  progreso: 'vilamar:progreso',
  casoCambiado: 'vilamar:caso-cambiado',
} as const
