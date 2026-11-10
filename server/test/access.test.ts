import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db'
import { errorHandler } from '../src/errors'
import { currentUserId, requireAdmin } from '../src/middleware/auth'
import { authHeader as auth, makeApp, registerAndVerify, resetDb, testConfig, validRegistration } from './helpers'

beforeEach(resetDb)

describe('correos permitidos (ALLOWED_EMAILS)', () => {
  const app = makeApp({ allowedEmails: ['novio@gmail.com'] })
  const register = (email: string) => request(app).post('/api/auth/register').send({ ...validRegistration, email })

  it('un correo de la lista se registra aunque no sea institucional', async () => {
    expect((await register('Novio@Gmail.com')).status).toBe(201)
  })

  it('un correo fuera de la lista recibe el mensaje de siempre', async () => {
    const res = await register('otro@gmail.com')
    expect(res.status).toBe(400)
    expect(res.body.error.fields.email).toBe('Usa tu correo institucional (nombre.apellido@upsjb.edu.pe).')
  })
})

describe('rol de administrador (ADMIN_EMAILS)', () => {
  it('se asigna al ingresar y se quita al sacarlo de la lista', async () => {
    const adminApp = makeApp({ adminEmails: [validRegistration.email] })
    const ana = await registerAndVerify(adminApp)
    expect((await request(adminApp).get('/api/auth/me').set(auth(ana.token))).body.role).toBe('admin')

    const plainApp = makeApp({ adminEmails: [] })
    const login = await request(plainApp).post('/api/auth/login').send({ email: validRegistration.email, password: validRegistration.password })
    expect(login.body.user.role).toBe('student')
  })

  it('requireAdmin rechaza a un estudiante con 403', async () => {
    const config = testConfig()
    const app = express()
    app.get('/solo-admin', requireAdmin(config), (req, res) => void res.json({ id: currentUserId(req) }))
    app.use(errorHandler)
    const ana = await registerAndVerify(makeApp())
    const res = await request(app).get('/solo-admin').set(auth(ana.token))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'No tienes acceso al panel de administración.' })
  })

  it('quitarle el rol en la base corta su acceso aunque su sesión siga vigente', async () => {
    const config = testConfig({ adminEmails: [validRegistration.email] })
    const app = express()
    app.get('/solo-admin', requireAdmin(config), (_req, res) => void res.json({ ok: true }))
    app.use(errorHandler)
    const ana = await registerAndVerify(makeApp({ adminEmails: [validRegistration.email] }))
    expect((await request(app).get('/solo-admin').set(auth(ana.token))).status).toBe(200)
    await prisma.user.update({ where: { id: ana.user.id }, data: { role: 'student' } })
    expect((await request(app).get('/solo-admin').set(auth(ana.token))).status).toBe(403)
  })
})

describe('sesiones revocables y bloqueo', () => {
  const app = makeApp()

  it('un token de una versión anterior deja de servir', async () => {
    const ana = await registerAndVerify(app)
    await prisma.user.update({ where: { id: ana.user.id }, data: { tokenVersion: { increment: 1 } } })
    expect((await request(app).get('/api/auth/me').set(auth(ana.token))).status).toBe(401)
  })

  it('un usuario bloqueado no puede entrar y su sesión vigente da 401', async () => {
    const ana = await registerAndVerify(app)
    await prisma.user.update({ where: { id: ana.user.id }, data: { blockedAt: new Date() } })
    expect((await request(app).get('/api/auth/me').set(auth(ana.token))).status).toBe(401)
    const login = await request(app).post('/api/auth/login').send({ email: validRegistration.email, password: validRegistration.password })
    expect(login.status).toBe(403)
    expect(login.body.error).toMatchObject({
      code: 'ACCOUNT_BLOCKED',
      message: 'Tu cuenta está suspendida. Escribe a la administración si crees que es un error.',
    })
  })
})
