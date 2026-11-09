import { v2 as cloudinarySdk } from 'cloudinary'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../config'

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export type ImageStorage = {
  mode: 'cloudinary' | 'local'
  /** Guarda la foto y devuelve su URL pública. */
  save(file: { buffer: Buffer; mime: ImageMime }): Promise<string>
  /** ¿Esta URL pertenece a este almacenamiento? (las demás no se aceptan como fotos nuevas) */
  owns(url: string): boolean
  /** Borra la foto si es propia. Nunca lanza: los errores solo se registran. */
  remove(url: string): Promise<void>
}

/** Lo mínimo de Cloudinary que se usa; permite reemplazarlo en las pruebas. */
export type CloudinaryLike = {
  config(): { cloud_name?: string }
  uploadBuffer(buffer: Buffer, options: { folder: string }): Promise<{ secure_url: string }>
  destroy(publicId: string): Promise<void>
}

const EXTENSIONS: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const FOLDER = 'ecoestudiante'

/** Reconoce el tipo real de la imagen por sus primeros bytes (no por el nombre ni el Content-Type). */
export function detectImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  return null
}

function realCloudinary(url: string): CloudinaryLike {
  const parsed = new URL(url) // cloudinary://<api_key>:<api_secret>@<cloud_name>
  cloudinarySdk.config({
    cloud_name: parsed.hostname,
    api_key: decodeURIComponent(parsed.username),
    api_secret: decodeURIComponent(parsed.password),
    secure: true,
  })
  return {
    config: () => cloudinarySdk.config(),
    uploadBuffer: (buffer, options) =>
      new Promise((resolve, reject) => {
        cloudinarySdk.uploader
          .upload_stream({ folder: options.folder, resource_type: 'image' }, (error, result) =>
            error || !result ? reject(error ?? new Error('Cloudinary no devolvió resultado')) : resolve(result),
          )
          .end(buffer)
      }),
    destroy: async (publicId) => {
      await cloudinarySdk.uploader.destroy(publicId)
    },
  }
}

function cloudinaryStorage(cloudinary: CloudinaryLike): ImageStorage {
  const prefix = `https://res.cloudinary.com/${cloudinary.config().cloud_name}/image/upload/`
  const publicIdOf = (url: string) =>
    url
      .slice(prefix.length)
      .replace(/^v\d+\//, '')
      .replace(/\.[a-z0-9]+$/i, '')
  const owns = (url: string) => url.startsWith(prefix) && publicIdOf(url).startsWith(`${FOLDER}/`)
  return {
    mode: 'cloudinary',
    owns,
    save: async ({ buffer }) => (await cloudinary.uploadBuffer(buffer, { folder: FOLDER })).secure_url,
    remove: async (url) => {
      if (!owns(url)) return
      try {
        await cloudinary.destroy(publicIdOf(url))
      } catch (error) {
        console.error('No se pudo borrar la foto en Cloudinary', url, error)
      }
    },
  }
}

function localStorage(config: Config): ImageStorage {
  const prefix = `${config.publicUrl.replace(/\/+$/, '')}/uploads/`
  const fileOf = (url: string) => {
    if (!url.startsWith(prefix)) return null
    const name = url.slice(prefix.length)
    return /^[\w-]+\.(jpg|png|webp)$/.test(name) ? name : null
  }
  return {
    mode: 'local',
    owns: (url) => fileOf(url) !== null,
    save: async ({ buffer, mime }) => {
      await fs.mkdir(config.uploadsDir, { recursive: true })
      const name = `${crypto.randomUUID()}.${EXTENSIONS[mime]}`
      await fs.writeFile(path.join(config.uploadsDir, name), buffer)
      return prefix + name
    },
    remove: async (url) => {
      const name = fileOf(url)
      if (!name) return
      await fs.rm(path.join(config.uploadsDir, name), { force: true }).catch((error) => {
        console.error('No se pudo borrar la foto', url, error)
      })
    },
  }
}

/** Cloudinary si hay CLOUDINARY_URL; si no, disco local servido en /uploads. */
export function createImageStorage(config: Config, deps: { cloudinary?: CloudinaryLike } = {}): ImageStorage {
  if (config.cloudinaryUrl) return cloudinaryStorage(deps.cloudinary ?? realCloudinary(config.cloudinaryUrl))
  return localStorage(config)
}
