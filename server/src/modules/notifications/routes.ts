import { Router } from 'express'
import type { Config } from '../../config'
import { prisma } from '../../db'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { toNotificationDto } from '../../notify/notify'

export function notificationRoutes(config: Config) {
  const router = Router()
  router.use(requireAuth(config))

  /** Las 100 más recientes, de más nueva a más vieja. */
  router.get('/', async (req, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: currentUserId(req) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    })
    res.json(rows.map(toNotificationDto))
  })

  router.post('/read-all', async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: currentUserId(req), read: false }, data: { read: true } })
    res.status(204).end()
  })

  return router
}
