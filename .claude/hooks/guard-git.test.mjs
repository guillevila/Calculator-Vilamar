import { describe, expect, it } from 'vitest'
import { apuntaAPrincipal, argumentos, revisarComandoGit, segmentar } from './guard-git.mjs'

/**
 * Pruebas de la guardia de Git.
 *
 * Un guardián sin probar es peor que no tener guardián: da sensación de
 * protección sin darla. Este proyecto ya sabe lo que cuesta —los cinco hooks
 * estuvieron rotos en silencio durante semanas.
 *
 * La mayoría de los casos de aquí NO los inventé yo: salen de una auditoría
 * adversarial que le encontró **34 agujeros** a la primera versión, que buscaba
 * patrones en el texto crudo del comando. Cada uno tiene su prueba para que no
 * pueda volver.
 *
 * Las dos mitades importan igual: lo que TIENE que bloquear, y lo que NUNCA
 * debe bloquear. Un guardián que estorba en el trabajo diario acaba
 * desactivado, y entonces no protege de nada.
 */

const bloquea = (comando, rama = 'feature/algo') => revisarComandoGit(comando, rama).bloquear

/* ─── Lo que tiene que bloquear ────────────────────────────────────────────── */

describe('protege la rama principal', () => {
  const formas = [
    'git push origin master',
    'git push origin main',
    'git push -u origin master',
    'git push origin HEAD:master',
    'git push origin mi-rama:master',
    // Ruta completa de la referencia: la barra rompía el patrón anterior.
    'git push origin refs/heads/master',
    'git push origin HEAD:refs/heads/master',
    'git push origin mi-rama:refs/heads/master',
    // Las comillas desactivaban la protección entera.
    'git push origin "master"',
    "git push origin 'main'",
  ]

  for (const forma of formas) {
    it(`bloquea: ${forma}`, () => expect(bloquea(forma)).toBe(true))
  }

  it('bloquea borrar la rama principal en el remoto', () => {
    expect(bloquea('git push origin :master')).toBe(true)
    expect(bloquea('git push origin :refs/heads/master')).toBe(true)
    expect(bloquea('git push --delete origin master')).toBe(true)
    expect(bloquea('git push --delete origin refs/heads/master')).toBe(true)
  })

  it('bloquea borrar la rama principal en local', () => {
    expect(bloquea('git branch -D master')).toBe(true)
    expect(bloquea('git branch --delete main')).toBe(true)
  })

  it('bloquea reposicionar la rama principal', () => {
    expect(bloquea('git branch -f master origin/otra')).toBe(true)
    expect(bloquea('git branch -M master')).toBe(true)
    expect(bloquea('git update-ref refs/heads/master abc123')).toBe(true)
  })

  it('bloquea `git push` a secas estando en la principal', () => {
    // Publica la rama actual, que es master.
    expect(bloquea('git push', 'master')).toBe(true)
    expect(bloquea('git push', 'feature/algo')).toBe(false)
  })
})

describe('protege la historia del repositorio', () => {
  it('bloquea el force push escrito de todas las formas', () => {
    expect(bloquea('git push --force origin x')).toBe(true)
    expect(bloquea('git push --force-with-lease origin x')).toBe(true)
    expect(bloquea('git push --force-with-lease=x:abc origin x')).toBe(true)
    expect(bloquea('git push -f origin x')).toBe(true)
    // Flags cortos agrupados: una sola letra pegada lo esquivaba.
    expect(bloquea('git push -uf origin x')).toBe(true)
    expect(bloquea('git push -fu origin x')).toBe(true)
    expect(bloquea('git push -qf origin x')).toBe(true)
    // El refspec `+rama` ES un force push, aunque no lo parezca.
    expect(bloquea('git push origin +master')).toBe(true)
    expect(bloquea('git push origin +mi-rama')).toBe(true)
    expect(bloquea('git push origin +HEAD:refs/heads/master')).toBe(true)
  })

  it('bloquea los push que operan sobre TODAS las ramas', () => {
    // --mirror borra en el remoto lo que no exista en local. Sin nombrar nada.
    expect(bloquea('git push --mirror origin')).toBe(true)
    expect(bloquea('git push --all origin')).toBe(true)
    expect(bloquea('git push --prune origin')).toBe(true)
  })

  it('bloquea git clean -f, que borra sin papelera', () => {
    expect(bloquea('git clean -f')).toBe(true)
    expect(bloquea('git clean -fd')).toBe(true)
    expect(bloquea('git clean -xfd')).toBe(true)
    // Pero mirar qué se llevaría es justo lo que hay que hacer antes.
    expect(bloquea('git clean -n')).toBe(false)
    expect(bloquea('git clean --dry-run')).toBe(false)
  })

  it('bloquea reset --hard', () => {
    expect(bloquea('git reset --hard')).toBe(true)
    expect(bloquea('git reset --hard HEAD~3')).toBe(true)
    expect(bloquea('git reset --hard origin/master')).toBe(true)
  })

  it('bloquea la reescritura masiva y el borrado del reflog', () => {
    expect(bloquea('git filter-branch --tree-filter x HEAD')).toBe(true)
    expect(bloquea('git reflog expire --expire=now --all')).toBe(true)
  })

  it('bloquea crear alias, que esconden lo que se ejecuta', () => {
    expect(bloquea('git config alias.yolo "push --force"')).toBe(true)
  })
})

describe('protege el trabajo de la otra persona', () => {
  it('bloquea resolver TODOS los conflictos escogiendo un lado', () => {
    expect(bloquea('git checkout --ours .')).toBe(true)
    expect(bloquea('git checkout --theirs .')).toBe(true)
    expect(bloquea('git checkout --ours -- .')).toBe(true)
    expect(bloquea('git restore --theirs .')).toBe(true)
    expect(bloquea('git checkout --ours *')).toBe(true)
    // Con algo detrás: el ancla de fin de línea lo dejaba pasar.
    expect(bloquea('git checkout --ours . && git commit -m listo')).toBe(true)
  })

  it('pero SÍ deja resolver un fichero concreto', () => {
    expect(bloquea('git checkout --ours packages/domain/src/selectors.ts')).toBe(false)
    expect(bloquea('git checkout --theirs apps/desktop/src/main/index.ts')).toBe(false)
  })
})

/**
 * El agujero más grave de todos: un comando de lectura al principio eximía a
 * TODO lo que viniera detrás. Anulaba las cinco reglas de golpe.
 */
describe('un comando inofensivo delante no exime a los de detrás', () => {
  const encadenados = [
    'git status && git push -f origin master',
    'git log -1 && git push origin master',
    'git log && git reset --hard HEAD',
    'git remote -v && git branch -D master',
    'git show HEAD | head -5; git branch -D master',
    'git fetch; git push origin master',
    'git status\ngit push origin master',
  ]

  for (const comando of encadenados) {
    it(`bloquea: ${comando.replace(/\n/g, ' ⏎ ')}`, () => expect(bloquea(comando)).toBe(true))
  }
})

describe('cambiar de rama dentro de la misma línea cuenta', () => {
  it('bloquea checkout a master seguido de merge', () => {
    // Al empezar no estábamos en master, pero al fusionar sí.
    expect(bloquea('git checkout master && git merge feature/algo', 'feature/algo')).toBe(true)
  })

  it('pero volver a una rama de trabajo lo permite otra vez', () => {
    expect(
      bloquea('git checkout master && git checkout feature/x && git merge y', 'feature/x'),
    ).toBe(false)
  })
})

describe('invocar git de otra forma no lo esconde', () => {
  it('reconoce git.exe y las rutas al binario', () => {
    expect(bloquea('git.exe push origin master')).toBe(true)
    expect(bloquea('/usr/bin/git push origin master')).toBe(true)
    expect(bloquea('"C:\\Program Files\\Git\\bin\\git.exe" push origin master')).toBe(true)
  })

  it('reconoce las opciones globales delante del subcomando', () => {
    expect(bloquea('git -C /otro/repo push origin master')).toBe(true)
  })
})

describe('fusionar depende de dónde estés', () => {
  it('estando en la principal, bloquea merge y rebase', () => {
    expect(bloquea('git merge feature/algo', 'master')).toBe(true)
    expect(bloquea('git rebase origin/master', 'main')).toBe(true)
  })

  it('en una rama de trabajo es lo normal', () => {
    expect(bloquea('git merge origin/master', 'feature/algo')).toBe(false)
    expect(bloquea('git rebase origin/master', 'integration/a-into-master')).toBe(false)
  })

  it('NUNCA bloquea la salida de emergencia', () => {
    // Abortar es lo que se hace cuando algo ya ha salido mal. Bloquearlo dejaría
    // a alguien atrapado en un merge a medias.
    expect(bloquea('git merge --abort', 'master')).toBe(false)
    expect(bloquea('git rebase --abort', 'master')).toBe(false)
    expect(bloquea('git rebase --continue', 'master')).toBe(false)
    expect(bloquea('git rebase --skip', 'master')).toBe(false)
  })

  it('deja adelantar la principal, que no crea ningún commit', () => {
    expect(bloquea('git merge --ff-only origin/master', 'master')).toBe(false)
  })

  it('no confunde los comandos de lectura que empiezan por «merge»', () => {
    expect(bloquea('git merge-base master feature/x', 'master')).toBe(false)
    expect(bloquea('git merge-tree a b c', 'master')).toBe(false)
  })

  it('si no se sabe en qué rama estamos, no se bloquea', () => {
    expect(revisarComandoGit('git merge algo', null).bloquear).toBe(false)
  })
})

/* ─── Lo que NUNCA debe bloquear ───────────────────────────────────────────── */

describe('NO estorba en el trabajo normal', () => {
  const permitidos = [
    'git status',
    'git log --oneline -10',
    'git diff master',
    'git diff master...HEAD',
    'git show HEAD',
    'git fetch origin',
    'git branch -a',
    'git checkout -b feature/nueva-cosa',
    'git checkout master',
    'git switch master',
    'git add -A',
    'git add .',
    'git commit -m "feat: algo"',
    'git push -u origin feature/nueva-cosa',
    'git push origin fix/un-fallo',
    'git push origin chore/limpieza',
    'git push origin integration/rama-into-master',
    'git stash push -m apartado',
    'git restore packages/domain/src/urls.ts',
    'git rev-parse --abbrev-ref HEAD',
    'git merge-base HEAD master',
    'git pull --ff-only',
    'git revert -m 1 abc123',
  ]

  for (const comando of permitidos) {
    it(`permite: ${comando}`, () => expect(bloquea(comando)).toBe(false))
  }

  it('no se confunde con ramas que solo CONTIENEN el nombre', () => {
    expect(bloquea('git push origin feature/mastermind')).toBe(false)
    expect(bloquea('git push origin fix/main-menu')).toBe(false)
    expect(bloquea('git push origin release/master-plan')).toBe(false)
    expect(bloquea('git push origin integration/algo-into-master')).toBe(false)
    expect(bloquea('git branch -D feature/mastermind')).toBe(false)
  })

  /**
   * Hablar de un comando peligroso no es ejecutarlo.
   *
   * La primera versión bloqueaba escribir un mensaje de commit que mencionara
   * `--force`, o buscar esa cadena en el código. Llegó a bloquear su propia
   * prueba, escrita desde la terminal.
   */
  it('deja HABLAR de los comandos peligrosos', () => {
    expect(bloquea('git commit -m "docs: explica por qué no usar git push --force"')).toBe(false)
    expect(bloquea('git commit -m "fix: ya no hace git reset --hard"')).toBe(false)
    expect(bloquea('grep -rn "git push --force" docs/')).toBe(false)
  })

  it('permite el flujo que el propio proyecto recomienda', () => {
    expect(bloquea('git push -u origin feature/x && gh pr create --base master')).toBe(false)
    expect(bloquea('git fetch origin && git merge origin/master', 'feature/x')).toBe(false)
    expect(bloquea('git checkout master && git pull --ff-only', 'feature/x')).toBe(false)
  })

  it('permite borrar una rama de trabajo y volver a la principal', () => {
    expect(bloquea('git checkout master && git branch -d feature/ya-fusionada')).toBe(false)
  })

  it('permite resolver un conflicto y confirmar después', () => {
    expect(bloquea('git checkout --ours packages/domain/src/urls.ts && git add .')).toBe(false)
  })

  it('no bloquea comandos que no son de git', () => {
    expect(bloquea('pnpm test')).toBe(false)
    expect(bloquea('node scripts/send-test-event.mjs')).toBe(false)
    expect(bloquea('echo "git push --force"')).toBe(false)
  })
})

/* ─── Las piezas por dentro ────────────────────────────────────────────────── */

describe('trocear la línea en comandos', () => {
  it('separa por los encadenadores de shell', () => {
    expect(segmentar('git status && git push')).toEqual(['git status', 'git push'])
    expect(segmentar('a; b | c')).toEqual(['a', 'b', 'c'])
  })

  it('no parte dentro de comillas', () => {
    expect(segmentar('git commit -m "uno && dos"')).toEqual(['git commit -m "uno && dos"'])
  })

  it('descarta los comentarios', () => {
    expect(segmentar('git status # y aquí git push --force')).toEqual(['git status'])
  })
})

describe('separar en argumentos', () => {
  it('respeta las comillas y las quita', () => {
    expect(argumentos('git commit -m "hola mundo"')).toEqual(['git', 'commit', '-m', 'hola mundo'])
  })

  it('conserva un argumento vacío entrecomillado', () => {
    expect(argumentos('git commit -m ""')).toEqual(['git', 'commit', '-m', ''])
  })
})

describe('reconocer la rama principal', () => {
  it('acepta todas las formas de nombrarla', () => {
    for (const forma of [
      'master',
      'main',
      'refs/heads/master',
      '+master',
      'HEAD:master',
      ':master',
      'x:refs/heads/main',
      '+HEAD:refs/heads/master',
    ]) {
      expect(apuntaAPrincipal(forma)).toBe(true)
    }
  })

  it('y rechaza las ramas de trabajo que se le parecen', () => {
    for (const forma of [
      'feature/mastermind',
      'fix/main-menu',
      'release/master-plan',
      'integration/algo-into-master',
      'origin',
      '-u',
    ]) {
      expect(apuntaAPrincipal(forma)).toBe(false)
    }
  })
})

describe('el mensaje explica qué hacer, no solo que no', () => {
  it('dice el motivo y la alternativa', () => {
    const resultado = revisarComandoGit('git push origin master', 'master')
    expect(resultado.motivo).toBeTruthy()
    expect(resultado.alternativa).toContain('Pull Request')
  })
})
