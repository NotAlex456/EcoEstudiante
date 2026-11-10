import cors from 'cors'
import express from 'express'
import type { Config } from './config'
import { errorHandler, notFound } from './errors'
import { createImageStorage, type ImageStorage } from './integrations/images'
import { createMailer, type Mailer } from './integrations/mail'
import { createNotifier, type Notifier } from './notify/notify'
import { nullRealtime, type Realtime } from './realtime/socket'
import { authRoutes } from './modules/auth/routes'
import { conversationRoutes } from './modules/conversations/routes'
import { materialRoutes, myMaterialsRoute } from './modules/materials/routes'
import { notificationRoutes } from './modules/notifications/routes'
import { reportRoutes } from './modules/reports/routes'
import { savedRoutes, savedSearchRoutes } from './modules/saved/routes'
import { uploadRoutes } from './modules/uploads/routes'
import { userRoutes } from './modules/users/routes'

export type AppDeps = { mailer: Mailer; images: ImageStorage; realtime: Realtime; notifier: Notifier }

export function createApp(config: Config, deps: Partial<AppDeps> = {}) {
  const { mailer = createMailer(config), images = createImageStorage(config), realtime = nullRealtime } = deps
  const notifier = deps.notifier ?? createNotifier(realtime)
  const hub = { config, realtime, notifier }
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRoutes({ config, mailer, notifier }))
  app.use('/api/users', myMaterialsRoute(config), userRoutes(config))
  app.use('/api/uploads', uploadRoutes(config, images))
  app.use('/api/materials', materialRoutes(config, images, notifier))
  app.use('/api/saved', savedRoutes(config))
  app.use('/api/saved-searches', savedSearchRoutes(config))
  app.use('/api/reports', reportRoutes(config))
  app.use('/api/notifications', notificationRoutes(config))
  app.use('/api/conversations', conversationRoutes(hub))

  // Fotos guardadas en disco (solo cuando no hay Cloudinary).
  if (images.mode === 'local') {
    app.use('/uploads', express.static(config.uploadsDir, { index: false, dotfiles: 'deny', maxAge: '7d' }))
  }

  app.use((_req, _res, next) => next(notFound()))
  app.use(errorHandler)
  return app
}
