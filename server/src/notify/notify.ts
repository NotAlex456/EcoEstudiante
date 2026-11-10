import type { Notification, NotificationCategory } from '@prisma/client'
import { prisma } from '../db'
import { isQuietHour, type PushSender } from '../integrations/push'
import type { NotificationPrefs } from '../modules/users/dto'
import type { Realtime } from '../realtime/socket'

export type NotificationDto = {
  id: string
  category: NotificationCategory
  text: string
  link: string
  read: boolean
  createdAt: string
}

export const toNotificationDto = (n: Notification): NotificationDto => ({
  id: n.id,
  category: n.category,
  text: n.text,
  link: n.link,
  read: n.read,
  createdAt: n.createdAt.toISOString(),
})

export type Notifier = {
  notify(userId: string, n: { category: NotificationCategory; text: string; link: string }): Promise<void>
  /** Espera los push que siguen en curso (pruebas y apagado ordenado). */
  settle(): Promise<void>
}

const offPush: PushSender = { mode: 'off', send: async () => ({ invalidTokens: [] }) }

/**
 * Único camino para avisar a alguien:
 * 1. guarda el aviso (siempre);
 * 2. si la persona tiene la app abierta (socket conectado), lo envía en vivo;
 * 3. si no, le manda un push a sus celulares, salvo que lo haya apagado o sea su horario silencioso.
 * Una categoría apagada no se emite ni se envía. El push corre en segundo plano: ni un fallo ni un Firebase lento
 * demoran o rompen la acción que avisó (enviar un mensaje, confirmar una entrega…).
 */
export function createNotifier({
  realtime,
  push = offPush,
  now = () => new Date(),
}: {
  realtime: Realtime
  push?: PushSender
  now?: () => Date
}): Notifier {
  const pending = new Set<Promise<void>>()

  async function sendPush(userId: string, n: { text: string; link: string }) {
    try {
      const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true }, orderBy: { token: 'asc' } })
      if (!devices.length) return
      const { invalidTokens } = await push.send(
        devices.map((d) => d.token),
        { title: 'EcoEstudiante', body: n.text, link: n.link },
      )
      if (invalidTokens.length) await prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } })
    } catch (error) {
      console.error('No se pudo enviar el push:', error instanceof Error ? error.message : error)
    }
  }

  return {
    async settle() {
      while (pending.size) await Promise.all(pending)
    },
    async notify(userId, n) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBot: true, notificationPrefs: true } })
      if (!user) return
      const row = await prisma.notification.create({ data: { userId, ...n } })
      if (user.isBot) return
      const prefs = (user.notificationPrefs ?? {}) as Partial<NotificationPrefs>
      if (prefs.categories?.[n.category] === false) return

      if (await realtime.isOnline(userId)) {
        realtime.emitToUser(userId, 'notification:new', toNotificationDto(row))
        return
      }
      if (prefs.push === false || (prefs.quietNight && isQuietHour(now()))) return
      const job = sendPush(userId, n)
      pending.add(job)
      void job.finally(() => pending.delete(job))
    },
  }
}
