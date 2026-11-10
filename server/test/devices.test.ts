import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/db'
import { authHeader as auth, fakePush, makeApp, registerAndVerify, resetDb } from './helpers'

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let push: ReturnType<typeof fakePush>
let app: ReturnType<typeof makeApp>
let ana: Who, beto: Who

beforeEach(async () => {
  await resetDb()
  push = fakePush()
  app = makeApp({}, { push })
  ana = await registerAndVerify(app)
  beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
})

afterEach(() => {
  vi.useRealTimers()
})

const register = (who: Who, token: string, platform = 'android') =>
  request(app).post('/api/devices').set(auth(who.token)).send({ token, platform })

describe('/api/devices', () => {
  it('registra un token una sola vez', async () => {
    expect((await register(ana, 'tok-1')).status).toBe(204)
    expect((await register(ana, 'tok-1')).status).toBe(204)
    expect(await prisma.deviceToken.findMany({ where: { token: 'tok-1' } })).toEqual([
      expect.objectContaining({ userId: ana.user.id, platform: 'android' }),
    ])
  })

  it('el mismo celular con otra cuenta pasa a la cuenta nueva', async () => {
    await register(ana, 'tok-1')
    await register(beto, 'tok-1')
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: 'tok-1' } })).userId).toBe(beto.user.id)
  })

  it('solo se puede borrar un token propio', async () => {
    await register(ana, 'tok-1')
    expect((await request(app).delete('/api/devices/tok-1').set(auth(beto.token))).status).toBe(204)
    expect(await prisma.deviceToken.count({ where: { token: 'tok-1' } })).toBe(1)
    expect((await request(app).delete('/api/devices/tok-1').set(auth(ana.token))).status).toBe(204)
    expect(await prisma.deviceToken.count({ where: { token: 'tok-1' } })).toBe(0)
  })

  it('valida la plataforma y exige sesión', async () => {
    expect((await register(ana, 'tok-1', 'ios')).status).toBe(400)
    expect((await request(app).post('/api/devices').send({ token: 'x', platform: 'android' })).status).toBe(401)
  })

  it('el aviso de prueba llega a los 10 s', async () => {
    await register(ana, 'tok-1')
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    expect((await request(app).post('/api/devices/test').set(auth(ana.token))).status).toBe(202)
    expect(push.sent).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)
    vi.useRealTimers()
    await vi.waitFor(() => expect(push.sent).toHaveLength(1))
    expect(push.sent).toEqual([
      {
        tokens: ['tok-1'],
        message: { title: 'EcoEstudiante', body: 'Así te avisaremos cuando EcoEstudiante esté cerrada.', link: '#/cuenta/notificaciones' },
      },
    ])
  })
})
