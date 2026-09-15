---
name: "source-command-merge"
description: "Integra una rama en master de forma segura, con el agente merge-guardian. Valida de verdad antes de fusionar, y se detiene si algo no está claro."
---

# source-command-merge

Use this skill when the user asks to run the migrated source command `merge`.

## Command Template

# Comando: /merge

Atajo explícito para lo que ya manda la constitución: **toda integración pasa
por `merge-guardian`**. Existe para que no dependa de que nadie se acuerde de la
regla, y para que quien acaba de llegar al repositorio la tenga a mano.

## Cómo está montado esto, y por qué

En este repositorio trabajan dos personas que **confían en el guardián** como
control de calidad. No hay aprobación humana obligatoria: la validación de
verdad la hace el agente, ejecutando los controles reales del proyecto.

Eso reparte la responsabilidad así:

- **El guardián** comprueba que nada se rompe y que **nada desaparece**.
- **Las protecciones de GitHub** impiden que entre algo con el CI en rojo, y
  cierran la puerta al force push y al borrado de la rama.
- **Las personas** deciden qué se construye.

Lo que se pierde, dicho claramente: **nadie más mira el código**. El guardián
comprueba que todo pasa, no si el cambio es buena idea. Fue una decisión
consciente del 5/8/2026, y se revierte en un comando —está en
`docs/github-branch-protection.md`—.

## Qué hacer al invocarlo

1. **Averigua qué hay que integrar.** El usuario puede decir «haz merge», «trae
   la rama de Alonso» o «/merge feature/x». Si no queda claro cuál es la rama
   origen, **pregunta antes de tocar nada**: equivocarse de rama al integrar es
   caro y silencioso.

   Por omisión, el destino es `master`.

2. **Lanza el agente `merge-guardian`** con la rama origen y la destino. No
   improvises la fusión: el agente tiene el proceso escrito y sabe qué mirar.

3. **Enseña el informe** que devuelva, en lenguaje llano. Sobre todo:
   - qué ficheros tocaban las dos ramas
   - qué conflictos hubo y cómo se resolvió cada uno
   - qué validaciones pasaron
   - **qué riesgos quedan**

4. **Si el agente se detuvo**, explica dónde y qué decisión hace falta.
   Detenerse es lo que hace bien, no un fallo.

5. **Si todo pasó**, fusiona la Pull Request y borra la rama de integración.

## Lo innegociable

- **Nunca escribir en `master` directamente.** Todo entra por Pull Request,
  aunque se fusione al momento: así queda el rastro y corre el CI.
- **Nunca fusionar con el CI en rojo.** GitHub no lo permitirá, y tampoco hay
  que intentar rodearlo.
- **Nunca desactivar un control** para que una integración pase. Si hace falta
  eso, no está lista.
- **Si el guardián se detuvo, no seguir por tu cuenta.** Se detuvo por algo.

## Los controles reales de este proyecto

**Este proyecto SÍ tiene lint.** Son estos, y todos tienen que pasar:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```
