import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db'
import { authHeader as auth, fakeRealtime, insertMaterial, makeApp, registerAndVerify, resetDb } from './helpers'

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>
let ana: Who, beto: Who, carla: Who
let materialId: string

beforeEach(async () => {
  await resetDb()
  realtime = fakeRealtime()
  app = makeApp({}, { realtime })
  ana = await registerAndVerify(app)
  beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
  carla = await registerAndVerify(app, { email: 'carla.ruiz@upsjb.edu.pe', name: 'Carla Ruiz' })
  materialId = (await insertMaterial(ana.user.id)).id
  realtime.events.length = 0
})

const open = (who: Who, id = materialId) => request(app).post('/api/conversations').set(auth(who.token)).send({ materialId: id })
const send = (who: Who, conversationId: string, text: string) =>
  request(app).post(`/api/conversations/${conversationId}/messages`).set(auth(who.token)).send({ text })
const list = (who: Who) => request(app).get('/api/conversations').set(auth(who.token))

describe('abrir conversaciones', () => {
  it('abrir dos veces devuelve la misma', async () => {
    const first = await open(beto)
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ materialId, buyerId: beto.user.id, sellerId: ana.user.id, unread: 0, lastMessage: null })
    const again = await open(beto)
    expect(again.status).toBe(200)
    expect(again.body.id).toBe(first.body.id)
  })

  it('no se abre sobre un material propio', async () => {
    const res = await open(ana)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: 'OWN_MATERIAL', message: 'Es tu propia publicación.' })
  })

  it('no se abre sobre un material pausado o entregado', async () => {
    const paused = await insertMaterial(ana.user.id, { status: 'Pausado' })
    const delivered = await insertMaterial(ana.user.id, { status: 'Entregado' })
    expect((await open(beto, paused.id)).status).toBe(404)
    expect((await open(beto, delivered.id)).status).toBe(404)
    expect((await open(beto, 'no-existe')).status).toBe(404)
  })
})

describe('mensajes', () => {
  it('enviar emite a ambos, notifica y cuenta no leídos', async () => {
    const conv = (await open(beto)).body
    const res = await send(beto, conv.id, '  ¿Sigue disponible?  ')
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ conversationId: conv.id, senderId: beto.user.id, text: '¿Sigue disponible?' })

    const messageEvents = realtime.events.filter((e) => e.event === 'message:new')
    expect(messageEvents.map((e) => e.userId).sort()).toEqual([ana.user.id, beto.user.id].sort())
    expect(messageEvents[0].payload).toEqual({ conversationId: conv.id, message: res.body })

    const notification = await prisma.notification.findFirst({ where: { userId: ana.user.id, category: 'mensajes' } })
    expect(notification).toMatchObject({ text: 'Beto te escribió: “¿Sigue disponible?”', link: `#/chat/${conv.id}` })

    const anaList = (await list(ana)).body
    expect(anaList).toHaveLength(1)
    expect(anaList[0]).toMatchObject({ unread: 1, lastMessage: { text: '¿Sigue disponible?' } })
    expect(anaList[0].material).toMatchObject({ id: materialId, title: 'Calculadora Casio fx-570' })
    expect(anaList[0].other).toMatchObject({ id: beto.user.id, name: 'Beto Díaz', rating: { value: 0, count: 0 } })
    expect((await list(beto)).body[0].unread).toBe(0)
  })

  it('recorta el texto largo en la notificación', async () => {
    const conv = (await open(beto)).body
    await send(beto, conv.id, 'a'.repeat(100))
    const notification = await prisma.notification.findFirst({ where: { userId: ana.user.id, category: 'mensajes' } })
    expect(notification?.text).toBe(`Beto te escribió: “${'a'.repeat(80)}…”`)
  })

  it('read deja en 0 y avisa al otro', async () => {
    const conv = (await open(beto)).body
    await send(beto, conv.id, 'hola')
    realtime.events.length = 0
    const res = await request(app).post(`/api/conversations/${conv.id}/read`).set(auth(ana.token))
    expect(res.status).toBe(204)
    expect((await list(ana)).body[0].unread).toBe(0)
    expect(realtime.events).toEqual([
      { userId: beto.user.id, event: 'conversation:read', payload: { conversationId: conv.id, userId: ana.user.id, readAt: expect.any(String) } },
    ])
  })

  it('quien no participa recibe 404 y ningún evento', async () => {
    const conv = (await open(beto)).body
    await send(beto, conv.id, 'hola')
    realtime.events.length = 0
    const notFound = { code: 'CONVERSATION_NOT_FOUND', message: 'Esta conversación ya no existe.' }
    const get = await request(app).get(`/api/conversations/${conv.id}/messages`).set(auth(carla.token))
    expect(get.status).toBe(404)
    expect(get.body.error).toMatchObject(notFound)
    expect((await send(carla, conv.id, 'intruso')).status).toBe(404)
    expect((await request(app).post(`/api/conversations/${conv.id}/read`).set(auth(carla.token))).status).toBe(404)
    expect((await list(carla)).body).toEqual([])
    expect(realtime.events.filter((e) => e.userId === carla.user.id)).toEqual([])
    expect(await prisma.message.count({ where: { senderId: carla.user.id } })).toBe(0)
  })

  it('valida el texto', async () => {
    const conv = (await open(beto)).body
    expect((await send(beto, conv.id, '   ')).status).toBe(400)
    expect((await send(beto, conv.id, 'a'.repeat(1001))).status).toBe(400)
  })

  it('pagina de a 50, del más viejo al más nuevo', async () => {
    const conv = (await open(beto)).body
    const base = Date.now() - 3_600_000
    await prisma.message.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        conversationId: conv.id,
        senderId: beto.user.id,
        text: `m${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    })
    const page = await request(app).get(`/api/conversations/${conv.id}/messages`).set(auth(ana.token))
    expect(page.status).toBe(200)
    expect(page.body).toHaveLength(50)
    expect(page.body[0].text).toBe('m10')
    expect(page.body[49].text).toBe('m59')
    const older = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .query({ before: page.body[0].createdAt })
      .set(auth(ana.token))
    expect(older.body.map((m: { text: string }) => m.text)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`))
  })
})
