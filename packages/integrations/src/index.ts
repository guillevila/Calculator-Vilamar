/**
 * @vilamar/integrations — La única capa que sabe HTML.
 *
 * Aquí dentro vive todo lo que sabe cómo son por dentro Kane, EVO y Barrett:
 * sus direcciones, sus campos, sus botones, sus rarezas y sus formas de fallar.
 *
 * Fuera de `src/adapters/` no debe aparecer ni un selector. Si mañana EVO
 * cambia su botón de calcular, se toca `adapters/evo.ts` y no se entera nadie
 * más.
 */

export * from './contrato.js'
export * from './normalizar.js'
export * from './orquestador.js'
export { AdaptadorEvoToric } from './adapters/evo.js'
export { AdaptadorBarrettToric } from './adapters/barrett.js'
export { AdaptadorKane } from './adapters/kane.js'
