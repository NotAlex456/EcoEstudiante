import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db'
import type { Mailer } from '../src/integrations/mail'
import { authHeader as auth, makeApp, registerAndVerify, resetDb, validRegistration } from './helpers'

/** Mailer de prueba: guarda los códigos de recuperación enviados. */
const sent: { to: string; code: string }[] = []
const mailer: Mailer = {
  mode: 'console',
  sendVerificationCode: async () => {},
  sendPasswordResetCode: async (to, _name, code) => void sent.push({ to, code }),
}
const app = makeApp({}, { mailer })
const email = validRegistration.email
const forgot = (to = email) => request(app).post('/api/auth/forgot').send({ email: to })
const reset = (code: string, password = 'nuevaClave123', to = email) =>
  request(app).post('/api/auth/reset').send({ email: to, code, password })

beforeEach(async () => {
  await resetDb()
  sent.length = 0
})

describe('recuperar contraseña', () => {
  it('responde lo mismo exista o no la cuenta, y solo envía si existe', async () => {
    const missing = await forgot('nadie.aqui@upsjb.edu.pe')
    expect(missing.status).toBe(200)
    expect(missing.body).toEqual({ ok: true })
    expect(sent).toEqual([])

    await registerAndVerify(app)
    const res = await forgot()
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(email)
  })

  it('con el código cambia la contraseña, cierra la sesión anterior e inicia una nueva', async () => {
    const ana = await registerAndVerify(app)
    await forgot()
    const res = await reset(sent[0].code)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(email)
    expect((await request(app).get('/api/auth/me').set(auth(ana.token))).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).status).toBe(200)
    const login = await request(app).post('/api/auth/login').send({ email, password: 'nuevaClave123' })
    expect(login.status).toBe(200)
  })

  it('un código de verificación del registro no sirve para recuperar', async () => {
    const reg = await request(app).post('/api/auth/register').send(validRegistration)
    expect(reg.status).toBe(201)
    // Cuenta sin verificar con su código de registro vigente: no puede usarse como código de recuperación.
    const verifyCode = reg.body.devCode as string | undefined
    await prisma.user.update({ where: { id: reg.body.userId }, data: { verified: true } })
    const res = await reset(verifyCode ?? '000000')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_CODE')
  })

  it('máximo 5 intentos', async () => {
    await registerAndVerify(app)
    await forgot()
    const wrong = sent[0].code === '111111' ? '222222' : '111111'
    for (let i = 0; i < 5; i++) expect((await reset(wrong)).status).toBe(400)
    expect((await reset(wrong)).status).toBe(429)
  })

  it('el código vence a los 15 minutos', async () => {
    await registerAndVerify(app)
    await forgot()
    await prisma.emailCode.updateMany({ where: { purpose: 'reset' }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await reset(sent[0].code)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('CODE_EXPIRED')
  })

  it('la nueva contraseña cumple las reglas del registro', async () => {
    await registerAndVerify(app)
    await forgot()
    expect((await reset(sent[0].code, 'corta12')).status).toBe(400)
  })
})
