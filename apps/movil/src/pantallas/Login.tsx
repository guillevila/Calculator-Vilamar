import { useState } from 'react'

import { api, type CuentaEntrada, ErrorApi } from '../api.js'

export function Login({ alEntrar }: { readonly alEntrar: (cuenta: CuentaEntrada) => void }): React.JSX.Element {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const cuenta = await api.login(usuario, contrasena)
      alEntrar(cuenta)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se ha podido entrar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pantalla">
      <h2>Calculator Vilamar</h2>
      {error && <div className="aviso error">{error}</div>}
      <form className="pila" onSubmit={entrar}>
        <div className="campo">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
          />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </div>
        <button className="boton" type="submit" disabled={enviando || !usuario || !contrasena}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
