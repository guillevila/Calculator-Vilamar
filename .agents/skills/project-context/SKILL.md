---
name: project-context
description: Contexto específico del proyecto. Rellena este archivo con la información de negocio que Codex necesita para tomar buenas decisiones. Cárgalo cuando trabajes en cualquier feature que toque datos del negocio.
---

# Skill: Project Context

> Este archivo debe ser rellenado por el dueño del proyecto o el domain analyst.
> Es el equivalente al "manual de empresa" para Codex.

---

## Entidades principales del dominio

> _Ejemplo: En una empresa de transporte, las entidades son: Conductor, Vehículo,
> Parte de trabajo, Ruta, Cliente._

[Listar aquí las entidades principales con una descripción de 1 línea cada una]

---

## Reglas de negocio clave

> _Ejemplo: "Un conductor solo puede tener un parte activo a la vez.
> Los partes se cierran al final del turno, nunca antes."_

[Listar aquí las reglas de negocio más importantes]

---

## Usuarios del sistema y sus permisos

| Rol     | Qué puede hacer | Qué NO puede hacer |
| ------- | --------------- | ------------------ |
| [Rol 1] |                 |                    |
| [Rol 2] |                 |                    |

---

## Flujos críticos del negocio

> _Describe los procesos más importantes paso a paso en lenguaje natural_

### Flujo 1: [nombre]

1. [Paso 1]
2. [Paso 2]
3. [Paso 3]

---

## Terminología específica del negocio

> _Palabras que en tu negocio significan algo concreto y Codex debe conocer_

| Término   | Qué significa en este contexto |
| --------- | ------------------------------ |
| [término] | [significado]                  |

---

## Integraciones y sistemas externos

> _Con qué otros sistemas se conecta este proyecto_

[Listar aquí: ERP, pasarelas de pago, APIs externas, etc.]

---

## Sensibilidad de datos

| Tipo de dato  | Nivel | Reglas                     |
| ------------- | ----- | -------------------------- |
| [ej: DNIs]    | Alta  | Solo admin                 |
| [ej: Nombres] | Media | Solo usuarios autenticados |
