import { Router } from 'express'
import type { Hub } from '../../hub'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { proposeSchema, reviewSchema } from './schemas'
import { agreementService } from './service'

export function agreementRoutes(hub: Hub) {
  const router = Router()
  const service = agreementService(hub)
  router.use(requireAuth(hub.config))

  router.get('/', async (req, res) => {
    res.json(await service.list(currentUserId(req)))
  })
  router.post('/', body(proposeSchema), async (req, res) => {
    res.status(201).json(await service.propose(currentUserId(req), req.body))
  })
  router.post('/:id/confirm', async (req, res) => {
    res.json(await service.confirm(String(req.params.id), currentUserId(req)))
  })
  router.post('/:id/cancel', async (req, res) => {
    res.json(await service.cancel(String(req.params.id), currentUserId(req)))
  })
  router.post('/:id/complete', async (req, res) => {
    res.json(await service.complete(String(req.params.id), currentUserId(req)))
  })
  router.post('/:id/review', body(reviewSchema), async (req, res) => {
    res.status(201).json(await service.review(String(req.params.id), currentUserId(req), req.body))
  })

  return router
}
