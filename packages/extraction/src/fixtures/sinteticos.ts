/**
 * sinteticos.ts — Informes de mentira para probar el programa.
 *
 * ⚠️ TODOS LOS DATOS DE ESTE FICHERO SON INVENTADOS.
 *
 * No proceden de ninguna persona, no se han copiado de ningún informe real y no
 * describen a ningún paciente. Están escritos a mano imitando la FORMA en que
 * estos aparatos presentan sus medidas, para poder probar la lectura sin meter
 * un documento clínico en el repositorio.
 *
 * Que un parser lea bien estos textos NO demuestra que lea bien un informe de
 * verdad. Demuestra que el motor de reglas funciona. La diferencia está escrita
 * en `PROJECT_STATUS.md` y no se debe difuminar.
 */

/** ANTERION, dos ojos, formato por secciones. */
export const ANTERION_OD_OS = `
HEIDELBERG ENGINEERING          ANTERION
Cataract App - Biometry Report
Report generated: 2026-01-01

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
AQD (endo)     2.65 mm
LT             4.53 mm
CCT             530 um
WTW           11.90 mm
Target Refraction  0.00 D
nk = 1.3375

OS
AL            24.01 mm
K1            40.27 D @ 8
K2            42.68 D @ 98
ACD (epi)      3.23 mm
AQD (endo)     2.70 mm
LT             4.48 mm
CCT             533 um
WTW           11.80 mm
Target Refraction -0.25 D
nk = 1.3375
`

/** ANTERION, solo ojo derecho. */
export const ANTERION_SOLO_OD = `
HEIDELBERG ENGINEERING ANTERION
Cataract App

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
LT             4.53 mm
CCT             530 um
WTW           11.90 mm
`

/**
 * ANTERION antiguo: publica AQD y grosor corneal, pero NO la ACD.
 *
 * Es el caso que justifica la capa de normalización. Las tres calculadoras
 * necesitan la ACD, y en este aparato se puede obtener: la ACD se mide desde el
 * epitelio y la AQD desde el endotelio, así que entre las dos está justo el
 * grosor de la córnea.
 *
 *   AQD 2.65 mm + CCT 530 µm (0.530 mm) = ACD 3.18 mm
 */
export const ANTERION_ANTIGUO_SIN_ACD = `
HEIDELBERG ENGINEERING          ANTERION
Cataract App - Biometry Report

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
AQD (endo)     2.65 mm
LT             4.53 mm
CCT             530 um
WTW           11.90 mm
`

/**
 * ANTERION antiguo SIN grosor corneal: hay AQD, pero no hay con qué sumarla.
 *
 * Comprueba que no se inventa la ACD cuando falta un ingrediente. Media córnea
 * no es media derivación: o están los dos datos o no hay dato.
 */
export const ANTERION_AQD_SIN_CCT = `
HEIDELBERG ENGINEERING          ANTERION
Cataract App

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
AQD (endo)     2.65 mm
LT             4.53 mm
WTW           11.90 mm
`

/**
 * ANTERION con las tres medidas, y no cuadran.
 *
 * ACD 3.18, AQD 2.10 y CCT 530 µm: los tres son valores perfectamente normales
 * por separado, la AQD es menor que la ACD como debe ser, y aun así 2.10 + 0.530
 * son 2.63 y no 3.18. Uno de los tres está mal, y el programa **no elige cuál**.
 */
export const ANTERION_ACD_INCOHERENTE = `
HEIDELBERG ENGINEERING          ANTERION
Cataract App

OD
AL            24.07 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD (epi)      3.18 mm
AQD (endo)     2.10 mm
CCT             530 um
`

/**
 * Un informe que trae AQD y CCT pero no se sabe de qué aparato es.
 *
 * La suma daría un número plausible, y por eso mismo NO se hace: si no se sabe
 * desde qué superficie mide ese aparato, el resultado podría ser correcto o
 * podría estar medio milímetro desviado, y las dos cosas se parecen.
 */
export const DESCONOCIDO_CON_AQD_Y_CCT = `
Biometry summary sheet

OD
AL            23.90 mm
K1            43.10 D @ 10
K2            44.20 D @ 100
AQD            2.55 mm
CCT             540 um
`

/** IOLMaster 700, formato de dos columnas — el más habitual. */
export const IOLMASTER_DOS_COLUMNAS = `
ZEISS IOLMaster 700
SWEPT SOURCE BIOMETRY

                    OD              OS
AL               23.85 mm        23.91 mm
ACD               3.05 mm         3.11 mm
LT                4.62 mm         4.58 mm
WTW              11.70 mm        11.75 mm
CCT                545 um          548 um
K1               43.15 D         43.02 D
K2               44.28 D         44.35 D
`

/** IOLMaster 700 con queratometría total y ejes. */
export const IOLMASTER_CON_TK = `
ZEISS IOLMaster 700
Total Keratometry

OD
AL      23.85 mm
K1      43.15 D @ 12
K2      44.28 D @ 102
TK1     43.02 D @ 14
TK2     44.41 D @ 104
ACD      3.05 mm
LT       4.62 mm
WTW     11.70 mm
CCT       545 um

OS
AL      23.91 mm
K1      43.02 D @ 170
K2      44.35 D @ 80
TK1     42.88 D @ 172
TK2     44.49 D @ 82
ACD      3.11 mm
LT       4.58 mm
WTW     11.75 mm
CCT       548 um
`

/**
 * Pentacam. NO da longitud axial: es un topógrafo, no un biómetro.
 * Sirve para comprobar que un campo que el aparato no mide sale como
 * «no encontrado» y no como un número inventado.
 */
export const PENTACAM_OD = `
OCULUS PENTACAM
Scheimpflug Tomography
Holladay Report

OD
K1 (front)    42.10 D @ 5
K2 (front)    43.40 D @ 95
K1 (back)     -6.20 D @ 92
K2 (back)     -6.55 D @ 2
Pachy Apex      552 um
Thinnest        548 um
`

/** Un informe sin marcas de ojo: no se puede saber de cuál es. */
export const SIN_MARCA_DE_OJO = `
Biometry summary
AL    24.07 mm
K1    41.22 D @ 175
K2    42.52 D @ 85
ACD    3.18 mm
`

/**
 * Un informe con un error de lectura típico: la longitud axial con el punto
 * decimal en el sitio equivocado. El programa tiene que AVISAR, no arreglarlo.
 */
export const CON_ERROR_DE_COMA = `
HEIDELBERG ENGINEERING ANTERION

OD
AL           240.7 mm
K1            41.22 D @ 175
K2            42.52 D @ 85
ACD            3.18 mm
`

/** Un documento del que no se saca nada: un PDF sin texto útil. */
export const SIN_DATOS = `
Clinic report
Page 1 of 1
Printed on 2026-01-01
`
