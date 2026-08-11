# Contratos de integración con las tres calculadoras

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude

> Todo lo de este documento se ha comprobado **abriendo las webs con un
> navegador real**, no de memoria ni de documentación. Cada apartado dice qué se
> verificó y qué no.
>
> Lo que aquí NO hay, y no habrá: nada sobre cómo funcionan sus fórmulas por
> dentro. Calculator Vilamar las usa como las usa una persona.

---

## Resumen

|                              | EVO Toric                   | Barrett Toric                                         | Kane                          |
| ---------------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------- |
| **Estado**                   | ✅ Verificado y funcionando | ✅ Verificado y funcionando                           | ⚠️ Escrito, **sin verificar** |
| **Tiempo típico**            | 4–7 s                       | 21–35 s                                               | —                             |
| **Navegador sin ventana**    | Sirve                       | **No sirve**                                          | No procede                    |
| **Login**                    | No                          | No                                                    | No                            |
| **CAPTCHA**                  | No                          | Protección anti-robot en el dominio de la calculadora | **Declara reCAPTCHA**         |
| **Términos que aceptar**     | No                          | No                                                    | **Sí, acuerdo de licencia**   |
| **Exige nombre de paciente** | Sí                          | Sí                                                    | Por determinar                |
| **Intervención humana**      | Ninguna                     | Solo si salta una comprobación                        | **Siempre la primera vez**    |

---

## EVO Toric

**Dirección:** `https://www.evoiolcalculator.com/toric.aspx`
**Adaptador:** `packages/integrations/src/adapters/evo.ts`

### Cómo es

Un formulario ASP.NET clásico. Calcular es un envío del formulario que recarga
la página; el resultado sale en la misma página. Sin iframes, sin login, sin
CAPTCHA. Los identificadores son estables y descriptivos.

### Campos

| Dato             | Selector                                           | Decimales |
| ---------------- | -------------------------------------------------- | --------- |
| Ojo              | `#RadioButtonRLEye_0` (OD) / `_1` (OS)             | —         |
| AL               | `#txtAL`                                           | 2         |
| K1 / eje         | `#txtK1` / `#TxtK1Axis`                            | 2 / 0     |
| K2 / eje         | `#txtK2` / `#TxtK2Axis`                            | 2 / 0     |
| ACD              | `#txtACD`                                          | 2         |
| LT               | `#txtLT`                                           | 2         |
| CCT              | `#txtCCT`                                          | 0         |
| Objetivo         | `#txtRefraction`                                   | 2         |
| Constante A      | `#txtAConstant`                                    | 2         |
| Modelo tórico    | `#DropDownToric`                                   | —         |
| SIA / eje        | `#TxtSIA` / `#TxtSIAaxis`                          | 2 / 0     |
| Córnea posterior | `#txtPK1`, `#TxtPK1axis`, `#txtPK2`, `#TxtPK2axis` | 2 / 0     |
| Calcular         | `#btnCalculate`                                    | —         |

**Campos de identificación que NO se rellenan:** `#TextBoxID` (identificador de
paciente) y `#TextBoxSurgeon` (cirujano). `#TextBoxName` es obligatorio para esa
web y recibe **el código local del caso**.

### Resultado

| Dato                      | Selector                                           |
| ------------------------- | -------------------------------------------------- |
| Esfera recomendada        | `#LabelRecIOL`                                     |
| Tórico                    | `#LabelRecToric`                                   |
| Designación               | `#LblRecT`                                         |
| Eje                       | `#LabelRecAxis`                                    |
| Refracción prevista       | `#LabelPredRef`                                    |
| Cilindro residual         | `#LabelPredCyl`                                    |
| Eje residual              | `#LabelPredAxis`                                   |
| Equivalente de desenfoque | `#LabelPredDE`                                     |
| Escalera de potencias     | `#lblResult_IOL1..5` / `#lblResult_Refraction1..5` |
| **Entradas según la web** | `#Labelpara1`, `#Labelpara2`                       |
| **Ojo según la web**      | `#LabelODOS`                                       |

### Dos cosas que importan

1. **EVO repite las entradas en pantalla al calcular.** Se leen y se guardan: eso
   es lo que hace auditable el informe, porque se apunta lo que la web dice haber
   recibido, no lo que creemos haberle mandado.
2. **Elegir el modelo puede sobrescribir la constante A.** Por eso se elige el
   modelo primero y la constante después. Y como comprobación de seguridad, se
   verifica que el ojo que devuelve es el que se pidió: un resultado del ojo
   equivocado parecería perfectamente válido.

---

## Barrett Toric

**Página:** `https://www.ascrs.org/en/tools/barrett-toric-calculator`
**Calculadora:** iframe de `https://calc.apacrs.org/toric_calculator20/Toric Calculator.aspx`
**Adaptador:** `packages/integrations/src/adapters/barrett.ts`

### Los cuatro obstáculos, y cómo se resuelven

1. **No está en la web de la ASCRS: está en un iframe de otro dominio.** Entrar
   directamente a ese dominio devuelve **HTTP 403 «Just a moment…»**: tiene
   protección anti-robot. **No se rodea.** Se entra por donde entra una persona,
   abriendo la página de la ASCRS.
2. **Con navegador sin ventana el iframe no llega a cargar.** Con ventana, carga.
   Por eso el adaptador declara `requiereNavegadorVisible = true`.
3. **Un aviso de cookies tapa la página entera y se come los clics.** Se elige
   **Rechazar** (`[data-cky-tag="reject-button"]`): declinar cookies opcionales
   no es aceptar nada en nombre de nadie. Ojo — el aviso **aparece unos segundos
   después de cargar**, así que hay que esperar a que salga y luego comprobar que
   la capa `.cky-overlay` **desaparece de verdad**. Dar por bueno el clic sin
   mirar el resultado produce un tiempo de espera agotado treinta segundos más
   tarde y en otro sitio del código.
4. **Los resultados están en otra pestaña.** Hay que abrir «Toric IOL», que es un
   segundo envío del formulario dentro del iframe.

### Campos

| Dato                 | Selector                                                 |
| -------------------- | -------------------------------------------------------- |
| Ojo                  | `#MainContent_Rad1` (OD) / `#MainContent_Rad2` (OS)      |
| Modelo de lente      | `#MainContent_IOLModel`                                  |
| Constante A / factor | `#MainContent_Aconstant` / `#MainContent_LensFactor`     |
| K1 plano / eje       | `#MainContent_MeasuredK` / `#MainContent_MeasuredAxis`   |
| K2 curvo / eje       | `#MainContent_MeasuredK0` / `#MainContent_MeasuredAxis0` |
| AL                   | `#MainContent_AxLength`                                  |
| ACD                  | `#MainContent_OpticalACD`                                |
| Objetivo             | `#MainContent_Refraction`                                |
| SIA / eje incisión   | `#MainContent_InducedCyl` / `#MainContent_IncisionAxis`  |
| LT                   | `#MainContent_LensThickness`                             |
| WTW                  | `#MainContent_WTW`                                       |
| Calcular             | `#MainContent_Button1`                                   |

**No se rellenan:** `#MainContent_DoctorName` ni `#MainContent_PatientNo`.
`#MainContent_PatientName` es obligatorio y recibe el código local del caso.

**Elegir el modelo rellena solo el factor de lente y la constante A**, con un
envío del formulario. Hay que esperarlo.

### Resultado

- `#MainContent_GridView1` — IOL Power | Toric Power | Refraction (S.E.Q.)
- `#MainContent_GridView2` — Toric Power | IOL Cylinder | Residual Astigmatism
- «Net Astigmatism: 0.72 D @ 81 Degrees», en la pestaña de datos. **No está en un
  elemento propio**, así que se lee del texto del marco: buscarlo como nodo no lo
  encuentra.

### Rangos que la propia web declara

Se han usado como límites de validación en el dominio:

| Dato                  | Rango      |
| --------------------- | ---------- |
| K plana y curva       | 30–60 D    |
| Ejes                  | 0–180°     |
| Longitud axial        | 12–38 mm   |
| ACD                   | 0,0–6,0 mm |
| SIA                   | 0,0–2,0 D  |
| Eje de incisión       | 0–360°     |
| Grosor del cristalino | 2,0–8,0 mm |
| WTW                   | 8–14 mm    |
| Constante A           | 112–125    |
| Factor de lente       | −2,0–5,0   |

---

## Kane

**Dirección:** `https://www.iolformula.com`
**Adaptador:** `packages/integrations/src/adapters/kane.ts`
**Estado:** ⚠️ **escrito pero NO verificado contra su formulario real**

### Por qué no está verificado

Al abrir la página aparece, **antes** de la calculadora, un acuerdo de licencia
con un botón «I Agree». Y al pie: «This site is protected by reCAPTCHA».

Calculator Vilamar **no acepta ese acuerdo en nombre de nadie** —es un contrato
legal entre el autor de la fórmula y quien la usa— y **no rodea el reCAPTCHA**.
Como consecuencia, no se ha podido ver el formulario de dentro para copiar sus
identificadores, que es como se han escrito los otros dos adaptadores.

Las cláusulas relevantes están citadas en [SYSTEM_VISION.md § 7](../SYSTEM_VISION.md),
junto con la decisión abierta O1 y la recomendación de revisión jurídica.

### Qué hace el adaptador hoy

1. Abre Kane en un navegador **visible**.
2. Detecta la pantalla de condiciones.
3. Avisa: _«KANE REQUIERE TU INTERVENCIÓN. En el navegador que se ha abierto
   tienes que leer y aceptar las condiciones de uso… Calculator Vilamar
   continuará automáticamente cuando termines.»_ — **comprobado: este mensaje
   aparece de verdad.**
4. Espera hasta cinco minutos a que la pantalla desaparezca.
5. Busca los campos **por su etiqueta** (`getByLabel`, texto de ayuda, celda
   anterior en una tabla), que es lo más robusto que se puede hacer sin haber
   visto el HTML.
6. Si no los encuentra, lo dice claramente y pide ejecutar `pnpm reconocer:kane`.
   No se inventa un resultado.
7. Lo que devuelva se marca como `PARTIAL`, con un mensaje que avisa de que el
   conector no está verificado y hay que contrastar los números con el navegador.

### Cómo cerrarlo (dos minutos de una persona)

```bash
pnpm reconocer:kane          # abre Kane con ventana
# → aceptas las condiciones con tu propio clic
# → la sonda guarda el formulario real en local/reconocimiento/
```

Con eso se rellenan los `selector` de `MAPA_KANE` en `adapters/kane.ts` y el
adaptador queda cerrado.

---

## Cómo comprobar que los tres siguen funcionando

```bash
pnpm live               # los tres
pnpm live evo           # solo uno
pnpm live evo barrett
```

Usa el fixture sintético y recorre el camino completo del producto —dominio,
confirmación, orquestador, adaptadores—, no una versión simplificada. Si esto
funciona, la aplicación hace lo mismo por dentro.

Cuando algo falle, mira el expediente que deja en `local/live/`: fase,
dirección, selector esperado y captura.
