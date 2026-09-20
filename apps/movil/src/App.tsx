import { useEffect, useState } from 'react'
import type { Caso } from '@vilamar/domain'

import { api, type CuentaEntrada } from './api.js'
import { Login } from './pantallas/Login.js'
import { Inicio } from './pantallas/Inicio.js'
import { Datos } from './pantallas/Datos.js'
import { Calculo } from './pantallas/Calculo.js'
import { Resultados } from './pantallas/Resultados.js'

type Paso = 'INICIO' | 'DATOS' | 'CALCULO' | 'RESULTADOS'

/** A qué pantalla corresponde retomar un caso a medias, según dónde se quedó. */
function pasoDelEstado(estado: Caso['estado']): Paso {
  switch (estado) {
    case 'BORRADOR':
    case 'DOCUMENTOS_CARGADOS':
    case 'EN_REVISION':
      return 'DATOS'
    case 'CONFIRMADO':
    case 'CALCULANDO':
      return 'CALCULO'
    case 'COMPLETADO':
      return 'RESULTADOS'
  }
}

export function App(): React.JSX.Element {
  const [cuenta, setCuenta] = useState<CuentaEntrada | null>(null)
  const [comprobando, setComprobando] = useState(true)
  const [caso, setCaso] = useState<Caso | null>(null)
  const [paso, setPaso] = useState<Paso>('INICIO')

  // Si ya hay una cookie de sesión válida (se volvió a abrir la app), entra
  // directo — no hace falta pedir usuario/contraseña otra vez cada vez. Y si
  // ya tenía un caso a medias, sigue justo donde lo dejó.
  useEffect(() => {
    api
      .quienSoy()
      .then(async (c) => {
        setCuenta(c)
        const casoActual = await api.casoActual().catch(() => null)
        if (casoActual) {
          setCaso(casoActual)
          setPaso(pasoDelEstado(casoActual.estado))
        }
      })
      .catch(() => setCuenta(null))
      .finally(() => setComprobando(false))
  }, [])

  async function salir(): Promise<void> {
    await api.logout()
    setCuenta(null)
    setCaso(null)
    setPaso('INICIO')
  }

  if (comprobando) {
    return <div className="centro">Cargando…</div>
  }

  if (!cuenta) {
    return <Login alEntrar={setCuenta} />
  }

  return (
    <>
      <header className="cabecera">
        <h1>Calculator Vilamar</h1>
        <button onClick={() => void salir()}>Salir</button>
      </header>

      {paso === 'INICIO' && (
        <Inicio
          alTenerCaso={(c, siguiente) => {
            setCaso(c)
            setPaso(siguiente)
          }}
        />
      )}

      {paso === 'DATOS' && caso && (
        <Datos
          caso={caso}
          alCambiar={setCaso}
          alConfirmar={(c) => {
            setCaso(c)
            setPaso('CALCULO')
          }}
        />
      )}

      {paso === 'CALCULO' && caso && (
        <Calculo
          caso={caso}
          alVolverADatos={() => setPaso('DATOS')}
          alTerminar={(c) => {
            setCaso(c)
            setPaso('RESULTADOS')
          }}
        />
      )}

      {paso === 'RESULTADOS' && caso && (
        <Resultados
          caso={caso}
          alVolverACalcular={() => setPaso('CALCULO')}
          alVolverAlCaso={() => setPaso('DATOS')}
          alEmpezarOtroCaso={() => {
            setCaso(null)
            setPaso('INICIO')
          }}
        />
      )}
    </>
  )
}
