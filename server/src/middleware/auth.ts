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

/** Exige `Authorization: Bearer <token>` de un usuario existente y verificado. */
export function requireAuth(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    const userId = scheme === 'Bearer' && token ? verifyToken(token, config.jwtSecret) : null
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, verified: true } }) : null
    if (!user?.verified) return next(unauthenticated())
    req.user = { id: user.id }
    next()
  }
}

/** Id del usuario autenticado (solo en rutas protegidas por requireAuth). */
export const currentUserId = (req: Express.Request) => {
  if (!req.user) throw unauthenticated()
  return req.user.id
}
