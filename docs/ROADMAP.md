# Roadmap

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude

> Por orden de importancia real, no de facilidad. Lo de arriba es lo que separa
> este prototipo de un MVP.

---

## Ahora mismo: lo que bloquea el MVP

### 1. Validar la lectura con informes reales — 🔴 bloqueado, te necesito

Todo lo demás está por detrás de esto. Los parsers funcionan sobre textos
sintéticos; con un informe de verdad pueden fallar, y el modo de fallo más
probable no es un error visible sino **leer un número donde no toca**.

**Qué hace falta:** 2–3 informes **anonimizados** de cada aparato (ANTERION,
IOLMaster 700, Pentacam). Con eso se ajustan las reglas y, por primera vez, se
puede decir un porcentaje de acierto sin inventárselo.

### 2. Cerrar Kane — 🟠 necesita una decisión y dos minutos tuyos

Antes: resolver la decisión abierta **O1** (SYSTEM_VISION § 7) y, dado el
impacto, revisión jurídica.
Después: `pnpm reconocer:kane`, aceptar las condiciones, y con el formulario
capturado se cierra el adaptador.

### 3. Instalador de Windows

Hoy se arranca con `pnpm dev` desde una consola. Un `.exe` con `electron-builder`
convierte esto en un programa normal. Está previsto en la configuración pero no
generado ni probado.

---

## Después

- **Calcular los dos ojos de una vez.** Hoy se cambia de ojo y se vuelve a
  lanzar.
- **Historial de casos.** Ya se guardan en disco; falta la pantalla para volver a
  uno.
- **Catálogo de lentes propio**, con las que use de verdad la consulta y sus
  constantes, para no teclear la constante A cada vez.
- **Córnea post-cirugía refractiva.** EVO tiene secciones específicas para
  post-LASIK que hoy se guardan pero no se rellenan.
- **Más aparatos**, según lo que aparezca en la consulta.

---

## Más adelante, si tiene sentido

- Un proveedor de lectura basado en modelo de visión, detrás de la misma
  abstracción, para informes que el OCR lea mal.
- Exportar a CSV para revisar series de casos.
- Reintento automático con espera creciente cuando una web falla por red.

---

## Lo que NO está en el roadmap, a propósito

- Nube, cuentas de usuario o multiusuario. Es local-first por decisión (D2).
- Calcular potencias por nuestra cuenta. No es lo que es este producto.
- Cualquier forma de recomendación clínica.
