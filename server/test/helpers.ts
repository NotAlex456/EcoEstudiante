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
