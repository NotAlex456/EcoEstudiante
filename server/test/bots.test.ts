import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOT_CONFIRMATION, interestMessage } from '../../shared/bot-replies'
import { seed } from '../prisma/seed'
import { runDueJobs } from '../src/bots/jobs'
import { prisma } from '../src/db'
import { createNotifier } from '../src/notify/notify'
import { authHeader as auth, fakeRealtime, insertMaterial, makeApp, registerAndVerify, resetDb, testConfig } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>
let hub: Parameters<typeof runDueJobs>[1]
let beto: Who
let mariaId: string
let mariaMaterialId: string

const later = (seconds: number) => new Date(Date.now() + seconds * 1000)

function futureDate() {
  const d = new Date(Date.now() + 2 * 86_400_000)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function setup(botsEnabled: boolean) {
  await resetDb()
  await seed(prisma)
  realtime = fakeRealtime()
  const config = testConfig({ botsEnabled })
  hub = { config, realtime, notifier: createNotifier({ realtime }) }
  app = makeApp({ botsEnabled }, { realtime })
  beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
  const maria = await prisma.user.findUniqueOrThrow({ where: { email: 'bot.maria.quispe@upsjb.edu.pe' } })
  mariaId = maria.id
  mariaMaterialId = (await prisma.material.findFirstOrThrow({ where: { ownerId: mariaId, status: 'Disponible' } })).id
  realtime.events.length = 0
}

const openWithMaria = async () =>
  (await request(app).post('/api/conversations').set(auth(beto.token)).send({ materialId: mariaMaterialId })).body.id as string

describe('bots activados', () => {
  beforeEach(() => setup(true))

  it('María responde a un mensaje', async () => {
    const conversationId = await openWithMaria()
    await request(app).post(`/api/conversations/${conversationId}/messages`).set(auth(beto.token)).send({ text: '¿Sigue disponible?' })
    expect(await prisma.botJob.count({ where: { kind: 'reply' } })).toBe(1)
    realtime.events.length = 0

    expect(await runDueJobs(later(10), hub)).toBe(1)
    const last = await prisma.message.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: 'desc' } })
    expect(last).toMatchObject({ senderId: mariaId, text: '¡Hola! Sí, sigue disponible. ¿Cuándo te gustaría recogerlo?' })
    expect(realtime.events).toContainEqual(expect.objectContaining({ userId: beto.user.id, event: 'message:new' }))
    expect(await prisma.notification.findFirst({ where: { userId: beto.user.id, category: 'mensajes' } })).toMatchObject({
      text: 'María te escribió: “¡Hola! Sí, sigue disponible. ¿Cuándo te gustaría recogerlo?”',
    })
    expect(await runDueJobs(later(20), hub)).toBe(0)
  })

  it('María no responde si su material ya no está disponible', async () => {
    const conversationId = await openWithMaria()
    await request(app).post(`/api/conversations/${conversationId}/messages`).set(auth(beto.token)).send({ text: '¿Sigue disponible?' })
    await prisma.material.update({ where: { id: mariaMaterialId }, data: { status: 'Entregado' } })
    expect(await runDueJobs(later(10), hub)).toBe(1)
    expect(await prisma.message.count({ where: { conversationId, senderId: mariaId } })).toBe(0)
  })

  it('María confirma un acuerdo', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set(auth(beto.token))
      .send({ materialId: mariaMaterialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    expect(res.status).toBe(201)
    // La propuesta no dispara una respuesta automática, solo la confirmación.
    expect(await prisma.botJob.count({ where: { kind: 'reply' } })).toBe(0)
    expect(await runDueJobs(later(30), hub)).toBe(1)
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('Confirmado')
    expect((await prisma.material.findUniqueOrThrow({ where: { id: mariaMaterialId } })).status).toBe('Reservado')
    const last = await prisma.message.findFirstOrThrow({ where: { senderId: mariaId }, orderBy: { createdAt: 'desc' } })
    expect(last.text).toBe(BOT_CONFIRMATION)
  })

  it('un bot se interesa en lo que publica un usuario real', async () => {
    const material = await insertMaterial(beto.user.id, { title: 'Libro de Cálculo' })
    const { scheduleBuyerInterest } = await import('../src/bots/schedule')
    await scheduleBuyerInterest(hub.config, material.id)
    expect(await runDueJobs(later(70), hub)).toBe(1)
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { materialId: material.id }, include: { messages: true, buyer: true } })
    expect(conversation.buyer.isBot).toBe(true)
    expect(conversation.messages.map((m) => m.text)).toEqual([interestMessage({ title: 'Libro de Cálculo', mode: 'Venta' })])
    expect(await prisma.notification.count({ where: { userId: beto.user.id, category: 'mensajes' } })).toBe(1)
  })

  it('publicar por la API programa el interés de un bot', async () => {
    await prisma.upload.create({ data: { url: 'https://img.test/x.jpg', uploaderId: beto.user.id } })
    const { createApp } = await import('../src/app')
    const withImages = createApp(hub.config, {
      realtime,
      images: { mode: 'local', owns: () => true, save: async () => '', remove: async () => {} },
    })
    const res = await request(withImages)
      .post('/api/materials')
      .set(auth(beto.token))
      .send({
        title: 'Calculadora Casio fx-570',
        course: 'Matemática I',
        career: 'Ingeniería de Sistemas',
        cycle: 1,
        category: 'Calculadoras',
        mode: 'Venta',
        price: 30,
        condition: 'Buen estado',
        description: 'Funciona perfecto, con tapa y manual. Pequeñas marcas de uso.',
        images: ['https://img.test/x.jpg'],
      })
    expect(res.status).toBe(201)
    const job = await prisma.botJob.findFirstOrThrow({ where: { kind: 'buyer_interest' } })
    expect(job.payload).toEqual({ materialId: res.body.id })
    const delay = job.dueAt.getTime() - Date.now()
    expect(delay).toBeGreaterThan(25_000)
    expect(delay).toBeLessThanOrEqual(60_000)
  })

  it('los trabajos que ya no aplican se marcan hechos sin hacer nada', async () => {
    const res = await request(app)
      .post('/api/agreements')
      .set(auth(beto.token))
      .send({ materialId: mariaMaterialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    await request(app).post(`/api/agreements/${res.body.id}/cancel`).set(auth(beto.token))

    const mine = await insertMaterial(beto.user.id)
    const { scheduleBuyerInterest } = await import('../src/bots/schedule')
    await scheduleBuyerInterest(hub.config, mine.id)
    await prisma.material.update({ where: { id: mine.id }, data: { status: 'Pausado' } })

    const messagesBefore = await prisma.message.count()
    expect(await runDueJobs(later(120), hub)).toBe(2)
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('Cancelado')
    expect(await prisma.conversation.count({ where: { materialId: mine.id } })).toBe(0)
    expect(await prisma.message.count()).toBe(messagesBefore)
    expect(await prisma.botJob.count({ where: { doneAt: null } })).toBe(0)
    expect(await runDueJobs(later(200), hub)).toBe(0)
  })
})

describe('bots desactivados', () => {
  beforeEach(() => setup(false))

  it('no se crean trabajos', async () => {
    const conversationId = await openWithMaria()
    await request(app).post(`/api/conversations/${conversationId}/messages`).set(auth(beto.token)).send({ text: 'hola' })
    await request(app)
      .post('/api/agreements')
      .set(auth(beto.token))
      .send({ materialId: mariaMaterialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    expect(await prisma.botJob.count()).toBe(0)
  })
})
