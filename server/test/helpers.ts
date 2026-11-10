import type { Express } from 'express'
import request from 'supertest'
import { createApp, type AppDeps } from '../src/app'
import type { Config } from '../src/config'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwtSecret: 'secreto-de-pruebas-con-32-caracteres!!',
    corsOrigins: ['http://localhost:8443'],
    publicUrl: 'http://localhost:3000',
    authRateLimit: 1000,
    mail: { from: 'test@eco' },
    botsEnabled: false,
    ...overrides,
  }
}

export const makeApp = (overrides: Partial<Config> = {}, deps: Partial<AppDeps> = {}) =>
  createApp(testConfig(overrides), deps)

/** Vacía todas las tablas (salvo el historial de migraciones). */
export async function resetDb() {
  const { prisma } = await import('../src/db')
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (!tables.length) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

export const validRegistration = {
  name: 'Ana Torres',
  email: 'ana.torres@upsjb.edu.pe',
  career: 'Contabilidad',
  cycle: 3,
  password: 'secreta123',
}

/** Registra y verifica un usuario (modo consola); devuelve su token y datos. */
export async function registerAndVerify(app: Express, overrides: Partial<typeof validRegistration> = {}) {
  const input = { ...validRegistration, ...overrides }
  const reg = await request(app).post('/api/auth/register').send(input)
  if (reg.status !== 201) throw new Error(`register ${reg.status}: ${JSON.stringify(reg.body)}`)
  const ver = await request(app).post('/api/auth/verify').send({ userId: reg.body.userId, code: reg.body.devCode, password: input.password })
  if (ver.status !== 200) throw new Error(`verify ${ver.status}: ${JSON.stringify(ver.body)}`)
  return ver.body as { token: string; user: { id: string; name: string; email: string; career: string; cycle: number } }
}
