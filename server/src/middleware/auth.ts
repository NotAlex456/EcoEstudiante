import type { RequestHandler } from 'express'
import type { Config } from '../config'
import { prisma } from '../db'
import { AppError } from '../errors'
import { verifyToken } from '../modules/auth/tokens'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string }
    }
  }
}

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Tu sesión expiró. Vuelve a ingresar.')

/** Id de un usuario verificado según el encabezado Authorization, o null. */
async function authenticatedUserId(header: string | undefined, secret: string) {
  const [scheme, token] = (header ?? '').split(' ')
  const userId = scheme === 'Bearer' && token ? verifyToken(token, secret) : null
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, verified: true } }) : null
  return user?.verified ? user.id : null
}

/** Exige `Authorization: Bearer <token>` de un usuario existente y verificado. */
export function requireAuth(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const id = await authenticatedUserId(req.headers.authorization, config.jwtSecret)
    if (!id) return next(unauthenticated())
    req.user = { id }
    next()
  }
}

/** Para rutas públicas: identifica al usuario si hay un token válido; si no, sigue como anónimo. */
export function optionalAuth(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const id = await authenticatedUserId(req.headers.authorization, config.jwtSecret)
    if (id) req.user = { id }
    next()
  }
}

/** Id del usuario autenticado (solo en rutas protegidas por requireAuth). */
export const currentUserId = (req: Express.Request) => {
  if (!req.user) throw unauthenticated()
  return req.user.id
}
