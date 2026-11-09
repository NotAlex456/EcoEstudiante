import { createApp, type AppDeps } from '../src/app'
import type { Config } from '../src/config'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/ecoestudiante_test',
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
