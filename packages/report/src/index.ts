/**
 * @vilamar/report — El informe PDF del caso.
 *
 * Genera HTML puro a partir de un caso ya calculado. Quien lo convierte en PDF
 * es el proceso principal de Electron con `printToPDF`: así no hace falta
 * ninguna librería de PDF, no se compila nada nativo y se maqueta con CSS.
 *
 * Todo lo de este paquete son funciones puras, así que el informe se puede
 * probar sin abrir Electron.
 */

export * from './plantilla.js'
export * from './recopilar.js'
