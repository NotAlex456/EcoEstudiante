import { Router } from 'express'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { messageSchema, openSchema } from './schemas'
import { conversationService } from './service'

/** `?before=` opcional: una fecha ISO válida. */
function parseBefore(value: unknown) {
  if (value === undefined) return undefined
  const date = typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) throw new AppError(400, 'VALIDATION', 'La fecha de paginación no es válida.')
  return date
}

export function conversationRoutes(hub: Hub) {
  const router = Router()
  const service = conversationService(hub)
  router.use(requireAuth(hub.config))

  router.post('/', body(openSchema), async (req, res) => {
    const { conversation, created } = await service.open(req.body.materialId, currentUserId(req))
    res.status(created ? 201 : 200).json(conversation)
  })

  router.get('/', async (req, res) => {
    res.json(await service.list(currentUserId(req)))
  })

  router.get('/:id/messages', async (req, res) => {
    res.json(await service.messages(String(req.params.id), currentUserId(req), parseBefore(req.query.before)))
  })

  router.post('/:id/messages', body(messageSchema), async (req, res) => {
    res.status(201).json(await service.sendMessage(String(req.params.id), currentUserId(req), req.body.text))
  })

  router.post('/:id/read', async (req, res) => {
    await service.markRead(String(req.params.id), currentUserId(req))
    res.status(204).end()
  })

  return router
}
