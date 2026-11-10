import path from 'node:path'
import { z } from 'zod'

export type Config = {
  port: number
  databaseUrl: string
  jwtSecret: string
  corsOrigins: string[]
  publicUrl: string
  authRateLimit: number
  mail: {
    resendApiKey?: string
    smtp?: { host: string; port: number; user: string; pass: string }
    from: string
  }
  botsEnabled: boolean
  /** Carpeta de las fotos cuando no hay Cloudinary. */
  uploadsDir: string
  cloudinaryUrl?: string
  /** Cuenta de servicio de Firebase (JSON). Sin ella no se envía push. */
  firebaseServiceAccount?: Record<string, unknown>
}

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'es obligatoria'),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:8443,http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost,https://localhost'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  RESEND_API_KEY: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  UPLOADS_DIR: optional,
  CLOUDINARY_URL: optional,
  // JSON de la cuenta de servicio de Firebase, codificado en base64 (una sola línea, cómodo para Render).
  FIREBASE_SERVICE_ACCOUNT: optional.transform((v, ctx) => {
    if (!v) return undefined
    try {
      const json = JSON.parse(Buffer.from(v, 'base64').toString('utf8'))
      if (json && typeof json === 'object' && !Array.isArray(json)) return json as Record<string, unknown>
    } catch {
      // se reporta abajo
    }
    ctx.addIssue({ code: 'custom', message: 'debe ser el JSON de la cuenta de servicio codificado en base64' })
    return z.NEVER
  }),
  MAIL_FROM: z.string().default('EcoEstudiante <no-reply@ecoestudiante.app>'),
  BOTS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
})

/** Lee y valida las variables de entorno. Lanza un error que nombra cada variable inválida. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Configuración inválida. ${problems}`)
  }
  const e = parsed.data
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    publicUrl: e.PUBLIC_URL,
    authRateLimit: e.AUTH_RATE_LIMIT,
    mail: {
      resendApiKey: e.RESEND_API_KEY,
      smtp:
        e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS
          ? { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, pass: e.SMTP_PASS }
          : undefined,
      from: e.MAIL_FROM,
    },
    botsEnabled: e.BOTS_ENABLED,
    uploadsDir: path.resolve(e.UPLOADS_DIR ?? path.join(import.meta.dirname, '..', 'uploads')),
    cloudinaryUrl: e.CLOUDINARY_URL,
    firebaseServiceAccount: e.FIREBASE_SERVICE_ACCOUNT,
  }
}
