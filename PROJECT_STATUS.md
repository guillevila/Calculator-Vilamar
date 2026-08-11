# PROJECT_STATUS.md — Estado real de Calculator Vilamar

> 🟢 **Este es el archivo más honesto del proyecto.**
> Dice qué funciona DE VERDAD hoy y qué no. Si algo no está aquí marcado como
> «funciona», asume que NO funciona.
>
> Regla que gobierna este documento: **construido ≠ probado ≠ validado.**
> Que exista un adaptador no significa que se haya probado contra su web. Que se
> haya probado contra su web no significa que se haya validado con informes
> reales.

**Última actualización:** 11/08/2026 · tras la primera sesión de construcción

---

## 1. Estado actual

- [ ] 💡 **Idea**
- [ ] 📄 **Documentación**
- [ ] 🎬 **Demo**
- [x] 🛠️ **Prototipo funcional**
- [ ] 🚀 **MVP**
- [ ] 🏭 **Producción**

**Por qué prototipo funcional y no MVP.**

Lo construido funciona de verdad y está comprobado: la aplicación arranca, se
rellenan los datos, se confirman, **habla con EVO y con Barrett de verdad**, trae
sus resultados y saca un PDF. Eso no es una demo: son dos webs reales
respondiendo, y está medido (47 segundos de punta a punta).

Pero **falta lo que lo convertiría en MVP**, y es justo la puerta de entrada:

1. **La lectura de informes no se ha probado nunca con un informe real.**
   Funciona sobre textos sintéticos escritos por mí imitando la forma de esos
   aparatos. Un informe de verdad puede tener otra maquetación, otras
   abreviaturas y otro orden. **Hasta que no se pruebe con informes reales, el
   dato de entrada del producto no está validado.** Es la limitación más
   importante de esta lista.
2. **Kane no está verificado** contra su formulario real (ver apartado 4).
3. **No hay instalador.** Hoy se arranca con `pnpm dev` desde una consola.

Mientras el paso 1 siga abierto, esto no se puede usar cómodamente cada día, que
es lo que separa un prototipo de un MVP.

---

## 2. ✅ Qué funciona HOY

> Solo lo que he ejecutado y comprobado, no lo que he escrito.

### Comprobado contra las webs reales

- **EVO Toric: funciona de punta a punta.** Se rellena su formulario, se pulsa
  calcular y se leen los resultados. Medido: **~4–7 segundos**. Devuelve esfera,
  cilindro, eje, designación tórica, refracción prevista, cilindro y eje
  residuales y el equivalente de desenfoque.
- **Barrett Toric: funciona de punta a punta.** Incluye entrar por la página de
  la ASCRS, quitar su aviso de cookies, esperar al iframe, rellenar, calcular y
  abrir su pestaña de resultados. Medido: **~21–35 segundos**.
- **Las dos coinciden** sobre el fixture sintético: 21.50 D de esfera, cilindro
  1.00 y eje 81°. Que dos implementaciones independientes den lo mismo es la
  mejor señal de que los datos se están enviando bien.
- **EVO devuelve lo que dice haber recibido** y se guarda. Eso es lo que hace el
  informe auditable: no se apunta lo que creemos haber mandado, sino lo que la
  web enseña en su pantalla.
- **Kane detecta su puerta.** Al abrirlo aparece su acuerdo de licencia; el
  programa lo reconoce, avisa con un mensaje claro y espera. No lo acepta por su
  cuenta.

### Comprobado arrancando la aplicación de verdad

Cinco pruebas que abren Electron y pulsan con el ratón, más una verificación
vertical completa:

- **La ventana abre** y enseña la pantalla de inicio.
- **Se pueden escribir los datos a mano**, y se validan según se escriben.
- **Un dato imposible bloquea.** `AL = 240.7` sale en rojo, dice «parece un punto
  decimal mal leído: podría ser 24.07», **no lo cambia** y no deja confirmar.
- **Un campo vacío pone «NO ENCONTRADO»**, nunca 0.
- **Borrar un dato** lo deja ausente, no a cero.
- **El flujo completo**: datos → confirmar → EVO y Barrett reales → tabla
  comparativa → **PDF escrito en disco**. Comprobado en 47 segundos.
- **Una calculadora que espera no bloquea a las demás:** con Kane esperando a que
  se acepten sus condiciones, se pueden ver los resultados de EVO y Barrett.

### Comprobado con tests automáticos (205, todos en verde)

- **Las diez invariantes clínicas.** Las dos barreras de confirmación se han
  comprobado **rompiéndolas a propósito** y viendo caer el test que las cubre.
- **Aislamiento de fallos**: con un adaptador que revienta —no uno que falla
  bien—, los otros dos conservan su resultado.
- **Que falte un dato bloquea solo a quien lo necesita**: sin SIA, Barrett no
  calcula y EVO sí.
- **Ningún selector HTML sale de `adapters/`.** Comprobado plantando una
  infracción y viendo saltar el guardián.
- **La comparativa describe y no aconseja**: hay un test que busca «debes»,
  «recomendamos», «implanta»… y falla si aparecen.
- **Lectura de informes sobre textos sintéticos**: ANTERION, IOLMaster 700 y
  Pentacam; formato por secciones y a dos columnas; ACD y AQD como campos
  distintos; K y TK por separado; y un informe sin marca de ojo que **no se
  atribuye a ninguno**.
- **El informe PDF** no lleva datos identificativos en su cuerpo y escapa el HTML
  que venga de fuera.

### Comprobado a mano

- **`pnpm install` no compila nada** y termina en segundos.
- **Lint, comprobación de tipos y build en verde.**
- **El PDF se ve bien.** Generado, abierto y mirado, no solo compilado.

---

## 3. ⚠️ Qué NO funciona todavía

- **DOCUMENT EXTRACTION NOT YET VALIDATED ON REAL REPORTS.** Lo repito en inglés
  porque es la frase que pidió el pliego y porque es la limitación que más
  importa. Los parsers funcionan sobre textos sintéticos. Con un informe real
  pueden fallar, y el modo de fallo más probable no es un error: es leer un
  número donde no toca.
- **Kane no está verificado.** El adaptador está escrito y busca los campos por
  su etiqueta, pero no se ha podido ver su formulario (ver apartado 4).
- **No hay instalador.** Se arranca desde consola con `pnpm dev`.
- **Sin historial de casos en la interfaz.** Los casos se guardan en disco, pero
  no hay pantalla para volver a uno anterior.
- **El OCR necesita internet la primera vez** (unos 5 MB de datos de idioma).
  Después funciona sin conexión.
- **Un PDF escaneado se lee, pero solo las 5 primeras páginas**, y lo dice.
- **Sin soporte de córnea post-cirugía refractiva** más allá de guardar los
  campos: no se rellenan las secciones específicas de EVO para post-LASIK.
- **Los dos ojos se calculan por separado.** Hay que cambiar de ojo y volver a
  lanzar; no se calculan los dos de una tacada.

---

## 4. 🔒 Bloqueos externos

| Qué                                | Por qué está bloqueado                                                                                                                                                                       | Qué hace falta                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verificar Kane**                 | Su calculadora está detrás de un acuerdo de licencia que hay que aceptar, y la web declara reCAPTCHA. Aceptar un contrato legal en nombre del usuario no es algo que deba hacer el programa. | Que el dueño del proyecto ejecute `pnpm reconocer:kane`, acepte las condiciones con su propio clic, y con lo que salga se cierre el adaptador. **Además: decisión sobre O1** (ver SYSTEM_VISION § 7) y, dado el impacto, revisión jurídica. |
| **Validar la lectura de informes** | No hay ningún informe real en el proyecto, y no debe haberlo sin anonimizar.                                                                                                                 | Informes reales **anonimizados** de ANTERION, IOLMaster 700 y Pentacam. Con 2–3 de cada uno se puede ajustar y medir de verdad.                                                                                                             |
| **Catálogo de lentes**             | No sé qué lentes usa la consulta.                                                                                                                                                            | La lista de modelos y constantes habituales.                                                                                                                                                                                                |

Ninguno de los tres impide usar lo demás.

---

## 5. 🚨 Riesgos

| Riesgo                                              | Gravedad | Qué hay hecho                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El OCR lee mal un número y nadie lo nota**        | **Alta** | Validación por rangos que marca lo imposible y bloquea; detección de punto decimal mal leído; evidencia visible de qué se leyó; revisión humana obligatoria. Aun así, un error dentro de rango **puede colarse**: por eso la pantalla enseña el texto original de cada dato. |
| **Los datos acaban en el ojo equivocado**           | **Alta** | Si no se puede determinar el ojo, no se asigna ninguno. La lateralidad viaja dentro de cada medida y guardarla en el ojo que no es lanza un error. EVO confirma el ojo en su respuesta y se comprueba.                                                                       |
| **Una web cambia y el adaptador deja de funcionar** | Media    | Cada fallo guarda un expediente con fase, dirección, selector esperado y captura. `pnpm live` prueba los adaptadores contra las webs en un minuto.                                                                                                                           |
| **Sesiones y cookies**                              | Media    | Perfil de navegador local en `%APPDATA%`, fuera del repositorio y en `.gitignore`.                                                                                                                                                                                           |
| **Privacidad**                                      | **Alta** | Nada identificativo entra en el repositorio ni en el PDF. Las capturas de diagnóstico **sí pueden contener biometría** y por eso viven solo en local, con un aviso escrito en su carpeta.                                                                                    |
| **Dependencia de terceros**                         | Media    | Las tres webs son ajenas y pueden cambiar o caerse. Por eso los tests contra ellas están fuera del CI y el producto entrega resultados parciales.                                                                                                                            |

---

## 6. Qué se ha decidido esta sesión

- Todo el apartado de decisiones cerradas de [SYSTEM_VISION.md](SYSTEM_VISION.md)
  (D1–D16).
- **La carpeta del repositorio estaba vacía.** La plantilla habitual no llegó a
  copiarse, así que se ha instalado desde el proyecto hermano y adaptado.

---

## 7. Lo siguiente, por orden de importancia

1. **Probar la lectura con informes reales anonimizados.** Todo lo demás está por
   detrás de esto.
2. **Cerrar Kane**: aceptar sus condiciones una vez, capturar su formulario y
   ajustar el adaptador. Antes, decidir O1.
3. **Instalador de Windows**, para poder arrancarlo sin consola.
4. Calcular los dos ojos de una vez.
5. Historial de casos.
