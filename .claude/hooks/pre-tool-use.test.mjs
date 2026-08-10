import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Prueba del hook REAL, ejecutándolo como lo ejecuta Claude Code.
 *
 * No basta con probar `revisarComandoGit` —eso ya se hace en `guard-git.test.mjs`—
 * porque el fallo puede estar en el cable: que el hook no llame a la guardia, que
 * no lea bien la entrada, o que salga con el código equivocado.
 *
 * Ese último detalle es el que más caro sale: **para bloquear hay que salir con
 * código 2**. Con 1, o con cualquier otro, Claude Code lo trata como un aviso y
 * ejecuta el comando igualmente. Una versión anterior de este hook usaba 1, así
 * que no bloqueaba nada aunque pareciera que sí.
 *
 * Nota de por qué esto vive en un fichero y no en un comando suelto: al probarlo
 * a mano desde la terminal, el propio guardián bloqueaba la orden de prueba,
 * porque contenía los textos peligrosos. Desde aquí no pasa.
 */

const HOOK = fileURLToPath(new URL('./pre-tool-use.mjs', import.meta.url))

/** Lanza el hook con una orden y devuelve con qué código salió y qué dijo. */
function ejecutar(command) {
  const resultado = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  })
  return {
    bloqueado: resultado.status === 2,
    codigo: resultado.status,
    mensaje: `${resultado.stderr ?? ''}${resultado.stdout ?? ''}`,
  }
}

describe('el hook bloquea de verdad, y con el código correcto', () => {
  const peligrosos = [
    ['push directo a la rama principal', 'git push origin master'],
    ['force push', ['git', 'push', '--force', 'origin', 'x'].join(' ')],
    ['reset destructivo', ['git', 'reset', '--hard', 'HEAD'].join(' ')],
    ['borrar la rama principal', 'git branch -D master'],
    ['resolver todos los conflictos de golpe', 'git checkout --ours .'],
  ]

  for (const [descripcion, orden] of peligrosos) {
    it(`bloquea: ${descripcion}`, () => {
      const r = ejecutar(orden)
      expect(r.bloqueado).toBe(true)
      // 2 y no otro: es lo único que Claude Code entiende como «no lo hagas».
      expect(r.codigo).toBe(2)
    })
  }

  it('explica el motivo y la alternativa, no solo que no', () => {
    const r = ejecutar('git push origin master')
    expect(r.mensaje).toContain('BLOQUEADO')
    expect(r.mensaje).toContain('Pull Request')
  })
})

describe('el hook NO estorba en el trabajo normal', () => {
  const normales = [
    'git status',
    'git fetch origin',
    'git checkout -b feature/algo',
    'git add -A',
    'git commit -m "feat: algo"',
    'git push -u origin feature/algo',
    'git push -u origin integration/rama-into-master',
    'git checkout --ours packages/domain/src/urls.ts',
    'pnpm test',
    'pnpm typecheck',
  ]

  for (const orden of normales) {
    it(`permite: ${orden}`, () => {
      expect(ejecutar(orden).bloqueado).toBe(false)
    })
  }
})

describe('no rompe lo que el hook ya protegía', () => {
  it('sigue bloqueando el acceso a ficheros con credenciales', () => {
    const resultado = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '.env' } }),
      encoding: 'utf8',
    })
    expect(resultado.status).toBe(2)
  })

  it('pero deja leer la plantilla de ejemplo', () => {
    const resultado = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '.env.example' } }),
      encoding: 'utf8',
    })
    expect(resultado.status).toBe(0)
  })
})
