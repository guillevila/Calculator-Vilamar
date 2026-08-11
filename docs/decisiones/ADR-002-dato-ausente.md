# ADR-002 — Un dato ausente se representa por su ausencia

**Fecha:** 11/08/2026 · **Estado:** aceptada

## Contexto

En un cálculo de lente intraocular, confundir «no lo sé» con «cero» cambia el
resultado y el resultado sigue pareciendo razonable. La primera invariante del
producto es `MISSING != 0`.

La forma habitual de modelarlo sería `valor: number | null`. Funciona, pero
depende de que **cada sitio que lee el dato se acuerde** de comprobar el `null`.
En un modelo con veinticuatro campos y cuatro consumidores, eso es cuestión de
tiempo.

## Decisión

`Medida.valor` es un `number` **a secas**. No admite `null`, ni `0` como
comodín, ni `-1`, ni `NaN`.

Un dato que no se conoce **no tiene medida**: la clave no está en el mapa.

```ts
type MapaMedidas = Partial<Record<CampoBiometrico, Medida>>
```

Además, `crearMedida` lanza un error si recibe algo que no es finito.

## Alternativas consideradas

- **`valor: number | null`** — descartada: traslada la responsabilidad a quien
  lee, y basta que uno lo olvide.
- **Un valor centinela (`-1`, `NaN`)** — descartada: es exactamente el error que
  se quiere impedir, con otro disfraz.

## Consecuencias

- **Es imposible escribir el caso contrario.** La invariante no depende de la
  disciplina de nadie.
- Quien quiera el valor recibe `number | undefined` y tiene que decidir
  explícitamente qué hacer si no está.
- Borrar un dato es una operación de primera clase (`sinMedida`), y en la
  pantalla es un botón: es la forma correcta de decir «esto no lo sabemos».
- **Precio asumido:** no se distingue «se buscó y no estaba» de «no se buscó».
  La pantalla enseña todos los campos esperados, así que un hueco se ve.
