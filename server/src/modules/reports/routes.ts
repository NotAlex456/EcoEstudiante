import { Router } from 'express'
import { z } from 'zod'
import { REPORT_REASONS } from '../../../../shared/constants'
import type { Config } from '../../config'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'
import { materialNotFound } from '../materials/service'

const reportSchema = z
  .object({
    materialId: z.string().min(1),
    reason: z.enum(REPORT_REASONS as [string, ...string[]], 'Elige un motivo de la lista.'),
    detail: z.string().trim().max(500),
  })
  .strict()

/** Guarda la denuncia (una por usuario y material). La moderación las revisa fuera de la app. */
async function report(userId: string, input: z.infer<typeof reportSchema>) {
  const material = await prisma.material.findUnique({ where: { id: input.materialId }, select: { ownerId: true, status: true } })
  if (!material || material.status === 'Eliminado') throw materialNotFound()
  if (material.ownerId === userId) throw new AppError(400, 'OWN_MATERIAL', 'No puedes reportar tu propia publicación.')
  const existing = await prisma.report.findFirst({ where: { userId, materialId: input.materialId } })
  if (existing) return false
  await prisma.report.create({ data: { userId, ...input } })
  return true
}

export function reportRoutes(config: Config) {
  const router = Router()
  router.post('/', requireAuth(config), body(reportSchema), async (req, res) => {
    const created = await report(currentUserId(req), req.body)
    res.status(created ? 201 : 200).json({ ok: true })
  })
  return router
}
