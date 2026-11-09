import { Router } from 'express'
import type { Config } from '../../config'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { updateMeSchema } from './schemas'
import * as users from './service'

export function userRoutes(config: Config) {
  const router = Router()

  router.patch('/me', requireAuth(config), body(updateMeSchema), async (req, res) => {
    res.json(await users.updateMe(currentUserId(req), req.body))
  })

  router.get('/:id', async (req, res) => {
    res.json(await users.getPublicUser(String(req.params.id)))
  })

  return router
}
