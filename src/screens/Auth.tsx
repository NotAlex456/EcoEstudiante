import { FormEvent, useEffect, useState } from 'react'
import { PasswordInput, Select } from '../components/inputs'
import { AppLogo, Button, Field, Icon } from '../components/ui'
import { CAREERS, CYCLES } from '../lib/data'
import { forgotPassword, login, register, resendCode, resetPassword, toast, verifyEmail } from '../lib/store'

/** Formato de correo. Que sea institucional (o un correo permitido) lo decide el servidor. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CAREER_OPTIONS = CAREERS.map((c) => ({ value: c, label: c }))
const CYCLE_OPTIONS = CYCLES.map((c) => ({ value: c, label: `${c}.° ciclo` }))

/** La contraseña viaja (solo en memoria) hasta la verificación, que la exige junto con el código. */
type Pending = { userId: string; email: string; password: string; devCode?: string }
type Step = { kind: 'login' } | { kind: 'register' } | { kind: 'forgot'; email: string } | ({ kind: 'verify' } & Pending)
type OnVerify = (pending: Pending) => void

export function Auth() {
  const [step, setStep] = useState<Step>({ kind: 'login' })

  return (
    <div className="auth">
      <div className="auth__intro">
        <AppLogo />
        <h1>Materiales que recirculan <em>entre estudiantes.</em></h1>
        <p>Compra a bajo costo, intercambia o recibe donaciones de otros estudiantes de la UPSJB Chincha.</p>
        <ul>
          <li><Icon name="shield" size={18} /> Solo con correo institucional</li>
          <li><Icon name="pin" size={18} /> Entregas en puntos seguros del campus</li>
          <li><Icon name="leaf" size={18} /> Venta, intercambio o donación</li>
        </ul>
      </div>
      <div className="auth__card page-enter" key={step.kind}>
        {step.kind === 'login' && (
          <LoginForm
            onRegister={() => setStep({ kind: 'register' })}
            onForgot={(email) => setStep({ kind: 'forgot', email })}
            onVerify={(pending) => setStep({ kind: 'verify', ...pending })}
          />
        )}
        {step.kind === 'forgot' && <ForgotForm initialEmail={step.email} onBack={() => setStep({ kind: 'login' })} />}
        {step.kind === 'register' && <RegisterForm onLogin={() => setStep({ kind: 'login' })} onVerify={(pending) => setStep({ kind: 'verify', ...pending })} />}
        {step.kind === 'verify' && <VerifyForm {...step} onBack={() => setStep({ kind: 'login' })} onResend={(devCode) => setStep({ ...step, devCode })} />}
      </div>
    </div>
  )
}

function LoginForm({ onRegister, onForgot, onVerify }: { onRegister: () => void; onForgot: (email: string) => void; onVerify: OnVerify }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await login(email, password)
    setBusy(false)
    if ('error' in result) setError(result.error)
    else if ('needsVerification' in result) onVerify({ userId: result.userId, email: email.trim().toLowerCase(), password, devCode: result.devCode })
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow">Bienvenido/a de nuevo</p>
      <h2>Ingresar</h2>
      <Field label="Correo institucional">
        <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="nombre.apellido@upsjb.edu.pe" />
      </Field>
      <Field label="Contraseña" error={error}>
        <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} placeholder="Tu contraseña" />
      </Field>
      <button type="button" className="auth__link" onClick={() => onForgot(email)}>¿Olvidaste tu contraseña?</button>
      <Button type="submit" className="full-button" disabled={busy || !email || !password}>Ingresar</Button>
      <p className="auth__switch">¿Aún no tienes cuenta? <button type="button" onClick={onRegister}>Crear cuenta</button></p>
    </form>
  )
}

function RegisterForm({ onLogin, onVerify }: { onLogin: () => void; onVerify: OnVerify }) {
  const [form, setForm] = useState({ name: '', email: '', career: CAREERS[0], cycle: 1, password: '', confirm: '', consent: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().split(/\s+/).length < 2) next.name = 'Escribe tu nombre y apellido.'
    if (!EMAIL_FORMAT.test(form.email.trim())) next.email = 'Escribe un correo válido (nombre.apellido@upsjb.edu.pe).'
    if (form.password.length < 8) next.password = 'Usa al menos 8 caracteres.'
    if (form.confirm !== form.password) next.confirm = 'Las contraseñas no coinciden.'
    if (!form.consent) next.consent = 'Necesitamos tu consentimiento para crear la cuenta.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    const result = await register(form)
    setBusy(false)
    if ('error' in result) setErrors({ [result.field ?? 'email']: result.error })
    else onVerify({ userId: result.userId, email: form.email.trim().toLowerCase(), password: form.password, devCode: result.devCode })
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow">Únete a la comunidad</p>
      <h2>Crear cuenta</h2>
      <Field label="Nombre y apellido" error={errors.name}>
        <input autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej.: Andrea Mendoza" />
      </Field>
      <Field label="Correo institucional" error={errors.email} hint="Solo estudiantes con correo @upsjb.edu.pe">
        <input type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre.apellido@upsjb.edu.pe" />
      </Field>
      <div className="form-grid">
        <Field label="Carrera">
          <Select label="Carrera" value={form.career} options={CAREER_OPTIONS} onChange={(v) => set('career', v)} />
        </Field>
        <Field label="Ciclo">
          <Select label="Ciclo" value={form.cycle} options={CYCLE_OPTIONS} onChange={(v) => set('cycle', v)} />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Contraseña" error={errors.password}>
          <PasswordInput autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Mínimo 8 caracteres" />
        </Field>
        <Field label="Repite la contraseña" error={errors.confirm}>
          <PasswordInput autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
        </Field>
      </div>
      <label className={`check-row ${errors.consent ? 'has-error' : ''}`}>
        <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
        <span>Acepto que EcoEstudiante use mi nombre, carrera y correo solo para identificarme ante otros estudiantes. Mi teléfono nunca se muestra (Ley N.° 29733).</span>
      </label>
      {errors.consent && <p className="field__error">{errors.consent}</p>}
      <Button type="submit" className="full-button" disabled={busy}>Crear cuenta</Button>
      <p className="auth__switch">¿Ya tienes cuenta? <button type="button" onClick={onLogin}>Ingresar</button></p>
    </form>
  )
}

function VerifyForm({ userId, email, password, devCode, onBack, onResend }: Pending & { onBack: () => void; onResend: (devCode?: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await verifyEmail(userId, value, password)
    setBusy(false)
    if ('error' in result) setError(result.error)
  }

  const resend = async () => {
    const result = await resendCode(userId)
    if ('error' in result) return toast(result.error, 'error')
    onResend(result.devCode)
    toast('Te enviamos un código nuevo.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow">Verifica tu identidad</p>
      <h2>Revisa tu correo</h2>
      <p className="auth__lead">Enviamos un código de 6 dígitos a <strong>{email}</strong>.</p>
      {devCode ? (
        <div className="demo-mail" role="note">
          <Icon name="info" size={18} />
          <span><strong>Modo demostración:</strong> el servidor no tiene correo configurado, el código es <b>{devCode}</b></span>
        </div>
      ) : (
        <p className="auth__lead">Revisa también la carpeta de spam.</p>
      )}
      <Field label="Código de verificación" error={error}>
        <input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={value} onChange={(e) => { setValue(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} placeholder="••••••" />
      </Field>
      <Button type="submit" className="full-button" disabled={busy || value.length !== 6}>Verificar y entrar</Button>
      <p className="auth__switch">
        <button type="button" onClick={resend}>Reenviar código</button>
        {' · '}
        <button type="button" onClick={onBack}>Volver</button>
      </p>
    </form>
  )
}

/** Recuperar la contraseña: correo → código de 6 dígitos → contraseña nueva (y se inicia sesión). */
function ForgotForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [devCode, setDevCode] = useState<string>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!EMAIL_FORMAT.test(email.trim())) return setErrors({ email: 'Escribe el correo con el que te registraste.' })
    setBusy(true)
    const result = await forgotPassword(email)
    setBusy(false)
    if ('error' in result) return setErrors({ email: result.error })
    setDevCode(result.devCode)
    setErrors({})
    setStage('code')
    setCooldown(60)
    toast('Si existe una cuenta con ese correo, te enviamos un código.')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (code.length !== 6) next.code = 'Escribe los 6 dígitos del código.'
    if (password.length < 8) next.password = 'Usa al menos 8 caracteres.'
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    const result = await resetPassword(email, code, password)
    setBusy(false)
    if ('error' in result) setErrors({ [result.field === 'password' ? 'password' : 'code']: result.error })
    else toast('¡Listo! Cambiaste tu contraseña.')
  }

  if (stage === 'email')
    return (
      <form onSubmit={send} noValidate>
        <p className="eyebrow">Recupera tu cuenta</p>
        <h2>¿Olvidaste tu contraseña?</h2>
        <p className="auth__lead">Escribe tu correo y te enviaremos un código para crear una contraseña nueva.</p>
        <Field label="Correo" error={errors.email}>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}) }} placeholder="nombre.apellido@upsjb.edu.pe" />
        </Field>
        <Button type="submit" className="full-button" disabled={busy || !email.trim()}>{busy ? 'Enviando…' : 'Enviar código'}</Button>
        <p className="auth__switch"><button type="button" onClick={onBack}>Volver a ingresar</button></p>
      </form>
    )

  return (
    <form onSubmit={save} noValidate>
      <p className="eyebrow">Recupera tu cuenta</p>
      <h2>Crea una contraseña nueva</h2>
      <p className="auth__lead">Si existe una cuenta con <strong>{email.trim().toLowerCase()}</strong>, te enviamos un código. Revisa también la carpeta de spam.</p>
      {devCode && (
        <div className="demo-mail" role="note">
          <Icon name="info" size={18} />
          <span><strong>Modo demostración:</strong> el servidor no tiene correo configurado, el código es <b>{devCode}</b></span>
        </div>
      )}
      <Field label="Código" error={errors.code}>
        <input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors({}) }} placeholder="••••••" />
      </Field>
      <Field label="Contraseña nueva" error={errors.password}>
        <PasswordInput autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors({}) }} placeholder="Mínimo 8 caracteres" />
      </Field>
      <Field label="Repite la contraseña nueva" error={errors.confirm}>
        <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors({}) }} />
      </Field>
      <Button type="submit" className="full-button" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña y entrar'}</Button>
      <p className="auth__switch">
        <button type="button" disabled={cooldown > 0 || busy} onClick={() => send()}>{cooldown ? `Reenviar código (${cooldown} s)` : 'Reenviar código'}</button>
        {' · '}
        <button type="button" onClick={onBack}>Volver</button>
      </p>
    </form>
  )
}
