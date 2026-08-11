# ADR-003 — Ninguna dependencia que compile código nativo

**Fecha:** 11/08/2026 · **Estado:** aceptada

## Contexto

El log de lecciones de este equipo abre con un sprint que se torció por elegir
`better-sqlite3`: no había binario para la versión de Node del equipo, intentó
compilarse y pidió Python y las herramientas de Visual Studio.

Para un dueño no técnico, una dependencia que exige compilar no es un problema
técnico: es un problema de producto. Convierte «instalarlo» en una tarde.

Tres piezas de este producto invitan a un módulo nativo:

1. **Base de datos** → SQLite
2. **Rasterizar PDF** → un lienzo nativo (`canvas`, `@napi-rs/canvas`)
3. **OCR** → un binario de Tesseract

## Decisión

Ninguna de las tres.

| Necesidad      | Solución                                 | Por qué no compila                             |
| -------------- | ---------------------------------------- | ---------------------------------------------- |
| Guardar casos  | Ficheros JSON en `%APPDATA%`             | Es `node:fs`                                   |
| Rasterizar PDF | pdf.js dentro del Chromium de Playwright | El navegador ya está, y tiene lienzo de verdad |
| OCR            | tesseract.js                             | WebAssembly puro                               |
| PDF final      | `printToPDF` de Electron                 | Ya está en Electron                            |

**`pnpm install` no compila nada y termina en segundos.** Comprobado.

## Consecuencias

- Instalar es trivial y no puede fallar por falta de herramientas.
- Un caso es un fichero de texto: se puede abrir, leer y copiar sin el programa.
- **Precio asumido:** sin consultas sobre los casos. Con un usuario y un caso en
  curso, no hace falta. Si algún día hiciera falta, el almacenamiento está detrás
  de un módulo (`almacen.ts`) y se puede cambiar sin tocar el dominio — que es
  justo lo que salvó el sprint de la lección original.
- **Precio asumido:** rasterizar un PDF abre un Chromium, lo que cuesta un par de
  segundos la primera vez. Solo ocurre con PDF escaneados.
