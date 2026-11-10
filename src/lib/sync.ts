/**
 * Trae datos del servidor a la caché local (el store). Las pantallas siguen leyendo con
 * `useStore`; aquí solo se actualiza lo que se guardó la última vez.
 */
import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { getState, updateCache } from './store'
import type { Agreement, Conversation, Material, Message, Notification, SavedSearch, State, User } from './types'

export type OwnerDto = { id: string; name: string; career: string; cycle: number; rating: { value: number; count: number }; deleted?: boolean }

export type MaterialDto = Omit<Material, 'createdAt'> & { createdAt: string; owner: OwnerDto }

export type ReviewDto = { authorName: string; stars: number; comment: string; materialTitle: string; createdAt: string }

export type PublicUserDto = OwnerDto & { createdAt: string; reviews: ReviewDto[]; materials: MaterialDto[] }

type SavedSearchDto = { id: string; query: string; category: string; mode: string; createdAt: string }

export function fromMaterialDto({ owner: _owner, createdAt, exchangeFor, ...rest }: MaterialDto): Material {
  return { ...rest, ...(exchangeFor ? { exchangeFor } : {}), createdAt: Date.parse(createdAt) }
}

/** Upsert de usuarios del servidor, conservando lo que la caché ya sabía (p. ej. el correo propio). */
function withUsers(s: State, owners: OwnerDto[]): User[] {
  const byId = new Map(s.users.map((u) => [u.id, u]))
  for (const o of owners) {
    const known = byId.get(o.id)
    byId.set(o.id, { email: '', verified: true, createdAt: 0, ...known, ...o })
  }
  return [...byId.values()]
}

/** Upsert de materiales en la caché. */
function withMaterials(s: State, materials: Material[]): Material[] {
  const byId = new Map(s.materials.map((m) => [m.id, m]))
  for (const m of materials) byId.set(m.id, m)
  return [...byId.values()]
}

/** Un material sigue en la caché si un chat o un acuerdo local lo usa (si no, esa pantalla se rompería). */
const inUse = (s: State, id: string) =>
  s.conversations.some((c) => c.materialId === id) || s.agreements.some((a) => a.materialId === id)

export function adoptMaterials(dtos: MaterialDto[]) {
  updateCache((s) => ({
    ...s,
    users: withUsers(s, dtos.map((d) => d.owner)),
    materials: withMaterials(s, dtos.map(fromMaterialDto)),
  }))
}

/** Todas las páginas de Explorar; quita de la caché los ajenos que ya no se listan. */
export async function loadMaterials() {
  const all: MaterialDto[] = []
  for (let page = 1; ; page++) {
    const res = await api<{ items: MaterialDto[]; hasMore: boolean }>('GET', `/materials?page=${page}`)
    all.push(...res.items)
    if (!res.hasMore || page >= 50) break
  }
  const listed = new Set(all.map((m) => m.id))
  updateCache((s) => ({
    ...s,
    users: withUsers(s, all.map((d) => d.owner)),
    materials: withMaterials(s, all.map(fromMaterialDto)).filter(
      (m) =>
        listed.has(m.id) ||
        m.ownerId === s.sessionUserId ||
        !(m.status === 'Disponible' || m.status === 'Reservado') ||
        inUse(s, m.id),
    ),
  }))
}

/** Un material por id. Si ya no existe (404), sale de la caché salvo que un chat o acuerdo lo use. */
export async function loadMaterial(id: string): Promise<'ok' | 'missing'> {
  try {
    adoptMaterials([await api<MaterialDto>('GET', `/materials/${encodeURIComponent(id)}`)])
    return 'ok'
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      updateCache((s) => (inUse(s, id) ? s : { ...s, materials: s.materials.filter((m) => m.id !== id) }))
      return 'missing'
    }
    throw error
  }
}

/** Perfil público: guarda al usuario y sus materiales en la caché y devuelve sus reseñas. */
export async function loadProfile(id: string): Promise<PublicUserDto | null> {
  try {
    const profile = await api<PublicUserDto>('GET', `/users/${encodeURIComponent(id)}`)
    adoptMaterials(profile.materials)
    updateCache((s) => ({ ...s, users: withUsers(s, [profile]) }))
    return profile
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Mis publicaciones, mis guardados y mis búsquedas guardadas. */
export async function loadActivity() {
  const me = getState().sessionUserId
  if (!me) return
  const [mine, saved, searches] = await Promise.all([
    api<MaterialDto[]>('GET', '/users/me/materials'),
    api<MaterialDto[]>('GET', '/saved'),
    api<SavedSearchDto[]>('GET', '/saved-searches'),
  ])
  const mineIds = new Set(mine.map((m) => m.id))
  adoptMaterials([...mine, ...saved])
  updateCache((s) => ({
    ...s,
    // Mis materiales que el servidor ya no devuelve (eliminados) salen de la caché.
    materials: s.materials.filter((m) => m.ownerId !== me || mineIds.has(m.id) || inUse(s, m.id)),
    saved: { ...s.saved, [me]: saved.map((m) => m.id) },
    savedSearches: [
      ...s.savedSearches.filter((x) => x.userId !== me),
      ...searches.map((x): SavedSearch => ({ id: x.id, userId: me, query: x.query, category: x.category, mode: x.mode, at: Date.parse(x.createdAt) })),
    ],
  }))
}

/* ---------- chat, acuerdos y notificaciones ---------- */

export type MessageDto = { id: string; conversationId: string; senderId: string; text: string; createdAt: string }

export type ConversationDto = {
  id: string
  materialId: string
  buyerId: string
  sellerId: string
  buyerReadAt: string | null
  sellerReadAt: string | null
  lastMessageAt: string
  lastMessage: MessageDto | null
  unread: number
  material: MaterialDto
  other: OwnerDto
}

export type AgreementDto = Omit<Agreement, 'createdAt' | 'updatedAt' | 'rating'> & {
  createdAt: string
  updatedAt: string
  review: { stars: number; comment: string; createdAt: string } | null
}

export type NotificationDto = { id: string; category: string; text: string; link: string; read: boolean; createdAt: string }

export const fromMessageDto = (m: MessageDto): Message => ({ id: m.id, from: m.senderId, text: m.text, at: Date.parse(m.createdAt) })

export function fromAgreementDto({ review, createdAt, updatedAt, note, ...rest }: AgreementDto): Agreement {
  return {
    ...rest,
    ...(note ? { note } : {}),
    createdAt: Date.parse(createdAt),
    updatedAt: Date.parse(updatedAt),
    ...(review ? { rating: { stars: review.stars, comment: review.comment, at: Date.parse(review.createdAt) } } : {}),
  }
}

export const fromNotificationDto = (n: NotificationDto, userId: string, live = false): Notification => ({
  id: n.id,
  userId,
  text: n.text,
  link: n.link,
  read: n.read,
  at: Date.parse(n.createdAt),
  ...(live ? { live } : {}),
})

/** Mensajes ordenados y sin repetidos (por id). */
function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.at - b.at)
}

/** La conversación del servidor, conservando los mensajes que la caché ya tenía. */
function fromConversationDto(dto: ConversationDto, cached?: Conversation): Conversation {
  const last = dto.lastMessage ? [fromMessageDto(dto.lastMessage)] : []
  return {
    id: dto.id,
    materialId: dto.materialId,
    participants: [dto.buyerId, dto.sellerId],
    messages: mergeMessages(cached?.messages ?? [], last),
    readAt: {
      [dto.buyerId]: dto.buyerReadAt ? Date.parse(dto.buyerReadAt) : 0,
      [dto.sellerId]: dto.sellerReadAt ? Date.parse(dto.sellerReadAt) : 0,
    },
    unread: dto.unread,
  }
}

/** Guarda conversaciones del servidor (con su material y la otra persona) en la caché. */
export function adoptConversations(dtos: ConversationDto[], replaceAll = false) {
  adoptMaterials(dtos.map((d) => d.material))
  updateCache((s) => {
    const cached = new Map(s.conversations.map((c) => [c.id, c]))
    const incoming = dtos.map((d) => fromConversationDto(d, cached.get(d.id)))
    const ids = new Set(incoming.map((c) => c.id))
    const kept = replaceAll ? [] : s.conversations.filter((c) => !ids.has(c.id))
    return { ...s, users: withUsers(s, dtos.map((d) => d.other)), conversations: [...kept, ...incoming] }
  })
}

export async function loadConversations() {
  if (!getState().sessionUserId) return
  adoptConversations(await api<ConversationDto[]>('GET', '/conversations'), true)
}

/** Trae los mensajes del servidor (los 50 últimos) y los une a los de la caché, sin perder los que llegaron mientras tanto. */
export async function loadMessages(conversationId: string) {
  const messages = await api<MessageDto[]>('GET', `/conversations/${encodeURIComponent(conversationId)}/messages`)
  if (!getState().conversations.some((c) => c.id === conversationId)) await loadConversations()
  updateCache((s) => ({
    ...s,
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, messages: mergeMessages(c.messages, messages.map(fromMessageDto)) } : c)),
  }))
}

/** Un mensaje nuevo (enviado o recibido por el socket). Si no es mío y no estoy mirando ese chat, cuenta como no leído. */
export function adoptMessage(conversationId: string, dto: MessageDto) {
  const s = getState()
  const conversation = s.conversations.find((c) => c.id === conversationId)
  if (!conversation) return void loadConversations().catch(() => undefined)
  if (conversation.messages.some((m) => m.id === dto.id)) return
  const mine = dto.senderId === s.sessionUserId
  const viewing = location.hash === `#/chat/${conversationId}`
  updateCache((st) => ({
    ...st,
    conversations: st.conversations.map((c) =>
      c.id === conversationId
        ? { ...c, messages: mergeMessages(c.messages, [fromMessageDto(dto)]), unread: mine || viewing ? c.unread ?? 0 : (c.unread ?? 0) + 1 }
        : c,
    ),
  }))
}

/** Un acuerdo del servidor; si su material no está en la caché, lo trae. */
export function adoptAgreement(dto: AgreementDto) {
  const agreement = fromAgreementDto(dto)
  updateCache((s) => ({ ...s, agreements: [...s.agreements.filter((a) => a.id !== agreement.id), agreement] }))
  if (!getState().materials.some((m) => m.id === agreement.materialId)) void loadMaterial(agreement.materialId).catch(() => undefined)
}

export async function loadAgreements() {
  if (!getState().sessionUserId) return
  const dtos = await api<AgreementDto[]>('GET', '/agreements')
  updateCache((s) => ({ ...s, agreements: dtos.map(fromAgreementDto) }))
  const known = new Set(getState().materials.map((m) => m.id))
  const missing = [...new Set(dtos.map((d) => d.materialId).filter((id) => !known.has(id)))]
  await Promise.allSettled(missing.map((id) => loadMaterial(id)))
}

/** Cambia el estado de un material en la caché (llega por el socket o tras una acción propia). */
export function setCachedMaterialStatus(materialId: string, status: Material['status'] | 'Eliminado') {
  updateCache((s) => ({
    ...s,
    materials:
      status === 'Eliminado'
        ? s.materials.filter((m) => m.id !== materialId || inUse(s, m.id))
        : s.materials.map((m) => (m.id === materialId ? { ...m, status } : m)),
  }))
}

export async function loadNotifications() {
  const me = getState().sessionUserId
  if (!me) return
  const dtos = await api<NotificationDto[]>('GET', '/notifications')
  updateCache((s) => ({ ...s, notifications: [...s.notifications.filter((n) => n.userId !== me), ...dtos.map((n) => fromNotificationDto(n, me))] }))
}

/** Una notificación que llegó en vivo: la ventana emergente la muestra `alerts.ts`. */
export function adoptLiveNotification(dto: NotificationDto) {
  const me = getState().sessionUserId
  if (!me || getState().notifications.some((n) => n.id === dto.id)) return
  updateCache((s) => ({ ...s, notifications: [...s.notifications, fromNotificationDto(dto, me, true)] }))
}

/** Al abrir la app, iniciar sesión o reconectar el socket. Un fallo de red deja la caché como estaba. */
export function syncAll() {
  return Promise.allSettled([loadMaterials(), loadActivity(), loadConversations(), loadAgreements(), loadNotifications()])
}

/**
 * Recarga desde el servidor al montar la pantalla (y cuando cambian las dependencias).
 * Mientras tanto la pantalla muestra lo que ya hay en caché; `loading` sirve para el primer uso.
 */
export function useRefresh<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; result?: T }>({ loading: true })
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    load()
      .then((result) => !cancelled && setState({ loading: false, result }))
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })))
    return () => {
      cancelled = true
    }
  }, deps)
  return state
}
