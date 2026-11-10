import type { UserRole } from '@prisma/client'
import type { RequestHandler } from 'express'
import type { Config } from '../config'
import { prisma } from '../db'
import { AppError } from '../errors'
import { verifyToken } from '../modules/auth/tokens'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole }
    }
  }
}

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Tu sesión expiró. Vuelve a ingresar.')
const notAdmin = () => new AppError(403, 'FORBIDDEN', 'No tienes acceso al panel de administración.')

/**
 * Usuario de un token válido: existe, está verificado, no está bloqueado y la versión del token es la actual.
 * Se consulta en cada petición, así un bloqueo o un cambio de contraseña cortan la sesión al instante.
 */
export async function sessionUser(token: string | undefined, config: Pick<Config, 'jwtSecret' | 'adminEmails'>) {
  const claims = token ? verifyToken(token, config.jwtSecret) : null
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, verified: true, tokenVersion: true, blockedAt: true, role: true },
  })
  if (!user?.verified || user.blockedAt || user.tokenVersion !== claims.version) return null
  // El rol se decide con ADMIN_EMAILS en cada petición: sacar un correo de la lista corta su acceso al instante.
  const role: UserRole = user.role === 'admin' && config.adminEmails.includes(user.email.toLowerCase()) ? 'admin' : 'student'
  return { id: user.id, role }
}

const bearer = (header: string | undefined) => {
  const [scheme, token] = (header ?? '').split(' ')
  return scheme === 'Bearer' && token ? token : undefined
}

/** Exige `Authorization: Bearer <token>` de una sesión vigente. */
export function requireAuth(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const user = await sessionUser(bearer(req.headers.authorization), config)
    if (!user) return next(unauthenticated())
    req.user = user
    next()
  }
}

/** Como requireAuth, y además el rol de administrador (leído de la base en cada petición). */
export function requireAdmin(config: Config): RequestHandler {
  const auth = requireAuth(config)
  return (req, res, next) =>
    auth(req, res, (error?: unknown) => {
      if (error) return next(error)
      if (req.user?.role !== 'admin') return next(notAdmin())
      next()
    })
}

/** Para rutas públicas: identifica al usuario si hay una sesión vigente; si no, sigue como anónimo. */
export function optionalAuth(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const user = await sessionUser(bearer(req.headers.authorization), config)
    if (user) req.user = user
    next()
  }
}

/** Id del usuario autenticado (solo en rutas protegidas por requireAuth). */
export const currentUserId = (req: Express.Request) => {
  if (!req.user) throw unauthenticated()
  return req.user.id
}
