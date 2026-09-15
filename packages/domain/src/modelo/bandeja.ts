/**
 * bandeja.ts — La cola de avisos que llegan de los delegados (D81, 15/09/2026;
 * carpeta de entrada por prioridad D84, 16/09/2026).
 *
 * Petición expresa del dueño del proyecto: recibe casos por WhatsApp de
 * varios delegados y necesita un sitio único, ordenado por prioridad, desde
 * el que ir trabajándolos. La recepción del aviso y el reenvío del PDF
 * siguen siendo manuales —fuera de este programa, por WhatsApp—: lo único
 * que se automatiza es LA ORGANIZACIÓN. Por eso `EntradaBandeja` no guarda
 * nada del mensaje en sí, solo lo mínimo para priorizar y para saber en qué
 * punto va cada uno: a qué `Caso` está enganchada (`casoCodigo`), una vez
 * que se empieza a trabajar — el estado real de ESE trabajo (revisando,
 * calculando, terminado) se lee del propio caso, no se duplica aquí.
 *
 * **La carpeta de entrada** (D84): el dueño guarda las fotos de biometría
 * que le llegan por WhatsApp en una carpeta de OneDrive compartida con el
 * móvil, dentro de tres subcarpetas por prioridad. `NOMBRE_CARPETA_PRIORIDAD`
 * es el único sitio que sabe cómo se llama cada una — si algún día cambian
 * de nombre, es el único punto que hay que tocar.
 */

export type PrioridadBandeja = 'URGENTE' | 'NORMAL' | 'BAJA'

export const NOMBRE_PRIORIDAD: Readonly<Record<PrioridadBandeja, string>> = {
  URGENTE: 'Urgente',
  NORMAL: 'Normal',
  BAJA: 'Baja',
}

/**
 * El nombre de la subcarpeta, dentro de la carpeta de entrada, para cada
 * prioridad — «Alta» y no «Urgente», porque así lo pidió el dueño para las
 * carpetas (el resto de la aplicación sigue diciendo «Urgente»).
 */
export const NOMBRE_CARPETA_PRIORIDAD: Readonly<Record<PrioridadBandeja, string>> = {
  URGENTE: 'Alta',
  NORMAL: 'Normal',
  BAJA: 'Baja',
}

/** Dónde se archiva una foto en cuanto ya tiene su aviso creado en la bandeja. */
export const CARPETA_IMPORTADAS = 'Importadas'

export interface EntradaBandeja {
  readonly id: string
  /** Quién lo manda — el delegado, no el paciente. */
  readonly delegado: string
  /** Nombre del paciente u otra nota para reconocer de qué caso se trata. */
  readonly descripcion: string
  readonly prioridad: PrioridadBandeja
  readonly notas: string
  readonly creadoEn: string
  /** A qué caso corresponde, una vez que se ha empezado a trabajar. `null` = todavía no. */
  readonly casoCodigo: string | null
  /** Se marca a mano cuando el PDF ya se ha reenviado por WhatsApp — no hay forma de saberlo sola. */
  readonly enviado: boolean
  /**
   * La foto de la carpeta de entrada (D84) que dio origen a este aviso, ya
   * archivada en «Importadas» — `null` si la entrada se apuntó a mano. Al
   * pulsar «Empezar», esta foto se carga y se lee sola, en vez de arrancar
   * un caso en blanco.
   */
  readonly rutaFoto: string | null
}

const ORDEN_PRIORIDAD: Readonly<Record<PrioridadBandeja, number>> = {
  URGENTE: 0,
  NORMAL: 1,
  BAJA: 2,
}

/**
 * El orden de la bandeja: lo enviado va al final (ya no hace falta mirarlo);
 * entre lo pendiente, primero la prioridad, y a igual prioridad, quien
 * llegó antes — así la persona no tiene que reordenar nada a mano, solo
 * decir la prioridad de cada aviso nuevo.
 */
export function ordenarBandeja(entradas: readonly EntradaBandeja[]): readonly EntradaBandeja[] {
  return [...entradas].sort((a, b) => {
    if (a.enviado !== b.enviado) return a.enviado ? 1 : -1
    const porPrioridad = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]
    if (porPrioridad !== 0) return porPrioridad
    return a.creadoEn.localeCompare(b.creadoEn)
  })
}
