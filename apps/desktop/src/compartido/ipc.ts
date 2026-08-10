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

/** Un fichero que el usuario suelta o elige. */
export interface ArchivoEntrante {
  readonly nombre: string
  readonly tamanoBytes: number
  /** El contenido. Va por IPC como array de bytes. */
  readonly datos: Uint8Array
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

  /** Sube documentos y los lee. Devuelve el caso actualizado y qué se encontró. */
  readonly cargarDocumentos: (
    archivos: readonly ArchivoEntrante[],
  ) => Promise<{ readonly caso: Caso; readonly resumenes: readonly ResumenExtraccion[] }>

  /** Abre el diálogo del sistema para elegir ficheros. */
  readonly elegirArchivos: () => Promise<readonly ArchivoEntrante[]>

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
  elegirArchivos: 'vilamar:elegir-archivos',
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
