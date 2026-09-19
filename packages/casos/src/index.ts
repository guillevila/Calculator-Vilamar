/**
 * @vilamar/casos — `ServicioCasos` y todo lo que necesita para guardar en
 * disco, sin saber nada de Electron.
 *
 * Vivía dentro de `apps/desktop/src/main/` porque hasta ahora solo lo usaba
 * la app de escritorio. Se sacó a un paquete propio (20/09/2026, Fase 1 del
 * plan móvil — `docs/PLAN-APP-MOVIL.md`) para que un servidor Node
 * (`apps/server`) pueda reutilizarlo tal cual, dándole sus propias
 * implementaciones de lo que sí depende de dónde corre: imprimir el PDF,
 * abrir el navegador de las calculadoras y avisar a la interfaz de los
 * avances. Es un movimiento mecánico — mismo comportamiento, mismos tests —
 * no una reescritura.
 */

export * from './tipos.js'
export * from './almacen.js'
export * from './capturas.js'
export * from './diagnostico.js'
export * from './servicio-casos.js'
