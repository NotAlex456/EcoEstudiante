import jwt from 'jsonwebtoken'

/** Token de sesión: JWT HS256 con el id del usuario, válido 7 días. */
export const signToken = (userId: string, secret: string) =>
  jwt.sign({}, secret, { subject: userId, expiresIn: '7d', algorithm: 'HS256' })

/** Devuelve el id del usuario o null si el token es inválido o venció. */
export function verifyToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
