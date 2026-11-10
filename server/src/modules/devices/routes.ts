import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import type { PushSender } from '../../integrations/push'
import { currentUserId, requireAuth } from '../../middleware/auth'
import { body } from '../../validate'

const deviceSchema = z
  .object({
    token: z.string().min(1).max(4096),
    platform: z.enum(['android', 'web'], 'La plataforma debe ser android o web.'),
  })
  .strict()

const TEST_DELAY_MS = 10_000

/** Celulares que reciben push. Un token es de un solo usuario: si otra cuenta lo registra, pasa a ella. */
export function deviceRoutes(hub: Hub, push: PushSender) {
  const router = Router()
  router.use(requireAuth(hub.config))

  router.post('/', body(deviceSchema), async (req, res) => {
    const userId = currentUserId(req)
    const { token, platform } = req.body as z.infer<typeof deviceSchema>
    await prisma.deviceToken.upsert({ where: { token }, update: { userId, platform }, create: { token, userId, platform } })
    res.status(204).end()
  })

  // Solo borra un token propio; con uno ajeno no hace nada (y no revela si existe).
  router.delete('/:token', async (req, res) => {
    await prisma.deviceToken.deleteMany({ where: { token: String(req.params.token), userId: currentUserId(req) } })
    res.status(204).end()
  })

  /** Para probar con la app cerrada: a los 10 s envía un push a mis celulares, esté o no conectado. */
  router.post('/test', async (req, res) => {
    const userId = currentUserId(req)
    // Mejor decirlo ahora que prometer un aviso que nunca llegará.
    if (push.mode === 'off') throw new AppError(503, 'PUSH_OFF', 'Los avisos con la app cerrada no están activos en el servidor.')
    if (!(await prisma.deviceToken.count({ where: { userId } })))
      throw new AppError(409, 'NO_DEVICES', 'Este celular aún no está registrado para avisos. Permite las notificaciones y vuelve a intentarlo.')
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } })
          await push.send(
            devices.map((d) => d.token),
            { title: 'EcoEstudiante', body: 'Así te avisaremos cuando EcoEstudiante esté cerrada.', link: '#/cuenta/notificaciones' },
          )
        } catch (error) {
          console.error('No se pudo enviar el push de prueba:', error)
        }
      })()
    }, TEST_DELAY_MS)
    timer.unref() // no impide apagar el servidor
    res.status(202).json({ ok: true })
  })

  return router
}
