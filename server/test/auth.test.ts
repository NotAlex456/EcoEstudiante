import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import type { Mailer } from '../src/integrations/mail'
import { makeApp, resetDb, validRegistration as valid } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const app = makeApp()
const register = (body: object = valid) => request(app).post('/api/auth/register').send(body)
const verify = (userId: string, code: string, password = valid.password) =>
  request(app).post('/api/auth/verify').send({ userId, code, password })
const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password })
const ageLastCode = (userId: string, seconds: number) =>
  prisma.emailCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - seconds * 1000) } })
const otherCode = (code: string) => (code === '111111' ? '222222' : '111111')

describe('auth', () => {
  beforeEach(resetDb)

  it('registro → verificación entrega token, usuario y bienvenida', async () => {
    const reg = await register()
    expect(reg.status).toBe(201)
    expect(reg.body.devCode).toMatch(/^\d{6}$/)
    const res = await verify(reg.body.userId, reg.body.devCode)
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toMatchObject({ id: reg.body.userId, email: valid.email, verified: true, career: 'Contabilidad', cycle: 3 })
    expect(res.body.user.passwordHash).toBeUndefined()
    const notes = await prisma.notification.findMany({ where: { userId: reg.body.userId } })
    expect(notes).toMatchObject([
      { category: 'cuenta', link: '#/cuenta', text: '¡Bienvenido/a a EcoEstudiante! Tu correo institucional quedó verificado.' },
    ])
  })

  it('normaliza el correo con mayúsculas y espacios', async () => {
    const reg = await register({ ...valid, email: ' Ana.Torres@UPSJB.edu.pe ' })
    await verify(reg.body.userId, reg.body.devCode)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: reg.body.userId } })).email).toBe('ana.torres@upsjb.edu.pe')
    expect((await login('ANA.TORRES@upsjb.edu.pe', valid.password)).status).toBe(200)
  })

  it('rechaza correos no institucionales', async () => {
    const res = await register({ ...valid, email: 'ana@gmail.com' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.fields.email).toBe('Usa tu correo institucional (nombre.apellido@upsjb.edu.pe).')
  })

  it('exige contraseña de 8 caracteres', async () => {
    const res = await register({ ...valid, password: '1234567' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.password).toBe('Usa al menos 8 caracteres.')
  })

  it('rechaza carrera desconocida y ciclo fuera de rango', async () => {
    expect((await register({ ...valid, career: 'Astrología' })).status).toBe(400)
    expect((await register({ ...valid, cycle: 11 })).status).toBe(400)
  })

  it('rechaza campos de más', async () => {
    const res = await register({ ...valid, isBot: true })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('re-registrar un correo no verificado actualiza sus datos', async () => {
    const first = await register()
    await ageLastCode(first.body.userId, 61)
    const again = await register({ ...valid, name: 'Ana María Torres', password: 'otraclave9' })
    expect(again.status).toBe(201)
    expect(again.body.userId).toBe(first.body.userId)
    await verify(again.body.userId, again.body.devCode, 'otraclave9')
    expect((await login(valid.email, 'otraclave9')).body.user.name).toBe('Ana María Torres')
  })

  it('un correo ya verificado responde 409 EMAIL_TAKEN', async () => {
    const reg = await register()
    await verify(reg.body.userId, reg.body.devCode)
    const res = await register()
    expect(res.status).toBe(409)
    expect(res.body.error).toEqual({ code: 'EMAIL_TAKEN', message: 'Ya existe una cuenta con este correo. Inicia sesión.' })
  })

  it('código incorrecto responde INVALID_CODE y suma un intento', async () => {
    const reg = await register()
    const res = await verify(reg.body.userId, otherCode(reg.body.devCode))
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'INVALID_CODE', message: 'El código no coincide. Revisa tu correo e inténtalo otra vez.' })
    expect((await prisma.emailCode.findFirstOrThrow({ where: { userId: reg.body.userId } })).attempts).toBe(1)
  })

  it('tras 5 intentos fallidos el código correcto responde 429', async () => {
    const reg = await register()
    for (let i = 0; i < 5; i++) await verify(reg.body.userId, otherCode(reg.body.devCode))
    const res = await verify(reg.body.userId, reg.body.devCode)
    expect(res.status).toBe(429)
    expect(res.body.error).toEqual({ code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Pide un código nuevo.' })
  })

  it('código vencido responde CODE_EXPIRED', async () => {
    const reg = await register()
    await prisma.emailCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await verify(reg.body.userId, reg.body.devCode)
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'CODE_EXPIRED', message: 'El código venció. Pide uno nuevo.' })
  })

  it('verificar con un usuario inexistente responde INVALID_CODE', async () => {
    const res = await verify('no-existe', '123456')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_CODE')
  })

  it('reenviar antes de 60 s responde 429; después, un código nuevo invalida el anterior', async () => {
    const reg = await register()
    const early = await request(app).post('/api/auth/resend-code').send({ userId: reg.body.userId })
    expect(early.status).toBe(429)
    expect(early.body.error).toEqual({ code: 'RATE_LIMITED', message: 'Espera un minuto antes de pedir otro código.' })
    await ageLastCode(reg.body.userId, 61)
    const later = await request(app).post('/api/auth/resend-code').send({ userId: reg.body.userId })
    expect(later.status).toBe(200)
    expect(later.body.devCode).toMatch(/^\d{6}$/)
    expect(await prisma.emailCode.count({ where: { userId: reg.body.userId } })).toBe(1)
    expect((await verify(reg.body.userId, later.body.devCode)).status).toBe(200)
  })

  it('login con contraseña incorrecta o correo inexistente da el mismo 401', async () => {
    const reg = await register()
    await verify(reg.body.userId, reg.body.devCode)
    const expected = { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' }
    const bad = await login(valid.email, 'equivocada1')
    const missing = await login('nadie@upsjb.edu.pe', valid.password)
    expect([bad.status, missing.status]).toEqual([401, 401])
    expect(bad.body.error).toEqual(expected)
    expect(missing.body.error).toEqual(expected)
  })

  it('login de cuenta no verificada responde 403 y reenvía código si pasó un minuto', async () => {
    const reg = await register()
    const soon = await login(valid.email, valid.password)
    expect(soon.status).toBe(403)
    expect(soon.body.error).toMatchObject({ code: 'EMAIL_NOT_VERIFIED', userId: reg.body.userId })
    expect(soon.body.error.devCode).toBeUndefined()
    await ageLastCode(reg.body.userId, 61)
    const later = await login(valid.email, valid.password)
    expect(later.body.error.devCode).toMatch(/^\d{6}$/)
  })

  it('un estudiante real con el mismo nombre que un bot puede registrarse', async () => {
    await seed(prisma)
    expect((await register()).status).toBe(201)
  })

  it('un bot no puede iniciar sesión', async () => {
    await seed(prisma)
    expect((await login('bot.maria.quispe@upsjb.edu.pe', '')).status).toBe(400)
    expect((await login('bot.maria.quispe@upsjb.edu.pe', 'cualquiera1')).status).toBe(401)
  })

  it('limita los intentos por minuto', async () => {
    const limited = makeApp({ authRateLimit: 3 })
    for (let i = 0; i < 3; i++) await request(limited).post('/api/auth/login').send({ email: 'a@upsjb.edu.pe', password: 'x' })
    const res = await request(limited).post('/api/auth/login').send({ email: 'a@upsjb.edu.pe', password: 'x' })
    expect(res.status).toBe(429)
    expect(res.body.error).toEqual({ code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera un minuto.' })
  })

  it('envía el correo con el código y no expone devCode', async () => {
    const sent: string[][] = []
    const mailer: Mailer = { mode: 'smtp', sendVerificationCode: async (...args) => void sent.push(args), sendPasswordResetCode: async () => {} }
    const withMailer = makeApp({}, { mailer })
    const reg = await request(withMailer).post('/api/auth/register').send(valid)
    expect(reg.body.devCode).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(sent[0].slice(0, 2)).toEqual([valid.email, valid.name])
    expect((await request(withMailer).post('/api/auth/verify').send({ userId: reg.body.userId, code: sent[0][2], password: valid.password })).status).toBe(200)
  })
  it('rechaza dominios parecidos al institucional', async () => {
    for (const email of ['ana@upsjbxedu.pe', 'ana@upsjb-edu.pe', 'ana@upsjb.eduxpe']) {
      const res = await register({ ...valid, email })
      expect(res.status, email).toBe(400)
    }
  })

  it('verificar exige la contraseña del registro', async () => {
    const reg = await register()
    const res = await verify(reg.body.userId, reg.body.devCode, 'otraclave9')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_CODE')
    expect((await verify(reg.body.userId, reg.body.devCode)).status).toBe(200)
  })

  it('otra persona que re-registra el correo no puede quedarse con la cuenta', async () => {
    const victim = await register()
    await ageLastCode(victim.body.userId, 61)
    const attacker = await register({ ...valid, password: 'atacante99' })
    // La víctima recibe el código nuevo en su correo e intenta verificar con su contraseña.
    const res = await verify(victim.body.userId, attacker.body.devCode, valid.password)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_CODE')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.body.userId } })).verified).toBe(false)
  })

  it('intentos en paralelo no superan el límite de 5', async () => {
    const reg = await register()
    const wrong = otherCode(reg.body.devCode)
    const results = await Promise.all(Array.from({ length: 10 }, () => verify(reg.body.userId, wrong)))
    expect(results.filter((r) => r.body.error?.code === 'INVALID_CODE')).toHaveLength(5)
    expect(results.filter((r) => r.status === 429)).toHaveLength(5)
    expect((await verify(reg.body.userId, reg.body.devCode)).status).toBe(429)
  })

  it('dos registros simultáneos del mismo correo no dan error 500', async () => {
    const results = await Promise.all([register(), register()])
    expect(results.map((r) => r.status).sort()).toEqual([201, 201])
    expect(await prisma.user.count()).toBe(1)
  })
})
