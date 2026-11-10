import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatDate, formatTime } from '../../shared/format'
import { prisma } from '../src/db'
import { checkSchedule } from '../src/modules/agreements/rules'
import { authHeader as auth, fakeRealtime, insertMaterial, makeApp, registerAndVerify, resetDb } from './helpers'

describe('checkSchedule', () => {
  const now = new Date('2026-11-10T10:00:00-05:00') // martes 10:00 en Lima
  it('acepta un horario válido', () => {
    expect(checkSchedule('2026-11-11', '12:30', now)).toBeNull()
    expect(checkSchedule('2026-11-10', '10:30', now)).toBeNull()
    expect(checkSchedule('2026-11-14', '20:59', now)).toBeNull()
  })
  it('rechaza formatos raros', () => {
    for (const [d, t] of [['2026-13-01', '12:00'], ['2026-02-30', '12:00'], ['11/11/2026', '12:00'], ['2026-11-11', '25:00'], ['2026-11-11', '9:00']])
      expect(checkSchedule(d, t, now)).toBe('Elige una fecha y hora válidas.')
  })
  it('rechaza lo que ya pasó', () => {
    expect(checkSchedule('2026-11-10', '09:59', now)).toBe('Elige una fecha y hora que todavía no hayan pasado.')
    expect(checkSchedule('2026-11-09', '12:00', now)).toBe('Elige una fecha y hora que todavía no hayan pasado.')
  })
  it('rechaza fuera del horario de clases', () => {
    const msg = 'Para tu seguridad, elige un horario de clases (7:00 a. m. a 9:00 p. m.).'
    expect(checkSchedule('2026-11-11', '21:00', now)).toBe(msg)
    expect(checkSchedule('2026-11-11', '06:59', now)).toBe(msg)
  })
  it('rechaza domingos', () => {
    expect(checkSchedule('2026-11-15', '12:00', now)).toBe('El campus no atiende los domingos. Elige otro día.')
  })
})

/** Un día hábil (no domingo) al menos 2 días después de hoy, como YYYY-MM-DD. */
function futureDate() {
  const d = new Date(Date.now() + 2 * 86_400_000)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>
let ana: Who, beto: Who, carla: Who
let materialId: string
const date = futureDate()
const proposal = () => ({ materialId, place: 'Biblioteca central', date, time: '12:30', note: 'Llevo sencillo' })
const propose = (who: Who, body: object = proposal()) => request(app).post('/api/agreements').set(auth(who.token)).send(body)
const act = (who: Who, id: string, action: string, body: object = {}) =>
  request(app).post(`/api/agreements/${id}/${action}`).set(auth(who.token)).send(body)
const materialStatus = async () => (await prisma.material.findUniqueOrThrow({ where: { id: materialId } })).status

beforeEach(async () => {
  await resetDb()
  realtime = fakeRealtime()
  app = makeApp({}, { realtime })
  ana = await registerAndVerify(app)
  beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
  carla = await registerAndVerify(app, { email: 'carla.ruiz@upsjb.edu.pe', name: 'Carla Ruiz' })
  materialId = (await insertMaterial(ana.user.id, { title: 'Calculadora Casio' })).id
  realtime.events.length = 0
})

describe('acuerdos', () => {
  it('flujo completo: proponer, confirmar, completar y reseñar', async () => {
    const proposed = await propose(beto)
    expect(proposed.status).toBe(201)
    expect(proposed.body).toMatchObject({ materialId, buyerId: beto.user.id, sellerId: ana.user.id, status: 'Pendiente', note: 'Llevo sencillo', review: null })
    const id = proposed.body.id

    // El mensaje de propuesta queda en la conversación con el texto exacto.
    const conv = await prisma.conversation.findFirstOrThrow({ where: { materialId, buyerId: beto.user.id }, include: { messages: true } })
    expect(conv.messages.map((m) => m.text)).toEqual([
      `📍 Propuesta de entrega: Biblioteca central, ${formatDate(date)} a las ${formatTime('12:30')}. Nota: Llevo sencillo`,
    ])
    expect(realtime.events.some((e) => e.event === 'agreement:updated' && e.userId === ana.user.id)).toBe(true)

    const confirmed = await act(ana, id, 'confirm')
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.status).toBe('Confirmado')
    expect(await materialStatus()).toBe('Reservado')
    expect(realtime.events).toContainEqual({ userId: beto.user.id, event: 'material:updated', payload: { materialId, status: 'Reservado' } })

    const completed = await act(beto, id, 'complete')
    expect(completed.body.status).toBe('Completado')
    expect(await materialStatus()).toBe('Entregado')

    const reviewed = await act(beto, id, 'review', { stars: 5, comment: 'Muy puntual' })
    expect(reviewed.status).toBe(201)
    expect(reviewed.body.review).toMatchObject({ stars: 5, comment: 'Muy puntual' })

    const notices = await prisma.notification.findMany({ where: { category: 'acuerdos' }, orderBy: { createdAt: 'asc' } })
    expect(notices.map((n) => [n.userId, n.text])).toEqual([
      [ana.user.id, 'Beto propuso entregar “Calculadora Casio” en Biblioteca central.'],
      [beto.user.id, 'Ana confirmó la entrega en Biblioteca central.'],
      [ana.user.id, 'Beto confirmó que recibió “Calculadora Casio”.'],
    ])
    expect(notices[0].link).toBe(`#/acuerdo/${id}`)

    const profile = await request(app).get(`/api/users/${ana.user.id}`)
    expect(profile.body.rating).toEqual({ value: 5, count: 1 })
    expect(profile.body.reviews[0]).toMatchObject({ authorName: 'Beto Díaz', materialTitle: 'Calculadora Casio', stars: 5 })

    const mine = await request(app).get('/api/agreements').set(auth(ana.token))
    expect(mine.body.map((a: { id: string }) => a.id)).toEqual([id])
  })

  it('dos propuestas simultáneas: una pasa y la otra recibe 409', async () => {
    const [a, b] = await Promise.all([propose(beto), propose(carla)])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const loser = a.status === 409 ? a : b
    expect(loser.body.error).toMatchObject({ code: 'AGREEMENT_ACTIVE', message: 'Ya hay una entrega en curso para este material.' })
    expect(await prisma.agreement.count({ where: { materialId, status: { in: ['Pendiente', 'Confirmado'] } } })).toBe(1)
  })

  it('permisos: cada acción le corresponde a quien debe', async () => {
    const id = (await propose(beto)).body.id
    const forbidden = await act(beto, id, 'confirm')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Esta acción le corresponde a la otra persona.' })
    for (const action of ['confirm', 'cancel', 'complete', 'review']) {
      const res = await act(carla, id, action, { stars: 5, comment: '' })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('AGREEMENT_NOT_FOUND')
    }
    expect((await act(beto, id, 'complete')).status).toBe(409) // aún Pendiente
    await act(ana, id, 'confirm')
    expect((await act(ana, id, 'complete')).status).toBe(403)
    await act(beto, id, 'complete')
    expect((await act(beto, id, 'review', { stars: 4, comment: '' })).status).toBe(201)
    const again = await act(beto, id, 'review', { stars: 4, comment: '' })
    expect(again.status).toBe(409)
    expect(again.body.error).toMatchObject({ code: 'ALREADY_REVIEWED', message: 'Ya valoraste esta entrega.' })
  })

  it('cancelar un acuerdo confirmado libera el material', async () => {
    const id = (await propose(beto)).body.id
    await act(ana, id, 'confirm')
    const cancelled = await act(ana, id, 'cancel')
    expect(cancelled.body.status).toBe('Cancelado')
    expect(await materialStatus()).toBe('Disponible')
    const notice = await prisma.notification.findFirst({ where: { userId: beto.user.id, text: { contains: 'canceló' } } })
    expect(notice?.text).toBe('Ana canceló la entrega de “Calculadora Casio”.')
    expect((await propose(carla)).status).toBe(201)
  })

  it('valida lugar, fecha y material', async () => {
    const badPlace = await propose(beto, { ...proposal(), place: 'Mi casa' })
    expect(badPlace.status).toBe(400)
    const sunday = await propose(beto, { ...proposal(), date: '2030-01-06' })
    expect(sunday.status).toBe(400)
    expect(sunday.body.error.message).toBe('El campus no atiende los domingos. Elige otro día.')
    expect((await propose(ana)).status).toBe(400)

    const id = (await propose(beto)).body.id
    await act(ana, id, 'confirm')
    const reserved = await propose(carla)
    expect(reserved.status).toBe(409)
    expect(reserved.body.error.code).toBe('MATERIAL_UNAVAILABLE')
  })
})
