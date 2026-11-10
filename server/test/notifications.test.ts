import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma } from '../src/db'
import { createNotifier } from '../src/notify/notify'
import { fakePush, fakeRealtime, insertMaterial, makeApp, registerAndVerify, resetDb } from './helpers'

let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>

beforeEach(async () => {
  await resetDb()
  realtime = fakeRealtime({ allOnline: true })
  app = makeApp({}, { realtime })
})

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('notify()', () => {
  it('crea la fila y emite notification:new con su DTO', async () => {
    const ana = await registerAndVerify(app)
    realtime.events.length = 0
    await createNotifier({ realtime }).notify(ana.user.id, { category: 'mensajes', text: 'Hola', link: '#/chat/1' })
    const rows = await prisma.notification.findMany({ where: { userId: ana.user.id, category: 'mensajes' } })
    expect(rows).toHaveLength(1)
    expect(realtime.events).toEqual([
      {
        userId: ana.user.id,
        event: 'notification:new',
        payload: { id: rows[0].id, category: 'mensajes', text: 'Hola', link: '#/chat/1', read: false, createdAt: rows[0].createdAt.toISOString() },
      },
    ])
  })

  it('con la categoría desactivada guarda pero no emite', async () => {
    const ana = await registerAndVerify(app)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ana.user.id } })
    const prefs = user.notificationPrefs as { categories: Record<string, boolean> }
    await prisma.user.update({
      where: { id: ana.user.id },
      data: { notificationPrefs: { ...prefs, categories: { ...prefs.categories, mensajes: false } } },
    })
    realtime.events.length = 0
    await createNotifier({ realtime }).notify(ana.user.id, { category: 'mensajes', text: 'x', link: '#/' })
    expect(await prisma.notification.count({ where: { userId: ana.user.id, category: 'mensajes' } })).toBe(1)
    expect(realtime.events).toEqual([])
  })

  it('a un bot no se le emite nada', async () => {
    const bot = await prisma.user.create({
      data: { name: 'Bot', email: 'bot.x@upsjb.edu.pe', career: 'X', cycle: 1, passwordHash: '-', verified: true, isBot: true },
    })
    await createNotifier({ realtime }).notify(bot.id, { category: 'mensajes', text: 'x', link: '#/' })
    expect(await prisma.notification.count({ where: { userId: bot.id } })).toBe(1)
    expect(realtime.events).toEqual([])
  })

  it('verificar el correo emite la bienvenida', async () => {
    const ana = await registerAndVerify(app)
    expect(realtime.events).toEqual([
      expect.objectContaining({ userId: ana.user.id, event: 'notification:new', payload: expect.objectContaining({ category: 'cuenta' }) }),
    ])
  })
})

describe('/api/notifications', () => {
  it('lista solo las propias, de más nueva a más vieja', async () => {
    const ana = await registerAndVerify(app)
    const beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
    const notifier = createNotifier({ realtime })
    await notifier.notify(ana.user.id, { category: 'acuerdos', text: 'segunda', link: '#/' })
    await notifier.notify(beto.user.id, { category: 'acuerdos', text: 'de beto', link: '#/' })
    const res = await request(app).get('/api/notifications').set(auth(ana.token))
    expect(res.status).toBe(200)
    expect(res.body.map((n: { text: string }) => n.text)).toEqual([
      'segunda',
      '¡Bienvenido/a a EcoEstudiante! Tu correo institucional quedó verificado.',
    ])
  })

  it('read-all marca todas como leídas', async () => {
    const ana = await registerAndVerify(app)
    const res = await request(app).post('/api/notifications/read-all').set(auth(ana.token))
    expect(res.status).toBe(204)
    const list = await request(app).get('/api/notifications').set(auth(ana.token))
    expect(list.body.every((n: { read: boolean }) => n.read)).toBe(true)
  })

  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401)
  })
})

describe('notify(): push con la app cerrada', () => {
  const lima = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00-05:00`)
  let push: ReturnType<typeof fakePush>
  let userId: string

  beforeEach(async () => {
    push = fakePush()
    realtime = fakeRealtime()
    app = makeApp({}, { realtime, push })
    const ana = await registerAndVerify(app)
    userId = ana.user.id
    await prisma.deviceToken.createMany({ data: [{ token: 't1', userId, platform: 'android' }, { token: 't2', userId, platform: 'android' }] })
    realtime.events.length = 0
    push.sent.length = 0
  })

  const setPrefs = async (patch: Record<string, unknown>) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: { ...(user.notificationPrefs as object), ...patch } as Prisma.InputJsonObject } })
  }
  const notifyAt = async (hhmm = '12:00', category: 'mensajes' | 'acuerdos' = 'mensajes') => {
    const notifier = createNotifier({ realtime, push, now: () => lima(hhmm) })
    await notifier.notify(userId, { category, text: 'Hola', link: '#/chat/1' })
    await notifier.settle() // el push corre en segundo plano
  }

  it('en línea: emite por socket y no envía push', async () => {
    realtime.online.add(userId)
    await notifyAt()
    expect(realtime.events).toHaveLength(1)
    expect(push.sent).toEqual([])
  })

  it('sin conexión: push a todos sus celulares y sin emisión', async () => {
    await notifyAt()
    expect(realtime.events).toEqual([])
    expect(push.sent).toEqual([{ tokens: ['t1', 't2'], message: { title: 'EcoEstudiante', body: 'Hola', link: '#/chat/1' } }])
  })

  it('con el push apagado no envía', async () => {
    await setPrefs({ push: false })
    await notifyAt()
    expect(push.sent).toEqual([])
  })

  it('horario silencioso: de noche no envía, de día sí', async () => {
    await setPrefs({ quietNight: true })
    await notifyAt('23:00')
    expect(push.sent).toEqual([])
    await notifyAt('12:00')
    expect(push.sent).toHaveLength(1)
  })

  it('categoría apagada: ni emisión ni push, pero se guarda', async () => {
    await setPrefs({ categories: { mensajes: false, acuerdos: true, busquedas: true, cuenta: true } })
    await notifyAt()
    expect(push.sent).toEqual([])
    expect(await prisma.notification.count({ where: { userId, category: 'mensajes' } })).toBe(1)
  })

  it('borra los tokens que Firebase ya no reconoce', async () => {
    push.invalid.add('t1')
    await notifyAt()
    expect((await prisma.deviceToken.findMany({ where: { userId } })).map((d) => d.token)).toEqual(['t2'])
  })

  it('un Firebase que no responde no demora notify (el push corre en segundo plano)', async () => {
    push.hang = true
    const notifier = createNotifier({ realtime, push })
    const result = await Promise.race([
      notifier.notify(userId, { category: 'mensajes', text: 'Hola', link: '#/chat/1' }).then(() => 'listo'),
      new Promise((r) => setTimeout(() => r('colgado'), 1000)),
    ])
    expect(result).toBe('listo')
  })

  it('si Firebase falla, enviar un mensaje responde 201 igual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    push.fail = true
    const beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
    const material = await insertMaterial(userId)
    const conv = await request(app).post('/api/conversations').set(auth(beto.token)).send({ materialId: material.id })
    const res = await request(app).post(`/api/conversations/${conv.body.id}/messages`).set(auth(beto.token)).send({ text: 'hola' })
    expect(res.status).toBe(201)
  })
})
