import { useCallback, useEffect, useState } from 'react'
import { getToken, setSessionLostHandler, setToken } from './api'
import { ToastHost } from './ui'
import { Login } from './views/Login'
import { Materials } from './views/Materials'
import { Reports } from './views/Reports'
import { Summary } from './views/Summary'
import { Users } from './views/Users'

type View = 'resumen' | 'publicaciones' | 'reportes' | 'usuarios'
const VIEWS: { id: View; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'publicaciones', label: 'Publicaciones' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'usuarios', label: 'Usuarios' },
]

/** La sección va en la URL (/admin/reportes…), así el botón Atrás y recargar la página funcionan. */
const viewFromPath = (): View => {
  const part = location.pathname.replace(/^\/admin\/?/, '').split('/')[0] as View
  return VIEWS.some((v) => v.id === part) ? part : 'resumen'
}

export function App() {
  const [session, setSession] = useState<string | null>(() => (getToken() ? sessionStorage.getItem('eco-admin-name') ?? 'Administración' : null))
  const [view, setView] = useState<View>(viewFromPath)
  const [pending, setPending] = useState(0)

  const logout = useCallback(() => {
    setToken(null)
    sessionStorage.removeItem('eco-admin-name')
    setSession(null)
  }, [])

  useEffect(() => {
    setSessionLostHandler(logout)
    const onPop = () => setView(viewFromPath())
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [logout])

  const go = (next: View) => {
    if (next !== view) history.pushState(null, '', `/admin/${next === 'resumen' ? '' : next}`)
    setView(next)
  }

  const onPendingReports = useCallback((n: number) => setPending(n), [])

  if (!session)
    return (
      <>
        <Login onLogin={(name) => { sessionStorage.setItem('eco-admin-name', name); setSession(name) }} />
        <ToastHost />
      </>
    )

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Secciones del panel">
        <div className="brand"><span aria-hidden="true">🌿</span><div>EcoEstudiante<small>Panel de administración</small></div></div>
        {VIEWS.map((v) => (
          <button key={v.id} className={`nav-link ${view === v.id ? 'is-active' : ''}`} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
            {v.label}
            {v.id === 'reportes' && pending > 0 && <span className="badge">{pending}</span>}
          </button>
        ))}
        <div className="sidebar-footer">
          <span>{session}</span>
          <button className="btn btn--small btn--ghost" onClick={logout}>Cerrar sesión</button>
        </div>
      </nav>
      <main>
        {view === 'resumen' && <Summary onPendingReports={onPendingReports} />}
        {view === 'publicaciones' && <Materials />}
        {view === 'reportes' && <Reports onPendingReports={onPendingReports} />}
        {view === 'usuarios' && <Users />}
      </main>
      <ToastHost />
    </div>
  )
}
