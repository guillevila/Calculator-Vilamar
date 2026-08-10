---
name: git-protocol
description: Protocolo de Git para este proyecto. Cárgalo antes de cualquier commit, branch o push.
---

# Skill: Git Protocol

> **La rama principal de este repositorio se llama `master`.** Donde este
> documento diga «rama principal», es `master`. Si algún día se renombra a
> `main`, hay que actualizar también este archivo y `.github/workflows/ci.yml`.

## Reglas absolutas

1. **NUNCA tocar la rama principal directamente** — toda tarea nueva = rama nueva + PR
2. **NUNCA `git push --force`** — si hay que deshacer algo, usar `git revert`
3. **NUNCA mergear sin aprobación** del dueño del proyecto
4. **NUNCA commitear `.env`** ni archivos con credenciales

## Flujo estándar

```bash
# 1. Asegurarse de estar en la rama principal actualizada
git checkout master && git pull origin master

# 2. Crear rama nueva con nombre descriptivo
git checkout -b feat/nombre-descriptivo
# Prefijos: feat/ fix/ chore/ docs/ refactor/

# 3. Hacer cambios y commitear
git add [archivos específicos]
git commit -m "feat(area): descripción clara en imperativo"

# 4. Push y PR
git push -u origin feat/nombre-descriptivo
gh pr create --title "..." --body "..."

# 5. Esperar aprobación → mergear → limpiar rama
```

## Formato de commits (Conventional Commits)

```
feat(scope): añadir pantalla de login
fix(scope): corregir cálculo de totales en factura
chore(scope): actualizar dependencias
docs(scope): añadir guía de instalación
refactor(scope): simplificar lógica de autenticación
```

## Naming de ramas

```
feat/login-pantalla
feat/facturas-filtro-fecha
fix/calculo-iva-incorrecto
chore/actualizar-dependencias
docs/guia-usuarios
```
