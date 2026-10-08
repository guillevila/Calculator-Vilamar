# Dar Calculator Vilamar a otro optometrista

> Para ti, el dueño del proyecto. Explica cómo preparar una copia de la
> aplicación lista para que otra persona la use en SU PROPIO ordenador — un
> optometrista nuevo, por ejemplo.

---

## La idea (D119, 06/10/2026)

Cada optometrista tiene su propio ordenador, con su propia copia
**independiente** de la aplicación — exactamente como tiene tu mujer la
suya. No hay ningún servidor ni ningún dato compartido entre copias: cada
una guarda sus propios casos y su propia lista de doctores, sin que nadie
vea los de otro.

Esto ya funciona solo, sin que haga falta tocar nada: los datos de cada
persona se guardan en la carpeta de Windows de su propio usuario, nunca
dentro de la aplicación en sí. En cuanto le des una copia a alguien nuevo,
esa copia empieza completamente vacía para ella — su propia lista de
doctores, sus propios casos, desde cero.

Lo único que hacía falta era un paso más rápido para preparar esa copia y
dársela. Eso es lo que hace este comando.

---

## Cómo hacerlo

1. Abre PowerShell en la carpeta del proyecto.
2. Ejecuta:

   ```powershell
   pnpm compartir
   ```

3. Tarda unos minutos (compila la aplicación entera, con su propio
   navegador incluido). Al terminar, deja un fichero `.zip` dentro de
   `apps\desktop\dist\`, con el nombre `Calculator-Vilamar-<fecha>.zip`.
   Son varios cientos de MB.

4. Copia ese `.zip` a un USB, o súbelo a una carpeta compartida de
   OneDrive, y pásaselo a la persona nueva.

## Lo que tiene que hacer la persona que lo recibe

1. Descomprimir el `.zip` en cualquier carpeta de su ordenador.
2. Entrar en esa carpeta y hacer doble clic en **`Calculator Vilamar.exe`**.
3. Windows avisará de **«Editor desconocido»** — es normal, la aplicación
   no está firmada digitalmente (lo sabes ya de tu propia copia). Hay que
   darle a **«Más información»** → **«Ejecutar de todas formas»**.
4. Para tenerlo como un programa normal: clic derecho sobre
   `Calculator Vilamar.exe` → _Enviar a_ → _Escritorio (crear acceso
   directo)_.

No hace falta instalar Node, pnpm, ni nada más — el `.zip` ya lleva todo
lo necesario dentro, incluido el navegador que usa para hablar con EVO,
Barrett y Kane.

## Su propia clave para leer fotos

La aplicación lee las fotos de los informes con una «clave de API» de
Anthropic. **Tu clave no viaja dentro del `.zip`**: vive en tu carpeta de
datos de Windows (`%APPDATA%\calculator-vilamar\.env`), no dentro de la
aplicación, así que quien reciba la copia no gasta de tu cuenta. Sin
ninguna clave, la aplicación funciona igual, pero lee las fotos con un
reconocimiento de texto local que se equivoca más (se lo avisa en
pantalla).

Para que la otra persona use la suya, en su ordenador:

1. Abrir la aplicación una vez y cerrarla (así se crea su carpeta de datos).
2. Teclas **Windows + R**, escribir `%APPDATA%\calculator-vilamar` e Intro.
3. Dentro, crear un archivo de texto llamado `.env` (con el punto delante y
   sin `.txt` al final).
4. Escribir una sola línea: `ANTHROPIC_API_KEY=` seguido de su clave, sin
   comillas ni espacios. Guardar y volver a abrir la aplicación.

No enviéis la clave por mensaje ni la dejéis dentro de la carpeta de la
aplicación: si alguien más la viera, habría que revocarla en la cuenta de
Anthropic y crear otra. Cada persona ve en su propia cuenta cuánto gasta.

## Actualizarla más adelante

Cuando quieras pasarle las mejoras de una sesión nueva, repite
`pnpm compartir` y vuelve a darle el `.zip` nuevo — que sustituya la
carpeta que ya tenía. Sus casos y sus doctores no se tocan: viven aparte,
en la carpeta de datos de Windows de su usuario, no dentro de la carpeta
de la aplicación que le mandas.
