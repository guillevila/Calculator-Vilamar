# SYSTEM_VISION.md — Calculator Vilamar

> Visión, límites y decisiones del proyecto.
> Claude lo lee al empezar cada sesión. Las decisiones cerradas no se reabren
> sin información nueva.

**Versión:** 1.0 · **Fecha:** 11/08/2026 · **Autor:** Claude (con validación del dueño del proyecto)

---

## 1. Qué es esto, en una frase

Una herramienta **local** para Windows que lee una biometría ocular **una sola
vez** y con ella rellena por ti las calculadoras de lente intraocular que hoy
rellenas a mano, pone los resultados juntos y saca un PDF.

---

## 2. El problema que resuelve

Hoy, para elegir una lente intraocular, el usuario:

1. abre el informe de biometría;
2. abre la calculadora de Kane y teclea unos doce datos;
3. abre EVO Toric y teclea **los mismos** doce datos;
4. abre Barrett Toric y teclea **los mismos** doce datos otra vez;
5. apunta los tres resultados en algún sitio;
6. los compara a ojo.

Eso es media hora por paciente, tres oportunidades de teclear mal un número y
ningún rastro de qué se metió en cada sitio.

**Lo que aporta Calculator Vilamar:** se teclea (o se lee) una vez, se revisa
una vez, y el resto lo hace el programa. Ahorra tiempo, quita errores de
transcripción y deja un informe auditable.

---

## 3. Qué NO es

Esta lista importa tanto como la anterior. El producto se define por sus
límites:

- **No es una fórmula nueva.** No calcula potencias de lente. Rellena las
  calculadoras que ya existen y recoge lo que dicen.
- **No es el proyecto de ray tracing**, que vive en otro repositorio.
- **No es una historia clínica.** No guarda pacientes; guarda cálculos.
- **No es un SaaS** ni una aplicación multiusuario. Un usuario, un ordenador.
- **No es un sistema hospitalario.**
- **No sustituye el criterio del profesional.** Compara; no recomienda.
- **No inventa datos que faltan.** Nunca.
- **No salta CAPTCHA, ni login, ni aceptación de términos.**
- **No es una cuarta calculadora clínica.**

---

## 4. El flujo

```
  NUEVO CÁLCULO
       ↓
  subir foto / captura / PDF de la biometría
       ↓
  detectar el aparato y el tipo de informe
       ↓
  extraer los datos de OD y/o OS
       ↓
  normalizarlos al modelo único
       ↓
  ENSEÑARLOS TODOS AL USUARIO
       ↓
  revisión y corrección humana OBLIGATORIA
       ↓
  CONFIRMAR
       ↓
  Playwright rellena las calculadoras externas
       ↓
  EVO Toric  ·  Barrett Toric  ·  Kane
       ↓
  resultados normalizados y puestos juntos
       ↓
  análisis descriptivo de concordancias y discrepancias
       ↓
  PDF trazable
```

---

## 5. Decisiones cerradas

> No se reabren sin información nueva explícita.

| #       | Decisión                                                                                 | Por qué                                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1**  | **Playwright** para toda automatización de las webs externas                             | Decisión del dueño del proyecto. No se usa Selenium, Puppeteer, WebDriver ni clics por coordenadas.                                                                                                                            |
| **D2**  | **Local-first por defecto.** Sin nube, sin servidor, sin base de datos remota            | Los documentos son sanitarios. Lo que no sale del ordenador no se puede filtrar. Matizado por D17.                                                                                                                             |
| **D3**  | **Electron + React + TypeScript**                                                        | Aplicación de Windows, navegador controlado, sesiones persistentes, imágenes y PDF, e instalación sencilla.                                                                                                                    |
| **D4**  | **Un solo modelo canónico** de biometría, no uno por calculadora                         | Tres copias de los mismos datos es la forma más segura de que se desincronicen.                                                                                                                                                |
| **D5**  | **Nada llega a una calculadora sin confirmación humana**                                 | Es la invariante central del producto. Está impuesta por el tipo, no por la interfaz.                                                                                                                                          |
| **D6**  | **Un dato que falta se representa por su AUSENCIA**, nunca con un número                 | `Medida.valor` es un `number` a secas: no hay ningún valor que signifique «no lo sé», así que no se puede confundir con un cero.                                                                                               |
| **D7**  | **El programa no corrige datos.** Avisa y bloquea; corrige la persona                    | Un OCR arreglado en silencio esconde el fallo y la próxima vez nadie se entera.                                                                                                                                                |
| **D8**  | **Almacenamiento en ficheros JSON**, no SQLite                                           | Un módulo nativo convierte «instalar» en una tarde de configuración. Lección registrada en el log del proyecto.                                                                                                                |
| **D9**  | **El PDF se genera con `printToPDF` de Electron** desde HTML                             | Cero dependencias nuevas, nada que compilar y se maqueta con CSS.                                                                                                                                                              |
| **D10** | **OCR local con tesseract.js**; PDF escaneado se rasteriza con el Chromium de Playwright | WebAssembly puro: no compila nada. Evita traer un lienzo nativo.                                                                                                                                                               |
| **D11** | **Ningún selector HTML sale de `packages/integrations/src/adapters/`**                   | Para que cambiar EVO sea tocar un fichero. Hay un test que lo vigila.                                                                                                                                                          |
| **D12** | **A las webs se les manda el CÓDIGO LOCAL del caso**, nunca un nombre                    | EVO y Barrett exigen «Patient Name». Se les da `CV-2026-0042`, que es un identificador de este programa.                                                                                                                       |
| **D13** | **En la web de la ASCRS se RECHAZAN las cookies opcionales**                             | Declinar no es consentir en nombre de nadie, y es lo que menos datos comparte.                                                                                                                                                 |
| **D14** | **Las tres calculadoras son independientes.** Si una falla, las otras entregan           | Un fallo es un dato, no una excepción que corta el proceso.                                                                                                                                                                    |
| **D15** | **Los tests contra las webs reales NO están en el CI**                                   | Una web ajena con un mal día no puede poner el control en rojo. Se lanzan a mano con `pnpm live`.                                                                                                                              |
| **D16** | **El producto compara; no recomienda**                                                   | Puede decir que dos calculadoras coinciden. No puede decir qué lente implantar. Hay un test que lo vigila.                                                                                                                     |
| **D17** | **El lector de visión existe, y viene APAGADO**                                          | El OCR local no basta (ver §11) y un modelo de visión sí. Pero manda el informe fuera del ordenador, y eso lo decide una persona, no el programa. Sin clave configurada, nada sale a internet.                                 |
| **D18** | **El modelo de visión está fijo en el código**, no en una variable de entorno            | En una herramienta clínica hay que poder decir con qué se leyó cada informe. Un modelo cambiable por una variable suelta haría que dos lecturas del mismo documento pudieran no ser comparables sin que nadie supiera por qué. |

---

## 6. Decisiones abiertas

| #      | Pregunta                                                                                                                     | Qué bloquea                                                      | Quién decide                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **O1** | ¿Se automatiza Kane, sabiendo que sus condiciones de uso prohíben «operar un service bureau» y que la web declara reCAPTCHA? | Cerrar el adaptador de Kane                                      | El dueño del proyecto. Ver el apartado 7.              |
| **O2** | ¿Qué aparatos y qué modelos de informe usa de verdad la consulta?                                                            | Ajustar los parsers a informes reales                            | El dueño del proyecto, aportando informes anonimizados |
| **O3** | ¿Qué lentes y constantes se usan habitualmente?                                                                              | Precargar el catálogo de lentes en vez de teclear la constante A | El dueño del proyecto                                  |
| **O4** | ¿Hace falta historial de casos y búsqueda, o basta con el caso en curso?                                                     | Diseño de la persistencia a medio plazo                          | El dueño del proyecto                                  |
| **O5** | ¿Se enciende el lector de visión, sabiendo que el informe sale del ordenador?                                                | Que la lectura de informes sea buena de verdad. Ver §11.         | El dueño del proyecto, con criterio jurídico           |

---

## 11. Por qué el OCR local no basta

Está medido, no supuesto. Sobre un informe convertido a PDF desde una imagen
comprimida, el reconocimiento de texto devolvió esto:

| Pone en el informe | Leyó      | Fiabilidad que declaró |
| ------------------ | --------- | ---------------------- |
| AL 24.01           | **24.81** | **93 %**               |
| AL 24.07           | **24.87** | 80 %                   |
| K1 40.27           | **48.27** | 68 %                   |

Y en el mismo documento, un **24.07 leído bien** declaraba un 79 %.

Dos conclusiones, y las dos importan:

1. **La fiabilidad del OCR no distingue lo correcto de lo incorrecto.** No sirve
   como filtro. El programa no puede saber si un número reconocido es bueno.
2. **La validación por rangos tampoco lo detecta.** 24.81 es una longitud axial
   perfectamente normal. Es un error invisible que cambia la lente.

La causa es de raíz: Tesseract es un **reconocedor de caracteres**. Mira unos
trazos y decide a qué letra se parecen. No sabe que «AL» es una longitud axial
ni que va en milímetros. Un «8» bien dibujado donde había un «0» es un 8 nítido:
alta confianza, valor equivocado.

**Un modelo de visión sí lo sabe.** Lee la maqueta, entiende las etiquetas y
conoce los órdenes de magnitud. Es la comprobación semántica que falta. Por eso
existe D17 — y por eso viene apagado: resolverlo cuesta mandar el informe fuera
del ordenador, que es una decisión de quien lo usa (O5).

Mientras tanto, y con cualquiera de los dos lectores, **un dato leído por una
máquina no se da por bueno solo**: sale en ámbar y hay que comprobarlo uno a uno
(invariante 11).

---

## 7. La cuestión de Kane

Al abrir `iolformula.com` con un navegador real aparece, **antes** de la
calculadora, un acuerdo de licencia que hay que aceptar. Dos frases suyas
afectan a este producto:

> «…gives the user a non-exclusive, non-transferable license to access the Kane
> formula for the limited purpose of performing IOL power calculations for the
> user's clinical operations.»

> «The user may not adapt, modify, reverse engineer, decompile, disassemble,
> create derivative works, **act as a software as a service provider, or operate
> a service bureau** based on the Kane Formula.»

Y al pie: «This site is protected by reCAPTCHA».

**Cómo se ha resuelto de momento:** Calculator Vilamar **no acepta ese acuerdo
en nombre de nadie** y **no rodea el reCAPTCHA**. El adaptador abre Kane en un
navegador visible, detecta que la puerta está ahí, avisa al usuario con un
mensaje claro y **espera** a que la persona acepte. Cuando la puerta desaparece,
continúa solo.

**Lo que hace falta decidir (O1):** un uso local, de un único profesional, para
sus propios cálculos, encaja en la licencia que la web concede y no es un
«service bureau». Pero es una interpretación legal, y quien asume el riesgo es
el dueño del proyecto, no el programa. **Recomendación: revisión jurídica antes
de usarlo en trabajo real**, porque el impacto es relevante.

Mientras tanto, el resto del producto funciona sin Kane: EVO y Barrett entregan
resultados y el informe dice con todas las letras que Kane no se ejecutó y por
qué.

---

## 8. Privacidad

Este software toca documentos sanitarios. Las reglas no son negociables:

- Al repositorio no entra **ningún** informe real, imagen clínica, PDF de
  paciente, nombre, fecha de nacimiento ni identificador. Todos los fixtures son
  sintéticos y están declarados como tales.
- Los registros de diagnóstico **no llevan datos identificativos**.
- Las capturas de diagnóstico de los adaptadores **sí pueden contener
  biometría** —son pantallazos de una web rellenada con los datos del caso—, así
  que viven solo en `%APPDATA%`, nunca en el repositorio, y su carpeta lleva un
  aviso escrito.
- Las sesiones y cookies del navegador son locales y están en `.gitignore`.
- El PDF final **no lleva el nombre del paciente**: el caso se identifica por su
  código local.

---

## 9. Cómo se sabe si esto va bien

- Un cálculo completo tarda **minutos en lugar de media hora**.
- **Cero** errores de transcripción, porque el dato se teclea una vez.
- Cuando dos calculadoras discrepan, **se ve de un vistazo**.
- Seis meses después, un informe permite reconstruir qué entró, adónde fue y qué
  salió.

---

## 10. Dónde mirar

| Quieres saber…                        | Está en…                                                     |
| ------------------------------------- | ------------------------------------------------------------ |
| Qué funciona HOY de verdad            | [PROJECT_STATUS.md](PROJECT_STATUS.md)                       |
| Cómo está construido                  | [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)                 |
| Qué viene después                     | [docs/ROADMAP.md](docs/ROADMAP.md)                           |
| Los contratos de las tres webs        | [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md)               |
| Cómo arreglar un adaptador roto       | [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md)               |
| Qué significa cada etapa del proyecto | [docs/ESTADOS_DEL_PROYECTO.md](docs/ESTADOS_DEL_PROYECTO.md) |
