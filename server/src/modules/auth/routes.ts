import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Config } from '../../config'
import { AppError } from '../../errors'
import type { Mailer } from '../../integrations/mail'
import { body } from '../../validate'
import { loginSchema, registerSchema, resendSchema, verifySchema } from './schemas'
import * as auth from './service'

export function authRoutes(ctx: { config: Config; mailer: Mailer }) {
  const router = Router()

  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: ctx.config.authRateLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un minuto.')),
    }),
  )

  router.post('/register', body(registerSchema), async (req, res) => {
    res.status(201).json(await auth.register(req.body, ctx))
  })

  router.post('/verify', body(verifySchema), async (req, res) => {
    res.json(await auth.verify(req.body, ctx))
  })

  router.post('/resend-code', body(resendSchema), async (req, res) => {
    res.json(await auth.resendCode(req.body.userId, ctx))
  })

  router.post('/login', body(loginSchema), async (req, res) => {
    res.json(await auth.login(req.body, ctx))
  })

  return router
}
