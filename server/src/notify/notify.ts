import type { Notification, NotificationCategory } from '@prisma/client'
import { prisma } from '../db'
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
}

/**
 * Único camino para avisar a alguien: guarda el aviso y, si la persona tiene activa esa
 * categoría, lo envía en vivo. (El push con la app cerrada se agrega en la etapa 5.)
 */
export function createNotifier(realtime: Realtime): Notifier {
  return {
    async notify(userId, n) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBot: true, notificationPrefs: true } })
      if (!user) return
      const row = await prisma.notification.create({ data: { userId, ...n } })
      if (user.isBot) return
      const prefs = user.notificationPrefs as NotificationPrefs | null
      if (prefs?.categories?.[n.category] === false) return
      realtime.emitToUser(userId, 'notification:new', toNotificationDto(row))
    },
  }
}
