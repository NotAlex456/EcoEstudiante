import type http from 'node:http'
import { Server } from 'socket.io'
import type { Config } from '../config'
import { sessionUser } from '../middleware/auth'

/** Eventos que el servidor envía. Los clientes nunca escriben por el socket. */
export type ServerEvent = 'message:new' | 'conversation:read' | 'agreement:updated' | 'material:updated' | 'notification:new'

export type Realtime = {
  emitToUser(userId: string, event: ServerEvent, payload: unknown): void
  isOnline(userId: string): Promise<boolean>
  /** Corta todas las conexiones en vivo de un usuario (al bloquearlo). */
  disconnectUser(userId: string): void
  close(): Promise<void>
}

const room = (userId: string) => `user:${userId}`

/** Socket.IO en el mismo servidor HTTP que la API. Cada usuario escucha en su sala `user:<id>`. */
export function createRealtime(server: http.Server, config: Config): Realtime {
  const io = new Server(server, { cors: { origin: config.corsOrigins } })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    // Mismas reglas que la API: verificado, no bloqueado y con la versión de token actual.
    const user = typeof token === 'string' ? await sessionUser(token, config.jwtSecret).catch(() => null) : null
    if (!user) return next(new Error('UNAUTHENTICATED'))
    socket.data.userId = user.id
    next()
  })

  io.on('connection', (socket) => {
    void socket.join(room(socket.data.userId))
  })

  return {
    emitToUser: (userId, event, payload) => {
      io.to(room(userId)).emit(event, payload)
    },
    isOnline: async (userId) => (await io.in(room(userId)).fetchSockets()).length > 0,
    disconnectUser: (userId) => {
      io.in(room(userId)).disconnectSockets(true)
    },
    close: () => new Promise((resolve) => void io.close(() => resolve())),
  }
}

/** Para pruebas y para cuando no hay servidor HTTP: no emite nada. */
export const nullRealtime: Realtime = {
  emitToUser: () => {},
  isOnline: async () => false,
  disconnectUser: () => {},
  close: async () => {},
}
