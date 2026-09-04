/**
 * camposNucleo.ts — Los seis datos que EVO, Barrett y Kane piden siempre
 * para poder calcular algo.
 *
 * Compartido entre `FormularioManual.tsx` y `PanelRevision.tsx` (rediseño
 * 04/09/2026: las dos pantallas de entrada de datos —a mano o revisando un
 * documento cargado— tienen que verse como la misma experiencia, con la
 * misma cabecera y barra de progreso). Vivía solo en `FormularioManual.tsx`
 * hasta ahora; sacarlo aquí evita que las dos pantallas puedan divergir en
 * silencio si algún día cambia la lista.
 *
 * No sustituye la exigencia real de cada campo —que depende de la
 * calculadora, y la da `exigenciaDe()` en el dominio—: es solo el núcleo
 * mínimo, para destacarlo y para calcular el «% completo» de la cabecera.
 */

import type { CampoBiometrico } from '@vilamar/domain'

export const CAMPOS_DESTACADOS: readonly CampoBiometrico[] = ['AL', 'K1', 'K1_EJE', 'K2', 'K2_EJE', 'ACD']
