import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db'
import { createNotifier } from '../src/notify/notify'
import { fakeRealtime, makeApp, registerAndVerify, resetDb } from './helpers'

let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>

beforeEach(async () => {
  await resetDb()
  realtime = fakeRealtime()
  app = makeApp({}, { realtime })
})

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('notify()', () => {
  it('crea la fila y emite notification:new con su DTO', async () => {
    const ana = await registerAndVerify(app)
    realtime.events.length = 0
    await createNotifier(realtime).notify(ana.user.id, { category: 'mensajes', text: 'Hola', link: '#/chat/1' })
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
    await createNotifier(realtime).notify(ana.user.id, { category: 'mensajes', text: 'x', link: '#/' })
    expect(await prisma.notification.count({ where: { userId: ana.user.id, category: 'mensajes' } })).toBe(1)
    expect(realtime.events).toEqual([])
  })

  it('a un bot no se le emite nada', async () => {
    const bot = await prisma.user.create({
      data: { name: 'Bot', email: 'bot.x@upsjb.edu.pe', career: 'X', cycle: 1, passwordHash: '-', verified: true, isBot: true },
    })
    await createNotifier(realtime).notify(bot.id, { category: 'mensajes', text: 'x', link: '#/' })
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
    const notifier = createNotifier(realtime)
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
