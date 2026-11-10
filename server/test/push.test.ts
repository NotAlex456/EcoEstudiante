import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { createPushSender, isQuietHour } from '../src/integrations/push'
import { testConfig } from './helpers'

const lima = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00-05:00`)

describe('isQuietHour (hora de Lima)', () => {
  it('silencio de 22:00 a 06:59', () => {
    expect(isQuietHour(lima('21:59'))).toBe(false)
    expect(isQuietHour(lima('22:00'))).toBe(true)
    expect(isQuietHour(lima('23:30'))).toBe(true)
    expect(isQuietHour(lima('06:59'))).toBe(true)
    expect(isQuietHour(lima('07:00'))).toBe(false)
    expect(isQuietHour(lima('12:00'))).toBe(false)
  })
})

describe('createPushSender', () => {
  it('sin credencial queda apagado y no hace nada', async () => {
    const push = createPushSender(testConfig())
    expect(push.mode).toBe('off')
    expect(await push.send(['t1'], { title: 'x', body: 'y', link: '#/' })).toEqual({ invalidTokens: [] })
  })
})

describe('FIREBASE_SERVICE_ACCOUNT', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) }
  it('rechaza un valor que no es base64 de un JSON', () => {
    expect(() => loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: 'no-es-json' })).toThrow(/FIREBASE_SERVICE_ACCOUNT/)
  })
  it('acepta el JSON en base64', () => {
    const json = Buffer.from(JSON.stringify({ project_id: 'eco', client_email: 'a@b', private_key: 'k' })).toString('base64')
    expect(loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: json }).firebaseServiceAccount).toMatchObject({ project_id: 'eco' })
  })
})
