# Plan: vender este software a oftalmólogos y clínicas

> Empezado el 19-20/09/2026. Es una decisión que el dueño del proyecto
> todavía no ha tomado («ya veremos») — este documento recoge la
> investigación y la estrategia habladas hasta ahora, para retomarlas sin
> perder lo ya averiguado. Relacionado con `docs/PLAN-APP-MOVIL.md` (el
> acceso desde el móvil es parte de lo que se vendería), pero es una
> decisión aparte: se puede construir la app móvil sin vender nada, y se
> podría vender la versión de escritorio sin haber hecho la móvil todavía.

## La idea

Vender el software (escritorio + más adelante móvil) a oftalmólogos y
clínicas: organiza sus cálculos de biometría, automatiza la entrada de
datos en Barrett/EVO/Kane, y genera el PDF con capturas de cada resultado —
igual que hace hoy para el dueño del proyecto, para muchos clientes en vez
de uno.

## Los dos riesgos que hay que resolver ANTES de vender nada

No son técnicos, son legales, y de los dos depende si el proyecto es
vendible tal cual está planteado:

### 1. Permiso de Barrett, EVO y Kane — el más urgente

Automatizar sus webs para uso propio (lo que hace el dueño hoy) es distinto
de automatizarlas para un producto comercial que usan varias clínicas a la
vez. El riesgo real: que bloqueen el acceso, o pidan formalmente que se
pare.

**Hay un precedente real y muy relevante**: el
[ESCRS IOL Calculator](https://iolcalculator.escrs.org/) (de la European
Society of Cataract & Refractive Surgeons, investigado el 19/09/2026) hace
EXACTAMENTE lo mismo que esta app —mete los datos de biometría en varias
webs de calculadoras a la vez y recoge los resultados («Web Scraping»,
tal cual lo llaman ellos—, y **lo hacen con autorización explícita de los
autores de las fórmulas**, cita literal de sus Términos: _"With
authorization of the IOL formula authors, the ESCRS utilizes a technology
called 'Web Scraping'..."_

**Siguiente paso recomendado**: pedir ese mismo tipo de autorización a
Barrett/EVO/Kane antes de avanzar con nada más — es lo primero que hay que
resolver, más concreto y más rápido que la pregunta regulatoria de abajo.
El dueño pidió que se le prepare un borrador de correo para esto cuando
quiera retomarlo.

### 2. Regulación de dispositivos médicos (MDR, Unión Europea)

Software que participa en la decisión de qué lente implantar en una
cirugía de cataratas puede caer bajo el Reglamento de Productos Sanitarios
de la UE, que exigiría marcado CE para venderlo como producto. No es una
pregunta que se pueda resolver por lógica — depende de la letra exacta del
reglamento y necesita a alguien especializado en sanitario.

**Lo que SÍ se pudo confirmar investigando el caso ESCRS** (19/09/2026):
su calculadora **NO reclama marcado CE ni se presenta como dispositivo
médico** — en vez de certificarse, se protegen con avisos explícitos:
los resultados _"no están destinados a servir de instrucción médica o
quirúrgica"_, el cirujano es _"el único responsable del resultado
refractivo"_, y el usuario tiene que indemnizar a ESCRS frente a cualquier
reclamación. Es una prueba real de que operar así, sin certificación, es
al menos una vía que una sociedad científica seria considera viable — pero
sigue sin ser una confirmación legal para ESTE proyecto, con SU marco
concreto (venta comercial, no una sociedad sin ánimo de lucro).

**Diferencia importante a tener en cuenta**: ESCRS **no guarda ningún
dato** de lo que se mete en sus formularios. Este software hace justo lo
contrario — su valor está en guardar y organizar los casos por doctor,
con histórico. No se puede copiar la estrategia de privacidad de ESCRS sin
perder lo que hace útil el producto; hará falta política de privacidad y
retención de datos propia, con ayuda legal para cumplir el RGPD si se
guardan datos de pacientes de varias clínicas.

## Cambios ya decididos, pendientes de construir cuando se retome

- **Quitar (o dejar claramente desactivable) la función de «estimación
  propia»** (D43 en `SYSTEM_VISION.md`) en cualquier versión que se venda.
  Hoy sugiere, con un criterio clínico fijo, cuál sería la opción
  recomendada bajo cada captura — es la función que más se parece a
  «recomendar un tratamiento», y quitarla refuerza el argumento de
  «esto es solo un organizador, no decide nada» de cara a un regulador.
- **Hecho (20/09/2026): aviso legal del PDF reforzado.** `PIE_LEGAL`, en
  `packages/report/src/plantilla.ts`, empieza ahora con «Este documento es
  únicamente un organizador de cálculos», añade la frase de ESCRS casi
  literal «No está destinado a servir de instrucción médica ni
  quirúrgica», y dice «responsabilidad exclusiva del oftalmólogo» en vez de
  «la decisión es del cirujano». Aprobado por el dueño tal cual se propuso,
  sin cambios. Esto vale para CUALQUIER PDF que genere la app desde ahora,
  no solo para una hipotética versión comercial — ya está en producción.

## Costes, si se decide seguir adelante

- **Servidor virtual (VPS)**: escala con el uso. Prototipo con una o dos
  clínicas, 5-10€/mes. Con más clínicas a la vez, cada cálculo abre un
  navegador real (Playwright, con bastante memoria), así que puede hacer
  falta un servidor más grande o varios pequeños según carga.
- **API de lectura de documentos (Claude Vision)**: se decidió que sea
  **una sola clave del dueño, para todas las clínicas**, con el coste
  metido dentro del precio de la suscripción — no que cada clínica cree su
  propia cuenta de API (demasiada fricción para un cliente no técnico, y
  así funciona la inmensa mayoría de productos con IA por detrás). La
  propia app ya mide el coste de cada lectura (tokens de entrada/salida),
  así que se puede calcular el coste real por clínica al mes y ponerle
  margen. Conviene un límite de uso por plan (p. ej. «hasta 200 casos al
  mes») para no llevarse una sorpresa de factura.
- Otros costes de un producto comercial de verdad, no presupuestados
  todavía: pasarela de pago, soporte técnico a clientes (esta misma
  conversación es un ejemplo de lo que hace falta resolver por cada
  cliente que no sea técnico), términos de servicio y política de
  privacidad redactados por un abogado.

## Estado

Investigación y estrategia recogidas. **No se ha tomado la decisión de
seguir adelante.** No se ha escrito ningún correo a Barrett/EVO/Kane, no se
ha consultado a ningún abogado, y el aviso legal del PDF todavía no se ha
tocado — el texto propuesto está pendiente de que el dueño lo apruebe.
