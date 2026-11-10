/**
 * Conexión en vivo con el servidor (Socket.IO). Solo escucha: todo lo que la app cambia va por la API.
 * Cada evento actualiza la caché; al reconectarse (p. ej. tras reiniciar el servidor) se vuelve a
 * sincronizar todo para no perder nada de lo que pasó mientras tanto.
 */
import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'
import {
  adoptAgreement,
  adoptLiveNotification,
  adoptMessage,
  loadMessages,
  setCachedMaterialStatus,
  syncAll,
  type AgreementDto,
  type MessageDto,
  type NotificationDto,
} from './sync'
import { updateCache } from './store'
import type { Material } from './types'

let socket: Socket | null = null

export function connectSocket(token: string) {
  disconnectSocket()
  const current = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] })
  socket = current

  // En cada conexión (la primera y las reconexiones) se vuelve a sincronizar: lo que pasó antes de
  // entrar a la sala no llega por el socket. Si hay un chat abierto, también se recargan sus mensajes.
  current.on('connect', () => {
    void syncAll()
    const open = /^#\/chat\/([^/]+)$/.exec(location.hash)
    if (open) loadMessages(decodeURIComponent(open[1])).catch(() => undefined)
  })
  current.on('message:new', ({ conversationId, message }: { conversationId: string; message: MessageDto }) => {
    adoptMessage(conversationId, message)
  })
  current.on('conversation:read', ({ conversationId, userId, readAt }: { conversationId: string; userId: string; readAt: string }) => {
    updateCache((s) => ({
      ...s,
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, readAt: { ...c.readAt, [userId]: Date.parse(readAt) } } : c)),
    }))
  })
  current.on('agreement:updated', ({ agreement }: { agreement: AgreementDto }) => adoptAgreement(agreement))
  current.on('material:updated', ({ materialId, status }: { materialId: string; status: Material['status'] | 'Eliminado' }) =>
    setCachedMaterialStatus(materialId, status),
  )
  current.on('notification:new', (notification: NotificationDto) => adoptLiveNotification(notification))
}

export function disconnectSocket() {
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
}
