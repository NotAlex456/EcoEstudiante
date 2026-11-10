import { FormEvent, useEffect, useRef, useState } from 'react'
import { Avatar, BackLink, Button, EmptyState, Icon } from '../components/ui'
import { navigate } from '../lib/router'
import { loadMessages, useRefresh } from '../lib/sync'
import { currentUser, markConversationRead, materialById, priceLabel, sendMessage, userById, useStore } from '../lib/store'

const QUICK_BUYER = ['¿Sigue disponible?', '¿Me lo dejas a menos?', '¿Podemos vernos mañana en la biblioteca?']
const QUICK_SELLER = ['Sí, sigue disponible 🙌', 'Propón lugar y hora con “Acordar entrega”.', '¿Te queda bien el patio principal?']

export function Chat({ id }: { id: string }) {
  const me = useStore(currentUser)!
  const conversation = useStore((s) => s.conversations.find((c) => c.id === id))
  const material = useStore((s) => (conversation ? materialById(s, conversation.materialId) : undefined))
  const otherId = conversation?.participants.find((p) => p !== me.id)
  const other = useStore((s) => (otherId ? userById(s, otherId) : undefined))
  const agreements = useStore((s) => s.agreements)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const { loading } = useRefresh(() => loadMessages(id), [id])
  const endRef = useRef<HTMLDivElement>(null)
  const count = conversation?.messages.length ?? 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
    if (conversation) markConversationRead(conversation.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  if ((!conversation || !material || !other) && loading) {
    return (
      <section className="inner-page page-enter">
        <BackLink label="Volver" fallback="#/actividad/mensajes" />
        <p className="result-count" role="status">Cargando…</p>
      </section>
    )
  }

  if (!conversation || !material || !other) {
    return (
      <section className="inner-page page-enter">
        <BackLink label="Volver" fallback="#/actividad/mensajes" />
        <EmptyState icon="message" title="Conversación no encontrada" text="Puede que la publicación haya sido retirada." />
      </section>
    )
  }

  const iAmBuyer = material.ownerId !== me.id
  const agreement = agreements.find((a) => a.materialId === material.id && a.buyerId === (iAmBuyer ? me.id : other.id) && a.status !== 'Cancelado')
  const quick = iAmBuyer ? QUICK_BUYER : QUICK_SELLER

  const submit = async (e?: FormEvent, value = text) => {
    e?.preventDefault()
    if (!value.trim() || sending) return
    setSending(true)
    const ok = await sendMessage(conversation.id, value)
    setSending(false)
    // Si falló, el texto se conserva para reintentar (el error ya se mostró).
    if (ok && value === text) setText('')
  }

  return (
    <section className="chat page-enter">
      <header className="chat__header">
        <BackLink label="" fallback="#/actividad/mensajes" />
        {other.deleted ? (
          <div className="chat__who">
            <Avatar name={other.name} size="small" />
            <div><strong>{other.name}</strong><small>Esta cuenta ya no existe</small></div>
          </div>
        ) : (
          <a className="chat__who" href={`#/perfil/${other.id}`} aria-label={`Ver perfil y reseñas de ${other.name}`}>
            <Avatar name={other.name} size="small" />
            <div>
              <strong>{other.name} <span className="verified"><Icon name="check" size={11} /></span></strong>
              <small>{iAmBuyer ? 'Publicó este material' : 'Interesado/a en tu material'} · Ver perfil</small>
            </div>
          </a>
        )}
      </header>

      <div className="chat__material">
        <a href={`#/material/${material.id}`}>
          <img src={material.images[0]} alt="" />
          <div><strong>{material.title}</strong><span>{material.mode === 'Donación' ? 'Donación' : priceLabel(material)} · {material.status}</span></div>
        </a>
        {iAmBuyer && !agreement && !other.deleted && material.status === 'Disponible' && (
          <Button className="chat__cta" onClick={() => navigate(`#/material/${material.id}/acordar`)}><Icon name="calendar" size={18} /> Acordar entrega</Button>
        )}
        {agreement && (
          <Button variant="secondary" className="chat__cta" onClick={() => navigate(`#/acuerdo/${agreement.id}`)}>Acuerdo: {agreement.status}</Button>
        )}
      </div>

      <div className="chat__messages" aria-live="polite">
        <div className="notice notice--soft"><Icon name="shield" size={18} /><p><span>Por tu seguridad no compartas tu teléfono. Acuerden la entrega en un punto seguro del campus.</span></p></div>
        {conversation.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.from === me.id ? 'bubble--me' : ''}`}>
            {m.text}
            <time>{new Date(m.at).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}</time>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat__composer">
        {!other.deleted && <div className="quick-replies">
          {quick.map((q) => <button key={q} disabled={sending} onClick={() => submit(undefined, q)}>{q}</button>)}
        </div>}
        {other.deleted ? <p className="chat__closed">Esta cuenta fue eliminada. Ya no puedes escribirle.</p> : <form onSubmit={submit}>
          <input aria-label="Escribe un mensaje" placeholder="Escribe un mensaje..." value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" />
          <button className="send-button" type="submit" aria-label="Enviar" disabled={!text.trim() || sending}><Icon name="send" size={20} /></button>
        </form>}
      </div>
    </section>
  )
}
