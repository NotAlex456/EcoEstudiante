import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config'
import { makeApp } from './helpers'

const app = makeApp()

describe('app', () => {
  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('ruta inexistente responde 404 NOT_FOUND en español', async () => {
    const res = await request(app).get('/api/nada')
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'No encontramos lo que buscas.' })
  })

  it('JSON mal formado responde 400 VALIDATION', async () => {
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{malo')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('JSON con charset no soportado responde 400 VALIDATION, no 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json; charset=latin1').send('{}')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('loadConfig rechaza JWT_SECRET corto', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/)
  })

  it('loadConfig aplica valores por defecto', () => {
    const c = loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) })
    expect(c.port).toBe(3000)
    expect(c.authRateLimit).toBe(10)
    expect(c.botsEnabled).toBe(true)
    expect(c.mail.resendApiKey).toBeUndefined()
    expect(c.mail.smtp).toBeUndefined()
  })
})

describe('configuración de producción', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) }
  it('avisa si en producción faltan Cloudinary o el correo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadConfig({ ...base, NODE_ENV: 'production' })
    const text = warn.mock.calls.flat().join(' ')
    expect(text).toContain('CLOUDINARY_URL')
    expect(text).toContain('correo')
    warn.mockRestore()
  })
  it('en desarrollo no avisa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadConfig(base)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
