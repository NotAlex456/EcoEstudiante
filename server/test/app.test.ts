import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config'
import { makeApp } from './helpers'

const app = makeApp()

describe('app', () => {
  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
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

describe('panel de administración (/admin)', () => {
  it('sirve la página del panel, con fallback a index.html y sin permitir iframes', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-admin-'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Panel EcoEstudiante</title>')
    const app = makeApp({ adminDir: dir })
    const home = await request(app).get('/admin/')
    expect(home.status).toBe(200)
    expect(home.text).toContain('Panel EcoEstudiante')
    expect(home.headers['x-frame-options']).toBe('DENY')
    const deep = await request(app).get('/admin/usuarios')
    expect(deep.status).toBe(200)
    expect(deep.text).toContain('Panel EcoEstudiante')
    // Tras un nuevo despliegue la página no debe quedar en caché apuntando a archivos viejos…
    expect(home.headers['cache-control']).toContain('no-cache')
    // …y un archivo que ya no existe da 404, no la página (el navegador no ejecutaría HTML como script).
    expect((await request(app).get('/admin/assets/index-viejo.js')).status).toBe(404)
  })

  it('sin la carpeta compilada no monta /admin', async () => {
    const app = makeApp({ adminDir: '/no/existe' })
    expect((await request(app).get('/admin/')).status).toBe(404)
  })
})

describe('página de estado del servidor', () => {
  it('/api/health informa base de datos, tiempo activo, versión y hora', async () => {
    const res = await request(makeApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, database: 'ok', version: expect.stringMatching(/^\d+\.\d+\.\d+/) })
    expect(res.body.uptime).toEqual(expect.any(Number))
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false)
  })

  it('la raíz muestra la página de estado con el botón al panel', async () => {
    const res = await request(makeApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('href="/admin/"')
    expect(res.text).toContain('/api/health')
    expect(res.text).toContain('Ir al panel de administración')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.text).toContain('<link rel="icon" href="/favicon.svg"')
  })

  it('sirve el logo de la app como ícono de pestaña', async () => {
    const res = await request(makeApp()).get('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/svg+xml')
    expect(res.headers['cache-control']).toContain('max-age=')
    expect(res.body.toString()).toContain('#176b4b')
  })
})
