import { FormEvent, useState } from 'react'
import { BackLink, Button, EmptyState, Field, Icon, MaterialSummary, Stars } from '../components/ui'
import { SAFE_POINTS } from '../lib/data'
import { navigate } from '../lib/router'
import {
  cancelAgreement, confirmReception, currentUser, formatDate, formatTime, materialById, openConversation, proposeAgreement, rateAgreement, toISODate, userById, useStore,
} from '../lib/store'
import type { AgreementStatus } from '../lib/types'

export function Schedule({ materialId }: { materialId: string }) {
  const material = useStore((s) => materialById(s, materialId))
  const owner = useStore((s) => (material ? userById(s, material.ownerId) : undefined))
  const [form, setForm] = useState(() => {
    // Default to the next day the campus is open (it is closed on Sundays).
    const next = new Date(Date.now() + 86_400_000)
    if (next.getDay() === 0) next.setDate(next.getDate() + 1)
    return { place: SAFE_POINTS[0].name, date: toISODate(next), time: '12:30', note: '' }
  })
  const [error, setError] = useState('')

  if (!material || !owner) return <Missing />
  if (material.status !== 'Disponible') {
    return (
      <section className="inner-page page-enter">
        <BackLink label="Volver a la ficha" fallback={`#/material/${materialId}`} />
        <EmptyState icon="info" title="Este material ya no está disponible" text="Otro estudiante ya coordinó la entrega. Revisa opciones similares." action={<Button onClick={() => navigate(`#/material/${materialId}`, { replace: true })}>Ver similares</Button>} />
      </section>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const when = new Date(`${form.date}T${form.time}`)
    const [h] = form.time.split(':').map(Number)
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) return setError('Elige una fecha y hora que todavía no hayan pasado.')
    if (h < 7 || h >= 21) return setError('Para tu seguridad, elige un horario de clases (7:00 a. m. a 9:00 p. m.).')
    if (when.getDay() === 0) return setError('El campus no atiende los domingos. Elige otro día.')
    const id = proposeAgreement({ materialId, ...form })
    navigate(`#/acuerdo/${id}/listo`, { replace: true })
  }

  const point = SAFE_POINTS.find((p) => p.name === form.place)

  return (
    <section className="inner-page page-enter">
      <BackLink label="Volver" fallback={`#/material/${materialId}`} />
      <div className="inner-page__header">
        <div><p className="eyebrow">Coordina con confianza</p><h1>Acordar entrega</h1></div>
        <span className="secure-badge"><Icon name="shield" size={17} /> Punto seguro</span>
      </div>
      <div className="schedule-layout">
        <form className="form-card" onSubmit={submit} noValidate>
          <MaterialSummary material={material} />
          <Field label="Punto seguro del campus" hint={point?.detail}>
            <select value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })}>
              {SAFE_POINTS.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Día"><input type="date" min={toISODate(new Date())} value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); setError('') }} /></Field>
            <Field label="Hora"><input type="time" min="07:00" max="21:00" step={900} value={form.time} onChange={(e) => { setForm({ ...form, time: e.target.value }); setError('') }} /></Field>
          </div>
          <Field label="Nota para el otro estudiante (opcional)">
            <input value={form.note} maxLength={120} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ej.: llevaré polo verde" />
          </Field>
          {error && <p className="field__error" role="alert">{error}</p>}
          <div className="safety-note"><Icon name="shield" /><p><strong>Entrega segura</strong><span>Elige una zona visible y concurrida, de preferencia en horario de clases. Revisa el material antes de pagar.</span></p></div>
          <Button type="submit" className="full-button">Enviar propuesta</Button>
        </form>
        <aside className="schedule-aside">
          <span>¿Qué sucederá después?</span>
          <ol>
            <li><i>1</i> Enviaremos la propuesta a {owner.name.split(' ')[0]}.</li>
            <li><i>2</i> Recibirás una notificación cuando la confirme.</li>
            <li><i>3</i> Tras la entrega, confirma la recepción y valora la experiencia.</li>
          </ol>
        </aside>
      </div>
    </section>
  )
}

export function Scheduled({ agreementId }: { agreementId: string }) {
  const agreement = useStore((s) => s.agreements.find((a) => a.id === agreementId))
  const material = useStore((s) => (agreement ? materialById(s, agreement.materialId) : undefined))
  const owner = useStore((s) => (agreement ? userById(s, agreement.sellerId) : undefined))
  if (!agreement || !material || !owner) return <Missing />
  return (
    <section className="success-view page-enter">
      <div className="success-view__icon"><Icon name="check" size={38} /></div>
      <p className="eyebrow">Propuesta enviada</p>
      <h1>¡Todo listo para el encuentro!</h1>
      <p>Enviamos tu propuesta para <strong>{material.title}</strong> a {owner.name.split(' ')[0]}. Te avisaremos cuando la confirme.</p>
      <AgreementCard place={agreement.place} date={agreement.date} time={agreement.time} />
      <div className="success-view__actions">
        <Button onClick={() => navigate(`#/acuerdo/${agreement.id}`, { replace: true })}>Ver mi acuerdo</Button>
        <Button variant="secondary" onClick={() => navigate('#/', { replace: true })}>Volver a explorar</Button>
      </div>
    </section>
  )
}

function AgreementCard({ place, date, time }: { place: string; date: string; time: string }) {
  return (
    <div className="agreement-card">
      <div><Icon name="pin" /><span><small>Punto seguro</small><strong>{place}</strong></span></div>
      <div><Icon name="clock" /><span><small>Fecha y hora</small><strong>{formatDate(date)} · {formatTime(time)}</strong></span></div>
      <div><Icon name="shield" /><span><small>Recomendación</small><strong>Encuéntrense en una zona visible</strong></span></div>
    </div>
  )
}

const STEPS: AgreementStatus[] = ['Pendiente', 'Confirmado', 'Completado']

export function AgreementDetail({ id }: { id: string }) {
  const me = useStore(currentUser)!
  const agreement = useStore((s) => s.agreements.find((a) => a.id === id))
  const material = useStore((s) => (agreement ? materialById(s, agreement.materialId) : undefined))
  const otherId = agreement ? (agreement.buyerId === me.id ? agreement.sellerId : agreement.buyerId) : ''
  const other = useStore((s) => userById(s, otherId))
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (!agreement || !material || !other) return <Missing />
  const iAmBuyer = agreement.buyerId === me.id
  const stepIndex = STEPS.indexOf(agreement.status)

  return (
    <section className="inner-page page-enter">
      <BackLink label="Volver" fallback="#/actividad/acuerdos" />
      <div className="inner-page__header">
        <div><p className="eyebrow">Acuerdo de entrega</p><h1>{agreement.status === 'Completado' ? 'Entrega completada' : agreement.status === 'Cancelado' ? 'Acuerdo cancelado' : 'Entrega en curso'}</h1></div>
        <span className={`status-pill status-pill--${agreement.status.toLowerCase()}`}>{agreement.status}</span>
      </div>

      <div className="schedule-layout">
        <div className="form-card">
          <MaterialSummary material={material} />
          {agreement.status !== 'Cancelado' && (
            <ol className="timeline">
              {STEPS.map((step, i) => (
                <li key={step} className={i <= stepIndex ? 'is-done' : ''}>
                  <i>{i <= stepIndex ? <Icon name="check" size={13} /> : i + 1}</i>
                  <span>{step === 'Pendiente' ? 'Propuesta enviada' : step === 'Confirmado' ? `${iAmBuyer ? other.name.split(' ')[0] : 'Tú'} confirmó` : 'Material recibido'}</span>
                </li>
              ))}
            </ol>
          )}
          <AgreementCard place={agreement.place} date={agreement.date} time={agreement.time} />
          {agreement.note && <p className="agreement-note">Nota: “{agreement.note}”</p>}

          {agreement.status === 'Pendiente' && (
            <div className="notice notice--soft"><Icon name="clock" /><p><strong>Esperando confirmación</strong><span>{other.name.split(' ')[0]} recibirá tu propuesta y la confirmará en breve.</span></p></div>
          )}

          {agreement.status === 'Confirmado' && iAmBuyer && (
            <div className="notice notice--ok"><Icon name="check" /><p><strong>¿Ya recibiste el material?</strong><span>Revísalo en el punto de encuentro y confirma solo si coincide con lo publicado.</span></p></div>
          )}

          {agreement.status === 'Completado' && iAmBuyer && !agreement.rating && (
            <form className="rating-form" onSubmit={(e) => { e.preventDefault(); rateAgreement(agreement.id, stars, comment) }}>
              <h3>¿Cómo fue tu experiencia con {other.name.split(' ')[0]}?</h3>
              <Stars value={stars} onChange={setStars} size={30} />
              <Field label="Comentario (opcional)">
                <textarea rows={3} value={comment} maxLength={200} onChange={(e) => setComment(e.target.value)} placeholder="Ej.: puntual y el material estaba tal cual." />
              </Field>
              <Button type="submit" className="full-button">Enviar valoración</Button>
            </form>
          )}

          {agreement.rating && (
            <div className="rating-done">
              <Stars value={agreement.rating.stars} />
              <p>{agreement.rating.comment || 'Valoración registrada sin comentario.'}</p>
              <small>Gracias por cerrar el ciclo 🌱</small>
            </div>
          )}

          <div className="form-actions form-actions--stack">
            {agreement.status === 'Confirmado' && iAmBuyer && <Button onClick={() => confirmReception(agreement.id)}><Icon name="check" /> Confirmar recepción</Button>}
            <Button variant="secondary" onClick={() => navigate(`#/chat/${openConversation(material.id, other.id)}`)}><Icon name="message" /> Abrir chat</Button>
            {(agreement.status === 'Pendiente' || agreement.status === 'Confirmado') && (
              confirmCancel ? (
                <div className="confirm-inline">
                  <span>¿Cancelar el acuerdo?</span>
                  <Button variant="danger" onClick={() => { cancelAgreement(agreement.id); setConfirmCancel(false) }}>Sí, cancelar</Button>
                  <Button variant="ghost" onClick={() => setConfirmCancel(false)}>No</Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancelar acuerdo</Button>
              )
            )}
          </div>
        </div>
        <aside className="schedule-aside">
          <span>Consejos para la entrega</span>
          <ol>
            <li><i>1</i> Llega puntual y avisa por el chat si te retrasas.</li>
            <li><i>2</i> Revisa el material antes de pagar o intercambiar.</li>
            <li><i>3</i> Si algo no coincide, no confirmes y repórtalo.</li>
          </ol>
        </aside>
      </div>
    </section>
  )
}

function Missing() {
  return (
    <section className="inner-page page-enter">
      <BackLink label="Volver" fallback="#/actividad/acuerdos" />
      <EmptyState icon="calendar" title="No encontramos este acuerdo" text="Puede que la publicación haya sido retirada." action={<Button onClick={() => navigate('#/')}>Explorar materiales</Button>} />
    </section>
  )
}
