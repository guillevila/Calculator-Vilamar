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
  EstadoCaso,
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

/**
 * Lo mínimo de un caso guardado para poder elegirlo en una lista, sin tener
 * que cargarlo entero (02/09/2026: «Casos guardados», para volver a abrir
 * uno después de cerrar la aplicación).
 */
export interface ResumenCasoGuardado {
  readonly codigo: string
  readonly estado: EstadoCaso
  readonly actualizadoEn: string
  /** Si el caso lo tiene — nunca sale de este ordenador (D44), y aquí tampoco. */
  readonly nombrePaciente?: string
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
  /** Los casos ya guardados, más recientes primero. */
  readonly listarCasosGuardados: () => Promise<readonly ResumenCasoGuardado[]>
  /** Vuelve a abrir un caso guardado, tal y como se dejó. */
  readonly abrirCaso: (codigo: string) => Promise<Caso>

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

  /**
   * @param aparato De qué biómetro es este dato (D47, 27/08/2026). Sin
   *   especificarlo, el aparato principal — el único que hay en un caso que
   *   no usa varios.
   */
  readonly editarMedida: (
    ojo: Lateralidad,
    campo: CampoBiometrico,
    valor: number | null,
    aparato?: string,
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

  readonly confirmarCampo: (
    ojo: Lateralidad,
    campo: CampoBiometrico,
    aparato?: string,
  ) => Promise<Caso>

  /** El sexo del paciente. Lo pide Kane; EVO y Barrett no. */
  readonly elegirSexo: (sexo: Sexo) => Promise<Caso>
  /** Da por bueno un sexo deducido del nombre. Sin esto no sale hacia Kane. */
  readonly confirmarSexo: () => Promise<Caso>
  readonly confirmarTodo: () => Promise<Caso>
  readonly validar: () => Promise<readonly Aviso[]>

  /**
   * Discrepancias entre los aparatos de un mismo ojo, ya confirmados (D47).
   *
   * Vacío si el ojo tiene un solo aparato, o si los que tiene no discrepan.
   */
  readonly discrepanciasDe: (ojo: Lateralidad) => Promise<
    readonly {
      readonly campo: CampoBiometrico
      readonly aparatoA: string
      readonly valorA: number
      readonly aparatoB: string
      readonly valorB: number
      readonly diferencia: number
    }[]
  >
  /** La persona ha mirado la discrepancia de este ojo y decide seguir adelante. */
  readonly reconocerDiscrepancia: (ojo: Lateralidad) => Promise<Caso>
  /**
   * Cambia el nombre de un aparato ya existente, sin tocar sus medidas
   * (D47, 27/08/2026) — es lo que permite elegir o escribir de qué biómetro
   * es el primer aparato de un ojo, sin necesitar añadir un segundo.
   * Rechaza el cambio si `aparatoNuevo` ya pertenece a otro aparato de ese
   * mismo ojo.
   */
  readonly renombrarAparato: (
    ojo: Lateralidad,
    aparatoViejo: string,
    aparatoNuevo: string,
  ) => Promise<Caso>
  /**
   * Con qué aparato se midió la córnea posterior de este dataset, si es
   * distinto del aparato general (02/09/2026, corrige D58) — `undefined` la
   * quita, y vuelve a usar el aparato general de siempre.
   */
  readonly editarAparatoCaraPosterior: (
    ojo: Lateralidad,
    aparato: string,
    aparatoCaraPosterior: string | undefined,
  ) => Promise<Caso>
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
    /**
     * Cómo se llama esta lente en el desplegable de EVO/Kane, cuando
     * difiere del nombre general (petición expresa del dueño, 27/08/2026)
     * — ver `LenteElegida` en `@vilamar/domain`.
     */
    nombreEnEvo?: string,
    nombreEnKane?: string,
  ) => Promise<{
    readonly caso: Caso
    readonly avisos: readonly string[]
    readonly emparejamiento: 'ENCONTRADA' | 'AMBIGUA' | 'NO_ESTA'
  }>

  /**
   * Aparca una segunda lente candidata, para comparar con la misma
   * biometría sin volver a escribirla (D55, 01/09/2026). No participa en
   * ningún cálculo hasta que `intercambiarLentes` la activa. Sin
   * argumento, la quita.
   */
  readonly elegirLenteSecundaria: (eleccion?: {
    readonly fabricante?: string
    readonly modelo: string
    readonly nombreEnEvo?: string
    readonly nombreEnKane?: string
  }) => Promise<Caso>

  /**
   * Activa la lente aparcada — pasa a ser la que se calcula, con su propia
   * constante A, y la que era la activa pasa a aparcada — y borra los
   * resultados ya calculados: eran de la lente anterior (D55, 01/09/2026).
   */
  readonly intercambiarLentes: () => Promise<{
    readonly caso: Caso
    readonly avisos: readonly string[]
  }>

  /**
   * Calcula el caso, o solo el dataset que se indique: cada calculadora, para
   * cada ojo y aparato que tenga datos.
   *
   * Ya no recibe un ojo por defecto, y ese era el problema: la pantalla
   * mandaba el de la pestaña activa, así que un caso con OD y OS dejaba el
   * segundo sin calcular. Los avances llegan por `alProgresar`, y cada uno
   * dice de qué ojo habla.
   *
   * @param filtro Restringe a un ojo y/o un aparato (D47, 27/08/2026) — es lo
   *   que permite calcular un biómetro mientras otro del mismo ojo sigue a
   *   medias, sin esperar a que los dos estén listos.
   */
  readonly calcular: (
    calculadoras?: readonly Calculadora[],
    filtro?: { readonly ojo?: Lateralidad; readonly aparato?: string },
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

  /**
   * Genera un PDF por ojo (D47, 27/08/2026) y devuelve dónde se ha guardado
   * cada uno. Un caso de un solo ojo devuelve una sola ruta, igual que antes.
   */
  readonly generarPdf: () => Promise<{
    readonly rutas: readonly { readonly ojo: Lateralidad; readonly ruta: string }[]
  }>
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
  listarCasosGuardados: 'vilamar:listar-casos-guardados',
  abrirCaso: 'vilamar:abrir-caso',
  cargarDocumentos: 'vilamar:cargar-documentos',
  elegirYCargarDocumentos: 'vilamar:elegir-y-cargar',
  editarMedida: 'vilamar:editar-medida',
  establecerIdentificacion: 'vilamar:establecer-identificacion',
  confirmarCampo: 'vilamar:confirmar-campo',
  elegirSexo: 'vilamar:elegir-sexo',
  confirmarSexo: 'vilamar:confirmar-sexo',
  confirmarTodo: 'vilamar:confirmar-todo',
  validar: 'vilamar:validar',
  discrepanciasDe: 'vilamar:discrepancias-de',
  reconocerDiscrepancia: 'vilamar:reconocer-discrepancia',
  renombrarAparato: 'vilamar:renombrar-aparato',
  editarAparatoCaraPosterior: 'vilamar:editar-aparato-cara-posterior',
  elegirLente: 'vilamar:elegir-lente',
  elegirLenteSecundaria: 'vilamar:elegir-lente-secundaria',
  intercambiarLentes: 'vilamar:intercambiar-lentes',
  calcular: 'vilamar:calcular',
  reintentar: 'vilamar:reintentar',
  cancelarCalculo: 'vilamar:cancelar-calculo',
  generarPdf: 'vilamar:generar-pdf',
  abrirCarpetaInformes: 'vilamar:abrir-carpeta-informes',
  progreso: 'vilamar:progreso',
  casoCambiado: 'vilamar:caso-cambiado',
} as const
