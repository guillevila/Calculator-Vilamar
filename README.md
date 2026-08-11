# Calculator Vilamar

**Lee una biometría ocular una sola vez y rellena por ti las calculadoras de
lente intraocular.**

Local, para Windows. Nada sale de tu ordenador salvo lo que se envía a las
propias calculadoras — y sin el nombre de nadie.

> 🛠️ **Estado: prototipo funcional.** Habla de verdad con EVO Toric y Barrett
> Toric y genera el PDF. La lectura automática de informes **todavía no se ha
> probado con informes reales**. Lo que funciona y lo que no está en
> [PROJECT_STATUS.md](PROJECT_STATUS.md), sin adornos.

---

## Qué hace

```
  NUEVO CÁLCULO  →  arrastras el informe  →  revisas lo que ha leído
                 →  CONFIRMAS  →  rellena EVO, Barrett y Kane
                 →  resultados juntos  →  PDF
```

En lugar de teclear los mismos doce datos en tres webs distintas, los tecleas —o
los lee— una vez.

**Lo que NO hace:** no calcula potencias de lente, no recomienda ninguna lente y
no sustituye tu criterio. Los números son de Kane, EVO y Barrett; este programa
los pone juntos.

---

## Arrancarlo en Windows

Necesitas [Node.js 20 o superior](https://nodejs.org) y
[pnpm](https://pnpm.io/installation) (`npm install -g pnpm`).

```bash
git clone <este-repositorio>
cd "Calculadora Vilamar"

pnpm install              # rápido: no compila nada
pnpm playwright:install   # el navegador que usan las calculadoras (una vez)

pnpm dev                  # arranca la aplicación
```

Después de la primera vez, basta con **hacer doble clic en
`Calculator Vilamar.cmd`**. (Todavía no hay instalador `.exe`; ver
[GETTING-STARTED](docs/GETTING-STARTED.md#3-arrancarlo).)

Instrucciones detalladas, incluida la primera vez y qué esperar:
[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

---

## Comandos

| Comando                                             | Qué hace                                                        |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev` · doble clic en `Calculator Vilamar.cmd` | Arranca la aplicación                                           |
| `pnpm test`                                         | 205 tests. No tocan internet                                    |
| `pnpm test:e2e`                                     | Arranca la aplicación real y recorre el flujo                   |
| `pnpm lint` · `pnpm typecheck` · `pnpm build`       | Calidad y compilación                                           |
| `pnpm live [evo\|barrett\|kane]`                    | Prueba los adaptadores **contra las webs reales**               |
| `pnpm verificar:vertical`                           | El producto entero contra EVO y Barrett reales, hasta el PDF    |
| `pnpm reconocer <sitio>`                            | Mira el formulario actual de una web, para reparar un adaptador |
| `pnpm muestra:informe`                              | Genera un informe de ejemplo para verlo                         |

Los que hablan con las webs **no están en el CI**, a propósito: una web ajena con
un mal día no puede poner el control en rojo.

---

## Privacidad

Este programa toca documentos sanitarios. Las reglas:

- **Nada identificativo entra en el repositorio.** Todos los fixtures son
  sintéticos y están declarados como tales.
- **El PDF no lleva el nombre del paciente.** El caso se identifica por un código
  local, `CV-2026-0042`.
- **A las webs externas se les manda ese código**, no un nombre. EVO y Barrett
  exigen un «Patient Name»; reciben el código del caso.
- Tus documentos, casos, sesiones de navegador e informes viven en
  `%APPDATA%\calculator-vilamar`, fuera del repositorio.
- Las capturas de diagnóstico **pueden contener biometría** —son pantallazos de
  una web rellenada con tus datos—. Son locales y su carpeta lleva un aviso.

---

## Lo que este programa no hace, por principio

- No acepta condiciones de uso en tu nombre. Kane pide aceptar un acuerdo de
  licencia: **lo aceptas tú**, en el navegador, y el programa continúa.
- No resuelve ni rodea CAPTCHA, ni falsea el navegador, ni salta protecciones.
- No inventa un dato que falta. Si no hay WTW, pone `NO ENCONTRADO`, no `12.0`.
- No corrige lo que ha leído. Si lee `AL = 240.7`, avisa de que probablemente
  sean `24.07` y **te deja corregirlo a ti**.
- No envía nada a ninguna calculadora sin que tú lo hayas confirmado antes.

---

## Documentación

| Documento                                                    | Para qué                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| [PROJECT_STATUS.md](PROJECT_STATUS.md)                       | **Qué funciona hoy de verdad.** Empieza aquí              |
| [SYSTEM_VISION.md](SYSTEM_VISION.md)                         | Visión, límites y decisiones cerradas                     |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)                 | Cómo está construido y por qué                            |
| [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md)               | Cómo es cada una de las tres webs                         |
| [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md)               | Reparar un adaptador, añadir un aparato o una calculadora |
| [docs/ROADMAP.md](docs/ROADMAP.md)                           | Qué viene después                                         |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)                       | Qué ha cambiado                                           |
| [docs/ESTADOS_DEL_PROYECTO.md](docs/ESTADOS_DEL_PROYECTO.md) | Qué significa «prototipo» y qué significa «MVP»           |

---

## Aviso

Calculator Vilamar es una herramienta de apoyo. Los resultados proceden de las
calculadoras externas **Kane** (iolformula.com), **EVO Toric**
(evoiolcalculator.com) y **Barrett Toric** (ASCRS / APACRS), y están sujetos a
las condiciones de uso de cada una. Las comparaciones que muestra son
descriptivas. **No sustituye el criterio del cirujano.**
