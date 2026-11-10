import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { Config } from '../../config'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Mailer } from '../../integrations/mail'
import { toMe, type MeDto } from '../users/dto'
import type { LoginInput, RegisterInput } from './schemas'
import { signToken } from './tokens'

type Ctx = { mailer: Mailer; config: Config }

const CODE_TTL_MS = 15 * 60_000
const RESEND_COOLDOWN_MS = 60_000
const MAX_ATTEMPTS = 5

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
const sameHash = (a: string, b: string) => crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))

const invalidCode = () => new AppError(400, 'INVALID_CODE', 'El código no coincide. Revisa tu correo e inténtalo otra vez.')
const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.')

/**
 * Crea un código nuevo (borrando los anteriores) y lo envía, salvo que el último
 * tenga menos de 60 s. Devuelve el código solo si el correo está en modo consola.
 */
async function issueCode(user: { id: string; email: string; name: string }, { mailer }: Ctx, force = false) {
  const last = await prisma.emailCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
  if (!force && last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) return { sent: false as const }
  const code = String(crypto.randomInt(100000, 1000000))
  await prisma.$transaction([
    prisma.emailCode.deleteMany({ where: { userId: user.id } }),
    prisma.emailCode.create({
      data: { userId: user.id, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ])
  await mailer.sendVerificationCode(user.email, user.name, code)
  return { sent: true as const, devCode: mailer.mode === 'console' ? code : undefined }
}

export async function register(input: RegisterInput, ctx: Ctx): Promise<{ userId: string; devCode?: string }> {
  try {
    return await registerOnce(input, ctx)
  } catch (error) {
    // Dos registros simultáneos del mismo correo nuevo: el segundo choca con el UNIQUE
    // y se reintenta como "correo ya existente".
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return registerOnce(input, ctx)
    throw error
  }
}

async function registerOnce(input: RegisterInput, ctx: Ctx) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing?.verified) throw new AppError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con este correo. Inicia sesión.')
  const data = {
    name: input.name,
    email: input.email,
    career: input.career,
    cycle: input.cycle,
    passwordHash: await bcrypt.hash(input.password, 10),
  }
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data })
    : await prisma.user.create({ data })
  const issued = await issueCode(user, ctx, !existing)
  return { userId: user.id, devCode: issued.sent ? issued.devCode : undefined }
}

export async function resendCode(userId: string, ctx: Ctx) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.verified) return { ok: true as const }
  const issued = await issueCode(user, ctx)
  if (!issued.sent) throw new AppError(429, 'RATE_LIMITED', 'Espera un minuto antes de pedir otro código.')
  return { ok: true as const, devCode: issued.devCode }
}

/**
 * Verifica el correo. Exige el código Y la contraseña con la que se registró, para que
 * alguien que re-registre el mismo correo no pueda quedarse con la cuenta de otra persona.
 */
export async function verify(
  input: { userId: string; code: string; password: string },
  { config }: Ctx,
): Promise<{ token: string; user: MeDto }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  const record = user && (await prisma.emailCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }))
  if (!user || user.verified || !record) throw invalidCode()
  if (record.expiresAt.getTime() < Date.now()) throw new AppError(400, 'CODE_EXPIRED', 'El código venció. Pide uno nuevo.')

  // Se reserva el intento de forma atómica ANTES de comparar: peticiones en paralelo no pasan de 5.
  const claimed = await prisma.emailCode.updateMany({
    where: { id: record.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (!claimed.count) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Pide un código nuevo.')

  const codeOk = sameHash(sha256(input.code), record.codeHash)
  const passwordOk = await bcrypt.compare(input.password, user.passwordHash)
  if (!codeOk || !passwordOk) throw invalidCode()

  const [activated] = await prisma.$transaction([
    prisma.user.updateMany({ where: { id: user.id, verified: false }, data: { verified: true } }),
    prisma.emailCode.deleteMany({ where: { userId: user.id } }),
  ])
  if (activated.count) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        category: 'cuenta',
        link: '#/cuenta',
        text: '¡Bienvenido/a a EcoEstudiante! Tu correo institucional quedó verificado.',
      },
    })
  }
  const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  return { token: signToken(verified.id, config.jwtSecret), user: toMe(verified) }
}

export async function login(input: LoginInput, ctx: Ctx): Promise<{ token: string; user: MeDto }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user || user.isBot || !(await bcrypt.compare(input.password, user.passwordHash))) throw invalidCredentials()
  if (!user.verified) {
    const issued = await issueCode(user, ctx)
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verifica tu correo para ingresar.', {
      userId: user.id,
      ...(issued.sent && issued.devCode ? { devCode: issued.devCode } : {}),
    })
  }
  return { token: signToken(user.id, ctx.config.jwtSecret), user: toMe(user) }
}
