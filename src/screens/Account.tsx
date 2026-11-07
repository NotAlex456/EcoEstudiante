import { FormEvent, useEffect, useState } from 'react'
import { Avatar, BackLink, Button, EmptyState, Field, Icon, Sheet, Stars } from '../components/ui'
import { CAREERS, COMMUNITY_RULES, CYCLES, SAFE_POINTS } from '../lib/data'
import { navigate } from '../lib/router'
import { currentUser, logout, markNotificationsRead, resetDemo, timeAgo, toast, unreadCount, updateProfile, userRating, useStore } from '../lib/store'
import { AccessibilitySettings, NotificationSettings } from './Settings'
import { canInstall, installApp, useInstallState } from '../pwa'

export function Account({ section }: { section?: string }) {
  const me = useStore(currentUser)!
  const rating = useStore((s) => userRating(s, me.id).value)
  const ratingCount = useStore((s) => userRating(s, me.id).count)
  const agreements = useStore((s) => s.agreements)
  const materials = useStore((s) => s.materials)
  const unread = useStore((s) => s.conversations.filter((c) => c.participants.includes(me.id)).reduce((n, c) => n + unreadCount(s, c, me.id), 0))
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const install = useInstallState()

  if (section === 'seguridad') return <SafetyGuide />
  if (section === 'notificaciones') return <NotificationSettings />
  if (section === 'accesibilidad') return <AccessibilitySettings />

  const deals = agreements.filter((a) => a.status === 'Completado' && (a.buyerId === me.id || a.sellerId === me.id)).length
  const donations = materials.filter((m) => m.ownerId === me.id && m.mode === 'Donación').length
  const reviews = agreements.filter((a) => a.sellerId === me.id && a.rating)
  const activeDeals = agreements.filter((a) => (a.status === 'Pendiente' || a.status === 'Confirmado') && (a.buyerId === me.id || a.sellerId === me.id)).length
  const recirculated = deals + materials.filter((m) => m.ownerId === me.id && m.status === 'Entregado').length

  return (
    <section className="account-page page-enter">
      <div className="page-title"><p className="eyebrow">Perfil y seguridad</p><h1>Mi cuenta</h1><p>Tu identidad institucional ayuda a construir una comunidad confiable.</p></div>
      <div className="profile-hero">
        <Avatar name={me.name} size="large" />
        <div><h2>{me.name}</h2><p>{me.career} · {me.cycle}.° ciclo</p><span className="verified-label"><Icon name="shield" size={16} /> Estudiante UPSJB verificado/a</span></div>
        <Button variant="secondary" onClick={() => setEditing(true)}><Icon name="edit" size={18} /> Editar perfil</Button>
      </div>

      <div className="activity-stats">
        <a href="#/actividad/acuerdos"><span><Icon name="calendar" /></span><strong>{activeDeals}</strong><small>Acuerdos en curso</small></a>
        <a href="#/actividad/mensajes"><span><Icon name="message" /></span><strong>{unread}</strong><small>Mensajes sin leer</small></a>
        <div><span><Icon name="leaf" /></span><strong>{recirculated}</strong><small>Materiales recirculados</small></div>
      </div>

      {install !== 'installed' && (
        <div className="install-card">
          <Icon name="download" size={26} />
          <div>
            <strong>Instala EcoEstudiante en tu celular</strong>
            <p>{canInstall() ? 'Ábrela desde tu pantalla de inicio, como cualquier app, incluso sin conexión.' : install === 'ios' ? 'En Safari toca Compartir y luego “Agregar a pantalla de inicio”.' : 'En Chrome abre el menú ⋮ y elige “Instalar aplicación” o “Agregar a pantalla principal”.'}</p>
          </div>
          {canInstall() && <Button onClick={installApp}>Instalar</Button>}
        </div>
      )}

      <div className="account-grid">
        <div className="account-card">
          <h3>Reputación en la comunidad</h3>
          <div className="rating">
            <strong>{ratingCount ? rating.toFixed(1) : '—'}</strong>
            <span><Stars value={rating} /><small>{ratingCount ? `${ratingCount} valoraciones` : 'Aún sin valoraciones'}</small></span>
          </div>
          <div className="account-metrics"><span><strong>{deals}</strong>Entregas</span><span><strong>{materials.filter((m) => m.ownerId === me.id).length}</strong>Publicaciones</span><span><strong>{donations}</strong>Donaciones</span></div>
          {reviews.length > 0 && (
            <ul className="reviews">{reviews.slice(-3).reverse().map((a) => <li key={a.id}><Stars value={a.rating!.stars} size={14} /><p>{a.rating!.comment || 'Sin comentario'}</p></li>)}</ul>
          )}
        </div>
        <div className="account-card">
          <h3>Seguridad de la cuenta</h3>
          <ul>
            <li><Icon name="check" /><span><strong>Correo institucional</strong><small>{me.email}</small></span></li>
            <li><Icon name="check" /><span><strong>Perfil completo</strong><small>Información visible solo para estudiantes</small></span></li>
            <li><Icon name="shield" /><span><strong>Privacidad protegida</strong><small>No mostramos tu teléfono públicamente</small></span></li>
          </ul>
        </div>
      </div>

      <div className="menu-list">
        <a href={`#/perfil/${me.id}`}><Icon name="user" /><span><strong>Ver mi perfil público</strong><small>Así te ven otros estudiantes, con tus reseñas</small></span><Icon name="chevron" size={18} /></a>
        <a href="#/cuenta/notificaciones"><Icon name="bell" /><span><strong>Notificaciones</strong><small>Ventanas emergentes, sonido, vibración y tipos de aviso</small></span><Icon name="chevron" size={18} /></a>
        <a href="#/cuenta/accesibilidad"><Icon name="eye" /><span><strong>Accesibilidad</strong><small>Tamaño del texto, alto contraste y animaciones</small></span><Icon name="chevron" size={18} /></a>
        <a href="#/cuenta/seguridad"><Icon name="pin" /><span><strong>Puntos seguros y normas</strong><small>Dónde y cómo hacer entregas en el campus</small></span><Icon name="chevron" size={18} /></a>
        <a href="#/actividad/guardados"><Icon name="search" /><span><strong>Alertas de búsqueda</strong><small>Avisos cuando publiquen lo que buscas</small></span><Icon name="chevron" size={18} /></a>
        <button onClick={() => setConfirmReset(true)}><Icon name="refresh" /><span><strong>Restablecer datos de demostración</strong><small>Borra cuentas, publicaciones y mensajes de este dispositivo</small></span><Icon name="chevron" size={18} /></button>
        <button onClick={() => { logout(); navigate('#/', { replace: true }) }}><Icon name="logout" /><span><strong>Cerrar sesión</strong><small>{me.email}</small></span><Icon name="chevron" size={18} /></button>
      </div>

      <div className="community-note"><Icon name="leaf" size={26} /><div><strong>Gracias por ser parte del cambio</strong><p>Cada material que recircula es dinero ahorrado y un recurso que no se desperdicia.</p></div></div>

      {editing && <EditProfile onClose={() => setEditing(false)} />}
      {confirmReset && (
        <Sheet title="Restablecer datos" onClose={() => setConfirmReset(false)}>
          <p className="sheet__lead">Se borrará todo lo guardado en este dispositivo (cuentas, publicaciones, mensajes y acuerdos) y volverán los materiales de ejemplo. No se puede deshacer.</p>
          <div className="form-actions form-actions--stack">
            <Button variant="danger" onClick={() => { resetDemo(); navigate('#/', { replace: true }) }}>Sí, restablecer</Button>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancelar</Button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const me = useStore(currentUser)!
  const [form, setForm] = useState({ name: me.name, career: me.career, cycle: me.cycle })
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim().split(/\s+/).length < 2) return setError('Escribe tu nombre y apellido.')
    updateProfile({ ...form, name: form.name.trim() })
    toast('Perfil actualizado')
    onClose()
  }
  return (
    <Sheet title="Editar perfil" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Nombre y apellido" error={error}><input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError('') }} /></Field>
        <div className="form-grid">
          <Field label="Carrera"><select value={form.career} onChange={(e) => setForm({ ...form, career: e.target.value })}>{CAREERS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Ciclo"><select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: Number(e.target.value) })}>{CYCLES.map((c) => <option key={c} value={c}>{c}.° ciclo</option>)}</select></Field>
        </div>
        <Field label="Correo institucional" hint="El correo verificado no se puede cambiar."><input value={me.email} disabled /></Field>
        <Button type="submit" className="full-button">Guardar cambios</Button>
      </form>
    </Sheet>
  )
}

function SafetyGuide() {
  return (
    <section className="account-page page-enter">
      <BackLink label="Volver" fallback="#/cuenta" />
      <div className="page-title"><p className="eyebrow">Cuenta y ayuda</p><h1>Puntos seguros y normas</h1><p>Lugares visibles y concurridos del campus para entregar materiales con tranquilidad.</p></div>
      <div className="safe-points">
        {SAFE_POINTS.map((p) => (
          <div key={p.name}><span><Icon name="pin" /></span><div><strong>{p.name}</strong><small>{p.detail}</small></div></div>
        ))}
      </div>
      <div className="account-card rules">
        <h3>Normas de la comunidad</h3>
        <ol>{COMMUNITY_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
      </div>
      <div className="notice notice--soft"><Icon name="info" /><p><strong>Tus datos</strong><span>Solo usamos tu nombre, carrera y correo institucional para identificarte ante otros estudiantes (Ley N.° 29733). En esta versión todo se guarda únicamente en tu dispositivo.</span></p></div>
    </section>
  )
}

export function Notifications() {
  const me = useStore(currentUser)!
  const all = useStore((s) => s.notifications)
  const list = all.filter((n) => n.userId === me.id).sort((a, b) => b.at - a.at)
  const [unreadIds] = useState(() => new Set(list.filter((n) => !n.read).map((n) => n.id)))

  useEffect(() => {
    markNotificationsRead()
  }, [all.length])

  return (
    <section className="activity-page page-enter">
      <BackLink label="Volver" fallback="#/" />
      <div className="page-title"><p className="eyebrow">Novedades</p><h1>Notificaciones</h1></div>
      {list.length ? (
        <ul className="list-card list-card--notifications">
          {list.map((n) => (
            <li key={n.id} className={unreadIds.has(n.id) ? 'is-unread' : ''}>
              <a href={n.link}>
                <span className="notification-icon"><Icon name="bell" size={18} /></span>
                <div><span>{n.text}</span><small>{timeAgo(n.at)}</small></div>
                <Icon name="chevron" size={18} />
              </a>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="bell" title="Sin notificaciones" text="Te avisaremos cuando te respondan, confirmen una entrega o publiquen algo que buscas." />}
    </section>
  )
}
