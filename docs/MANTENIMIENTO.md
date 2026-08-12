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
4. **Añade su perfil** a `packages/domain/src/normalizacion/perfiles.ts`. El tipo
   te obliga: sin esa entrada no compila, y es a propósito.
5. Añade un fixture **sintético** a `packages/extraction/src/fixtures/` y un test.

**No hace falta tocar** el motor de reglas, la separación por ojo ni el resto del
programa.

### Sobre el perfil: la respuesta por defecto es «no deriva»

```ts
LENSTAR: {
  dispositivo: 'LENSTAR',
  acdDesdeAqdMasCct: false,
  razonAcd: 'No consta en su informe desde qué superficie mide la ACD.',
},
```

`acdDesdeAqdMasCct: true` solo se pone si **puedes señalar dónde dice el informe
—o su documentación— desde qué superficie mide cada distancia**. El ANTERION lo
imprime al lado del dato («ACD epithelium», «AQD endothelium»), y por eso la suma
`ACD = AQD + CCT` es exacta en ese aparato.

Si no lo puedes señalar, la respuesta es `false`. No es prudencia excesiva: en un
aparato que mida la ACD desde el endotelio, esa suma da un número **plausible y
medio milímetro desviado**, y un número plausible y equivocado es indistinguible
de uno correcto. Vale más decir «falta la ACD, escríbela» que rellenarla mal.

Hay un test que comprueba que la lista de los que derivan sea exactamente
`['ANTERION']`. Si añades uno, **actualízalo a propósito** — ese fallo es la señal
de que estás tomando una decisión clínica, no un test molesto.

---

## 2.1. Añadir la tabla de lentes de un aparato

Algunos informes listan modelos de LIO con su constante A. Reconocerla exige DOS
cosas, y la segunda es la que importa:

1. Poner el formato en su perfil (`packages/domain/src/normalizacion/perfiles.ts`):

```ts
LENSTAR: {
  ...
  tablaDeLentes: 'CONSTANTES_POR_FORMULA',
  razonTablaDeLentes: 'Lenstar lista los modelos y, bajo cada uno, la constante por fórmula.',
},
```

2. **Comprobar de verdad cómo lo imprime ese aparato.** El formato
   `CONSTANTES_POR_FORMULA` da por hecho que el modelo va encima —o delante— de una
   línea «`SRK/T: 119.2`». Si el aparato lo monta de otra manera, hay que añadir un
   formato nuevo en `parsers/lentes.ts`, no forzar el que hay.

`NINGUNA` es la respuesta por defecto y la correcta mientras no se haya mirado. Un
número junto a «SRK/T» puede ser el `a0` de otra fórmula o un error de lectura, y
emparejarlo con el texto de encima inventaría una relación que quizá no existe.

### Cómo NO romper la regla al tocar esto

La regla es que **la constante viaja siempre con su modelo**. Si al añadir un
aparato te encuentras escribiendo código que devuelve un número sin el nombre de la
lente al lado, el diseño se está torciendo: no hay ningún sitio donde guardar eso,
y es a propósito.

Tres cosas que el parser ya hace y conviene no deshacer:

- **Busca la CONSTANTE y luego mira hacia atrás**, no al revés. No hay forma de
  saber que «LUX SMART» es un modelo hasta ver que debajo lleva una constante;
  buscar primero nombres plausibles convertiría en modelo cualquier línea suelta.
- **Rechaza un valor fuera de 112–125**, que es el rango que declaran las propias
  calculadoras. Media relación —un modelo con una constante imposible— no vale.
- **Descarta las líneas que son otra constante por fórmula** por su FORMA
  («nombre: número»), no por una lista de nombres de fórmula. Una lista se queda
  corta en cuanto aparece una que no está en ella.

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
