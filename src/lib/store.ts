import { useSyncExternalStore } from 'react'
import { api, ApiError, getToken, setToken } from './api'
import { createSeedState, simulatedReply, STATE_VERSION } from './data'
import { uploadImages } from './images'
import { adoptMaterials, type MaterialDto } from './sync'
import type { Agreement, Conversation, Material, ScheduledEvent, State, User } from './types'

const STORAGE_KEY = 'ecoestudiante:v1'
import { INSTITUTIONAL_EMAIL } from '../../shared/constants'
import { matchesSearch } from '../../shared/search'
export { INSTITUTIONAL_EMAIL }

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/* ---------- persistence ---------- */

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (parsed.version === STATE_VERSION) return parsed
    }
  } catch {
    // corrupted or unavailable storage: start from the seed
  }
  return createSeedState()
}

let state: State = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    toast('El almacenamiento del celular está lleno. Usa menos fotos o elimina publicaciones antiguas.', 'error')
  }
}

function setState(updater: (draft: State) => State) {
  state = updater(state)
  persist()
  listeners.forEach((listener) => listener())
}

/** Para `sync.ts`: escribe en la caché los datos que llegan del servidor. */
export const updateCache = setState

export function getState() {
  return state
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

// Keep several open tabs in sync.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  state = load()
  listeners.forEach((listener) => listener())
})

/* ---------- toasts ---------- */

export type Toast = { id: string; text: string; tone: 'ok' | 'error' }
let toasts: Toast[] = []
const toastListeners = new Set<() => void>()

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const item = { id: uid('t'), text, tone }
  toasts = [...toasts, item]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id)
    toastListeners.forEach((l) => l())
  }, 3600)
}

export function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener)
      return () => toastListeners.delete(listener)
    },
    () => toasts,
  )
}

/* ---------- selectors ---------- */

export const currentUser = (s: State) => s.users.find((u) => u.id === s.sessionUserId) ?? null
export const userById = (s: State, id: string) => s.users.find((u) => u.id === id)
export const materialById = (s: State, id: string) => s.materials.find((m) => m.id === id)

/** Reputación: la del servidor (o la base sembrada) más las valoraciones de acuerdos locales (modo mixto). */
export function userRating(s: State, userId: string) {
  const user = userById(s, userId)
  const ratings = s.agreements.filter((a) => a.sellerId === userId && a.rating).map((a) => a.rating!.stars)
  const base = user?.rating ?? { value: user?.baseRating ?? 0, count: user?.baseRatingCount ?? 0 }
  const count = base.count + ratings.length
  if (!count) return { value: 0, count: 0 }
  const total = base.value * base.count + ratings.reduce((a, b) => a + b, 0)
  return { value: Math.round((total / count) * 10) / 10, count }
}

export function unreadCount(s: State, conversation: Conversation, userId: string) {
  const since = conversation.readAt[userId] ?? 0
  return conversation.messages.filter((m) => m.from !== userId && m.at > since).length
}

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

/* ---------- auth (servidor) ---------- */

type MeDto = { id: string; name: string; email: string; career: string; cycle: number; createdAt: string }

/** Guarda al usuario del servidor en la caché local y abre su sesión. */
function adoptUser(me: MeDto) {
  const user: User = { id: me.id, name: me.name, email: me.email, career: me.career, cycle: me.cycle, verified: true, createdAt: Date.parse(me.createdAt) }
  setState((s) => ({ ...s, sessionUserId: user.id, users: [...s.users.filter((u) => u.id !== user.id), user] }))
}

function welcome(userId: string) {
  setState((s) => ({
    ...s,
    notifications: [
      ...s.notifications,
      { id: uid('n'), userId, at: Date.now(), read: false, link: '#/cuenta', text: '¡Bienvenido/a a EcoEstudiante! Tu correo institucional quedó verificado.' },
    ],
  }))
}

type Failure = { error: string; field?: string }

/** Convierte un error de la API en un mensaje (y el campo del formulario al que corresponde). */
function failure(error: unknown): Failure {
  if (!(error instanceof ApiError)) return { error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' }
  const fields = error.details.fields as Record<string, string> | undefined
  const [field, message] = Object.entries(fields ?? {})[0] ?? []
  return field ? { error: message, field } : { error: error.message }
}

type AuthResponse = { token: string; user: MeDto }

export async function register(input: { name: string; email: string; career: string; cycle: number; password: string }): Promise<Failure | { userId: string; devCode?: string }> {
  try {
    const { name, email, career, cycle, password } = input
    return await api<{ userId: string; devCode?: string }>('POST', '/auth/register', { name, email, career, cycle, password })
  } catch (error) {
    return failure(error)
  }
}

export async function resendCode(userId: string): Promise<Failure | { devCode?: string }> {
  try {
    return await api<{ devCode?: string }>('POST', '/auth/resend-code', { userId })
  } catch (error) {
    return failure(error)
  }
}

/** El servidor exige la misma contraseña del registro junto con el código. */
export async function verifyEmail(userId: string, code: string, password: string): Promise<Failure | { ok: true }> {
  try {
    const { token, user } = await api<AuthResponse>('POST', '/auth/verify', { userId, code: code.trim(), password })
    setToken(token)
    adoptUser(user)
    welcome(user.id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

type LoginResult = Failure | { needsVerification: true; userId: string; devCode?: string } | { ok: true }

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const { token, user } = await api<AuthResponse>('POST', '/auth/login', { email, password })
    setToken(token)
    adoptUser(user)
    return { ok: true }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED')
      return { needsVerification: true, userId: String(error.details.userId), devCode: error.details.devCode as string | undefined }
    return failure(error)
  }
}

/** Al abrir la app: confirma la sesión guardada con el servidor. Sin conexión, conserva la caché. */
export async function restoreSession() {
  if (!getToken()) {
    if (state.sessionUserId) logout()
    return
  }
  try {
    adoptUser(await api<MeDto>('GET', '/auth/me'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) logout()
  }
}

export function logout() {
  setToken(null)
  setState((s) => ({ ...s, sessionUserId: null }))
}

export async function updateProfile(patch: Pick<User, 'name' | 'career' | 'cycle'>): Promise<boolean> {
  try {
    adoptUser(await api<MeDto>('PATCH', '/users/me', patch))
    return true
  } catch (error) {
    toast(failure(error).error, 'error')
    return false
  }
}

export function resetDemo() {
  setToken(null)
  localStorage.removeItem(STORAGE_KEY)
  state = createSeedState()
  persist()
  listeners.forEach((l) => l())
}

/* ---------- materials (servidor) ---------- */

/** Muestra el error del servidor (o de red) y devuelve false. */
function failed(error: unknown) {
  toast(failure(error).error, 'error')
  return false
}

export async function toggleSaved(materialId: string) {
  const me = state.sessionUserId
  if (!me) return
  const current = state.saved[me] ?? []
  const has = current.includes(materialId)
  const apply = (ids: string[]) => setState((s) => ({ ...s, saved: { ...s.saved, [me]: ids } }))
  apply(has ? current.filter((id) => id !== materialId) : [...current, materialId]) // optimista
  try {
    await api(has ? 'DELETE' : 'PUT', `/saved/${encodeURIComponent(materialId)}`)
    toast(has ? 'Quitado de guardados' : 'Guardado en Mi actividad')
  } catch (error) {
    apply(current)
    failed(error)
  }
}

export type MaterialInput = Omit<Material, 'id' | 'ownerId' | 'status' | 'createdAt'>

/** Sube las fotos nuevas y devuelve el cuerpo que espera la API. */
async function materialBody(input: MaterialInput) {
  return { ...input, exchangeFor: input.exchangeFor || undefined, images: await uploadImages(input.images) }
}

/** Publica en el servidor. Devuelve el id, o null si falló (el error ya se mostró). */
export async function publishMaterial(input: MaterialInput): Promise<string | null> {
  const me = state.sessionUserId!
  let dto: MaterialDto
  try {
    dto = await api<MaterialDto>('POST', '/materials', await materialBody(input))
  } catch (error) {
    failed(error)
    return null
  }
  adoptMaterials([dto])
  // Simulación local de un estudiante interesado (pasa al servidor en la etapa 4).
  const others = state.users.filter((u) => u.baseRating && u.id !== me)
  const buyer = others[Math.floor(Math.random() * others.length)]
  if (buyer) {
    setState((s) => ({
      ...s,
      scheduled: [...s.scheduled, { id: uid('e'), kind: 'buyer-interest', dueAt: Date.now() + 25_000, materialId: dto.id, ownerId: me, buyerId: buyer.id, conversationId: uid('c') } as ScheduledEvent],
    }))
  }
  return dto.id
}

export async function updateMaterial(id: string, input: MaterialInput): Promise<boolean> {
  try {
    adoptMaterials([await api<MaterialDto>('PATCH', `/materials/${encodeURIComponent(id)}`, await materialBody(input))])
    return true
  } catch (error) {
    return failed(error)
  }
}

export async function setMaterialStatus(id: string, status: 'Disponible' | 'Pausado' | 'Entregado'): Promise<boolean> {
  try {
    adoptMaterials([await api<MaterialDto>('PATCH', `/materials/${encodeURIComponent(id)}/status`, { status })])
    return true
  } catch (error) {
    return failed(error)
  }
}

export async function deleteMaterial(id: string): Promise<boolean> {
  try {
    await api('DELETE', `/materials/${encodeURIComponent(id)}`)
  } catch (error) {
    return failed(error)
  }
  setState((s) => ({
    ...s,
    materials: s.materials.filter((m) => m.id !== id),
    conversations: s.conversations.filter((c) => c.materialId !== id),
    agreements: s.agreements.filter((a) => a.materialId !== id),
    scheduled: s.scheduled.filter((e) => !('materialId' in e) || e.materialId !== id),
  }))
  return true
}

export { matchesSearch }

type SavedSearchDto = { id: string; query: string; category: string; mode: string; createdAt: string }

export async function saveSearch(search: { query: string; category: string; mode: string }) {
  const me = state.sessionUserId!
  try {
    const saved = await api<SavedSearchDto>('POST', '/saved-searches', search)
    setState((s) => ({
      ...s,
      savedSearches: [...s.savedSearches.filter((x) => x.id !== saved.id), { ...search, id: saved.id, userId: me, at: Date.parse(saved.createdAt) }],
    }))
    toast('Búsqueda guardada: te avisaremos cuando alguien publique algo así.')
  } catch (error) {
    failed(error)
  }
}

export async function deleteSavedSearch(id: string) {
  try {
    await api('DELETE', `/saved-searches/${encodeURIComponent(id)}`)
  } catch (error) {
    // Si ya no existía en el servidor, igual se quita de la caché.
    if (!(error instanceof ApiError && error.status === 404)) return void failed(error)
  }
  setState((s) => ({ ...s, savedSearches: s.savedSearches.filter((x) => x.id !== id) }))
}

export async function reportMaterial(materialId: string, reason: string, detail: string): Promise<boolean> {
  const me = state.sessionUserId!
  try {
    await api('POST', '/reports', { materialId, reason, detail })
  } catch (error) {
    return failed(error)
  }
  // Se guarda en la caché para seguir ocultando el material en Explorar.
  setState((s) => ({ ...s, reports: [...s.reports, { id: uid('r'), materialId, userId: me, reason, detail, at: Date.now() }] }))
  toast('Gracias por avisar. La moderación revisará la publicación.')
  return true
}

/* ---------- conversations ---------- */

export function openConversation(materialId: string, otherId?: string) {
  const me = state.sessionUserId!
  const material = materialById(state, materialId)!
  const partner = otherId ?? material.ownerId
  const existing = state.conversations.find((c) => c.materialId === materialId && c.participants.includes(me) && c.participants.includes(partner))
  if (existing) return existing.id
  const conversation: Conversation = { id: uid('c'), materialId, participants: [me, partner], messages: [], readAt: { [me]: Date.now() } }
  setState((s) => ({ ...s, conversations: [...s.conversations, conversation] }))
  return conversation.id
}

function pushMessage(s: State, conversationId: string, from: string, text: string): State {
  return {
    ...s,
    conversations: s.conversations.map((c) =>
      c.id === conversationId ? { ...c, messages: [...c.messages, { id: uid('msg'), from, text, at: Date.now() }] } : c,
    ),
  }
}

const isSimulated = (userId: string) => Boolean(userById(state, userId)?.baseRating)

export function sendMessage(conversationId: string, text: string) {
  const me = state.sessionUserId!
  const conversation = state.conversations.find((c) => c.id === conversationId)
  if (!conversation || !text.trim()) return
  const other = conversation.participants.find((p) => p !== me)!
  const material = materialById(state, conversation.materialId)!
  setState((s) => {
    let next = pushMessage(s, conversationId, me, text.trim())
    next = { ...next, conversations: next.conversations.map((c) => (c.id === conversationId ? { ...c, readAt: { ...c.readAt, [me]: Date.now() } } : c)) }
    if (isSimulated(other)) {
      const reply = material.ownerId === other ? simulatedReply(text, material) : buyerReply(conversation)
      next.scheduled = [...next.scheduled, { id: uid('e'), kind: 'reply', dueAt: Date.now() + 1800 + Math.random() * 1500, conversationId, from: other, text: reply }]
    }
    return next
  })
}

function buyerReply(conversation: Conversation) {
  const sent = conversation.messages.filter((m) => m.from !== state.sessionUserId).length
  return sent < 2 ? '¡Genial! ¿Te parece mañana a las 12:30 en la biblioteca central?' : 'Perfecto, ahí nos vemos. ¡Gracias! 🙌'
}

export function markConversationRead(conversationId: string) {
  const me = state.sessionUserId!
  setState((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, readAt: { ...c.readAt, [me]: Date.now() } } : c)) }))
}

/* ---------- agreements ---------- */

export function proposeAgreement(input: { materialId: string; place: string; date: string; time: string; note: string }) {
  const me = state.sessionUserId!
  const material = materialById(state, input.materialId)!
  const conversationId = openConversation(input.materialId)
  const agreement: Agreement = {
    id: uid('a'), materialId: material.id, buyerId: me, sellerId: material.ownerId,
    place: input.place, date: input.date, time: input.time, note: input.note.trim() || undefined,
    status: 'Pendiente', createdAt: Date.now(), updatedAt: Date.now(),
  }
  setState((s) => {
    let next = pushMessage(s, conversationId, me, `📍 Propuesta de entrega: ${input.place}, ${formatDate(input.date)} a las ${formatTime(input.time)}.${agreement.note ? ` Nota: ${agreement.note}` : ''}`)
    next = { ...next, agreements: [...next.agreements, agreement] }
    if (isSimulated(material.ownerId))
      next.scheduled = [...next.scheduled, { id: uid('e'), kind: 'confirm-agreement', dueAt: Date.now() + 4000, agreementId: agreement.id }]
    return next
  })
  return agreement.id
}

function updateAgreement(id: string, patch: Partial<Agreement>) {
  setState((s) => ({ ...s, agreements: s.agreements.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)) }))
}

export function cancelAgreement(id: string) {
  const agreement = state.agreements.find((a) => a.id === id)!
  updateAgreement(id, { status: 'Cancelado' })
  const material = materialById(state, agreement.materialId)
  if (material?.status === 'Reservado') setMaterialStatus(material.id, 'Disponible')
  toast('Acuerdo cancelado. Avisamos al otro estudiante.')
}

export function confirmReception(id: string) {
  const agreement = state.agreements.find((a) => a.id === id)!
  updateAgreement(id, { status: 'Completado' })
  setMaterialStatus(agreement.materialId, 'Entregado')
}

export function rateAgreement(id: string, stars: number, comment: string) {
  updateAgreement(id, { rating: { stars, comment: comment.trim(), at: Date.now() } })
  toast('¡Gracias! Tu valoración ayuda a otros estudiantes.')
}

/* ---------- notifications ---------- */

export function markNotificationsRead() {
  const me = state.sessionUserId
  setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === me ? { ...n, read: true } : n)) }))
}

/* ---------- simulated events ---------- */

export function processScheduled(now = Date.now()) {
  const due = state.scheduled.filter((e) => e.dueAt <= now)
  if (!due.length) return
  setState((s) => {
    let next: State = { ...s, scheduled: s.scheduled.filter((e) => e.dueAt > now) }
    for (const event of due) next = applyEvent(next, event)
    return next
  })
}

type Notice = { userId: string; text: string; link: string }

function interestedBuyer(s: State, event: Extract<ScheduledEvent, { kind: 'buyer-interest' }>) {
  const chosen = event.buyerId && userById(s, event.buyerId)
  if (chosen) return chosen
  const candidates = s.users.filter((u) => u.baseRating && u.id !== event.ownerId)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** What the notification of a simulated event will say, or null if the event no longer applies. */
export function eventNotice(s: State, event: ScheduledEvent): Notice | null {
  if (event.kind === 'reply') {
    const conversation = s.conversations.find((c) => c.id === event.conversationId)
    if (!conversation) return null
    const sender = userById(s, event.from)
    return {
      userId: conversation.participants.find((p) => p !== event.from)!,
      link: `#/chat/${conversation.id}`,
      text: `${sender?.name.split(' ')[0]} te respondió: “${event.text}”`,
    }
  }
  if (event.kind === 'confirm-agreement') {
    const agreement = s.agreements.find((a) => a.id === event.agreementId)
    if (!agreement || agreement.status !== 'Pendiente') return null
    const seller = userById(s, agreement.sellerId)
    return { userId: agreement.buyerId, link: `#/acuerdo/${agreement.id}`, text: `${seller?.name.split(' ')[0]} confirmó la entrega en ${agreement.place}.` }
  }
  const material = s.materials.find((m) => m.id === event.materialId)
  if (!material || material.status !== 'Disponible' || !event.conversationId) return null
  const buyer = interestedBuyer(s, event)
  return {
    userId: event.ownerId,
    link: `#/chat/${event.conversationId}`,
    text: `${buyer.name.split(' ')[0]} está interesado/a en “${material.title}”.`,
  }
}

/** Notifications made by an event share its id, so a background alert isn't repeated in the app. */
export const noticeId = (event: ScheduledEvent) => `n-${event.id}`

function applyEvent(s: State, event: ScheduledEvent): State {
  // Events saved before conversation ids were chosen up front.
  if (event.kind === 'buyer-interest' && !event.conversationId) event = { ...event, conversationId: uid('c') }
  const notice = eventNotice(s, event)
  if (!notice) return s
  const withNotice = (next: State): State => ({
    ...next,
    notifications: [...next.notifications, { id: noticeId(event), read: false, at: Date.now(), ...notice }],
  })
  if (event.kind === 'reply') return withNotice(pushMessage(s, event.conversationId, event.from, event.text))
  if (event.kind === 'confirm-agreement') {
    const agreement = s.agreements.find((a) => a.id === event.agreementId)!
    const conversation = s.conversations.find((c) => c.materialId === agreement.materialId && c.participants.includes(agreement.buyerId) && c.participants.includes(agreement.sellerId))
    let next: State = {
      ...s,
      agreements: s.agreements.map((a) => (a.id === agreement.id ? { ...a, status: 'Confirmado', updatedAt: Date.now() } : a)),
      materials: s.materials.map((m) => (m.id === agreement.materialId ? { ...m, status: 'Reservado' } : m)),
    }
    if (conversation) next = pushMessage(next, conversation.id, agreement.sellerId, '✅ ¡Confirmado! Nos vemos ahí. Llevaré el material.')
    return withNotice(next)
  }
  const material = s.materials.find((m) => m.id === event.materialId)!
  const buyer = interestedBuyer(s, event)
  const text = material.mode === 'Donación'
    ? `¡Hola! Me serviría mucho ${material.title}. ¿Aún lo estás donando?`
    : `¡Hola! Me interesa ${material.title}. ¿Sigue disponible?`
  const conversation: Conversation = {
    id: event.conversationId!, materialId: material.id, participants: [buyer.id, event.ownerId], readAt: {},
    messages: [{ id: uid('msg'), from: buyer.id, text, at: Date.now() }],
  }
  return withNotice({ ...s, conversations: [...s.conversations, conversation] })
}

/* ---------- formatting ---------- */

import { formatDate, formatTime } from '../../shared/format'
export { formatDate, formatTime }

export function timeAgo(at: number) {
  const diff = Math.max(0, Date.now() - at) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  const days = Math.floor(diff / 86400)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

export const priceLabel = (m: Pick<Material, 'mode' | 'price'>) => (m.mode === 'Venta' ? `S/ ${m.price}` : m.mode)

export function toISODate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
