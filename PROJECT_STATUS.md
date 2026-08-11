# PROJECT_STATUS.md — Estado real de Calculator Vilamar

> 🟢 **Este es el archivo más honesto del proyecto.**
> Dice qué funciona DE VERDAD hoy y qué no. Si algo no está aquí marcado como
> «funciona», asume que NO funciona.
>
> Regla que gobierna este documento: **construido ≠ probado ≠ validado.**
> Que exista un adaptador no significa que se haya probado contra su web. Que se
> haya probado contra su web no significa que se haya validado con informes
> reales.

**Última actualización:** 11/08/2026 · tras la primera sesión y la ronda de
arreglos que salió de probarla con un documento real

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
3. **No hay instalador `.exe`.** Se arranca con doble clic en
   `Calculator Vilamar.cmd`, que sí funciona, pero no es un programa instalado.

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

### Lectura de documentos — comprobada con documentos generados

Con `pnpm probar:lectura`, que genera tres documentos y los pasa por el mismo
proveedor que usa la aplicación:

| Documento                         | Resultado                                      |
| --------------------------------- | ---------------------------------------------- |
| **PDF con capa de texto**         | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |
| **Imagen PNG o JPEG (OCR)**       | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |
| **PDF escaneado (imagen dentro)** | ✅ 8 de 8 campos, los dos ojos, ejes incluidos |

Y con imágenes de distintos tamaños y formatos, comprobado por separado:

| Entrada                              | Fiabilidad del OCR | Números                                      |
| ------------------------------------ | ------------------ | -------------------------------------------- |
| PNG 900×600                          | 89 %               | correctos                                    |
| JPEG 1920×1080 (captura de pantalla) | 90 %               | correctos                                    |
| JPEG 4032×3024 (foto de móvil)       | 91 %               | correctos                                    |
| Fichero corrupto                     | —                  | mensaje claro, y la aplicación sigue abierta |

#### Hay un segundo lector, mejor, y viene apagado

Existe un **lector de visión** (Claude, `claude-opus-5`) que lee el informe
entendiéndolo en vez de reconociendo letras: ve la maqueta, sabe que AL es una
longitud axial en milímetros y devuelve los datos ya estructurados, cada uno con
la línea literal del informe de donde sale.

**Está construido, con pruebas, y APAGADO.** Sin `ANTHROPIC_API_KEY` configurada
se declara no disponible y la aplicación lee en local exactamente como antes.

Por qué apagado: **manda el informe fuera del ordenador.** Son datos de salud
(RGPD art. 9). Encenderlo es una decisión de quien lo usa, no del programa —
decisión abierta O5 en SYSTEM_VISION.

Qué NO cambia si se enciende: un dato leído por el modelo sigue saliendo en
ámbar y hay que comprobarlo uno a uno. Acierta mucho más, pero no es exacto.

**Sin validar contra informes reales.** No he podido medir cuánto mejora, porque
para eso hacen falta informes de verdad anonimizados. Lo que está probado son
las 13 pruebas de que su respuesta se trata con la desconfianza que le toca
(entra como `VISION`, un ojo dudoso se descarta entero, nada se pierde en
silencio), verificadas rompiendo cada guarda a propósito.

Si la API falla —sin internet, clave caducada, cuenta sin saldo— **no se pierde
el documento**: se lee en local y se dice qué ha pasado.

#### ⚠️ Lo más importante que se ha aprendido: el OCR no es de fiar para números

Sobre un informe convertido a PDF desde una imagen comprimida, el reconocimiento
leyó esto:

| Pone en el informe | Leyó      | Fiabilidad que declaró |
| ------------------ | --------- | ---------------------- |
| AL 24.01           | **24.81** | **93 %**               |
| AL 24.07           | **24.87** | 80 %                   |
| K1 40.27           | **48.27** | 68 %                   |
| CCT 530            | **538**   | —                      |

Y en el mismo documento, un **24.07 leído CORRECTAMENTE** declaraba un 79 %.

O sea: **la fiabilidad que da el OCR no distingue lo correcto de lo incorrecto.**
El programa NO PUEDE saber si un número reconocido es bueno. Y un 24.81 en lugar
de 24.01 está dentro de rango, así que ninguna validación lo detecta.

**Qué se ha hecho con eso**, porque es una decisión de producto y no un ajuste:

- Un dato leído por OCR **nunca se enseña como «✓ correcto»**. Sale en ámbar,
  como «⚠ compruébalo», aunque el valor sea perfectamente normal.
- **«Confirmar datos» no los acepta en bloque.** Hay que comprobar cada uno
  contra el informe y pulsar «Está bien». Lo escrito a mano y lo que viene del
  texto de un PDF no lo necesitan: son exactos.
- La pantalla enseña el texto que se leyó, para poder compararlo de un vistazo.

**Consecuencia práctica:** con un informe en PDF **con texto dentro**, la lectura
es exacta y el programa ahorra todo el trabajo. Con una imagen o un escaneo,
ahorra teclear pero **hay que comprobar cada número**. Convertir una imagen a PDF
no ayuda: sigue siendo reconocimiento sobre imagen.

**Toda imagen pasa por el navegador y sale como PNG limpio** del tamaño que
mejor lee el OCR (unos 2200 px de ancho). El navegador decodifica muchos más
formatos y variantes que tesseract, y eso es lo que convirtió un «Error
attempting to read image» en un informe leído.

Medido: llevar la imagen a ese ancho sube la fiabilidad del 80 % al 90 %.
Ampliar ×3 **empeora** —apareció un 24.97 donde ponía 24.07—, así que hay tope.

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
- **No hay instalador `.exe`.** Hay un lanzador de doble clic
  (`Calculator Vilamar.cmd`) **comprobado: abre la ventana**. El instalador de
  verdad falla en este equipo porque `electron-builder` necesita permiso para
  crear enlaces simbólicos; se arregla activando el Modo de desarrollador de
  Windows, pero no lo he podido probar sin ese permiso.
- **Sin historial de casos en la interfaz.** Los casos se guardan en disco, pero
  no hay pantalla para volver a uno anterior.
- **El OCR necesita internet UNA vez** para bajar 5 MB de datos de idioma;
  después funciona sin conexión. Se puede hacer por adelantado con
  `pnpm ocr:preparar`. Si faltan y no hay conexión, se dice con claridad y se
  puede seguir a mano — **antes esto cerraba la aplicación**.
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
3. **Instalador de Windows.** La configuración está puesta; falta ejecutarlo
   con el Modo de desarrollador activado y comprobar el `.exe` resultante.
4. Calcular los dos ojos de una vez.
5. Historial de casos.
