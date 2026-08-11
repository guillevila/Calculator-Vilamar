# Mantenimiento — las cuatro cosas que vas a necesitar

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude

> Este documento existe para que dentro de seis meses se pueda arreglar algo sin
> reconstruir el razonamiento entero.

---

## 1. «EVO ha cambiado el botón de calcular»

Es lo que más va a pasar: las webs cambian sin avisar.

### Cómo se ve

En la aplicación, la calculadora aparece con un mensaje del tipo _«EVO no ha
respondido como se esperaba»_ o _«La página puede haber cambiado»_.

### Cómo se diagnostica

Cada fallo deja un expediente en:

```
%APPDATA%\calculator-vilamar\diagnostico\<adaptador>-<fecha>\
   informe.json    ← fase, dirección, selector esperado, error técnico
   resumen.txt     ← lo mismo, legible de un vistazo
   pantalla.png    ← qué había en pantalla en ese momento
```

`resumen.txt` te dice **qué selector esperaba encontrar**. Ábrelo primero.

> ⚠️ Esa captura es de una web rellenada con los datos del caso, así que **puede
> contener biometría**. Es local. No la subas a ningún sitio sin mirarla.

### Cómo se arregla

```bash
# 1. Mira el formulario actual con un navegador real
pnpm reconocer          # node scripts/sondas/reconocer.mjs evo|kane|barrett
# → local/reconocimiento/evo.json  tiene todos los campos y botones de hoy

# 2. Corrige el selector en el adaptador
#    packages/integrations/src/adapters/evo.ts

# 3. Compruébalo contra la web de verdad
pnpm live evo
```

**Solo se toca un fichero.** Ni el modelo clínico, ni la lectura de informes, ni
la interfaz, ni los otros dos adaptadores se enteran. Hay un test que lo
garantiza (`arquitectura.test.ts`).

---

## 2. Añadir un aparato de biometría

Añadir soporte para un aparato nuevo es **añadir una tabla de reglas**.

```ts
// packages/extraction/src/deteccion/detector.ts
// 1) Cómo se reconoce: indicios con peso. Los altos, para lo que solo puede
//    venir de ese aparato (su nombre comercial).
{
  dispositivo: 'LENSTAR',
  indicios: [
    { patron: /\bLENSTAR\b/i, peso: 10, descripcion: 'Nombre del aparato' },
    { patron: /\bHAAG[- ]STREIT\b/i, peso: 6, descripcion: 'Fabricante' },
  ],
}

// packages/extraction/src/parsers/dispositivos.ts
// 2) Cómo llama a las cosas. Sus reglas van PRIMERO: el motor se queda con la
//    primera coincidencia de cada campo.
const LENSTAR: readonly ReglaLectura[] = [
  {
    campo: 'ACD',
    nombre: 'Lenstar ACD',
    patrones: [/\bACD\b[^0-9-]{0,14}(\d+[.,]\d{1,3})/i],
  },
]

REGLAS_POR_DISPOSITIVO.LENSTAR = [...LENSTAR, ...REGLAS_GENERICAS]
```

3. Añade `'LENSTAR'` al tipo `Dispositivo` y su nombre a `NOMBRE_DISPOSITIVO`
   (`packages/domain/src/modelo/documento.ts`).
4. Añade un fixture **sintético** a `packages/extraction/src/fixtures/` y un test.

**No hace falta tocar** el motor de reglas, la separación por ojo ni el resto del
programa.

---

## 3. Añadir una calculadora

1. **Míralaprimero.** Añade su dirección a `scripts/sondas/reconocer.mjs` y
   ejecútalo. Escribir un adaptador de memoria no funciona; esta lección está en
   el log del proyecto.
2. Añade la clave al tipo `Calculadora` y su ficha a `FICHAS`
   (`packages/domain/src/modelo/calculadoras.ts`): dirección, campos
   **requeridos**, **opcionales** y qué intervención humana pide.
3. Crea `packages/integrations/src/adapters/<nombre>.ts` implementando
   `AdaptadorCalculadora`. Cópiale la estructura a `evo.ts`, que es la más
   sencilla.
4. Regístralo en `crearAdaptadores()` y colócalo en `ORDEN_POR_DEFECTO` según
   cuánta intervención pida: las que no piden nada, primero.
5. `pnpm live <nombre>`.

**Lo que no debe pasar:** que un selector de esa web aparezca fuera de su
adaptador. El test de arquitectura te avisará.

---

## 4. Cerrar el adaptador de Kane

Necesita dos minutos de una persona, porque hay que aceptar un acuerdo legal.

```bash
pnpm reconocer:kane
```

Se abre Kane con ventana. **Acepta tú las condiciones.** La sonda guarda el
formulario real en `local/reconocimiento/kane.json`.

Con esa lista, rellena el campo `selector` de cada entrada de `MAPA_KANE` en
`packages/integrations/src/adapters/kane.ts`. Los `selector` tienen prioridad
sobre la búsqueda por etiqueta.

Después: `pnpm live kane`, y actualiza `PROJECT_STATUS.md` y
`docs/INTEGRACIONES.md` para que dejen de decir «sin verificar».

Antes de nada, resuelve la decisión abierta **O1** de
[SYSTEM_VISION.md § 7](../SYSTEM_VISION.md).

---

## 5. Comprobaciones antes de cerrar cualquier cambio

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm test:e2e     # si se tocó interfaz o proceso principal
pnpm live                       # si se tocó un adaptador
pnpm verificar:vertical         # si se tocó el flujo completo
```

**Nunca** se desactiva un test ni se relaja una validación para que algo pase. Si
hace falta eso, no está listo.

Y una regla específica de este proyecto: **las invariantes clínicas de
`packages/domain/src/invariantes/` no se relajan nunca.** Si un cambio hace
fallar uno de esos tests, el que está mal es el cambio.
