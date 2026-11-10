import { useState, type FormEvent } from 'react'
import { api, ApiError, setToken } from '../api'
import { PasswordInput } from '../ui'

type LoginResponse = { token: string; user: { name: string; role: 'student' | 'admin' } }

/** Ingreso al panel: misma cuenta de la app, pero solo pasa quien tiene el rol de administrador. */
export function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { token, user } = await api<LoginResponse>('POST', '/auth/login', { email, password })
      if (user.role !== 'admin') return setError('No tienes acceso al panel de administración.')
      setToken(token)
      onLogin(user.name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos ingresar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit} noValidate>
        <h1>Panel de EcoEstudiante</h1>
        <p>Ingresa con tu cuenta de administrador.</p>
        <label className="field">
          Correo
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Contraseña
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn" disabled={busy || !email || !password}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  )
}
