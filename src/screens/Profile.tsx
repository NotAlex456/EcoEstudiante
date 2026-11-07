import { useMemo } from 'react'
import { Avatar, BackLink, Button, EmptyState, Icon, MaterialCard, Stars } from '../components/ui'
import { SEED_REVIEWS } from '../lib/data'
import { navigate } from '../lib/router'
import { currentUser, timeAgo, toggleSaved, userById, userRating, useStore } from '../lib/store'

const DAY = 86_400_000

export function Profile({ id }: { id: string }) {
  const me = useStore(currentUser)!
  const user = useStore((s) => userById(s, id))
  const rating = useStore((s) => userRating(s, id).value)
  const ratingCount = useStore((s) => userRating(s, id).count)
  const agreements = useStore((s) => s.agreements)
  const users = useStore((s) => s.users)
  const materials = useStore((s) => s.materials)
  const saved = useStore((s) => s.saved[me.id]) ?? []

  const reviews = useMemo(() => {
    const real = agreements
      .filter((a) => a.sellerId === id && a.rating)
      .map((a) => ({
        key: a.id,
        author: users.find((u) => u.id === a.buyerId)?.name ?? 'Estudiante',
        stars: a.rating!.stars,
        comment: a.rating!.comment,
        at: a.rating!.at,
        material: materials.find((m) => m.id === a.materialId)?.title ?? '',
      }))
    const seeded = (SEED_REVIEWS[id] ?? []).map((r, i) => ({ key: `seed-${i}`, ...r, at: Date.now() - r.daysAgo * DAY }))
    return [...real, ...seeded].sort((a, b) => b.at - a.at)
  }, [agreements, users, materials, id])

  const available = materials.filter((m) => m.ownerId === id && m.status === 'Disponible')
  const delivered = agreements.filter((a) => a.sellerId === id && a.status === 'Completado').length + (user?.baseRatingCount ?? 0)
  const distribution = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.stars === n).length }))

  if (!user) {
    return (
      <section className="account-page page-enter">
        <BackLink label="Volver" fallback="#/" />
        <EmptyState icon="user" title="Perfil no encontrado" text="Puede que la cuenta ya no exista." action={<Button onClick={() => navigate('#/')}>Explorar materiales</Button>} />
      </section>
    )
  }

  const isMe = user.id === me.id

  return (
    <section className="account-page page-enter">
      <BackLink label="Volver" fallback="#/" />
      <div className="profile-hero profile-card">
        <Avatar name={user.name} size="large" />
        <div>
          <h2>{user.name} {user.verified && <span className="verified"><Icon name="check" size={12} /></span>}</h2>
          <p>{user.career} · {user.cycle}.° ciclo</p>
          <span className="verified-label"><Icon name="shield" size={16} /> Correo institucional verificado</span>
        </div>
        {isMe && <Button variant="secondary" onClick={() => navigate('#/cuenta')}>Ir a mi cuenta</Button>}
      </div>

      <div className="account-grid">
        <div className="account-card">
          <h3>{isMe ? 'Así te ven otros estudiantes' : 'Reputación en la comunidad'}</h3>
          <div className="rating">
            <strong>{ratingCount ? rating.toFixed(1) : '—'}</strong>
            <span><Stars value={rating} /><small>{ratingCount ? `${ratingCount} valoraciones` : 'Aún sin valoraciones'}</small></span>
          </div>
          {reviews.length > 0 && (
            <div className="rating-bars" aria-label="Distribución de valoraciones">
              {distribution.map(({ n, count }) => (
                <div key={n}>
                  <span>{n} ★</span>
                  <i><b style={{ width: `${(count / reviews.length) * 100}%` }} /></i>
                  <small>{count}</small>
                </div>
              ))}
              <p className="rating-bars__note">Según {reviews.length === 1 ? 'la reseña' : `las ${reviews.length} reseñas`} con comentario</p>
            </div>
          )}
          <div className="account-metrics"><span><strong>{delivered}</strong>Entregas</span><span><strong>{available.length}</strong>Disponibles</span><span><strong>{materials.filter((m) => m.ownerId === id && m.mode === 'Donación').length}</strong>Donaciones</span></div>
        </div>
        <div className="account-card">
          <h3>Confianza</h3>
          <ul>
            <li><Icon name="check" /><span><strong>Estudiante UPSJB Chincha</strong><small>Verificado con correo @upsjb.edu.pe</small></span></li>
            <li><Icon name="shield" /><span><strong>Datos protegidos</strong><small>Su teléfono no se muestra; hablen por el chat</small></span></li>
            <li><Icon name="pin" /><span><strong>Entregas en puntos seguros</strong><small>Siempre dentro del campus</small></span></li>
          </ul>
        </div>
      </div>

      <div className="section-heading profile-section"><div><p className="eyebrow">Lo que dicen otros estudiantes</p><h2>Reseñas</h2></div></div>
      {reviews.length ? (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.key}>
              <div className="review-list__head">
                <Avatar name={r.author} size="small" />
                <div><strong>{r.author}</strong><small>{timeAgo(r.at)}{r.material && ` · ${r.material}`}</small></div>
                <Stars value={r.stars} size={14} />
              </div>
              <p>{r.comment || 'Valoró la entrega sin dejar comentario.'}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="star" title="Aún sin reseñas" text="Cuando complete su primera entrega, las valoraciones aparecerán aquí." />
      )}

      <div className="section-heading profile-section"><div><p className="eyebrow">Publicaciones activas</p><h2>Materiales de {user.name.split(' ')[0]}</h2></div></div>
      {available.length ? (
        <div className="materials-grid">
          {available.map((m) => <MaterialCard key={m.id} material={m} mine={isMe} saved={saved.includes(m.id)} onSave={() => toggleSaved(m.id)} />)}
        </div>
      ) : (
        <EmptyState icon="book" title="Sin materiales disponibles" text="Por ahora no tiene publicaciones activas." />
      )}
    </section>
  )
}
