# Arrancar Calculator Vilamar en Windows, desde cero

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude

> Pensado para seguirlo tal cual, sin saber programar. Si algo no sale como
> aquí pone, es un fallo del programa o de estas instrucciones — no tuyo.

---

## 1. Lo que hay que instalar una vez

### Node.js

Descárgalo de **<https://nodejs.org>** y elige la versión **LTS**. Instalador
siguiente-siguiente-terminar.

Para comprobar que ha ido bien, abre **PowerShell** (tecla Windows, escribe
«PowerShell», Enter) y escribe:

```powershell
node --version
```

Tiene que responder algo como `v22.x.x` o superior. Si dice que no reconoce el
comando, cierra PowerShell, ábrelo otra vez y repite.

### pnpm

En la misma ventana:

```powershell
npm install -g pnpm
pnpm --version
```

---

## 2. Preparar el programa

Ve a la carpeta del proyecto y ejecuta, **por este orden**:

```powershell
cd "C:\Users\<tu-usuario>\Desktop\Desarrollo\Calculadora Vilamar"

pnpm install
```

Esto baja las piezas que necesita. **Debe tardar segundos y no debe fallar**: no
compila nada. Si te pide Visual Studio o Python, algo va mal — avísame.

```powershell
pnpm playwright:install
```

Esto descarga el navegador que usará para rellenar las calculadoras. Son unos
150 MB y tarda un par de minutos. **Solo hace falta la primera vez.**

---

## 3. Arrancarlo

### Con doble clic (lo normal)

En la carpeta del proyecto hay un fichero llamado **`Calculator Vilamar.cmd`**.
**Haz doble clic.** Se abre la aplicación.

La primera vez tarda un poco porque construye el programa; después es inmediato.

> **Truco:** haz clic derecho sobre ese fichero → _Enviar a_ → _Escritorio (crear
> acceso directo)_. Así lo tienes como cualquier otro programa.

### Desde la consola (si prefieres)

```powershell
pnpm dev      # modo desarrollo, se recarga al cambiar el código
pnpm start    # abre la versión construida
```

Para cerrarlo, cierra la ventana.

> ℹ️ **Todavía no hay un instalador .exe.** Generarlo requiere activar el _Modo
> de desarrollador_ de Windows (Configuración → Privacidad y seguridad → Para
> desarrolladores), porque la herramienta que lo crea necesita permiso para
> hacer enlaces simbólicos. El fichero `.cmd` hace el mismo trabajo mientras
> tanto.

---

## 4. Tu primer cálculo

### a) Los datos

Tienes dos caminos:

- **Arrastra tu informe** (PDF, JPG o PNG) a la zona de puntos, o pulsa **Elegir
  archivo**.
- O pulsa **Escribir los datos a mano**, que es el camino que ahora mismo está
  más probado.

> ⚠️ La lectura automática de informes **todavía no se ha probado con informes
> reales**. Puede leer bien, puede leer mal, y puede leer un número donde no
> toca. **Revísalo todo** en el paso siguiente. Es la razón por la que ese paso
> existe.

### b) Revisar

Verás todos los datos, agrupados. De cada uno se dice **de dónde salió**:

- `del informe` — lo ha leído el programa
- `a mano` — lo has escrito tú
- `no encontrado` — **no está**. No es cero: es que no se sabe

Y su estado: `correcto`, `poco frecuente` (ámbar) o `imposible` (rojo).

Si algo está en rojo, no te dejará continuar. El programa te dirá qué sospecha
—por ejemplo, que `240.7` debería ser `24.07`— pero **no lo cambiará por su
cuenta**: lo corriges tú.

Para decir que un dato no se conoce, **deja el campo vacío** o pulsa **Borrar**.
No pongas 0: para el cálculo no es lo mismo.

Antes de seguir, rellena lo que decides tú y no viene en el informe:
**refracción objetivo**, **SIA**, **eje de la incisión**, **constante A** y el
**modelo de lente**.

### c) Confirmar

**Confirmar datos.** A partir de aquí, y solo a partir de aquí, los datos pueden
salir hacia las calculadoras.

### d) Calcular

Pulsa **Calcular en las tres**. Se abrirá un navegador y **verás cómo se
rellenan las webs solas**. No lo cierres.

- **EVO Toric** tarda unos segundos.
- **Barrett Toric** tarda alrededor de medio minuto.
- **Kane** te pedirá que **aceptes sus condiciones de uso** en el navegador. Es
  un acuerdo legal y solo puedes aceptarlo tú. Cuando lo hagas, el programa
  continúa solo.

Si no quieres usar Kane, no pasa nada: **no esperes**. Pulsa **Ver los
resultados que ya hay** y tendrás EVO y Barrett.

### e) Resultados y PDF

Una tabla con las tres columnas, y debajo, en lenguaje normal, en qué coinciden y
en qué no.

**Generar PDF** te lo guarda y te dice dónde. El botón **Abrir la carpeta** te
lleva allí.

---

## 5. Dónde queda todo

```
%APPDATA%\calculator-vilamar\
   casos\          los cálculos, en ficheros de texto
   documentos\     copia de los informes que has subido
   informes\       los PDF generados
   diagnostico\    qué pasó cuando algo falló
   sesion-navegador\  cookies y sesiones del navegador
```

Para llegar: tecla Windows + R, escribe `%APPDATA%\calculator-vilamar`, Enter.

**Nada de eso sale de tu ordenador** y nada de eso está en el repositorio.

---

## 6. Si algo va mal

| Qué ves                                   | Qué pasa                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm` no se reconoce                     | Cierra PowerShell y ábrelo otra vez tras instalar pnpm                                     |
| No se abre ninguna ventana con `pnpm dev` | Copia lo que salga en la consola y mándamelo                                               |
| «EVO no ha respondido como se esperaba»   | Reinténtalo. Si sigue, es que la web ha cambiado: mira `docs/MANTENIMIENTO.md`             |
| Barrett se queda esperando                | Su web pide a veces una comprobación de seguridad. Hazla en el navegador que se ha abierto |
| El OCR falla la primera vez               | Necesita internet una vez para bajar 5 MB de datos de idioma                               |
| Kane no avanza                            | Está esperando a que aceptes sus condiciones en el navegador                               |

**Lo importante:** si una calculadora falla, **las demás no se pierden**. Puedes
reintentar solo esa.

---

## 7. Comprobar que todo sigue bien

De vez en cuando, o después de un cambio:

```powershell
pnpm lint ; pnpm typecheck ; pnpm test ; pnpm build
```

Y para comprobar que las webs siguen respondiendo como esperamos (tarda un
minuto y abre ventanas):

```powershell
pnpm live evo barrett
```
