import type { Express } from 'express'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp, type AppDeps } from '../src/app'
import type { Config } from '../src/config'
import type { PushMessage, PushSender } from '../src/integrations/push'
import type { Realtime, ServerEvent } from '../src/realtime/socket'

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
    uploadsDir: path.join(os.tmpdir(), 'eco-test-uploads'),
    allowedEmails: [],
    adminDir: path.join(os.tmpdir(), 'eco-sin-panel'),
    adminEmails: [],
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

/** Realtime de mentira: guarda lo que se emitiría y permite marcar usuarios conectados. */
export function fakeRealtime(opts: { allOnline?: boolean } = {}) {
  const events: { userId: string; event: string; payload: unknown }[] = []
  const online = new Set<string>()
  return {
    events,
    online,
    emitToUser(userId: string, event: ServerEvent, payload: unknown) {
      events.push({ userId, event, payload })
    },
    isOnline: async (userId: string) => Boolean(opts.allOnline) || online.has(userId),
    disconnected: [] as string[],
    disconnectUser(userId: string) {
      this.disconnected.push(userId)
    },
    close: async () => {},
  } satisfies Realtime & { events: unknown[]; online: Set<string>; disconnected: string[] }
}

/** Inserta un material directamente (sin pasar por fotos ni validaciones de la API). */
export async function insertMaterial(ownerId: string, overrides: Record<string, unknown> = {}) {
  const { prisma } = await import('../src/db')
  return prisma.material.create({
    data: {
      ownerId,
      title: 'Calculadora Casio fx-570',
      course: 'Matemática I',
      career: 'Ingeniería de Sistemas',
      cycle: 1,
      category: 'Calculadoras',
      mode: 'Venta',
      price: 40,
      condition: 'BuenEstado',
      description: 'Funciona perfecto, con tapa y manual.',
      ...overrides,
    },
  })
}

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` })

/** Push de mentira: guarda lo enviado; `invalid` simula tokens que Firebase ya no reconoce y `fail`, una caída. */
export function fakePush() {
  const sent: { tokens: string[]; message: PushMessage }[] = []
  const invalid = new Set<string>()
  const state = {
    mode: 'firebase' as const,
    sent,
    invalid,
    fail: false,
    /** Simula un Firebase que nunca responde. */
    hang: false,
    async send(tokens: string[], message: PushMessage) {
      if (state.fail) throw new Error('Firebase no responde')
      if (state.hang) await new Promise(() => {})
      sent.push({ tokens, message })
      return { invalidTokens: tokens.filter((t) => invalid.has(t)) }
    },
  }
  return state satisfies PushSender & { sent: unknown[] }
}
