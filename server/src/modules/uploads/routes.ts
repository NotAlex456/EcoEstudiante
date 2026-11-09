import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import type { Config } from '../../config'
import { AppError } from '../../errors'
import { detectImageMime, type ImageStorage } from '../../integrations/images'
import { prisma } from '../../db'
import { currentUserId, requireAuth } from '../../middleware/auth'

const MAX_FILES = 5
const MAX_BYTES = 2 * 1024 * 1024

const invalidImage = () => new AppError(400, 'INVALID_IMAGE', 'Solo se aceptan fotos JPG, PNG o WebP.')

/** multer con límites; sus errores se traducen a mensajes en español. */
const receiveFiles: RequestHandler = (req, res, next) => {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES } }).array('files')(req, res, (error) => {
    if (!error) return next()
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'Cada foto puede pesar hasta 2 MB.'))
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
        return next(
          error.code === 'LIMIT_FILE_COUNT'
            ? new AppError(400, 'TOO_MANY_FILES', `Puedes subir hasta ${MAX_FILES} fotos.`)
            : new AppError(400, 'VALIDATION', 'Envía las fotos en el campo "files".'),
        )
      return next(new AppError(400, 'VALIDATION', 'Revisa los archivos enviados.'))
    }
    // Errores de busboy/multer por un cuerpo mal formado (sin boundary, cortado…): son del cliente.
    next(new AppError(400, 'VALIDATION', 'Revisa los archivos enviados.'))
  })
}

export function uploadRoutes(config: Config, images: ImageStorage) {
  const router = Router()

  router.post('/', requireAuth(config), receiveFiles, async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (!files.length) throw new AppError(400, 'VALIDATION', 'Elige al menos una foto.')
    // Se valida TODO antes de guardar NADA: o se guardan todas o ninguna.
    const checked = files.map((file) => {
      const mime = detectImageMime(file.buffer)
      if (!mime) throw invalidImage()
      return { buffer: file.buffer, mime }
    })
    const urls: string[] = []
    for (const file of checked) urls.push(await images.save(file))
    // Se registra quién subió cada foto: solo esa persona podrá usarla en una publicación.
    await prisma.upload.createMany({ data: urls.map((url) => ({ url, uploaderId: currentUserId(req) })) })
    res.status(201).json({ urls })
  })

  return router
}
