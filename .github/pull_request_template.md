## ¿Qué cambia en este PR?

[Describe en lenguaje normal qué se añadió, cambió o corrigió]

## ¿Por qué?

[Qué problema resuelve o qué necesidad cubre]

## Rama de origen

`[nombre-de-la-rama]` → `master`

## Resumen técnico

[Qué se ha tocado por dentro y con qué enfoque. Dos o tres frases bastan.]

## ¿Cómo probarlo?

[Pasos para verificar que funciona correctamente]

1. [Paso 1]
2. [Paso 2]
3. [Resultado esperado]

---

## Impacto: rellena solo lo que aplique

> Si un apartado no aplica, escribe **«nada»**. Dejarlo en blanco no distingue
> «no hay» de «no lo he mirado», y esa diferencia importa al revisar.

### Módulos críticos modificados

- [ ] `packages/contracts/` — tipos compartidos: **un cambio aquí afecta a los dos lados a la vez**
- [ ] `packages/domain/` — reglas de negocio
- [ ] `apps/desktop/src/main/db/` — base de datos
- [ ] `apps/desktop/src/main/events/` — receptor local (rutas y seguridad)
- [ ] `apps/extension/` — extensión de navegador
- [ ] Ninguno de los anteriores

### Base de datos

[¿Hay migración nueva? ¿Qué número? ¿Es reversible? Si no hay: «nada».]

> Recordatorio: **una migración publicada no se edita nunca.** Se añade otra
> debajo. Si dos ramas añaden migración a la vez, hay que reordenarlas a mano.

### Variables de entorno nuevas

[Nombre y para qué sirven. Si no hay: «nada».]

### Dependencias

[Añadidas, quitadas o actualizadas. Si no hay: «nada».]

### Capturas

[Obligatorias si cambia algo visual. Si no cambia nada visual: «nada».]

---

## Riesgos conocidos

[Qué puede romperse, qué no has podido comprobar, qué queda cogido con alfileres.]

## Plan de reversión

[Cómo se deshace esto si algo va mal. Normalmente «revertir el commit de merge»,
pero **si hay migración de base de datos, explica qué pasa con los datos ya
guardados**.]

---

## Comprobaciones

- [ ] `pnpm typecheck` en verde
- [ ] `pnpm test` en verde
- [ ] `pnpm build` en verde
- [ ] `pnpm test:e2e` en verde _(si se tocó interfaz o proceso principal)_
- [ ] Lint — **este proyecto no tiene lint**, no aplica
- [ ] Lo he probado en local y funciona
- [ ] No hay credenciales ni datos sensibles en los cambios
- [ ] No hay migraciones destructivas sin revisar
- [ ] **No se ha eliminado ninguna funcionalidad sin querer**
- [ ] La descripción es clara para alguien que no estuvo en la sesión
- [ ] Si hay decisiones nuevas, se han añadido a `SYSTEM_VISION.md`
- [ ] Si cambia la arquitectura, se ha actualizado `docs/ARQUITECTURA.md`
- [ ] Si cambia qué funciona de verdad, se ha actualizado `PROJECT_STATUS.md`

## ¿Hay decisiones abiertas que esto resuelve o bloquea?

[Referencia a O1, O2... si aplica. Si no, elimina esta sección.]
