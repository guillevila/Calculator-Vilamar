/**
 * pdf.ts — Convierte HTML en PDF con el Chromium headless de Playwright.
 *
 * La app de escritorio usa una `BrowserWindow` oculta de Electron y
 * `webContents.printToPDF` (`apps/desktop/src/main/index.ts`); un servidor
 * no tiene Electron, así que aquí se hace lo mismo con una página headless
 * de Playwright. Mismo HTML de siempre (`@vilamar/report`, sin cambios) y
 * el mismo margen cero a propósito: el informe ya trae sus propios
 * márgenes por hoja — ver el comentario en la versión de escritorio.
 */

import { chromium, type Browser } from 'playwright'

let navegadorPdf: Browser | null = null

async function obtenerNavegadorPdf(): Promise<Browser> {
  if (navegadorPdf?.isConnected()) return navegadorPdf
  navegadorPdf = await chromium.launch({ headless: true })
  return navegadorPdf
}

export async function imprimirPdfServidor(html: string, destino: string): Promise<void> {
  const navegador = await obtenerNavegadorPdf()
  const pagina = await navegador.newPage()
  try {
    await pagina.setContent(html, { waitUntil: 'networkidle' })
    const pdf = await pagina.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(destino, pdf)
  } finally {
    await pagina.close()
  }
}

/** Cierra el navegador compartido de impresión — para un apagado limpio. */
export async function cerrarNavegadorPdf(): Promise<void> {
  if (navegadorPdf) {
    await navegadorPdf.close()
    navegadorPdf = null
  }
}
