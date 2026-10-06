#!/usr/bin/env node
/**
 * empaquetar-para-compartir.mjs — Prepara un .zip listo para darle la
 * aplicación a otra persona, en su propio ordenador.
 *
 * Petición expresa del dueño del proyecto (06/10/2026, D119): cada
 * optometrista que use Calculator Vilamar tiene su PROPIO ordenador, con su
 * propia copia independiente de la aplicación — sin servidor, sin datos
 * compartidos, cada uno con su propia lista de doctores y sus propios casos
 * (ver «Agenda de doctores», D80). No hace falta ningún sistema de cuentas:
 * ya es así en cuanto cada copia vive en un ordenador distinto, porque los
 * datos de cada caso y cada doctor se guardan en la carpeta de datos de
 * Windows de quien la abre (`app.getPath('userData')`), nunca dentro de la
 * propia aplicación instalada. Este script solo hace más rápido el paso
 * manual de siempre: generar el paquete y copiarlo a mano a un USB.
 *
 *     pnpm compartir
 *
 * Qué hace, en orden:
 *
 *   1. `pnpm dist` — compila y empaqueta la aplicación entera, con su
 *      propio Chromium de Playwright ya incluido (ver
 *      `preparar-navegador-empaquetado.mjs`): quien reciba el .zip no
 *      tiene que instalar nada más, ni Node, ni pnpm, ni Playwright.
 *   2. Comprime `apps/desktop/dist/win-unpacked` entero en un único
 *      fichero `.zip`, con la fecha de hoy en el nombre, dentro de
 *      `apps/desktop/dist/` (ya está en `.gitignore`, igual que el resto
 *      de esa carpeta).
 *
 * Usa el `7za.exe` que ya trae `electron-builder` (el mismo paquete de
 * siempre, `7zip-bin`, ahora declarado como dependencia explícita en vez de
 * depender de que otro paquete lo arrastre) — no una librería nueva, misma
 * razón de siempre en este proyecto para no añadir dependencias que no
 * hagan falta (ver `docs/ARQUITECTURA.md`, sección de módulos nativos).
 *
 * No se usa `Compress-Archive` de PowerShell: se probó primero, y falla con
 * esta aplicación en concreto porque el Chromium de Playwright que se
 * incluye trae rutas muy profundas (p. ej.
 * `resources\playwright-browsers\chromium_headless_shell-...\...\
 * PrivacySandboxAttestationsPreloaded\privacy-sandbox-attestations.dat`) que,
 * sumadas a la ruta larga de esta carpeta del proyecto, superan el límite
 * clásico de 260 caracteres de Windows — y `Compress-Archive` no lo soporta.
 * Encima, el error no paraba el script: parecía que había terminado bien sin
 * haber creado el .zip. `7za.exe` no tiene ese límite.
 *
 * El .zip pesa varios cientos de MB (lleva su propio Chromium): se manda
 * mejor por USB o una carpeta compartida que por email.
 */

import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { path7za } from '7zip-bin'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpetaOrigen = join(raiz, 'apps', 'desktop', 'dist', 'win-unpacked')
const fecha = new Date().toISOString().slice(0, 10)
const destinoZip = join(raiz, 'apps', 'desktop', 'dist', `Calculator-Vilamar-${fecha}.zip`)

console.log('1/2 — Generando el paquete (pnpm dist)…\n')
try {
  execFileSync('pnpm', ['dist'], { cwd: raiz, stdio: 'inherit', shell: true })
} catch {
  // "pnpm dist" termina en "error" en este equipo porque el paso de firma
  // de código de electron-builder falla —sin privilegios de administrador
  // para crear los enlaces simbólicos que necesita, lección ya conocida
  // del proyecto—, pero eso pasa DESPUÉS de haber escrito el paquete
  // entero. No es un fallo real: se comprueba mirando si el paquete
  // existe, no el código de salida.
}

if (!existsSync(carpetaOrigen)) {
  console.error(
    `\n✕ No se ha encontrado ${carpetaOrigen} — "pnpm dist" no ha debido terminar bien.`,
  )
  process.exit(1)
}

console.log(`\n2/2 — Comprimiendo en un único archivo:\n  ${destinoZip}\n`)
if (existsSync(destinoZip)) rmSync(destinoZip)

// `-mx=1` (compresión mínima): este .zip ya va lleno de binarios
// (Chromium, el .exe) que apenas se comprimen, así que no merece la pena
// esperar más por una compresión más fuerte.
execFileSync(path7za, ['a', '-tzip', '-mx=1', destinoZip, join(carpetaOrigen, '*')], {
  stdio: 'inherit',
})

if (!existsSync(destinoZip)) {
  console.error(
    `\n✕ "7za" ha terminado pero no se ha creado ${destinoZip}. Revisa el mensaje de arriba.`,
  )
  process.exit(1)
}

console.log(
  `\n✓ Listo. Copia este fichero a un USB o carpeta compartida, y en el\n` +
    `  ordenador de la persona nueva solo hace falta descomprimirlo y abrir\n` +
    `  «Calculator Vilamar.exe» de dentro — nada más que instalar.\n` +
    `  (Windows avisará de «Editor desconocido»: Más información → Ejecutar\n` +
    `  de todas formas, es normal, la aplicación no está firmada.)\n\n` +
    `  ${destinoZip}`,
)
