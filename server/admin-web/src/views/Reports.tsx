import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AdminReport } from '../api'
import { Empty, ErrorBox, formatDate, Loading, notify, pillClass, statusLabel, useConfirm } from '../ui'

export function Reports({ onPendingReports }: { onPendingReports: (n: number) => void }) {
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending')
  const [items, setItems] = useState<AdminReport[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, ask] = useConfirm()

  const load = useCallback(async () => {
    setError('')
    setItems(null)
    try {
      const res = await api<AdminReport[]>('GET', `/admin/reports?status=${tab}`)
      setItems(res)
      if (tab === 'pending') onPendingReports(res.length)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos cargar los reportes.')
    }
  }, [tab, onPendingReports])

  useEffect(() => void load(), [load])

  const resolve = async (r: AdminReport, action: 'hidden' | 'dismissed') => {
    const answer = await ask(
      action === 'hidden'
        ? { title: 'Ocultar publicación', text: `Se ocultará “${r.material.title}”, se cancelarán sus entregas en curso y se resolverán todos sus reportes.`, confirm: 'Ocultar' }
        : { title: 'Descartar reporte', text: 'El reporte quedará resuelto sin tocar la publicación.', confirm: 'Descartar' },
    )
    if (!answer.ok) return
    setBusy(r.id)
    try {
      await api('POST', `/admin/reports/${r.id}/resolve`, { action })
      notify(action === 'hidden' ? 'Publicación oculta y reportes resueltos.' : 'Reporte descartado.')
      await load()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'No se pudo resolver.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>Reportes</h1><p>Publicaciones que los estudiantes denunciaron.</p></div></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'is-active' : ''} onClick={() => setTab('pending')}>Pendientes</button>
        <button role="tab" aria-selected={tab === 'resolved'} className={tab === 'resolved' ? 'is-active' : ''} onClick={() => setTab('resolved')}>Resueltos</button>
      </div>
      {error ? <ErrorBox message={error} /> : !items ? <Loading /> : !items.length ? (
        <Empty>{tab === 'pending' ? 'No hay reportes pendientes. 🎉' : 'Todavía no se resolvió ningún reporte.'}</Empty>
      ) : (
        items.map((r) => (
          <article key={r.id} className="card report">
            <div className="report-head">
              {r.material.images[0] ? <img className="thumb" src={r.material.images[0]} alt="" /> : <span className="thumb" />}
              <div>
                <strong>{r.material.title}</strong> <span className={pillClass(statusLabel(r.material))}>{statusLabel(r.material)}</span>
                <br /><small className="muted">Publicó {r.material.owner.name} · Reportó {r.reporter.name} ({r.reporter.email}) · {formatDate(r.createdAt)}</small>
              </div>
            </div>
            <div><strong>{r.reason}</strong>{r.detail && <blockquote>{r.detail}</blockquote>}</div>
            {tab === 'pending' ? (
              <div className="actions">
                <button className="btn" disabled={busy === r.id} onClick={() => resolve(r, 'hidden')}>Ocultar publicación</button>
                <button className="btn btn--ghost" disabled={busy === r.id} onClick={() => resolve(r, 'dismissed')}>Descartar</button>
              </div>
            ) : (
              <small className="muted">{r.resolution === 'hidden' ? 'Se ocultó la publicación' : 'Reporte descartado'} · {r.resolvedAt && formatDate(r.resolvedAt)}</small>
            )}
          </article>
        ))
      )}
      {dialog}
    </>
  )
}
