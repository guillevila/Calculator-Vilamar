/**
 * @vilamar/extraction — De un documento a datos biométricos con procedencia.
 *
 * Este paquete no sabe leer PDFs ni imágenes por sí solo, y es a propósito: la
 * tecnología de lectura se inyecta (`ProveedorExtraccion`). Lo que sí sabe es
 * reconocer qué aparato hizo el informe, separar el ojo derecho del izquierdo y
 * convertir etiquetas en medidas del dominio, con la evidencia de dónde salió
 * cada número.
 */

export * from './contratos.js'
export * from './deteccion/detector.js'
export * from './parsers/nucleo.js'
export * from './parsers/segmentar.js'
export * from './parsers/dispositivos.js'
export * from './proveedores/fixture.js'
export * from './pipeline.js'
export * as fixturesSinteticos from './fixtures/sinteticos.js'
