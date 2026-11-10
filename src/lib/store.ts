import { useSyncExternalStore } from 'react'
import { api, ApiError, getToken, setToken } from './api'
import { createSeedState, STATE_VERSION } from './data'
import { uploadImages } from './images'
import {
  adoptAgreement,
  adoptConversations,
  adoptMaterials,
  adoptMessage,
  loadConversations,
  setCachedMaterialStatus,
  type AgreementDto,
  type ConversationDto,
  type MaterialDto,
  type MessageDto,
} from './sync'
import type { Conversation, Material, State, User } from './types'

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

/**
 * Reputación: solo la que calcula el servidor con las reseñas recibidas. Las valoraciones de
 * acuerdos ya son reseñas del servidor; sumarlas aquí las contaría dos veces.
 */
export function userRating(s: State, userId: string) {
  return userById(s, userId)?.rating ?? { value: 0, count: 0 }
}

/** No leídos: el conteo del servidor (que el socket va sumando) o, si no llegó, lo que hay en caché. */
export function unreadCount(_s: State, conversation: Conversation, userId: string) {
  if (conversation.unread !== undefined) return conversation.unread
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
  // Conserva la reputación que ya trajo el perfil (el servidor la calcula aparte).
  setState((s) => ({ ...s, sessionUserId: user.id, users: [...s.users.filter((u) => u.id !== user.id), { ...user, rating: userById(s, user.id)?.rating }] }))
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

/* ---------- conversations (servidor) ---------- */

/** Abre (o reutiliza) el chat con quien publicó. Devuelve su id, o null si falló (el error ya se mostró). */
export async function openConversation(materialId: string): Promise<string | null> {
  try {
    const dto = await api<ConversationDto>('POST', '/conversations', { materialId })
    adoptConversations([dto])
    return dto.id
  } catch (error) {
    failed(error)
    return null
  }
}

export async function sendMessage(conversationId: string, text: string): Promise<boolean> {
  const me = state.sessionUserId!
  try {
    const message = await api<MessageDto>('POST', `/conversations/${encodeURIComponent(conversationId)}/messages`, { text: text.trim() })
    adoptMessage(conversationId, message)
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, readAt: { ...c.readAt, [me]: Date.parse(message.createdAt) } } : c)),
    }))
    return true
  } catch (error) {
    return failed(error)
  }
}

/** Marca el chat como leído (en la caché al instante; en el servidor sin esperar). */
export function markConversationRead(conversationId: string) {
  const me = state.sessionUserId!
  const conversation = state.conversations.find((c) => c.id === conversationId)
  if (!conversation) return
  const last = conversation.messages.at(-1)
  if (!conversation.unread && (!last || last.from === me || (conversation.readAt[me] ?? 0) >= last.at)) return
  setState((s) => ({
    ...s,
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0, readAt: { ...c.readAt, [me]: Date.now() } } : c)),
  }))
  api('POST', `/conversations/${encodeURIComponent(conversationId)}/read`).catch(() => undefined)
}

/* ---------- agreements (servidor) ---------- */

/** Aplica la respuesta del servidor y, si cambió, el estado del material en la caché. */
function applyAgreement(dto: AgreementDto, materialStatus?: Material['status']) {
  adoptAgreement(dto)
  if (materialStatus) setCachedMaterialStatus(dto.materialId, materialStatus)
}

export async function proposeAgreement(input: { materialId: string; place: string; date: string; time: string; note: string }): Promise<string | null> {
  try {
    const dto = await api<AgreementDto>('POST', '/agreements', { ...input, note: input.note.trim() || undefined })
    applyAgreement(dto)
    // El mensaje de propuesta quedó en el chat: se trae la conversación (por si era nueva).
    loadConversations().catch(() => undefined)
    return dto.id
  } catch (error) {
    failed(error)
    return null
  }
}

async function agreementAction(id: string, action: string, body?: unknown, materialStatus?: Material['status']) {
  try {
    applyAgreement(await api<AgreementDto>('POST', `/agreements/${encodeURIComponent(id)}/${action}`, body), materialStatus)
    return true
  } catch (error) {
    return failed(error)
  }
}

/** El vendedor confirma la propuesta: el material queda Reservado. */
export async function confirmAgreement(id: string) {
  const ok = await agreementAction(id, 'confirm', undefined, 'Reservado')
  if (ok) toast('Entrega confirmada. Avisamos al otro estudiante.')
  return ok
}

export async function cancelAgreement(id: string) {
  const agreement = state.agreements.find((a) => a.id === id)
  const freed = agreement?.status === 'Confirmado' ? 'Disponible' : undefined
  const ok = await agreementAction(id, 'cancel', undefined, freed)
  if (ok) toast('Acuerdo cancelado. Avisamos al otro estudiante.')
  return ok
}

export async function confirmReception(id: string) {
  return agreementAction(id, 'complete', undefined, 'Entregado')
}

export async function rateAgreement(id: string, stars: number, comment: string) {
  const ok = await agreementAction(id, 'review', { stars, comment: comment.trim() })
  if (ok) toast('¡Gracias! Tu valoración ayuda a otros estudiantes.')
  return ok
}

/* ---------- notifications (servidor) ---------- */

export function markNotificationsRead() {
  const me = state.sessionUserId
  if (!state.notifications.some((n) => n.userId === me && !n.read)) return
  setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === me ? { ...n, read: true } : n)) }))
  api('POST', '/notifications/read-all').catch(() => undefined)
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
