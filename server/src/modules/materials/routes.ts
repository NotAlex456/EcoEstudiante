import { Router } from 'express'
import type { Config } from '../../config'
import type { Hub } from '../../hub'
import { AppError } from '../../errors'
import type { ImageStorage } from '../../integrations/images'
import { currentUserId, optionalAuth, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { listQuerySchema, materialSchema, statusSchema } from './schemas'
import * as materials from './service'

export function materialRoutes(hub: Hub, images: ImageStorage) {
  const router = Router()
  const auth = requireAuth(hub.config)

  router.get('/', async (req, res) => {
    const query = listQuerySchema.safeParse(req.query)
    if (!query.success) throw new AppError(400, 'VALIDATION', 'Revisa los filtros de búsqueda.')
    res.json(await materials.list(query.data))
  })

  router.get('/:id', optionalAuth(hub.config), async (req, res) => {
    res.json(await materials.getVisible(String(req.params.id), req.user?.id))
  })

  router.post('/', auth, body(materialSchema), async (req, res) => {
    res.status(201).json(await materials.create(currentUserId(req), req.body, images, hub.notifier))
  })

  router.patch('/:id', auth, body(materialSchema), async (req, res) => {
    res.json(await materials.update(String(req.params.id), currentUserId(req), req.body, images))
  })

  router.patch('/:id/status', auth, body(statusSchema), async (req, res) => {
    const material = await materials.setStatus(String(req.params.id), currentUserId(req), req.body.status)
    await materials.emitMaterialUpdated(hub.realtime, material.id, material.status)
    res.json(material)
  })

  router.delete('/:id', auth, async (req, res) => {
    await materials.remove(String(req.params.id), currentUserId(req), images)
    // Si quedó como Eliminado (tenía historial), avisa a quienes conversaban; si se borró, no hay a quién.
    await materials.emitMaterialUpdated(hub.realtime, String(req.params.id), 'Eliminado')
    res.status(204).end()
  })

  return router
}

/** GET /api/users/me/materials (se monta en el router de usuarios). */
export function myMaterialsRoute(config: Config) {
  const router = Router()
  router.get('/me/materials', requireAuth(config), async (req, res) => {
    res.json(await materials.listMine(currentUserId(req)))
  })
  return router
}
