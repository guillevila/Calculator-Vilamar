/**
 * api.ts — El puente con `apps/server`, por HTTP en vez de por IPC (Fase 3
 * del plan móvil). Mismo espíritu que `apps/desktop/src/renderer/api.ts`: un
 * único sitio que sabe hablar con el otro lado.
 *
 * `credentials: 'include'` en cada petición es lo que manda la cookie de
 * sesión — sin eso, el servidor vería cada petición como si nadie hubiera
 * entrado.
 */

import type { Calculadora, Caso, CampoBiometrico, Lateralidad, ResultadoCalculadora, Sexo } from '@vilamar/domain'

export interface CuentaEntrada {
  readonly id: string
  readonly usuario: string
  readonly nombre: string
}

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function peticion<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const r = await fetch(ruta, { credentials: 'include', ...opciones })
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
    throw new ErrorApi(cuerpo.error ?? `Error ${r.status}`, r.status)
  }
  return r.json() as Promise<T>
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export const api = {
  login: (usuario: string, contrasena: string): Promise<CuentaEntrada> =>
    peticion('/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ usuario, contrasena }) }),

  logout: (): Promise<{ ok: boolean }> => peticion('/logout', { method: 'POST' }),

  quienSoy: (): Promise<CuentaEntrada> => peticion('/quien-soy'),

  casoActual: (): Promise<Caso | null> => peticion('/casos'),

  nuevoCaso: (): Promise<Caso> => peticion('/casos', { method: 'POST' }),

  cargarDocumentos: (archivos: readonly File[]) => {
    const datos = new FormData()
    for (const archivo of archivos) datos.append('documentos', archivo)
    return peticion('/casos/documentos', { method: 'POST', body: datos })
  },

  editarMedida: (
    ojo: Lateralidad,
    campo: CampoBiometrico,
    valor: number | null,
    aparato?: string,
  ): Promise<Caso> =>
    peticion('/casos/medida', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ ojo, campo, valor, aparato }),
    }),

  establecerIdentificacion: (datos: { nombrePaciente?: string; nombreCirujano?: string }): Promise<Caso> =>
    peticion('/casos/identificacion', { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(datos) }),

  elegirSexo: (sexo: Sexo): Promise<Caso> =>
    peticion('/casos/sexo', { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ sexo }) }),

  elegirLente: (datos: { fabricante?: string; modelo: string; constanteConocida?: number }): Promise<Caso> =>
    peticion('/casos/lente', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(datos) }),

  confirmarTodo: (): Promise<Caso> => peticion('/casos/confirmar', { method: 'POST' }),

  calcular: (
    calculadoras?: readonly Calculadora[],
    filtro?: { ojo?: Lateralidad; aparato?: string },
  ): Promise<readonly ResultadoCalculadora[]> =>
    peticion('/casos/calcular', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ calculadoras, filtro }) }),

  generarPdf: (): Promise<{ rutas: readonly { ojo: Lateralidad; descarga: string }[] }> =>
    peticion('/casos/pdf', { method: 'POST' }),
}
