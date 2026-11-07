import { useMemo, useState } from 'react'
import { Avatar, BackLink, Button, EmptyState, Field, Icon, MaterialCard, ModeTag, Sheet } from '../components/ui'
import { REPORT_REASONS } from '../lib/data'
import { navigate } from '../lib/router'
import {
  currentUser, materialById, openConversation, priceLabel, reportMaterial, setMaterialStatus, timeAgo, toggleSaved, userById, userRating, useStore,
} from '../lib/store'

export function Detail({ id }: { id: string }) {
  const me = useStore(currentUser)!
  const material = useStore((s) => materialById(s, id))
  const owner = useStore((s) => (material ? userById(s, material.ownerId) : undefined))
  const rating = useStore((s) => (material ? userRating(s, material.ownerId).value : 0))
  const ratingCount = useStore((s) => (material ? userRating(s, material.ownerId).count : 0))
  const saved = useStore((s) => s.saved[me.id]) ?? []
  const agreements = useStore((s) => s.agreements)
  const materials = useStore((s) => s.materials)
  const [photo, setPhoto] = useState(0)
  const [reporting, setReporting] = useState(false)

  const myAgreement = agreements.find((a) => a.materialId === id && a.buyerId === me.id && (a.status === 'Pendiente' || a.status === 'Confirmado'))
  const similar = useMemo(
    () => (material ? materials.filter((m) => m.id !== material.id && m.status === 'Disponible' && m.ownerId !== me.id && (m.course === material.course || m.category === material.category)).slice(0, 3) : []),
    [materials, material, me.id],
  )

  if (!material || !owner) {
    return (
      <section className="detail page-enter">
        <BackLink label="Volver" fallback="#/" />
        <EmptyState icon="search" title="Esta publicación ya no existe" text="Puede que la hayan retirado. Busca opciones similares." action={<Button onClick={() => navigate('#/')}>Explorar materiales</Button>} />
      </section>
    )
  }

  const mine = material.ownerId === me.id
  const unavailable = material.status !== 'Disponible' && !myAgreement

  const contact = () => navigate(`#/chat/${openConversation(material.id)}`)

  return (
    <section className="detail page-enter">
      <BackLink label="Volver a resultados" fallback="#/" />
      <div className="detail__grid">
        <div className="detail__visual">
          <div className="gallery" onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {material.images.map((src, i) => <img key={i} src={src} alt={`${material.title}, foto ${i + 1}`} />)}
          </div>
          <span>Foto real del material</span>
          {material.images.length > 1 && <div className="gallery__dots">{material.images.map((_, i) => <i key={i} className={i === photo ? 'is-active' : ''} />)}</div>}
        </div>
        <div className="detail__content">
          <div className="detail__tags">
            <ModeTag mode={material.mode} />
            <span>{material.condition}</span>
            <span className={material.status === 'Disponible' ? 'is-ok' : 'is-warn'}>{material.status}</span>
          </div>
          <p className="eyebrow">{material.course} · {material.cycle}.° ciclo</p>
          <h1>{material.title}</h1>
          <div className="detail__price">{material.mode === 'Donación' ? 'Gratis · Donación' : priceLabel(material)}</div>
          {material.exchangeFor && <p className="detail__exchange"><Icon name="refresh" size={17} /> Busca a cambio: <strong>{material.exchangeFor}</strong></p>}
          <p className="detail__description">{material.description}</p>
          <p className="detail__meta">{material.career} · Publicado {timeAgo(material.createdAt)}</p>

          <a className="owner-card" href={`#/perfil/${owner.id}`} aria-label={`Ver perfil y reseñas de ${owner.name}`}>
            <Avatar name={owner.name} />
            <div>
              <small>{mine ? 'Tu publicación' : 'Publicado por'}</small>
              <strong>{owner.name} {owner.verified && <span className="verified"><Icon name="check" size={12} /></span>}</strong>
              <span>{ratingCount ? `★ ${rating} (${ratingCount})` : 'Sin valoraciones aún'} · Correo institucional verificado</span>
              <span className="owner-card__cta">Ver perfil y reseñas</span>
            </div>
            <Icon name="chevron" size={20} />
          </a>

          {mine ? (
            <div className="detail__actions">
              <Button onClick={() => navigate(`#/publicar/${material.id}`)}><Icon name="edit" /> Editar publicación</Button>
              {material.status === 'Disponible' || material.status === 'Pausado' ? (
                <Button variant="secondary" onClick={() => setMaterialStatus(material.id, material.status === 'Pausado' ? 'Disponible' : 'Pausado')}>
                  <Icon name="pause" /> {material.status === 'Pausado' ? 'Reactivar' : 'Pausar'}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate('#/actividad/publicaciones')}>Ver en mi actividad</Button>
              )}
            </div>
          ) : myAgreement ? (
            <div className="detail__actions">
              <Button onClick={() => navigate(`#/acuerdo/${myAgreement.id}`)}><Icon name="calendar" /> Ver mi acuerdo</Button>
              <Button variant="secondary" onClick={contact}><Icon name="message" /> Mensajes</Button>
            </div>
          ) : unavailable ? (
            <div className="notice notice--warn"><Icon name="info" /><p><strong>Este material ya está {material.status.toLowerCase()}.</strong><span>Mira opciones similares abajo o guárdalo por si se libera.</span></p></div>
          ) : (
            <div className="detail__actions">
              <Button onClick={contact}><Icon name="message" /> Contactar y acordar</Button>
              <Button variant="secondary" onClick={() => toggleSaved(material.id)}><Icon name="heart" className={saved.includes(material.id) ? 'icon--filled' : ''} /> {saved.includes(material.id) ? 'Guardado' : 'Guardar'}</Button>
            </div>
          )}

          <div className="detail__links">
            <a href="#/cuenta/seguridad"><Icon name="shield" size={16} /> Puntos seguros y normas</a>
            {!mine && <button className="report-link" onClick={() => setReporting(true)}><Icon name="flag" size={16} /> Reportar publicación</button>}
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <div className="similar">
          <div className="section-heading"><div><p className="eyebrow">También te puede servir</p><h2>Opciones similares</h2></div></div>
          <div className="materials-grid">
            {similar.map((m) => <MaterialCard key={m.id} material={m} saved={saved.includes(m.id)} onSave={() => toggleSaved(m.id)} />)}
          </div>
        </div>
      )}

      {reporting && <ReportSheet onClose={() => setReporting(false)} onSubmit={(reason, detail) => { reportMaterial(material.id, reason, detail); setReporting(false); navigate('#/', { replace: true }) }} />}
    </section>
  )
}

function ReportSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string, detail: string) => void }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  return (
    <Sheet title="Reportar publicación" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason, detail) }}>
        <p className="sheet__lead">Tu reporte es anónimo. Ocultaremos esta publicación para ti y la moderación la revisará.</p>
        <div className="radio-list" role="radiogroup" aria-label="Motivo">
          {REPORT_REASONS.map((r) => (
            <label key={r} className={reason === r ? 'is-active' : ''}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>
        <Field label="Cuéntanos más (opcional)">
          <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ej.: la calculadora de la foto es otro modelo." />
        </Field>
        <Button type="submit" className="full-button" disabled={!reason}>Enviar reporte</Button>
      </form>
    </Sheet>
  )
}
