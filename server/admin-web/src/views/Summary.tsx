import { useEffect, useState } from 'react'
import { api, ApiError, type AdminMaterial, type AdminReport, type LogEntry, type Page, type Stats } from '../api'
import { Empty, ErrorBox, formatDate, Loading, pillClass, statusLabel } from '../ui'

const ACTION_LABEL: Record<string, string> = {
  hide_material: 'ocultó una publicación',
  restore_material: 'restauró una publicación',
  delete_material: 'eliminó una publicación',
  block_user: 'bloqueó a un usuario',
  unblock_user: 'desbloqueó a un usuario',
  dismiss_report: 'descartó un reporte',
}

type Data = { stats: Stats; latest: AdminMaterial[]; reports: AdminReport[]; log: LogEntry[] }

export function Summary({ onPendingReports }: { onPendingReports: (n: number) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api<Stats>('GET', '/admin/stats'),
      api<Page<AdminMaterial>>('GET', '/admin/materials'),
      api<AdminReport[]>('GET', '/admin/reports?status=pending'),
      api<LogEntry[]>('GET', '/admin/log'),
    ])
      .then(([stats, latest, reports, log]) => {
        setData({ stats, latest: latest.items.slice(0, 5), reports: reports.slice(0, 5), log: log.slice(0, 8) })
        onPendingReports(stats.pendingReports)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No pudimos cargar el resumen.'))
  }, [onPendingReports])

  if (error) return <ErrorBox message={error} />
  if (!data) return <Loading />
  const { stats } = data

  return (
    <>
      <div className="page-head"><div><h1>Resumen</h1><p>Cómo va la comunidad de EcoEstudiante.</p></div></div>
      <div className="stats">
        <div className="card stat"><strong>{stats.students}</strong><span>Estudiantes</span></div>
        <div className="card stat"><strong>{stats.activeMaterials}</strong><span>Publicaciones activas</span></div>
        <div className="card stat"><strong>{stats.completedAgreements}</strong><span>Entregas completadas</span></div>
        <div className="card stat"><strong>{stats.pendingReports}</strong><span>Reportes pendientes</span></div>
      </div>
      <div className="grid-2">
        <section className="card section">
          <h2>Últimas publicaciones</h2>
          {data.latest.length ? (
            <ul className="list">
              {data.latest.map((m) => (
                <li key={m.id}>
                  <span><strong>{m.title}</strong><br /><small className="muted">{m.owner.name} · {formatDate(m.createdAt)}</small></span>
                  <span className={pillClass(statusLabel(m))}>{statusLabel(m)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Todavía no hay publicaciones.</Empty>}
        </section>
        <section className="card section">
          <h2>Reportes pendientes</h2>
          {data.reports.length ? (
            <ul className="list">
              {data.reports.map((r) => (
                <li key={r.id}>
                  <span><strong>{r.material.title}</strong><br /><small className="muted">{r.reason}</small></span>
                  <small className="muted">{formatDate(r.createdAt)}</small>
                </li>
              ))}
            </ul>
          ) : <Empty>No hay reportes pendientes. 🎉</Empty>}
        </section>
        <section className="card section">
          <h2>Últimas acciones</h2>
          {data.log.length ? (
            <ul className="list">
              {data.log.map((l) => (
                <li key={l.id}>
                  <span>{l.admin.name.split(' ')[0]} {ACTION_LABEL[l.action] ?? l.action}{l.reason ? ` — “${l.reason}”` : ''}</span>
                  <small className="muted">{formatDate(l.createdAt)}</small>
                </li>
              ))}
            </ul>
          ) : <Empty>Aún no hay acciones de moderación.</Empty>}
        </section>
      </div>
    </>
  )
}
