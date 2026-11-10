import { useMemo, useState } from 'react'
import { Avatar, Button, EmptyState, Icon, MaterialCard } from '../components/ui'
import { navigate } from '../lib/router'
import { loadActivity, loadAgreements, loadConversations, useRefresh } from '../lib/sync'
import {
  currentUser, deleteMaterial, deleteSavedSearch, formatDate, formatTime, setMaterialStatus, timeAgo, toast, toggleSaved, unreadCount, useStore,
} from '../lib/store'

const TABS = [
  { id: 'acuerdos', label: 'Acuerdos' },
  { id: 'mensajes', label: 'Mensajes' },
  { id: 'publicaciones', label: 'Publicaciones' },
  { id: 'guardados', label: 'Guardados' },
] as const

export function Activity({ tab = 'acuerdos' }: { tab?: string }) {
  const state = useStore((s) => s)
  const me = currentUser(state)!
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useRefresh(() => Promise.allSettled([loadActivity(), loadConversations(), loadAgreements()]), [])

  /** Ejecuta una acción sobre un material; el botón queda deshabilitado mientras responde el servidor. */
  const run = async (id: string, action: () => Promise<boolean>, okMessage?: string) => {
    setBusy(id)
    const ok = await action()
    setBusy(null)
    if (ok && okMessage) toast(okMessage)
  }

  const data = useMemo(() => {
    const byId = new Map(state.materials.map((m) => [m.id, m]))
    const users = new Map(state.users.map((u) => [u.id, u]))
    const agreements = state.agreements
      .filter((a) => a.buyerId === me.id || a.sellerId === me.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const conversations = state.conversations
      .filter((c) => c.participants.includes(me.id) && c.messages.length)
      .sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at)
    const mine = state.materials.filter((m) => m.ownerId === me.id).sort((a, b) => b.createdAt - a.createdAt)
    const saved = (state.saved[me.id] ?? []).map((id) => byId.get(id)).filter((m) => m !== undefined)
    const searches = state.savedSearches.filter((s) => s.userId === me.id)
    return { byId, users, agreements, conversations, mine, saved, searches }
  }, [state, me.id])

  const unread = data.conversations.reduce((n, c) => n + unreadCount(state, c, me.id), 0)

  return (
    <section className="activity-page page-enter">
      <div className="page-title"><p className="eyebrow">Tu espacio</p><h1>Mi actividad</h1><p>Revisa tus acuerdos, mensajes, publicaciones y materiales guardados.</p></div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => navigate(`#/actividad/${t.id}`, { replace: true })}>
            {t.label}
            {t.id === 'mensajes' && unread > 0 && <span className="count-badge">{unread}</span>}
          </button>
        ))}
      </div>

      {tab === 'acuerdos' && (data.agreements.length ? (
        <ul className="list-card">
          {data.agreements.map((a) => {
            const m = data.byId.get(a.materialId)
            const other = data.users.get(a.buyerId === me.id ? a.sellerId : a.buyerId)
            if (!m || !other) return null
            return (
              <li key={a.id}>
                <a href={`#/acuerdo/${a.id}`}>
                  <img src={m.images[0]} alt="" />
                  <div>
                    <strong>{m.title}</strong>
                    <span>{a.buyerId === me.id ? 'Con' : 'Para'} {other.name.split(' ')[0]} · {a.place}</span>
                    <small>{formatDate(a.date)} · {formatTime(a.time)}</small>
                  </div>
                  <span className={`status-pill status-pill--${a.status.toLowerCase()}`}>{a.status === 'Completado' && !a.rating && a.buyerId === me.id ? 'Valorar' : a.status}</span>
                </a>
              </li>
            )
          })}
        </ul>
      ) : <EmptyState icon="calendar" title="Aún no tienes acuerdos" text="Cuando contactes a un estudiante y propongas una entrega, aparecerá aquí." action={<Button onClick={() => navigate('#/')}>Explorar materiales</Button>} />)}

      {tab === 'mensajes' && (data.conversations.length ? (
        <ul className="list-card">
          {data.conversations.map((c) => {
            const m = data.byId.get(c.materialId)
            const other = data.users.get(c.participants.find((p) => p !== me.id)!)
            const last = c.messages[c.messages.length - 1]
            const count = unreadCount(state, c, me.id)
            if (!m || !other) return null
            return (
              <li key={c.id} className={count ? 'is-unread' : ''}>
                <a href={`#/chat/${c.id}`}>
                  <Avatar name={other.name} />
                  <div>
                    <strong>{other.name}</strong>
                    <span>{m.title}</span>
                    <small>{last.from === me.id ? 'Tú: ' : ''}{last.text}</small>
                  </div>
                  <span className="list-card__aside"><time>{timeAgo(last.at)}</time>{count > 0 && <span className="count-badge">{count}</span>}</span>
                </a>
              </li>
            )
          })}
        </ul>
      ) : <EmptyState icon="message" title="Sin mensajes por ahora" text="Escribe a quien publicó un material desde su ficha." />)}

      {tab === 'publicaciones' && (data.mine.length ? (
        <ul className="list-card">
          {data.mine.map((m) => (
            <li key={m.id}>
              <a href={`#/material/${m.id}`}>
                <img src={m.images[0]} alt="" />
                <div>
                  <strong>{m.title}</strong>
                  <span>{m.mode === 'Venta' ? `S/ ${m.price}` : m.mode} · {m.course}</span>
                  <small>Publicado {timeAgo(m.createdAt)}</small>
                </div>
                {m.moderated ? <span className="status-pill status-pill--moderada">Oculta por moderación</span> : <span className={`status-pill status-pill--${m.status.toLowerCase()}`}>{m.status}</span>}
              </a>
              <div className="list-card__actions">
                {!m.moderated && <button onClick={() => navigate(`#/publicar/${m.id}`)}><Icon name="edit" size={16} /> Editar</button>}
                {m.status === 'Disponible' && <button disabled={busy === m.id} onClick={() => run(m.id, () => setMaterialStatus(m.id, 'Pausado'))}><Icon name="pause" size={16} /> Pausar</button>}
                {m.status === 'Pausado' && !m.moderated && <button disabled={busy === m.id} onClick={() => run(m.id, () => setMaterialStatus(m.id, 'Disponible'))}><Icon name="refresh" size={16} /> Reactivar</button>}
                {(m.status === 'Disponible' || m.status === 'Reservado') && <button disabled={busy === m.id} onClick={() => run(m.id, () => setMaterialStatus(m.id, 'Entregado'), '¡Genial! Marcado como entregado.')}><Icon name="check" size={16} /> Entregado</button>}
                {confirmDelete === m.id ? (
                  <button className="is-danger" disabled={busy === m.id} onClick={() => run(m.id, () => deleteMaterial(m.id), 'Publicación eliminada').then(() => setConfirmDelete(null))}>¿Eliminar? Sí</button>
                ) : (
                  <button onClick={() => setConfirmDelete(m.id)}><Icon name="trash" size={16} /> Eliminar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="plus" title="Aún no publicaste materiales" text="Dale una segunda vida a lo que ya no usas." action={<Button onClick={() => navigate('#/publicar')}>Publicar material</Button>} />)}

      {tab === 'guardados' && <>
        {data.saved.length ? (
          <div className="materials-grid">
            {data.saved.map((m) => <MaterialCard key={m.id} material={m} saved onSave={() => toggleSaved(m.id)} />)}
          </div>
        ) : <EmptyState icon="heart" title="Aún no guardaste materiales" text="Guarda lo que te interese para encontrarlo fácilmente." action={<Button onClick={() => navigate('#/')}>Explorar materiales</Button>} />}
        {data.searches.length > 0 && (
          <div className="saved-searches">
            <h3><Icon name="bell" size={18} /> Búsquedas con aviso</h3>
            <ul>
              {data.searches.map((s) => (
                <li key={s.id}>
                  <span>{[s.query && `“${s.query}”`, s.category !== 'Todos' && s.category, s.mode !== 'Todos' && s.mode].filter(Boolean).join(' · ') || 'Todos los materiales'}</span>
                  <button aria-label="Eliminar búsqueda" onClick={() => deleteSavedSearch(s.id)}><Icon name="close" size={16} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>}
    </section>
  )
}
