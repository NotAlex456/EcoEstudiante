import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AdminMaterial, type Page } from '../api'
import { Empty, ErrorBox, formatDate, Loading, notify, pillClass, statusLabel, useConfirm } from '../ui'

const STATUSES = ['', 'Disponible', 'Reservado', 'Entregado', 'Pausado', 'Eliminado']

export function Materials() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AdminMaterial[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, ask] = useConfirm()

  const load = useCallback(
    async (nextPage = 1) => {
      setError('')
      const params = new URLSearchParams({ page: String(nextPage), ...(q ? { q } : {}), ...(status ? { status } : {}) })
      try {
        const res = await api<Page<AdminMaterial>>('GET', `/admin/materials?${params}`)
        setItems((prev) => (nextPage === 1 ? res.items : [...(prev ?? []), ...res.items]))
        setHasMore(res.hasMore)
        setPage(nextPage)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar las publicaciones.')
      }
    },
    [q, status],
  )

  useEffect(() => {
    const timer = setTimeout(() => void load(1), 250) // espera a que termines de escribir
    return () => clearTimeout(timer)
  }, [load])

  const act = async (m: AdminMaterial, action: 'hide' | 'restore' | 'delete') => {
    const copy = {
      hide: { title: 'Ocultar publicación', text: `“${m.title}” dejará de verse. Se cancelan sus entregas en curso y se avisa al dueño.`, confirm: 'Ocultar', withReason: true },
      restore: { title: 'Restaurar publicación', text: `“${m.title}” vuelve a estar disponible para todos.`, confirm: 'Restaurar' },
      delete: { title: 'Eliminar publicación', text: `“${m.title}” se eliminará. Esta acción no se puede deshacer.`, confirm: 'Eliminar', danger: true },
    }[action]
    const answer = await ask(copy)
    if (!answer.ok) return
    setBusy(m.id)
    try {
      if (action === 'delete') await api('DELETE', `/admin/materials/${m.id}`)
      else await api('POST', `/admin/materials/${m.id}/${action}`, action === 'hide' ? { reason: answer.reason || undefined } : undefined)
      notify(action === 'hide' ? 'Publicación oculta.' : action === 'restore' ? 'Publicación restaurada.' : 'Publicación eliminada.')
      await load(1)
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo completar la acción.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>Publicaciones</h1><p>Todas las publicaciones, incluidas las pausadas y eliminadas.</p></div></div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Buscar por título, categoría o dueño" aria-label="Buscar publicaciones" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
        </select>
      </div>
      {error ? <ErrorBox message={error} /> : !items ? <Loading /> : !items.length ? <Empty>No hay publicaciones con esos filtros.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th></th><th>Publicación</th><th>Dueño</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>
              {items.map((m) => {
                const label = statusLabel(m)
                return (
                  <tr key={m.id}>
                    <td>{m.images[0] ? <img className="thumb" src={m.images[0]} alt="" /> : <span className="thumb" />}</td>
                    <td className="cell-title"><strong>{m.title}</strong><small>{m.category} · {m.course}</small></td>
                    <td>{m.owner.name}{m.owner.blocked && <> <span className="pill pill--bloqueado">Bloqueado</span></>}<br /><small className="muted">{m.owner.email}</small></td>
                    <td><span className={pillClass(label)}>{label}</span></td>
                    <td><small>{formatDate(m.createdAt)}</small></td>
                    <td>
                      <div className="actions">
                        {m.status !== 'Eliminado' && !m.moderatedAt && <button className="btn btn--small btn--ghost" disabled={busy === m.id} onClick={() => act(m, 'hide')}>Ocultar</button>}
                        {m.moderatedAt && m.status !== 'Eliminado' && <button className="btn btn--small btn--ghost" disabled={busy === m.id} onClick={() => act(m, 'restore')}>Restaurar</button>}
                        {m.status !== 'Eliminado' && <button className="btn btn--small btn--danger" disabled={busy === m.id} onClick={() => act(m, 'delete')}>Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && <div className="more"><button className="btn btn--ghost" onClick={() => load(page + 1)}>Cargar más</button></div>}
      {dialog}
    </>
  )
}
