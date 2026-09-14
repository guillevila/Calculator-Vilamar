import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Los tres procesos de Electron se construyen por separado.
 *
 * `externalizeDepsPlugin` deja fuera del paquete las dependencias de node_modules
 * —Playwright, pdfjs y tesseract— porque cargan binarios y ficheros de datos por
 * su cuenta y no deben empaquetarse.
 *
 * Pero los paquetes del propio monorepo (`@vilamar/*`) SÍ hay que empaquetarlos:
 * son TypeScript sin compilar, y si se dejan fuera, Electron intenta importar un
 * `.ts` en tiempo de ejecución y la aplicación no arranca. El síntoma es el peor
 * posible —la ventana no aparece y no se ve ningún error salvo que se mire la
 * salida de error— así que conviene no volver a tocarlo sin probar el arranque.
 */
const paquetesDelMonorepo = [
  '@vilamar/domain',
  '@vilamar/extraction',
  '@vilamar/integrations',
  '@vilamar/report',
  '@anthropic-ai/sdk',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: paquetesDelMonorepo })],
    build: { outDir: 'out/main' },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: paquetesDelMonorepo })],
    build: { outDir: 'out/preload' },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: 'src/renderer/index.html' },
    },
  },
})
