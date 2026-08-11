# ADR-001 — Playwright para toda la automatización

**Fecha:** 11/08/2026 · **Estado:** aceptada (decisión del dueño del proyecto)

## Contexto

El producto tiene que rellenar tres calculadoras web que no controlamos.

## Decisión

**Playwright**, en exclusiva. No se usa Selenium, ni Puppeteer, ni WebDriver, ni
automatización por coordenadas de pantalla.

Es una decisión cerrada del dueño del proyecto (D1) y no se reabre.

## Consecuencias

- Toda la lógica de navegador vive en `packages/integrations`.
- Se reutiliza el Chromium de Playwright para **rasterizar PDF escaneados**
  (ADR-003), lo que evita una dependencia nativa.
- Los tests de interfaz usan `_electron` de Playwright, así que hay una sola
  herramienta para navegador y escritorio.
- La automatización por coordenadas queda descartada, lo cual es bueno: se rompe
  con cualquier cambio de resolución.
