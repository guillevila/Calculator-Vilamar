/**
 * variante-sin-cara-posterior.ts — Ejecuta un adaptador dos veces: con los
 * datos del caso tal cual, y sin la córnea posterior (D45, 27/08/2026).
 *
 * Petición expresa del dueño del proyecto: comparar el resultado de EVO con
 * y sin PK1/PK2, para los casos donde esa medida está disponible. No hace
 * falta tocar el adaptador real ni duplicar ningún selector: `prepararEntradas()`
 * ya construye las entradas campo a campo según la ficha de cada calculadora
 * (`packages/domain/src/modelo/calculadoras.ts`), así que la ficha de la
 * variante «sin córnea posterior» simplemente no incluye PK1/PK1_EJE/PK2/PK2_EJE
 * en sus opcionales — las entradas que le llegan a este envoltorio YA vienen
 * sin esos campos, del mismo modo que a Barrett nunca le llega el WTW si la
 * ficha no lo pide.
 *
 * Lo único que hace este envoltorio es delegar en el adaptador real y volver
 * a etiquetar el resultado con la calculadora de la variante — si no,
 * `ResultadoCalculadora.calculadora` saldría con el nombre del adaptador
 * interno (`EVO_TORIC`) y pisaría el resultado de la ejecución CON córnea
 * posterior al guardarse, porque los resultados se guardan por calculadora.
 */

import type { Calculadora, EntradasCalculadora } from '@vilamar/domain'

import type { AdaptadorCalculadora, ContextoEjecucion } from './contrato.js'
import type { ResultadoCalculadora } from '@vilamar/domain'

export class AdaptadorSinCaraPosterior implements AdaptadorCalculadora {
  constructor(
    private readonly interno: AdaptadorCalculadora,
    readonly calculadora: Calculadora,
  ) {}

  get nombre(): string {
    return this.interno.nombre
  }

  get url(): string {
    return this.interno.url
  }

  get requiereNavegadorVisible(): boolean {
    return this.interno.requiereNavegadorVisible
  }

  validarEntradas(entradas: EntradasCalculadora): readonly string[] {
    return this.interno.validarEntradas(entradas)
  }

  async ejecutar(contexto: ContextoEjecucion): Promise<ResultadoCalculadora> {
    const resultado = await this.interno.ejecutar(contexto)
    return { ...resultado, calculadora: this.calculadora }
  }
}
