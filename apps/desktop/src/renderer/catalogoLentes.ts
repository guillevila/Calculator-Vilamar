/**
 * catalogoLentes.ts — El catálogo de lentes conocidas: su constante A
 * cuando la hay (D69) y sus nombres en EVO/Kane cuando difieren del modelo
 * general (D50).
 *
 * Datos puros, sin React ni nada de Electron — a propósito, para poder
 * reutilizarse desde cualquier sitio sin arrastrar el resto de la interfaz
 * de escritorio. Vivía dentro de `SelectorLente.tsx`; se sacó aquí el
 * 20/09/2026 para que `apps/movil` (la PWA del móvil) pueda usar el MISMO
 * catálogo — nunca transcribirlo de nuevo: una constante clínica copiada a
 * mano dos veces ya dio un error real una vez (D69, LuxSmart 118.4 en vez
 * de 118.5).
 *
 * **Estos NO traen constante**, salvo los marcados con `constanteConocida`
 * — ver más abajo. La constante, si no, sale del informe o la escribe la
 * persona.
 *
 * `nombreEnEvo`/`nombreEnKane` existen porque el MISMO modelo físico se llama
 * distinto en cada desplegable (petición expresa del dueño, 27/08/2026):
 * «B&L LuxSmart» en EVO es «B+L LuxSmart Toric» en Kane. Sin ellos, cada
 * adaptador busca `modelo` tal cual — sigue así para los modelos de esta
 * lista que ya se llaman igual en las dos webs.
 *
 * `constanteConocida` es D69 (corregida 05/09/2026, petición expresa del
 * dueño del proyecto): Barrett no tiene desplegable de lentes, así que —a
 * diferencia de EVO y Kane, que resuelven su propia constante en su propia
 * web— nunca tenía forma de recibir una sin escribirla a mano cada vez.
 * Son las constantes **oficiales del fabricante, dadas por el propio
 * dueño** — las mismas que usan los desplegables de EVO y Kane. **Tienen
 * prioridad sobre la tabla de lentes del propio informe**, si la hubiera:
 * el dueño confirmó que esa tabla viene equivocada con frecuencia. Se
 * aplican directamente, sin pedir comprobación humana (ver
 * `@vilamar/domain`, `seleccion-lente.ts`) — lo único que respetan por
 * encima es una constante que haya escrito una persona.
 */
export interface LenteCatalogada {
  readonly fabricante: string
  readonly modelo: string
  readonly nombreEnEvo?: string
  readonly nombreEnKane?: string
  readonly constanteConocida?: number
}

export const MODELOS_DE_LAS_CALCULADORAS: readonly LenteCatalogada[] = [
  { fabricante: 'Alcon', modelo: 'Alcon SN6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon SA6ATx' },
  { fabricante: 'Alcon', modelo: 'Alcon Vivity' },
  { fabricante: 'Alcon', modelo: 'Alcon Panoptix' },
  { fabricante: 'Johnson & Johnson', modelo: 'Tecnis' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60T' },
  { fabricante: 'Bausch & Lomb', modelo: 'B&L MX60ET/PT', constanteConocida: 119.1 },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L Aspire',
    nombreEnEvo: 'B&L Aspire',
    nombreEnKane: 'B+L enVista Aspire Toric',
    constanteConocida: 119.1,
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L Envy',
    nombreEnEvo: 'B&L Envy',
    nombreEnKane: 'B+L enVista Envy Toric',
    constanteConocida: 119.28,
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxGood',
    nombreEnEvo: 'B&L LuxGood',
    nombreEnKane: 'B+L LuxGood Toric',
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxSmart',
    nombreEnEvo: 'B&L LuxSmart',
    nombreEnKane: 'B+L LuxSmart Toric',
    constanteConocida: 118.5,
  },
  {
    fabricante: 'Bausch & Lomb',
    modelo: 'B&L LuxLife',
    nombreEnEvo: 'B&L LuxLife',
    nombreEnKane: 'B+L LuxLife Toric',
    constanteConocida: 118.63,
  },
  { fabricante: 'Rayner', modelo: 'Rayner EMV' },
  { fabricante: 'ZEISS', modelo: 'Zeiss 709M/MP' },
]
