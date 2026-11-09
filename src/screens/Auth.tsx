import { FormEvent, useState } from 'react'
import { AppLogo, Button, Field, Icon } from '../components/ui'
import { CAREERS, CYCLES } from '../lib/data'
import { INSTITUTIONAL_EMAIL, login, register, resendCode, toast, verifyEmail } from '../lib/store'

type Step = { kind: 'login' } | { kind: 'register' } | { kind: 'verify'; userId: string; email: string; devCode?: string }

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
        {step.kind === 'login' && <LoginForm onRegister={() => setStep({ kind: 'register' })} onVerify={(userId, email, devCode) => setStep({ kind: 'verify', userId, email, devCode })} />}
        {step.kind === 'register' && <RegisterForm onLogin={() => setStep({ kind: 'login' })} onVerify={(userId, email, devCode) => setStep({ kind: 'verify', userId, email, devCode })} />}
        {step.kind === 'verify' && <VerifyForm {...step} onBack={() => setStep({ kind: 'login' })} onResend={(devCode) => setStep({ ...step, devCode })} />}
      </div>
    </div>
  )
}

function LoginForm({ onRegister, onVerify }: { onRegister: () => void; onVerify: (userId: string, email: string, devCode?: string) => void }) {
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
    else if ('needsVerification' in result) onVerify(result.userId, email.trim().toLowerCase(), result.devCode)
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow">Bienvenido/a de nuevo</p>
      <h2>Ingresar</h2>
      <Field label="Correo institucional">
        <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="nombre.apellido@upsjb.edu.pe" />
      </Field>
      <Field label="Contraseña" error={error}>
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} placeholder="Tu contraseña" />
      </Field>
      <Button type="submit" className="full-button" disabled={busy || !email || !password}>Ingresar</Button>
      <p className="auth__switch">¿Aún no tienes cuenta? <button type="button" onClick={onRegister}>Crear cuenta</button></p>
    </form>
  )
}

function RegisterForm({ onLogin, onVerify }: { onLogin: () => void; onVerify: (userId: string, email: string, devCode?: string) => void }) {
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
    if (!INSTITUTIONAL_EMAIL.test(form.email.trim())) next.email = 'Usa tu correo institucional que termina en @upsjb.edu.pe.'
    if (form.password.length < 8) next.password = 'Usa al menos 8 caracteres.'
    if (form.confirm !== form.password) next.confirm = 'Las contraseñas no coinciden.'
    if (!form.consent) next.consent = 'Necesitamos tu consentimiento para crear la cuenta.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    const result = await register(form)
    setBusy(false)
    if ('error' in result) setErrors({ [result.field ?? 'email']: result.error })
    else onVerify(result.userId, form.email.trim().toLowerCase(), result.devCode)
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
          <select value={form.career} onChange={(e) => set('career', e.target.value)}>{CAREERS.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Ciclo">
          <select value={form.cycle} onChange={(e) => set('cycle', Number(e.target.value))}>{CYCLES.map((c) => <option key={c} value={c}>{c}.° ciclo</option>)}</select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Contraseña" error={errors.password}>
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Mínimo 8 caracteres" />
        </Field>
        <Field label="Repite la contraseña" error={errors.confirm}>
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
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

function VerifyForm({ userId, email, devCode, onBack, onResend }: { userId: string; email: string; devCode?: string; onBack: () => void; onResend: (devCode?: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await verifyEmail(userId, value)
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
        <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => { setValue(e.target.value.replace(/D/g, '')); setError('') }} placeholder="••••••" />
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
