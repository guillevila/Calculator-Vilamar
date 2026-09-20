/**
 * crear-usuario-servidor.ts — Da de alta una cuenta para entrar en
 * `apps/server` (Fase 2 del plan móvil, `docs/PLAN-APP-MOVIL.md`).
 *
 * Sin registro público a propósito: con dos o tres personas de confianza,
 * añadir una cuenta es un gesto del dueño en su propia terminal, no un
 * formulario abierto en internet. Se ejecuta en el ordenador donde vive
 * `VILAMAR_SERVER_DATOS` —el mismo servidor, o cualquier máquina con acceso
 * a esa carpeta—, nunca hace falta que el servidor esté arrancado.
 *
 * Uso:
 *
 *     pnpm crear-usuario-servidor --usuario ana --nombre "Ana Vilamar"
 *
 * Pide la contraseña por teclado (se ve al escribirla — es una herramienta
 * de un solo uso, para ejecutar a solas, no una pantalla de producción).
 */

import { createInterface } from 'node:readline/promises'

import { raicesDelServidor } from '../apps/server/src/dependencias.js'
import { crearUsuario } from '../apps/server/src/usuarios.js'

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const usuario = argumento('usuario')
const nombre = argumento('nombre')

if (!usuario || !nombre) {
  console.error('Uso: pnpm crear-usuario-servidor --usuario <nombre-de-entrada> --nombre "<Nombre completo>"')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const contrasena = await rl.question('Contraseña para esta cuenta: ')
rl.close()

if (contrasena.length < 8) {
  console.error('La contraseña tiene que tener al menos 8 caracteres.')
  process.exit(1)
}

const raices = raicesDelServidor()
const creado = crearUsuario(raices.datos, { usuario, nombre, contrasena })
console.log(`✓ Cuenta creada: ${creado.nombre} (usuario «${creado.usuario}»), en ${raices.datos}`)
