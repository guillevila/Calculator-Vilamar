/**
 * BarraDeProgreso.tsx — Las barras de progreso (21/10/2026, petición del dueño):
 * una al cargar las fotos, para saber que se está cargando y más o menos cuánto
 * falta; y una por calculadora al calcular.
 *
 * Los porcentajes son estimaciones honestas (ver `compartido/progreso.ts`): nunca
 * llegan a 100 antes de terminar de verdad.
 */

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import {
  porcentajeDeCarga,
  segundosQueFaltan,
  SEGUNDOS_POR_DOCUMENTO,
} from '../../compartido/progreso.js'
import type { ProgresoCarga } from '../../compartido/progreso.js'

type Tono = 'normal' | 'exito' | 'atencion'

export function BarraDeProgreso({
  porcentaje,
  tono = 'normal',
  testId,
}: {
  /** 0–100, o `null` si no se puede saber (barra animada sin cifra). */
  readonly porcentaje: number | null
  readonly tono?: Tono
  readonly testId?: string
}): JSX.Element {
  return (
    <div
      className={`barra-progreso ${tono}${porcentaje === null ? ' indeterminada' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      {...(porcentaje !== null ? { 'aria-valuenow': porcentaje } : {})}
      data-testid={testId}
    >
      <span style={{ width: porcentaje === null ? '40%' : `${porcentaje}%` }} />
    </div>
  )
}

/** Cuánto se lleva leído de las fotos que se están cargando. */
export function CargaDeDocumentos({
  progreso,
}: {
  readonly progreso: ProgresoCarga | null
}): JSX.Element {
  // Desde cuándo se lee el documento actual y cuánto tardaron los anteriores:
  // con eso se afina la estimación del resto.
  const inicioDelLote = useRef<number>(Date.now())
  const inicioDelActual = useRef<number>(Date.now())
  const ultimoIndice = useRef<number>(0)
  const [ahora, setAhora] = useState(() => Date.now())

  if (progreso && progreso.indice !== ultimoIndice.current) {
    if (progreso.indice === 1) inicioDelLote.current = Date.now()
    inicioDelActual.current = Date.now()
    ultimoIndice.current = progreso.indice
  }

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  const total = progreso?.total ?? 1
  const completados = Math.max(0, (progreso?.indice ?? 1) - 1)
  const enElActual = (ahora - inicioDelActual.current) / 1000
  // Con documentos ya leídos, la media real de este lote; si no, la estimada.
  const media =
    completados > 0
      ? Math.max(1, (inicioDelActual.current - inicioDelLote.current) / 1000 / completados)
      : SEGUNDOS_POR_DOCUMENTO
  const porcentaje = progreso ? porcentajeDeCarga(total, completados, enElActual, media) : 0
  const faltan = progreso ? segundosQueFaltan(total, completados, enElActual, media) : 0

  return (
    <div className="carga-documentos" data-testid="carga-documentos">
      <div className="carga-cabecera">
        <strong>
          {progreso
            ? total > 1
              ? `Leyendo el documento ${progreso.indice} de ${total}…`
              : 'Leyendo el documento…'
            : 'Preparando la lectura…'}
        </strong>
        <span data-testid="carga-porcentaje">{porcentaje} %</span>
      </div>
      <BarraDeProgreso porcentaje={porcentaje} testId="carga-barra" />
      <div className="pie-nota">
        {progreso ? `«${progreso.nombre}» · ` : ''}
        {faltan > 0
          ? `Faltan unos ${faltan} segundos (es una estimación).`
          : 'Terminando… un momento más.'}{' '}
        Si es un documento escaneado hay que reconocer el texto, y eso tarda un poco más.
      </div>
    </div>
  )
}
