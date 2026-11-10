import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config'
import { errorHandler, notFound } from './errors'
import { createImageStorage, type ImageStorage } from './integrations/images'
import { createMailer, type Mailer } from './integrations/mail'
import { createPushSender, type PushSender } from './integrations/push'
import { createNotifier, type Notifier } from './notify/notify'
import { nullRealtime, type Realtime } from './realtime/socket'
import { authRoutes } from './modules/auth/routes'
import { adminRoutes } from './modules/admin/routes'
import { agreementRoutes } from './modules/agreements/routes'
import { deviceRoutes } from './modules/devices/routes'
import { conversationRoutes } from './modules/conversations/routes'
import { materialRoutes, myMaterialsRoute } from './modules/materials/routes'
import { notificationRoutes } from './modules/notifications/routes'
import { reportRoutes } from './modules/reports/routes'
import { savedRoutes, savedSearchRoutes } from './modules/saved/routes'
import { uploadRoutes } from './modules/uploads/routes'
import { userRoutes } from './modules/users/routes'

export type AppDeps = { mailer: Mailer; images: ImageStorage; realtime: Realtime; notifier: Notifier; push: PushSender }

export function createApp(config: Config, deps: Partial<AppDeps> = {}) {
  const { mailer = createMailer(config), images = createImageStorage(config), realtime = nullRealtime } = deps
  const push = deps.push ?? createPushSender(config)
  const notifier = deps.notifier ?? createNotifier({ realtime, push })
  const hub = { config, realtime, notifier }
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRoutes({ config, mailer, notifier, realtime }))
  app.use('/api/users', myMaterialsRoute(config), userRoutes(config))
  app.use('/api/uploads', uploadRoutes(config, images))
  app.use('/api/materials', materialRoutes(hub, images))
  app.use('/api/saved', savedRoutes(config))
  app.use('/api/saved-searches', savedSearchRoutes(config))
  app.use('/api/reports', reportRoutes(config))
  app.use('/api/notifications', notificationRoutes(config))
  app.use('/api/conversations', conversationRoutes(hub))
  app.use('/api/agreements', agreementRoutes(hub))
  app.use('/api/devices', deviceRoutes(hub, push))
  app.use('/api/admin', adminRoutes(hub, images))

  // Fotos guardadas en disco (solo cuando no hay Cloudinary).
  if (images.mode === 'local') {
    app.use('/uploads', express.static(config.uploadsDir, { index: false, dotfiles: 'deny', maxAge: '7d' }))
  }

  // Panel de administración: una página aparte (server/admin-web), compilada en dist-admin.
  if (fs.existsSync(path.join(config.adminDir, 'index.html'))) {
    const noFrames: express.RequestHandler = (_req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY')
      next()
    }
    const page = (res: express.Response) => res.setHeader('Cache-Control', 'no-cache')
    app.use(
      '/admin',
      noFrames,
      express.static(config.adminDir, {
        index: 'index.html',
        // Tras cada despliegue cambian los nombres de los archivos: la página se revisa siempre y los archivos
        // (con huella en el nombre) se guardan un año.
        setHeaders: (res, file) =>
          file.endsWith('index.html') ? page(res) : res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
      }),
    )
    // Rutas internas del panel (/admin/usuarios…) devuelven su página; un archivo que no existe, 404.
    app.get('/admin/*rest', noFrames, (req, res, next) => {
      if (path.extname(req.path)) return next()
      page(res)
      res.sendFile(path.join(config.adminDir, 'index.html'))
    })
  }

  app.use((_req, _res, next) => next(notFound()))
  app.use(errorHandler)
  return app
}
