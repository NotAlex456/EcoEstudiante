import type { ErrorRequestHandler } from 'express'

/** Error esperado: se responde tal cual al cliente con un mensaje en español. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'No encontramos lo que buscas.')

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let error: AppError
  if (err instanceof AppError) error = err
  else if (err instanceof SyntaxError && 'body' in err) error = new AppError(400, 'VALIDATION', 'Revisa los datos enviados.')
  else if (err?.type === 'entity.too.large') error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Los datos enviados son demasiado grandes.')
  else {
    console.error(err)
    error = new AppError(500, 'INTERNAL', 'Ocurrió un error inesperado. Inténtalo de nuevo.')
  }
  res.status(error.status).json({ error: { code: error.code, message: error.message, ...error.details } })
}
