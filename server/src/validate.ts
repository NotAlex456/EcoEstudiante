import type { RequestHandler } from 'express'
import type { z } from 'zod'
import { AppError } from './errors'

/** Valida req.body con zod y lo reemplaza por el valor parseado. */
export function body<T>(schema: z.ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {})
    if (parsed.success) {
      req.body = parsed.data
      return next()
    }
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.length ? issue.path.join('.') : issue.code === 'unrecognized_keys' ? issue.keys.join(',') : '_'
      fields[key] ??= issue.message
    }
    next(new AppError(400, 'VALIDATION', 'Revisa los datos enviados.', { fields }))
  }
}
