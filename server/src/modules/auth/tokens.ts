import jwt from 'jsonwebtoken'

/**
 * Token de sesión: JWT HS256 con el id del usuario y su `tokenVersion` (v), válido 7 días.
 * Subir `tokenVersion` (cambio de contraseña, bloqueo) invalida todos los tokens anteriores.
 */
export const signToken = (userId: string, version: number, secret: string) =>
  jwt.sign({ v: version }, secret, { subject: userId, expiresIn: '7d', algorithm: 'HS256' })

/** Devuelve el id del usuario y la versión del token, o null si es inválido o venció. */
export function verifyToken(token: string, secret: string): { userId: string; version: number } | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null
    return { userId: payload.sub, version: typeof payload.v === 'number' ? payload.v : 0 }
  } catch {
    return null
  }
}
