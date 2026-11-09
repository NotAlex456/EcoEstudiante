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
}

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'es obligatoria'),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:8443,capacitor://localhost,https://localhost'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  RESEND_API_KEY: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
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
  }
}
