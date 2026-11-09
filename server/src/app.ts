import cors from 'cors'
import express from 'express'
import type { Config } from './config'
import { errorHandler, notFound } from './errors'
import { createImageStorage, type ImageStorage } from './integrations/images'
import { createMailer, type Mailer } from './integrations/mail'
import { authRoutes } from './modules/auth/routes'
import { materialRoutes } from './modules/materials/routes'
import { uploadRoutes } from './modules/uploads/routes'
import { userRoutes } from './modules/users/routes'

export type AppDeps = { mailer: Mailer; images: ImageStorage }

export function createApp(config: Config, deps: Partial<AppDeps> = {}) {
  const { mailer = createMailer(config), images = createImageStorage(config) } = deps
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRoutes({ config, mailer }))
  app.use('/api/users', userRoutes(config))
  app.use('/api/uploads', uploadRoutes(config, images))
  app.use('/api/materials', materialRoutes(config, images))

  // Fotos guardadas en disco (solo cuando no hay Cloudinary).
  if (images.mode === 'local') {
    app.use('/uploads', express.static(config.uploadsDir, { index: false, dotfiles: 'deny', maxAge: '7d' }))
  }

  app.use((_req, _res, next) => next(notFound()))
  app.use(errorHandler)
  return app
}
