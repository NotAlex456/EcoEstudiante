import { Router } from 'express'
import { z } from 'zod'
import type { Hub } from '../../hub'
import type { ImageStorage } from '../../integrations/images'
import { currentUserId, requireAdmin } from '../../middleware/auth'
import { body } from '../../validate'
import { adminService } from './service'

const page = z.coerce.number().int().min(1).catch(1)
const materialsQuery = z.object({
  q: z.string().trim().optional().catch(undefined),
  status: z.enum(['Disponible', 'Reservado', 'Entregado', 'Pausado', 'Eliminado']).optional().catch(undefined),
  page,
})
const usersQuery = z.object({ q: z.string().trim().optional().catch(undefined), page })
const reasonSchema = z.object({ reason: z.string().trim().max(200).optional() }).strict()
const resolveSchema = z.object({ action: z.enum(['hidden', 'dismissed'], 'Elige ocultar o descartar.') }).strict()

/** API del panel de administración. Todo exige una sesión con rol admin (403 si no). */
export function adminRoutes(hub: Hub, images: ImageStorage) {
  const router = Router()
  const admin = adminService(hub, images)
  router.use(requireAdmin(hub.config))

  router.get('/stats', async (_req, res) => {
    res.json(await admin.stats())
  })

  router.get('/materials', async (req, res) => {
    const q = materialsQuery.parse(req.query)
    res.json(await admin.materials({ q: q.q || undefined, status: q.status, page: q.page }))
  })
  router.post('/materials/:id/hide', body(reasonSchema), async (req, res) => {
    await admin.hideMaterial(currentUserId(req), String(req.params.id), req.body.reason)
    res.json({ ok: true })
  })
  router.post('/materials/:id/restore', async (req, res) => {
    await admin.restoreMaterial(currentUserId(req), String(req.params.id))
    res.json({ ok: true })
  })
  router.delete('/materials/:id', async (req, res) => {
    await admin.deleteMaterial(currentUserId(req), String(req.params.id))
    res.status(204).end()
  })

  router.get('/reports', async (req, res) => {
    res.json(await admin.reports(req.query.status === 'resolved' ? 'resolved' : 'pending'))
  })
  router.post('/reports/:id/resolve', body(resolveSchema), async (req, res) => {
    await admin.resolveReport(currentUserId(req), String(req.params.id), req.body.action)
    res.json({ ok: true })
  })

  router.get('/users', async (req, res) => {
    const q = usersQuery.parse(req.query)
    res.json(await admin.users({ q: q.q || undefined, page: q.page }))
  })
  router.post('/users/:id/block', body(reasonSchema), async (req, res) => {
    await admin.blockUser(currentUserId(req), String(req.params.id), req.body.reason)
    res.json({ ok: true })
  })
  router.post('/users/:id/unblock', async (req, res) => {
    await admin.unblockUser(currentUserId(req), String(req.params.id))
    res.json({ ok: true })
  })

  router.get('/log', async (_req, res) => {
    res.json(await admin.moderationLog())
  })

  return router
}
