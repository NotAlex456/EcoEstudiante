import { Router } from 'express'
import type { Hub } from '../../hub'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { deleteAccountService } from './delete'
import { deleteMeSchema, updateMeSchema } from './schemas'
import * as users from './service'

export function userRoutes(hub: Hub) {
  const { config } = hub
  const router = Router()
  const accounts = deleteAccountService(hub)

  router.patch('/me', requireAuth(config), body(updateMeSchema), async (req, res) => {
    res.json(await users.updateMe(currentUserId(req), req.body))
  })

  // Eliminar mi cuenta: pide la contraseña para confirmar.
  router.delete('/me', requireAuth(config), body(deleteMeSchema), async (req, res) => {
    await accounts.deleteAccount(currentUserId(req), req.body.password)
    res.status(204).end()
  })

  router.get('/:id', async (req, res) => {
    res.json(await users.getPublicUser(String(req.params.id)))
  })

  return router
}
