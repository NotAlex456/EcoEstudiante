import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

/* ---------- avisos ---------- */

type Toast = { text: string; tone: 'ok' | 'error' } | null
let showToast: (t: Toast) => void = () => {}

export function notify(text: string, tone: 'ok' | 'error' = 'ok') {
  showToast({ text, tone })
}

export function ToastHost() {
  const [toast, setToast] = useState<Toast>(null)
  useEffect(() => {
    showToast = setToast
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`toast ${toast.tone === 'error' ? 'toast--error' : ''}`} role="status">
      {toast.text}
    </div>
  )
}

/* ---------- confirmación (en lugar de window.confirm) ---------- */

export type ConfirmOptions = { title: string; text: string; confirm: string; danger?: boolean; withReason?: boolean; reasonLabel?: string }

export function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmOptions
  onClose: (result: { ok: boolean; reason?: string }) => void
}) {
  const [reason, setReason] = useState('')
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose({ ok: false })
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose({ ok: false })}>
      <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{options.title}</h2>
        <p>{options.text}</p>
        {options.withReason && (
          <label className="field">
            {options.reasonLabel ?? 'Motivo (opcional, se le muestra al dueño)'}
            <input className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => onClose({ ok: false })}>Cancelar</button>
          <button ref={confirmRef} className={`btn ${options.danger ? 'btn--danger' : ''}`} onClick={() => onClose({ ok: true, reason })}>
            {options.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Hook: `const [dialog, ask] = useConfirm()`; `if ((await ask({...})).ok) …`. */
export function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (r: { ok: boolean; reason?: string }) => void } | null>(null)
  const ask = (options: ConfirmOptions) => new Promise<{ ok: boolean; reason?: string }>((resolve) => setState({ options, resolve }))
  const dialog = state ? (
    <ConfirmDialog
      options={state.options}
      onClose={(result) => {
        state.resolve(result)
        setState(null)
      }}
    />
  ) : null
  return [dialog, ask] as const
}

/* ---------- estados ---------- */

export const Loading = () => <p className="loading" role="status">Cargando…</p>
export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>
export const ErrorBox = ({ message }: { message: string }) => <p className="error-box" role="alert">{message}</p>

/* ---------- contraseña con 👁 ---------- */

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password">
      <input {...props} className="input" type={visible ? 'text' : 'password'} />
      <button
        type="button"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  )
}

/* ---------- formato ---------- */

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })

export const statusLabel = (m: { status: string; moderatedAt: string | null }) =>
  m.moderatedAt && m.status === 'Pausado' ? 'Oculta' : m.status

export const pillClass = (label: string) => `pill pill--${label.toLowerCase()}`
