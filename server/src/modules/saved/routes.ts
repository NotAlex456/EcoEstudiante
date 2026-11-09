import { Router } from 'express'
import { z } from 'zod'
import { CATEGORIES, MODES } from '../../../../shared/constants'
import type { Config } from '../../config'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import * as saved from './service'

const searchSchema = z
  .object({
    query: z.string().trim().max(80),
    category: z.enum(['Todos', ...CATEGORIES], 'Elige una categoría de la lista.'),
    mode: z.enum(['Todos', ...MODES], 'Elige una modalidad de la lista.'),
  })
  .strict()

/** /api/saved (materiales guardados) */
export function savedRoutes(config: Config) {
  const router = Router()
  router.use(requireAuth(config))

  router.get('/', async (req, res) => {
    res.json(await saved.listSaved(currentUserId(req)))
  })
  router.put('/:materialId', async (req, res) => {
    await saved.save(currentUserId(req), String(req.params.materialId))
    res.status(204).end()
  })
  router.delete('/:materialId', async (req, res) => {
    await saved.unsave(currentUserId(req), String(req.params.materialId))
    res.status(204).end()
  })
  return router
}

/** /api/saved-searches (alertas de búsqueda) */
export function savedSearchRoutes(config: Config) {
  const router = Router()
  router.use(requireAuth(config))

  router.get('/', async (req, res) => {
    res.json(await saved.listSearches(currentUserId(req)))
  })
  router.post('/', body(searchSchema), async (req, res) => {
    const [search, created] = await saved.addSearch(currentUserId(req), req.body)
    res.status(created ? 201 : 200).json(search)
  })
  router.delete('/:id', async (req, res) => {
    await saved.removeSearch(currentUserId(req), String(req.params.id))
    res.status(204).end()
  })
  return router
}
