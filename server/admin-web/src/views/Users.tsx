import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AdminUser, type Page } from '../api'
import { Empty, ErrorBox, formatDate, Loading, notify, useConfirm } from '../ui'

export function Users() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AdminUser[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, ask] = useConfirm()

  const load = useCallback(
    async (nextPage = 1) => {
      setError('')
      const params = new URLSearchParams({ page: String(nextPage), ...(q ? { q } : {}) })
      try {
        const res = await api<Page<AdminUser>>('GET', `/admin/users?${params}`)
        setItems((prev) => (nextPage === 1 ? res.items : [...(prev ?? []), ...res.items]))
        setHasMore(res.hasMore)
        setPage(nextPage)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar los usuarios.')
      }
    },
    [q],
  )

  useEffect(() => {
    const timer = setTimeout(() => void load(1), 250)
    return () => clearTimeout(timer)
  }, [load])

  const toggle = async (u: AdminUser) => {
    const block = !u.blocked
    const answer = await ask(
      block
        ? { title: `Bloquear a ${u.name}`, text: 'No podrá ingresar ni usar la app, su sesión se cerrará al instante y sus publicaciones se ocultarán.', confirm: 'Bloquear', danger: true, withReason: true, reasonLabel: 'Motivo (opcional, queda en el registro de moderación)' }
        : { title: `Desbloquear a ${u.name}`, text: 'Podrá volver a ingresar y sus publicaciones volverán a verse.', confirm: 'Desbloquear' },
    )
    if (!answer.ok) return
    setBusy(u.id)
    try {
      await api('POST', `/admin/users/${u.id}/${block ? 'block' : 'unblock'}`, block ? { reason: answer.reason || undefined } : undefined)
      notify(block ? `${u.name} quedó bloqueado/a.` : `${u.name} quedó desbloqueado/a.`)
      await load(1)
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo completar la acción.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>Usuarios</h1><p>Estudiantes registrados (sin los estudiantes simulados).</p></div></div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error ? <ErrorBox message={error} /> : !items ? <Loading /> : !items.length ? <Empty>No encontramos usuarios.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Estudiante</th><th>Carrera</th><th>Publicaciones</th><th>Reputación</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="cell-title"><strong>{u.name}</strong><small>{u.email} · desde {formatDate(u.createdAt)}</small></td>
                  <td><small>{u.career} · {u.cycle}.° ciclo</small></td>
                  <td>{u.materials}</td>
                  <td>{u.rating.count ? `★ ${u.rating.value} (${u.rating.count})` : <span className="muted">Sin reseñas</span>}</td>
                  <td>
                    {u.role === 'admin' && <span className="pill pill--admin">Admin</span>}{' '}
                    {u.deleted
                      ? <span className="pill pill--eliminada" title={u.deletedAt ? `Eliminada el ${formatDate(u.deletedAt)}` : undefined}>Cuenta eliminada{u.deletedAt ? ` · ${formatDate(u.deletedAt)}` : ''}</span>
                      : u.blocked ? <span className="pill pill--bloqueado">Bloqueado</span> : <span className="pill">Activo</span>}
                  </td>
                  <td>
                    {u.role !== 'admin' && !u.deleted && (
                      <button className={`btn btn--small ${u.blocked ? 'btn--ghost' : 'btn--danger'}`} disabled={busy === u.id} onClick={() => toggle(u)}>
                        {u.blocked ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && <div className="more"><button className="btn btn--ghost" onClick={() => load(page + 1)}>Cargar más</button></div>}
      {dialog}
    </>
  )
}
