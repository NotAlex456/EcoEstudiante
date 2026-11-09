import cors from 'cors'
import express from 'express'
import type { Config } from './config'
import { errorHandler, notFound } from './errors'
import { createMailer, type Mailer } from './integrations/mail'

export type AppDeps = { mailer: Mailer }

export function createApp(config: Config, deps: Partial<AppDeps> = {}) {
  const { mailer = createMailer(config) } = deps
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use((_req, _res, next) => next(notFound()))
  app.use(errorHandler)
  return app
}
