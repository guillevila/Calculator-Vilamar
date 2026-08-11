# Hooks — Automatismos y protecciones

> **En lenguaje normal:** los hooks son pequeños programas que se ejecutan solos
> en momentos concretos, como alarmas que saltan sin que nadie las llame.
> Tú no tienes que hacer nada para que funcionen.

---

## Los hooks de este proyecto

| Cuándo se dispara             | Qué hace                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Al abrir sesión**           | Le da a Claude el estado real: rama, últimos commits, cambios sin guardar, lecciones aprendidas y la etapa del proyecto |
| **Antes de cada herramienta** | 🛡️ **Bloquea** operaciones destructivas y el acceso a ficheros con credenciales                                         |
| **Después de escribir**       | Deja rastro de qué ficheros se tocaron                                                                                  |
| **Al lanzar un subagente**    | Anota qué agente se usó y para qué                                                                                      |
| **Al cerrar sesión**          | Recuerda registrar lecciones y no dejar trabajo sin commitear                                                           |

El registro de auditoría se guarda en `.claude/audit/`, **fuera del repositorio**.

---

## La protección más importante

`pre-tool-use.mjs` es la red de seguridad. Bloquea:

- Borrados irreversibles (borrar la raíz del disco, borrar tablas, formatear).
- Reescrituras de historial (`git push --force`, `git reset --hard HEAD~`).
- Cualquier lectura o edición de `.env`, claves `.pem`, `.key`, `.p12` o
  carpetas `secrets/`.

`.env.example` está **expresamente permitido**: es la plantilla sin valores
reales y forma parte del repositorio.

---

## Por qué están escritos en Node

Los hooks originales de la plantilla estaban en Bash y Python. En el ordenador
donde se desarrolla este proyecto **ninguno de los dos estaba disponible**, así
que los cinco fallaban en silencio: parecía haber protección y no la había.

Node sí está garantizado, porque la aplicación no arranca sin él. Además se
invocan en **forma directa** (`"command": "node", "args": [...]`), sin pasar por
ningún intérprete de comandos, así que funcionan igual en Windows, macOS y Linux.

También se corrigió el código de salida: para **bloquear** una herramienta hay
que salir con **2**. Los hooks antiguos salían con 1, que Claude Code trata como
un error no bloqueante — es decir, aunque hubieran podido ejecutarse, no habrían
bloqueado nada.

---

## Comprobar que siguen funcionando

Cada hook recibe un JSON por la entrada estándar. Se pueden probar a mano.
En PowerShell:

```powershell
# Debe devolver 2 (bloqueado)
'{"tool_name":"Read","tool_input":{"file_path":".env"}}' | node .claude/hooks/pre-tool-use.mjs
$LASTEXITCODE

# Debe devolver 0 (permitido)
'{"tool_name":"Bash","tool_input":{"command":"pnpm test"}}' | node .claude/hooks/pre-tool-use.mjs
$LASTEXITCODE
```

---

## Ficheros

| Fichero                       | Evento                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| `session-start.mjs`           | SessionStart                                                |
| `pre-tool-use.mjs`            | PreToolUse — el que protege                                 |
| `post-tool-use.mjs`           | PostToolUse (solo escrituras)                               |
| `stop.mjs`                    | Stop                                                        |
| `log-subagent-spawn.mjs`      | SubagentStart                                               |
| `block-subagent-external.mjs` | PreToolUse — impide que un subagente haga cosas hacia fuera |
| `_input.mjs`                  | Utilidad compartida para leer la entrada                    |

Se activan desde [`.claude/settings.json`](../settings.json). Si tocas ese
fichero y el JSON queda mal formado, **se desactivan todos los ajustes en
silencio** — comprueba siempre que sigue siendo JSON válido.
