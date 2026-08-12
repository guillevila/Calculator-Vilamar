/**
 * @vilamar/domain — El modelo canónico de Calculator Vilamar.
 *
 * Este paquete no sabe qué es Electron, ni React, ni Playwright, ni un fichero.
 * Es lógica pura, se prueba sin navegador y es el único sitio donde se decide
 * qué significa un dato biométrico y qué se puede hacer con él.
 *
 * Si un cambio te obliga a importar aquí algo del navegador o del sistema de
 * ficheros, el cambio está mal planteado.
 */

export * from './modelo/lateralidad.js'
export * from './modelo/campos.js'
export * from './modelo/procedencia.js'
export * from './modelo/medida.js'
export * from './modelo/documento.js'
export * from './modelo/calculadoras.js'
export * from './modelo/caso.js'
export * from './modelo/preparar-entradas.js'
export * from './normalizacion/perfiles.js'
export * from './normalizacion/normalizar.js'
export * from './validacion/validar.js'
export * from './comparacion/comparar.js'
