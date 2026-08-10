/**
 * guard-git.mjs — Guardia de comandos de Git peligrosos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ EN NODE Y NO EN BASH
 *
 * El encargo original pedía un `scripts/guard-git-command.sh`. En este equipo
 * eso no funcionaría: los cinco hooks del proyecto estuvieron rotos en silencio
 * durante semanas por estar escritos en bash y python, que no están disponibles
 * de forma fiable en Windows (lección del 3/8/2026). Un guardián que no arranca
 * es peor que no tener guardián.
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO BUSCA PATRONES EN EL TEXTO
 *
 * La primera versión hacía exactamente eso, y una auditoría adversarial le
 * encontró 34 agujeros. Todos venían del mismo error: mirar la cadena entera en
 * bruto. Unos ejemplos de lo que se colaba —y lo que estorbaba:
 *
 *   git status && git push -f origin master   ← el `git status` eximía TODO
 *   git push origin refs/heads/master         ← la barra rompía el patrón
 *   git push origin +master                   ← `+` es force, y nadie lo miraba
 *   git push origin "master"                  ← las comillas lo desactivaban
 *   git push -uf origin x                     ← flags agrupados
 *   git push --mirror                          ← borra el remoto sin nombrar nada
 *   git commit -m "no hagas git push --force" ← bloqueado por HABLAR de ello
 *   git merge --abort                          ← bloqueada la salida de emergencia
 *
 * La versión de ahora no busca texto: **trocea el comando y lo analiza**.
 *
 *   1. Separa la línea en comandos por `&&`, `||`, `;`, `|` y saltos de línea,
 *      respetando las comillas y descartando comentarios.
 *   2. Cada comando se parte en argumentos, también respetando comillas. Lo que
 *      va entrecomillado es un ARGUMENTO, no comandos que ejecutar: por eso un
 *      mensaje de commit puede hablar de `--force` sin bloquearse.
 *   3. Se normaliza el binario: `git`, `git.exe`, `"C:\...\git.exe"` son git.
 *   4. Las reglas deciden mirando los argumentos, no la cadena.
 *
 * Las dos mitades importan igual. Que no se cuele nada, y que no estorbe en el
 * trabajo diario: un guardián que molesta acaba desactivado, y entonces no
 * protege de nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Nombres que tratamos como rama principal. Aquí es `master`. */
const RAMAS_PRINCIPALES = ['main', 'master']

/* ─── Trocear y leer el comando ────────────────────────────────────────────── */

/**
 * Separa una línea en los comandos que de verdad se van a ejecutar.
 *
 * Divide por `&&`, `||`, `;`, `|` y saltos de línea, **sin partir dentro de
 * comillas**, y descarta lo que va tras `#`.
 *
 * Es la corrección más importante de todas: antes, un `git status` al principio
 * eximía de las reglas a todo lo que viniera detrás.
 */
export function segmentar(linea) {
  const segmentos = []
  let actual = ''
  let comilla = null

  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i]

    if (comilla) {
      actual += c
      if (c === comilla) comilla = null
      continue
    }

    if (c === '"' || c === "'") {
      comilla = c
      actual += c
      continue
    }

    // Comentario: se acaba el comando aquí.
    if (c === '#') {
      while (i < linea.length && linea[i] !== '\n') i += 1
      segmentos.push(actual)
      actual = ''
      continue
    }

    const dos = linea.slice(i, i + 2)
    if (dos === '&&' || dos === '||') {
      segmentos.push(actual)
      actual = ''
      i += 1
      continue
    }

    if (c === ';' || c === '|' || c === '&' || c === '\n' || c === '\r') {
      segmentos.push(actual)
      actual = ''
      continue
    }

    actual += c
  }

  segmentos.push(actual)
  return segmentos.map((s) => s.trim()).filter(Boolean)
}

/**
 * Parte un comando en sus argumentos, respetando las comillas.
 *
 * Lo entrecomillado se devuelve **sin las comillas pero como un solo
 * argumento**. Eso resuelve dos agujeros opuestos a la vez: `git push origin
 * "master"` se reconoce como push a master, y `git commit -m "git push
 * --force"` no se confunde con un force push, porque ese texto es UN argumento
 * del commit, no un comando.
 */
export function argumentos(segmento) {
  const args = []
  let actual = ''
  let comilla = null
  let hayAlgo = false

  for (const c of segmento) {
    if (comilla) {
      if (c === comilla) comilla = null
      else actual += c
      continue
    }
    if (c === '"' || c === "'") {
      comilla = c
      hayAlgo = true
      continue
    }
    if (/\s/.test(c)) {
      if (actual || hayAlgo) args.push(actual)
      actual = ''
      hayAlgo = false
      continue
    }
    actual += c
  }
  if (actual || hayAlgo) args.push(actual)
  return args
}

/**
 * ¿El primer argumento invoca a git?
 *
 * Acepta `git`, `git.exe`, `/usr/bin/git`, `"C:\Program Files\Git\bin\git.exe"`.
 * Sin esto bastaba con escribir `git.exe` para saltarse todas las reglas.
 */
function esGit(binario) {
  if (!binario) return false
  const limpio = binario.replace(/\\/g, '/').split('/').pop() ?? ''
  return /^git(\.(exe|cmd|bat))?$/i.test(limpio)
}

/** Quita las opciones globales de git (`-C ruta`, `-c clave=valor`) y devuelve el resto. */
function sinOpcionesGlobales(args) {
  const resto = args.slice(1)
  while (resto.length > 0) {
    const a = resto[0]
    if (a === '-C' || a === '-c' || a === '--git-dir' || a === '--work-tree') {
      resto.splice(0, 2)
      continue
    }
    if (a?.startsWith('--git-dir=') || a?.startsWith('--work-tree=') || a?.startsWith('-c')) {
      resto.splice(0, 1)
      continue
    }
    break
  }
  return resto
}

/**
 * ¿Este argumento apunta a la rama principal?
 *
 * Reconoce todas las formas con las que git deja nombrarla, que es donde se
 * colaban la mitad de los agujeros:
 *
 *   master · refs/heads/master · +master · HEAD:master · :master (borrar)
 *   mi-rama:refs/heads/master  · +HEAD:refs/heads/master
 *
 * Y NO reconoce `fix/main-menu`, `feature/mastermind` ni
 * `integration/algo-into-master`, que son ramas de trabajo legítimas.
 */
export function apuntaAPrincipal(arg) {
  if (!arg) return false
  // Un refspec forzado empieza por `+`. Se quita para mirar el destino.
  const sinMas = arg.startsWith('+') ? arg.slice(1) : arg
  // De `origen:destino` manda el destino. `:destino` es borrar destino.
  const destino = sinMas.includes(':') ? sinMas.slice(sinMas.lastIndexOf(':') + 1) : sinMas
  const nombre = destino.replace(/^refs\/heads\//, '')
  return RAMAS_PRINCIPALES.includes(nombre)
}

/** ¿Es un grupo de flags cortos que incluye `-f`? (`-f`, `-uf`, `-fu`, `-qf`) */
function llevaForceCorto(arg) {
  return /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg ?? '')
}

/** Los pathspec que significan «todo el árbol». */
const TODO_EL_ARBOL = new Set(['.', '*', './', ':/'])

/* ─── Las reglas ───────────────────────────────────────────────────────────── */

const NO = (nombre, motivo, alternativa) => ({ bloquear: true, nombre, motivo, alternativa })
const OK = { bloquear: false }

/**
 * Subcomandos de solo lectura. Nunca se bloquean.
 *
 * Se comprueba el subcomando EXACTO, no un prefijo: antes, cualquier cadena que
 * empezara por `git status` quedaba exenta entera.
 */
const SOLO_LECTURA = new Set([
  'status', 'log', 'diff', 'show', 'remote', 'fetch', 'ls-files', 'ls-remote',
  'rev-parse', 'rev-list', 'describe', 'blame', 'shortlog', 'whatchanged',
  'cat-file', 'merge-base', 'merge-tree', 'name-rev', 'check-ignore', 'grep',
])

/** Verbos que reescriben la historia o borran la red de seguridad. */
const REESCRIBEN_HISTORIA = new Set(['filter-branch', 'filter-repo'])

/** Analiza UN comando ya troceado. Devuelve el bloqueo o `OK`. */
function revisarSegmento(args, enPrincipal) {
  if (!esGit(args[0])) return OK

  const resto = sinOpcionesGlobales(args)
  const sub = resto[0]
  if (!sub) return OK

  const opciones = resto.slice(1)
  const tiene = (...flags) => opciones.some((o) => flags.includes(o))

  if (SOLO_LECTURA.has(sub)) return OK

  // ── push ──────────────────────────────────────────────────────────────────
  if (sub === 'push') {
    if (tiene('--mirror', '--all', '--prune')) {
      return NO(
        'push que opera sobre TODAS las ramas',
        '`--mirror`, `--all` y `--prune` actúan sobre todas las referencias del remoto sin nombrar ninguna. `--mirror` además borra en el remoto lo que no exista en local: es el comando de git con más poder destructivo sobre un repositorio compartido.',
        'Empuja la rama concreta que quieras: `git push origin mi-rama`.',
      )
    }

    const forzado =
      tiene('--force', '--force-with-lease') ||
      opciones.some((o) => o.startsWith('--force-with-lease=')) ||
      opciones.some(llevaForceCorto) ||
      opciones.some((o) => o.startsWith('+'))

    if (forzado) {
      return NO(
        'force push',
        'Reescribe la historia del repositorio. Si otra persona ya se había traído esos commits, los pierde sin aviso. Cuenta también el refspec `+rama`, que es un force disfrazado.',
        'Haz un commit nuevo encima. Si de verdad hace falta reescribir, pídelo y hazlo a mano.',
      )
    }

    const aPrincipal = opciones.some(apuntaAPrincipal)
    if (aPrincipal) {
      const borrando = tiene('--delete', '-d') || opciones.some((o) => o.startsWith(':'))
      return borrando
        ? NO(
            'borrar la rama principal en el remoto',
            'Se está intentando borrar la rama principal del repositorio.',
            'No hay alternativa: eso no se hace.',
          )
        : NO(
            'push directo a la rama principal',
            'La rama principal solo cambia por Pull Request.',
            'Sube tu rama (`git push -u origin mi-rama`) y abre una Pull Request hacia master.',
          )
    }

    // `git push` a secas estando en master publica en master.
    const nombraDestino = opciones.some((o) => !o.startsWith('-'))
    if (enPrincipal && !nombraDestino) {
      return NO(
        'push sin destino estando en la rama principal',
        'Un `git push` sin argumentos publica la rama actual, y ahora mismo la rama actual es la principal.',
        'Cámbiate a una rama de trabajo, o nombra la rama explícitamente.',
      )
    }

    return OK
  }

  // ── clean ─────────────────────────────────────────────────────────────────
  if (sub === 'clean' && opciones.some((o) => /^-[a-zA-Z]*f/.test(o))) {
    return NO(
      'git clean -f',
      'Borra del disco los ficheros que git no está siguiendo. No van al historial ni a la papelera: desaparecen.',
      'Mira antes qué se llevaría con `git clean -n`, y borra a mano lo que de verdad sobre.',
    )
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  if (sub === 'reset' && tiene('--hard')) {
    return NO(
      'reset --hard',
      'Tira a la basura los cambios sin guardar, sin preguntar y sin vuelta atrás.',
      'Usa `git stash` para apartarlos, o `git restore <fichero>` para revertir solo lo que quieras.',
    )
  }

  // ── branch ────────────────────────────────────────────────────────────────
  if (sub === 'branch') {
    const borra = tiene('-D', '-d', '--delete')
    const mueve = tiene('-f', '--force', '-M')
    if ((borra || mueve) && opciones.some(apuntaAPrincipal)) {
      return NO(
        'borrar o reposicionar la rama principal',
        'Se está intentando borrar o mover la rama principal del proyecto.',
        'No hay alternativa: eso no se hace.',
      )
    }
    return OK
  }

  // ── resolver conflictos en bloque ─────────────────────────────────────────
  if (sub === 'checkout' || sub === 'restore') {
    const eligeLado = tiene('--ours', '--theirs')
    if (eligeLado) {
      const rutas = opciones.filter((o) => !o.startsWith('-'))
      const todo = rutas.length === 0 || rutas.some((r) => TODO_EL_ARBOL.has(r))
      if (todo) {
        return NO(
          'resolver TODOS los conflictos de golpe',
          'Escoge un lado en bloque, sin mirar ninguno. Es la forma más rápida de borrar el trabajo de otra persona sin enterarse.',
          'Resuelve fichero a fichero: `git checkout --ours ruta/al/fichero`.',
        )
      }
    }
    return OK
  }

  // ── fontanería de referencias ─────────────────────────────────────────────
  if (sub === 'update-ref' || sub === 'symbolic-ref') {
    if (opciones.some((o) => apuntaAPrincipal(o.replace(/^refs\/heads\//, '')) || apuntaAPrincipal(o))) {
      return NO(
        'mover la rama principal por fontanería',
        '`update-ref` y `symbolic-ref` reposicionan una rama sin pasar por commit ni merge. Sobre la principal es equivalente a reescribirla.',
        'Si hace falta corregir master, hazlo con una Pull Request.',
      )
    }
    return OK
  }

  if (REESCRIBEN_HISTORIA.has(sub)) {
    return NO(
      'reescritura masiva de la historia',
      `\`git ${sub}\` reescribe commits ya existentes. En un repositorio compartido invalida el trabajo de todos los demás.`,
      'Si de verdad hace falta, es una operación planificada y a mano, no parte de una tarea.',
    )
  }

  if (sub === 'reflog' && opciones.includes('expire')) {
    return NO(
      'borrar el reflog',
      'El reflog es la red que permite recuperar commits perdidos. Vaciarlo quita la única vuelta atrás que queda tras un error.',
      'Déjalo estar: no ocupa nada y algún día salva un día de trabajo.',
    )
  }

  // ── alias: esconden lo que se ejecuta de verdad ───────────────────────────
  if (sub === 'config' && opciones.some((o) => o.startsWith('alias.'))) {
    return NO(
      'crear un alias de git',
      'Un alias esconde lo que se ejecuta de verdad, y con él cualquier comando peligroso se vuelve invisible para esta guardia.',
      'Escribe el comando entero. Se lee peor pero se entiende lo que hace.',
    )
  }

  // ── fusionar estando EN la rama principal ─────────────────────────────────
  if (enPrincipal && (sub === 'merge' || sub === 'rebase')) {
    // La salida de emergencia nunca se bloquea: abortar es lo que se hace
    // cuando algo ya ha salido mal.
    const rescate = tiene('--abort', '--quit', '--skip', '--continue', '--edit-todo')
    // `--ff-only` no puede crear un commit de fusión: solo adelanta la rama.
    const soloAdelantar = tiene('--ff-only')
    if (!rescate && !soloAdelantar) {
      return NO(
        'merge o rebase estando en la rama principal',
        'Fusionar aquí escribe en la rama principal directamente, saltándose la revisión.',
        'Cámbiate a una rama de integración (`git checkout -b integration/...`), fusiona ahí y abre una Pull Request.',
      )
    }
  }

  return OK
}

/**
 * ¿Hay que bloquear este comando?
 *
 * Analiza cada comando de la línea por separado. Además sigue la pista de los
 * cambios de rama dentro de la propia línea: `git checkout master && git merge x`
 * acaba fusionando en la principal aunque al empezar no estuviéramos en ella.
 *
 * @param {string} comando El comando tal cual se va a ejecutar.
 * @param {string|null} ramaActual En qué rama estamos, si se sabe.
 */
export function revisarComandoGit(comando, ramaActual = null) {
  const texto = String(comando ?? '')
  if (!texto.trim()) return OK

  let enPrincipal = ramaActual !== null && RAMAS_PRINCIPALES.includes(ramaActual)

  for (const segmento of segmentar(texto)) {
    const args = argumentos(segmento)
    const resultado = revisarSegmento(args, enPrincipal)
    if (resultado.bloquear) return resultado

    // Si este comando se cambia a la principal, lo que venga detrás en la misma
    // línea se juzga como si estuviéramos ya en ella.
    if (esGit(args[0])) {
      const resto = sinOpcionesGlobales(args)
      if (resto[0] === 'checkout' || resto[0] === 'switch') {
        const destinos = resto.slice(1).filter((o) => !o.startsWith('-'))
        if (destinos.some(apuntaAPrincipal)) enPrincipal = true
        else if (destinos.length > 0) enPrincipal = false
      }
    }
  }

  return OK
}

/** Texto que se le enseña a quien intentó ejecutarlo. */
export function explicar(resultado) {
  return [
    `🛑 BLOQUEADO: ${resultado.nombre}.`,
    '',
    resultado.motivo,
    '',
    `Qué hacer en su lugar: ${resultado.alternativa}`,
    '',
    'Si de verdad hace falta, pídeselo al dueño del proyecto y que lo ejecute él a mano.',
  ].join('\n')
}

export const RAMAS_PRINCIPALES_CONOCIDAS = RAMAS_PRINCIPALES
