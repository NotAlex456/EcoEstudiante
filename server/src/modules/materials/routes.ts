import { Router } from 'express'
import type { Config } from '../../config'
import { AppError } from '../../errors'
import type { ImageStorage } from '../../integrations/images'
import { currentUserId, optionalAuth, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { listQuerySchema, materialSchema } from './schemas'
import * as materials from './service'

export function materialRoutes(config: Config, images: ImageStorage) {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = listQuerySchema.safeParse(req.query)
    if (!query.success) throw new AppError(400, 'VALIDATION', 'Revisa los filtros de búsqueda.')
    res.json(await materials.list(query.data))
  })

  router.get('/:id', optionalAuth(config), async (req, res) => {
    res.json(await materials.getVisible(String(req.params.id), req.user?.id))
  })

  router.post('/', requireAuth(config), body(materialSchema), async (req, res) => {
    res.status(201).json(await materials.create(currentUserId(req), req.body, images))
  })

  return router
}
