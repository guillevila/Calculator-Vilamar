# AGENTS.md

> Este archivo le dice a Codex dónde encontrar sus instrucciones completas.

Lee `.Codex/AGENTS.md` para la constitución completa del agente.

El orden de lectura al iniciar una sesión es:

1. Este archivo (puntero)
2. `.Codex/AGENTS.md` — constitución completa
3. `SYSTEM_VISION.md` — visión, límites y decisiones cerradas del proyecto
4. `PROJECT_STATUS.md` — estado REAL (qué funciona hoy, qué no, qué está bloqueado)
5. `.Codex/skills/lessons-learned/log.md` — lecciones de sesiones anteriores
6. `docs/ARQUITECTURA.md` — estado técnico actual

> Para trabajar con las webs externas: `docs/INTEGRACIONES.md` (cómo es cada una)
> y `docs/MANTENIMIENTO.md` (cómo reparar un adaptador cuando una cambie).
>
> Guía para el dueño del proyecto: `docs/GETTING-STARTED.md`. Qué significa cada
> etapa: `docs/ESTADOS_DEL_PROYECTO.md`.

---

## Lo que este proyecto no hace, nunca

Está en la constitución, pero se repite aquí porque es lo que define el producto:

- **No inventa un dato que falta.** Ni con cero, ni con un valor «normal».
- **No corrige lo que ha leído.** Avisa y bloquea; corrige la persona.
- **No mezcla los datos de los dos ojos.**
- **No envía nada a una calculadora sin confirmación humana.**
- **No acepta términos ni rodea protecciones** en nombre del usuario.
- **Compara, pero no recomienda.** No dice qué lente implantar. **Única
  excepción, estrecha y siempre marcada como «no vinculante»**: una
  estimación propia, con un criterio clínico fijo y explícito, bajo cada
  captura de pantalla y en un cuadro final opcional (D43, ver
  `SYSTEM_VISION.md`) — pedida expresamente por el dueño del proyecto
  después de que se le avisara de que es justo lo que esta regla evita.
