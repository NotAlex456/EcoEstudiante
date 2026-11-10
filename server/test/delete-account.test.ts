import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/db'
import { authHeader, insertMaterial, makeApp, registerAndVerify, resetDb, validRegistration } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const app = makeApp()
const other = { email: 'otra.persona@upsjb.edu.pe', name: 'Otra Persona' }

const deleteMe = (token: string, password = validRegistration.password) =>
  request(app).delete('/api/users/me').set(authHeader(token)).send({ password })

describe('eliminar mi cuenta', () => {
  beforeEach(resetDb)

  it('con contraseña incorrecta responde 401 y no cambia nada', async () => {
    const { token } = await registerAndVerify(app)
    const res = await deleteMe(token, 'contraseña-mala-123')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_PASSWORD')
    expect((await request(app).get('/api/auth/me').set(authHeader(token))).status).toBe(200)
  })

  it('elimina: 204, el token deja de servir y el nombre pasa a "Usuario eliminado"', async () => {
    const { token, user } = await registerAndVerify(app)
    expect((await deleteMe(token)).status).toBe(204)
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row).toMatchObject({
      name: 'Usuario eliminado',
      email: `eliminado-${user.id}@eliminado.invalid`,
      deletedName: user.name,
      deletedEmail: user.email,
    })
    expect(row.deletedAt).not.toBeNull()
    expect(row.blockedAt).not.toBeNull()
    expect((await request(app).get('/api/auth/me').set(authHeader(token))).status).toBe(401)
    const log = await prisma.moderationLog.findFirst({ where: { targetId: user.id } })
    expect(log?.action).toBe('delete_account')
  })

  it('el correo original queda libre para registrarse de nuevo', async () => {
    const { token } = await registerAndVerify(app)
    await deleteMe(token)
    await expect(registerAndVerify(app)).resolves.toBeDefined()
  })

  it('borra guardados, búsquedas, notificaciones y celulares; y los guardados de otros que apuntan a sus materiales', async () => {
    const a = await registerAndVerify(app)
    const b = await registerAndVerify(app, other)
    const mineA = await insertMaterial(a.user.id)
    const mineB = await insertMaterial(b.user.id)
    await prisma.savedMaterial.createMany({
      data: [
        { userId: a.user.id, materialId: mineB.id },
        { userId: b.user.id, materialId: mineA.id },
      ],
    })
    await prisma.savedSearch.create({ data: { userId: a.user.id, query: 'casio', category: '', mode: '' } })
    await prisma.notification.create({ data: { userId: a.user.id, category: 'cuenta', text: 'hola', link: '#/' } })
    await prisma.deviceToken.create({ data: { token: 'tok-a', userId: a.user.id, platform: 'android' } })

    expect((await deleteMe(a.token)).status).toBe(204)
    expect(await prisma.savedMaterial.count()).toBe(0)
    expect(await prisma.savedSearch.count({ where: { userId: a.user.id } })).toBe(0)
    expect(await prisma.notification.count({ where: { userId: a.user.id } })).toBe(0)
    expect(await prisma.deviceToken.count({ where: { userId: a.user.id } })).toBe(0)
  })

  it('cancela sus acuerdos activos, libera el material reservado y avisa a la otra persona', async () => {
    const a = await registerAndVerify(app)
    const b = await registerAndVerify(app, other)
    const material = await insertMaterial(b.user.id, { status: 'Reservado' })
    const agreement = await prisma.agreement.create({
      data: { materialId: material.id, buyerId: a.user.id, sellerId: b.user.id, place: 'Biblioteca', date: '2026-11-20', time: '10:00', status: 'Confirmado' },
    })

    expect((await deleteMe(a.token)).status).toBe(204)
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: agreement.id } })).status).toBe('Cancelado')
    expect((await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).status).toBe('Disponible')
    const notice = await prisma.notification.findFirst({ where: { userId: b.user.id, category: 'acuerdos' } })
    expect(notice?.text).toContain('eliminó su cuenta')
  })

  it('sus reseñas escritas pasan a firmarse como "Usuario eliminado"', async () => {
    const a = await registerAndVerify(app)
    const b = await registerAndVerify(app, other)
    await prisma.review.create({ data: { authorId: a.user.id, authorName: a.user.name, targetId: b.user.id, stars: 5, comment: 'Todo bien', materialTitle: 'Libro' } })
    await deleteMe(a.token)
    expect((await prisma.review.findFirstOrThrow({ where: { targetId: b.user.id } })).authorName).toBe('Usuario eliminado')
  })

  it('sus publicaciones desaparecen de Explorar y su perfil da 404', async () => {
    const a = await registerAndVerify(app)
    const material = await insertMaterial(a.user.id)
    await deleteMe(a.token)
    const list = await request(app).get('/api/materials')
    expect(list.body.items.map((m: { id: string }) => m.id)).not.toContain(material.id)
    expect((await request(app).get(`/api/users/${a.user.id}`)).status).toBe(404)
  })

  it('eliminar dos veces con el token viejo responde 401, no 500', async () => {
    const { token } = await registerAndVerify(app)
    await deleteMe(token)
    expect((await deleteMe(token)).status).toBe(401)
  })
})
