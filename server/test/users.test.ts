import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import { makeApp, registerAndVerify, resetDb, testConfig } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const app = makeApp()
const me = (token?: string) => {
  const req = request(app).get('/api/auth/me')
  return token === undefined ? req : req.set('Authorization', token)
}
const SESSION_EXPIRED = { code: 'UNAUTHENTICATED', message: 'Tu sesión expiró. Vuelve a ingresar.' }

describe('sesión', () => {
  beforeEach(resetDb)

  it('GET /auth/me con token válido devuelve al usuario sin hash', async () => {
    const { token, user } = await registerAndVerify(app)
    const res = await me(`Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: user.id, email: user.email, verified: true })
    expect(res.body.passwordHash).toBeUndefined()
  })

  it('GET /auth/me no cuenta para el límite de intentos', async () => {
    const limited = makeApp({ authRateLimit: 3 })
    const { token } = await registerAndVerify(app)
    for (let i = 0; i < 5; i++) {
      expect((await request(limited).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200)
    }
  })

  it('tokens ausentes, inválidos, ajenos, vencidos o de usuarios borrados responden 401', async () => {
    const { token, user } = await registerAndVerify(app)
    const { jwtSecret } = testConfig()
    const cases = [
      undefined,
      'Bearer basura',
      token,
      `Bearer ${jwt.sign({}, 'otro-secreto-que-no-es-el-del-servidor', { subject: user.id })}`,
      `Bearer ${jwt.sign({}, jwtSecret, { subject: user.id, expiresIn: -1 })}`,
      `Bearer ${jwt.sign({}, jwtSecret, { subject: user.id, algorithm: 'HS512' })}`,
    ]
    for (const header of cases) {
      const res = await me(header)
      expect(res.status, String(header)).toBe(401)
      expect(res.body.error).toEqual(SESSION_EXPIRED)
    }
    await prisma.user.delete({ where: { id: user.id } })
    expect((await me(`Bearer ${token}`)).status).toBe(401)
  })
})

describe('usuarios', () => {
  beforeEach(resetDb)

  const patch = (token: string, body: object) =>
    request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send(body)

  it('PATCH /users/me cambia nombre y ciclo', async () => {
    const { token } = await registerAndVerify(app)
    const res = await patch(token, { name: '  Ana Lucía Torres ', cycle: 5 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Ana Lucía Torres', cycle: 5, career: 'Contabilidad' })
  })

  it('PATCH /users/me rechaza vacío, correo y valores inválidos', async () => {
    const { token } = await registerAndVerify(app)
    expect((await patch(token, {})).status).toBe(400)
    expect((await patch(token, { email: 'otro@upsjb.edu.pe' })).status).toBe(400)
    expect((await patch(token, { career: 'Astrología' })).status).toBe(400)
    expect((await patch(token, { cycle: 0 })).status).toBe(400)
  })

  it('PATCH /users/me requiere sesión', async () => {
    expect((await request(app).patch('/api/users/me').send({ cycle: 2 })).status).toBe(401)
  })

  it('guarda las preferencias de notificación', async () => {
    const { token } = await registerAndVerify(app)
    const prefs = { push: true, quietNight: true, categories: { mensajes: true, acuerdos: true, busquedas: false, cuenta: true } }
    expect((await patch(token, { notificationPrefs: prefs })).status).toBe(200)
    expect((await me(`Bearer ${token}`)).body.notificationPrefs).toEqual(prefs)
  })

  it('rechaza preferencias incompletas', async () => {
    const { token } = await registerAndVerify(app)
    expect((await patch(token, { notificationPrefs: { push: false } })).status).toBe(400)
  })

  it('GET /users/:id devuelve perfil público con reputación y reseñas', async () => {
    await seed(prisma)
    const res = await request(app).get('/api/users/u-maria')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'u-maria', name: 'María Fernanda Quispe', career: 'Ingeniería de Sistemas', cycle: 8 })
    expect(res.body.rating).toEqual({ value: 4.7, count: 3 })
    expect(res.body.reviews).toHaveLength(3)
    expect(res.body.reviews[0]).toMatchObject({ authorName: 'Kevin Huamán', stars: 5, materialTitle: 'Calculadora Casio fx-82' })
    expect(res.body.email).toBeUndefined()
    const ids = res.body.materials.map((m: { id: string; ownerId: string; status: string }) => [m.ownerId, m.status])
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(([owner, status]: string[]) => owner === 'u-maria' && status === 'Disponible')).toBe(true)
  })

  it('un usuario sin reseñas tiene reputación 0', async () => {
    const { user } = await registerAndVerify(app)
    expect((await request(app).get(`/api/users/${user.id}`)).body.rating).toEqual({ value: 0, count: 0 })
  })

  it('GET /users/:id inexistente o sin verificar responde 404', async () => {
    const res = await request(app).get('/api/users/no-existe')
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual({ code: 'USER_NOT_FOUND', message: 'Este estudiante no existe.' })
  })
})
