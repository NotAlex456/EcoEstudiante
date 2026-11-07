import { ReactNode, useEffect } from 'react'
import { dismissBanner, useBanner } from '../lib/alerts'
import { goBack, navigate } from '../lib/router'
import { initials, priceLabel, useToasts } from '../lib/store'
import type { Material } from '../lib/types'

export type IconName =
  | 'search' | 'home' | 'plus' | 'heart' | 'user' | 'book' | 'calculator' | 'notes' | 'file' | 'sliders'
  | 'arrow' | 'shield' | 'pin' | 'clock' | 'check' | 'upload' | 'message' | 'bell' | 'leaf' | 'close'
  | 'send' | 'edit' | 'trash' | 'flag' | 'star' | 'logout' | 'camera' | 'pause' | 'download' | 'chevron'
  | 'calendar' | 'info' | 'refresh' | 'volume' | 'eye' | 'moon' | 'text'

const paths: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M4 4.5v17" /></>,
  calculator: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /></>,
  notes: <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" />,
  file: <path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h6M9 16h6" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  arrow: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v5h16v-5" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8M8 13h5" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  leaf: <><path d="M20 4C10 4 4 8 4 15c0 3 2 5 5 5 7 0 11-8 11-16Z" /><path d="M5 19c3-5 7-8 12-11" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  flag: <path d="M5 22V4m0 0h11l-2 4 2 4H5" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  camera: <><path d="M3 8h4l2-3h6l2 3h4v12H3Z" /><circle cx="12" cy="13" r="4" /></>,
  pause: <path d="M9 5v14M15 5v14" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  text: <path d="M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3" />,
}

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}

export function Button({
  children, variant = 'primary', className = '', onClick, type = 'button', disabled,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button className={`button button--${variant} ${className}`} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error" role="alert">{error}</span> : hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <span className="brand__mark"><Icon name="leaf" size={compact ? 20 : 24} /></span>
      <span>
        <strong>EcoEstudiante</strong>
        {!compact && <small>UPSJB · Chincha</small>}
      </span>
    </div>
  )
}

export function Avatar({ name, size = '' }: { name: string; size?: '' | 'small' | 'large' }) {
  return <div className={`avatar ${size ? `avatar--${size}` : ''}`}>{initials(name)}</div>
}

export function ModeTag({ mode }: { mode: Material['mode'] }) {
  return <span className={`mode mode--${mode.toLowerCase()}`}>{mode}</span>
}

export function MaterialCard({
  material, saved, onSave, mine,
}: {
  material: Material
  saved: boolean
  onSave: () => void
  mine?: boolean
}) {
  return (
    <article className="material-card">
      <a className="material-card__image" href={`#/material/${material.id}`} aria-label={`Ver ${material.title}`}>
        <img src={material.images[0]} alt={material.title} loading="lazy" />
        <ModeTag mode={material.mode} />
        {material.status !== 'Disponible' && <span className="status-flag">{material.status}</span>}
      </a>
      <div className="material-card__body">
        <div className="material-card__topline">
          <span>{mine ? 'Tu publicación' : material.category}</span>
          {!mine && (
            <button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? 'Quitar de guardados' : 'Guardar material'} aria-pressed={saved}>
              <Icon name="heart" size={19} />
            </button>
          )}
        </div>
        <a className="material-card__title" href={`#/material/${material.id}`}>{material.title}</a>
        <p className="material-card__course">{material.course}</p>
        <div className="material-card__meta">
          <strong>{material.mode === 'Venta' ? `S/ ${material.price}` : material.mode === 'Donación' ? 'Gratis' : 'Intercambio'}</strong>
          <span><i /> {material.condition}</span>
        </div>
      </div>
    </article>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span><Icon name={icon} size={30} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function BackLink({ label, fallback }: { label: string; fallback: string }) {
  return (
    <button className="back-link" onClick={() => goBack(fallback)}>
      <Icon name="arrow" /> {label}
    </button>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="stars" role={onChange ? 'radiogroup' : undefined} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrellas`} className={n <= value ? 'is-on' : ''} onClick={() => onChange(n)}>
            <Icon name="star" size={size} />
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value) ? 'is-on' : ''}><Icon name="star" size={size} /></span>
        ),
      )}
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <Icon name={t.tone === 'ok' ? 'check' : 'info'} size={18} />
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function MaterialSummary({ material }: { material: Material }) {
  return (
    <div className="summary-material">
      <img src={material.images[0]} alt="" />
      <div><small>{material.mode}</small><strong>{material.title}</strong><span>{material.mode === 'Venta' ? priceLabel(material) : 'Sin costo'}</span></div>
    </div>
  )
}

/** Toggle row for settings screens: the whole row is the tap target. */
export function Switch({ label, detail, checked, onChange, disabled }: {
  label: string
  detail?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`setting-row ${disabled ? 'is-disabled' : ''}`}>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const BANNER_ICONS = { mensajes: 'message', acuerdos: 'calendar', busquedas: 'search', cuenta: 'bell' } as const
const BANNER_TITLES = { mensajes: 'Nuevo mensaje', acuerdos: 'Acuerdo de entrega', busquedas: 'Alerta de búsqueda', cuenta: 'EcoEstudiante' } as const

/** Pop-up at the top of the screen for a new notification. */
export function NotificationBanner() {
  const banner = useBanner()
  if (!banner) return null
  return (
    <div className="notification-banner" role="status" aria-live="assertive" key={banner.id}>
      <button className="notification-banner__body" onClick={() => { dismissBanner(); navigate(banner.link) }}>
        <span className="notification-banner__icon"><Icon name={BANNER_ICONS[banner.category]} size={20} /></span>
        <span><strong>{BANNER_TITLES[banner.category]}</strong><span>{banner.text}</span></span>
      </button>
      <button className="notification-banner__close" aria-label="Cerrar aviso" onClick={dismissBanner}><Icon name="close" size={18} /></button>
    </div>
  )
}
