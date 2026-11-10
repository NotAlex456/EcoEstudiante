import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import type { ImageStorage } from '../src/integrations/images'
import { makeApp, registerAndVerify, resetDb } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const removed: string[] = []
const images: ImageStorage = {
  mode: 'local',
  owns: (url) => url.startsWith('https://img.test/'),
  save: async () => 'https://img.test/nueva.jpg',
  remove: async (url) => void removed.push(url),
}
const app = makeApp({}, { images })

export const validMaterial = {
  title: 'Calculadora Casio fx-570',
  course: 'Matemática I',
  career: 'Ingeniería de Sistemas',
  cycle: 1,
  category: 'Calculadoras',
  mode: 'Venta',
  price: 30,
  condition: 'Buen estado',
  description: 'Funciona perfecto, con tapa y manual. Pequeñas marcas de uso.',
  images: ['https://img.test/a.jpg'],
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
type Who = { token: string; user: { id: string } }
let counter = 0
/** Registra las URLs como subidas por `who` (lo que hace POST /uploads). */
const own = (who: Who, urls: unknown) =>
  prisma.upload.createMany({ data: (Array.isArray(urls) ? urls : []).map((url) => ({ url, uploaderId: who.user.id })), skipDuplicates: true })
/** Publica como `who`. Con el material por defecto usa una foto nueva cada vez. */
const create = async (who: Who, body: Record<string, unknown> = validMaterial) => {
  const payload = body === validMaterial ? { ...validMaterial, images: [`https://img.test/f${++counter}.jpg`] } : body
  await own(who, payload.images)
  return request(app).post('/api/materials').set(auth(who.token)).send(payload)
}
const list = (query = '') => request(app).get(`/api/materials${query}`)

let ana: { token: string; user: { id: string } }
let beto: { token: string; user: { id: string } }

describe('materiales: crear, listar y ver', () => {
  beforeEach(async () => {
    await resetDb()
    removed.length = 0
    ana = await registerAndVerify(app)
    beto = await registerAndVerify(app, { email: 'beto.rojas@upsjb.edu.pe', name: 'Beto Rojas' })
  })

  it('publica con las etiquetas de la app y el dueño del token', async () => {
    const res = await create(ana, { ...validMaterial, mode: 'Donación', price: 15, condition: 'Como nuevo' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      mode: 'Donación',
      price: 0,
      condition: 'Como nuevo',
      status: 'Disponible',
      ownerId: ana.user.id,
      images: ['https://img.test/a.jpg'],
      owner: { id: ana.user.id, name: 'Ana Torres', rating: { value: 0, count: 0 } },
    })
    expect(typeof res.body.createdAt).toBe('string')
  })

  it('valida el precio de venta', async () => {
    for (const price of [0, 1001]) {
      const res = await create(ana, { ...validMaterial, price })
      expect(res.status).toBe(400)
      expect(res.body.error.fields.price).toBe('El precio de venta va de S/ 1 a S/ 1000.')
    }
  })

  it('solo acepta fotos subidas desde la app, entre 1 y 5', async () => {
    const res = await create(ana, { ...validMaterial, images: ['https://evil.pe/x.jpg'] })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.images).toBe('Usa fotos subidas desde la app.')
    expect((await create(ana, { ...validMaterial, images: [] })).status).toBe(400)
    expect((await create(ana, { ...validMaterial, images: Array(6).fill('https://img.test/a.jpg') })).status).toBe(400)
  })

  it('exige sesión y rechaza campos que no se pueden elegir', async () => {
    expect((await request(app).post('/api/materials').send(validMaterial)).status).toBe(401)
    expect((await create(ana, { ...validMaterial, ownerId: beto.user.id })).status).toBe(400)
    expect((await create(ana, { ...validMaterial, status: 'Entregado' })).status).toBe(400)
  })

  it('lista los materiales disponibles y reservados con su dueño', async () => {
    await seed(prisma)
    const res = await list()
    expect(res.status).toBe(200)
    expect(res.body.page).toBe(1)
    expect(res.body.hasMore).toBe(false)
    const statuses = new Set(res.body.items.map((m: { status: string }) => m.status))
    expect([...statuses].every((s) => s === 'Disponible' || s === 'Reservado')).toBe(true)
    const dates = res.body.items.map((m: { createdAt: string }) => Date.parse(m.createdAt))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    const maria = res.body.items.find((m: { ownerId: string }) => m.ownerId === 'u-maria')
    expect(maria.owner).toMatchObject({ name: 'María Fernanda Quispe', rating: { value: 4.7, count: 3 } })
  })

  it('filtra por texto, categoría, modalidad, carrera, ciclo, estado y precio', async () => {
    await seed(prisma)
    const ids = async (query: string) => (await list(query)).body.items.map((m: { id: string }) => m.id).sort()
    const all = (await list()).body.items as { id: string; title: string; course: string; category: string; mode: string; career: string; cycle: number; condition: string; price: number }[]
    const expected = (fn: (m: (typeof all)[number]) => boolean) => all.filter(fn).map((m) => m.id).sort()

    expect(await ids('?q=CALCULADORA')).toEqual(expected((m) => /calculadora/i.test(`${m.title} ${m.course} ${m.category}`)))
    expect(await ids('?q=c%C3%A1lculo')).toEqual(expected((m) => /cálculo/i.test(`${m.title} ${m.course}`)))
    expect(await ids('?category=Libros')).toEqual(expected((m) => m.category === 'Libros'))
    expect(await ids(`?mode=${encodeURIComponent('Donación')}`)).toEqual(expected((m) => m.mode === 'Donación'))
    expect(await ids('?career=Contabilidad')).toEqual(expected((m) => m.career === 'Contabilidad'))
    expect(await ids('?cycle=4')).toEqual(expected((m) => m.cycle === 4))
    expect(await ids('?condition=Usado')).toEqual(expected((m) => m.condition === 'Usado'))
    expect(await ids('?maxPrice=20')).toEqual(expected((m) => m.mode !== 'Venta' || m.price <= 20))
    expect((await ids('?category=Libros')).length).toBeGreaterThan(0)
    expect((await ids('?maxPrice=20')).length).toBeLessThan(all.length)
  })

  it('pagina de a 20 y valida la página', async () => {
    await prisma.material.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        ownerId: ana.user.id, title: `Material ${i}`, course: 'Curso', career: 'Derecho', cycle: 1,
        category: 'Apuntes' as const, mode: 'Donacion' as const, condition: 'Usado' as const, description: 'x'.repeat(20),
      })),
    })
    const p1 = await list('?page=1')
    expect([p1.body.items.length, p1.body.hasMore]).toEqual([20, true])
    const p2 = await list('?page=2')
    expect([p2.body.items.length, p2.body.hasMore]).toEqual([5, false])
    expect((await list('?page=0')).status).toBe(400)
    expect((await list('?page=abc')).status).toBe(400)
    expect((await list('?category=x')).status).toBe(400) // categoría libre, pero de 2 a 40 caracteres
  })

  it('un material pausado solo lo ve su dueño', async () => {
    const { body } = await create(ana)
    await prisma.material.update({ where: { id: body.id }, data: { status: 'Pausado' } })
    expect((await request(app).get(`/api/materials/${body.id}`).set(auth(ana.token))).status).toBe(200)
    const other = await request(app).get(`/api/materials/${body.id}`).set(auth(beto.token))
    expect(other.status).toBe(404)
    expect(other.body.error).toEqual({ code: 'MATERIAL_NOT_FOUND', message: 'Esta publicación ya no existe.' })
    expect((await request(app).get(`/api/materials/${body.id}`)).status).toBe(404)
    expect((await request(app).get('/api/materials/no-existe')).status).toBe(404)
  })

  it('un material eliminado solo lo ven quienes tenían chat sobre él', async () => {
    const { body } = await create(ana)
    await prisma.conversation.create({ data: { materialId: body.id, buyerId: beto.user.id, sellerId: ana.user.id } })
    await prisma.material.update({ where: { id: body.id }, data: { status: 'Eliminado' } })
    const carla = await registerAndVerify(app, { email: 'carla.diaz@upsjb.edu.pe' })
    expect((await request(app).get(`/api/materials/${body.id}`).set(auth(beto.token))).status).toBe(200)
    expect((await request(app).get(`/api/materials/${body.id}`).set(auth(carla.token))).status).toBe(404)
  })

  it('un token inválido en una ruta pública se trata como anónimo', async () => {
    const { body } = await create(ana)
    expect((await request(app).get(`/api/materials/${body.id}`).set({ Authorization: 'Bearer basura' })).status).toBe(200)
  })

  it('avisa a otros usuarios con una búsqueda guardada que coincide', async () => {
    await prisma.savedSearch.create({ data: { userId: beto.user.id, query: 'casio', category: 'Todos', mode: 'Todos' } })
    await prisma.savedSearch.create({ data: { userId: beto.user.id, query: '', category: 'Libros', mode: 'Todos' } })
    await prisma.savedSearch.create({ data: { userId: ana.user.id, query: 'casio', category: 'Todos', mode: 'Todos' } })
    const { body } = await create(ana)
    const notes = await prisma.notification.findMany({ where: { category: 'busquedas' } })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      userId: beto.user.id,
      link: `#/material/${body.id}`,
      text: `Nuevo material para tu búsqueda “casio”: ${validMaterial.title}`,
    })
  })
})

describe('materiales: editar, estado, borrar y mis publicaciones', () => {
  beforeEach(async () => {
    await resetDb()
    removed.length = 0
    ana = await registerAndVerify(app)
    beto = await registerAndVerify(app, { email: 'beto.rojas@upsjb.edu.pe', name: 'Beto Rojas' })
  })

  const edit = async (who: Who, id: string, body: Record<string, unknown>) => {
    await own(who, body.images)
    return request(app).patch(`/api/materials/${id}`).set(auth(who.token)).send(body)
  }
  const setStatus = (token: string, id: string, status: string) =>
    request(app).patch(`/api/materials/${id}/status`).set(auth(token)).send({ status })
  const remove = (token: string, id: string) => request(app).delete(`/api/materials/${id}`).set(auth(token))

  it('el dueño edita datos y fotos; la foto quitada se borra del almacenamiento', async () => {
    const { body } = await create(ana, { ...validMaterial, images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'] })
    const res = await edit(ana, body.id, { ...validMaterial, title: 'Casio fx-570 (rebajada)', images: ['https://img.test/b.jpg', 'https://img.test/c.jpg'] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Casio fx-570 (rebajada)', images: ['https://img.test/b.jpg', 'https://img.test/c.jpg'] })
    expect(removed).toEqual(['https://img.test/a.jpg'])
  })

  it('al editar se pueden conservar las fotos que el material ya tenía, aunque sean externas', async () => {
    await seed(prisma)
    const maria = await prisma.material.findUniqueOrThrow({ where: { id: 'm-1' }, include: { images: true } })
    await prisma.material.update({ where: { id: 'm-1' }, data: { ownerId: ana.user.id } })
    const keep = maria.images.map((i) => i.url)
    const res = await edit(ana, 'm-1', { ...validMaterial, images: keep })
    expect(res.status).toBe(200)
    expect(res.body.images).toEqual(keep)
    expect((await edit(ana, 'm-1', { ...validMaterial, images: ['https://evil.pe/x.jpg'] })).status).toBe(400)
  })

  it('otra persona no puede editar, cambiar el estado ni borrar', async () => {
    const { body } = await create(ana)
    const expected = { code: 'FORBIDDEN', message: 'Solo quien publicó puede modificar este material.' }
    for (const res of [
      await edit(beto, body.id, { ...validMaterial, title: 'Robada robada' }),
      await setStatus(beto.token, body.id, 'Pausado'),
      await remove(beto.token, body.id),
    ]) {
      expect(res.status).toBe(403)
      expect(res.body.error).toEqual(expected)
    }
    const stored = await prisma.material.findUniqueOrThrow({ where: { id: body.id } })
    expect([stored.title, stored.status]).toEqual([validMaterial.title, 'Disponible'])
  })

  it('solo permite las transiciones de estado previstas', async () => {
    const { body } = await create(ana)
    expect((await setStatus(ana.token, body.id, 'Pausado')).body.status).toBe('Pausado')
    expect((await setStatus(ana.token, body.id, 'Disponible')).body.status).toBe('Disponible')
    expect((await setStatus(ana.token, body.id, 'Entregado')).body.status).toBe('Entregado')
    const back = await setStatus(ana.token, body.id, 'Disponible')
    expect(back.status).toBe(409)
    expect(back.body.error).toEqual({ code: 'INVALID_TRANSITION', message: 'No se puede cambiar la publicación a ese estado.' })

    const other = await create(ana)
    await prisma.material.update({ where: { id: other.body.id }, data: { status: 'Reservado' } })
    expect((await setStatus(ana.token, other.body.id, 'Pausado')).status).toBe(409)
    expect((await setStatus(ana.token, other.body.id, 'Entregado')).status).toBe(200)
    expect((await setStatus(ana.token, other.body.id, 'Reservado')).status).toBe(400)
  })

  it('borrar sin chats elimina la fila y sus fotos (salvo las sembradas)', async () => {
    const { body } = await create(ana, { ...validMaterial, images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'] })
    expect((await remove(ana.token, body.id)).status).toBe(204)
    expect(await prisma.material.findUnique({ where: { id: body.id } })).toBeNull()
    expect(removed.sort()).toEqual(['https://img.test/a.jpg', 'https://img.test/b.jpg'])
    expect((await remove(ana.token, body.id)).status).toBe(404)
  })

  it('borrar con chats lo marca Eliminado, lo oculta y cancela sus acuerdos activos', async () => {
    const { body } = await create(ana)
    await prisma.conversation.create({ data: { materialId: body.id, buyerId: beto.user.id, sellerId: ana.user.id } })
    const agreement = await prisma.agreement.create({
      data: { materialId: body.id, buyerId: beto.user.id, sellerId: ana.user.id, place: 'Biblioteca central', date: '2026-12-01', time: '12:00' },
    })
    expect((await remove(ana.token, body.id)).status).toBe(204)
    expect((await prisma.material.findUniqueOrThrow({ where: { id: body.id } })).status).toBe('Eliminado')
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: agreement.id } })).status).toBe('Cancelado')
    expect((await list()).body.items.map((m: { id: string }) => m.id)).not.toContain(body.id)
    const mine = await request(app).get('/api/users/me/materials').set(auth(ana.token))
    expect(mine.body.map((m: { id: string }) => m.id)).not.toContain(body.id)
    expect((await edit(ana, body.id, validMaterial)).status).toBe(404)
  })

  it('mis publicaciones incluye las pausadas y no las ajenas', async () => {
    const mine = await create(ana)
    await setStatus(ana.token, mine.body.id, 'Pausado')
    await create(beto)
    const res = await request(app).get('/api/users/me/materials').set(auth(ana.token))
    expect(res.status).toBe(200)
    expect(res.body.map((m: { id: string; status: string }) => [m.id, m.status])).toEqual([[mine.body.id, 'Pausado']])
    expect((await request(app).get('/api/users/me/materials')).status).toBe(401)
  })
})

describe('fotos: solo las propias y sin borrar las que otra publicación usa', () => {
  beforeEach(async () => {
    await resetDb()
    removed.length = 0
    ana = await registerAndVerify(app)
    beto = await registerAndVerify(app, { email: 'beto.rojas@upsjb.edu.pe', name: 'Beto Rojas' })
  })

  const post = (who: Who, images: string[]) =>
    request(app).post('/api/materials').set(auth(who.token)).send({ ...validMaterial, images })

  it('no acepta una foto que subió otra persona', async () => {
    await own(ana, ['https://img.test/de-ana.jpg'])
    const res = await post(beto, ['https://img.test/de-ana.jpg'])
    expect(res.status).toBe(400)
    expect(res.body.error.fields.images).toBe('Usa fotos subidas desde la app.')
  })

  it('no acepta una foto subida que nadie registró', async () => {
    expect((await post(ana, ['https://img.test/huerfana.jpg'])).status).toBe(400)
  })

  it('no acepta reutilizar una foto que ya usa otra publicación', async () => {
    await own(ana, ['https://img.test/u.jpg'])
    expect((await post(ana, ['https://img.test/u.jpg'])).status).toBe(201)
    expect((await post(ana, ['https://img.test/u.jpg'])).status).toBe(400)
  })

  it('al borrar no elimina el archivo si otra publicación sigue usando esa foto', async () => {
    await own(ana, ['https://img.test/u.jpg'])
    const first = await post(ana, ['https://img.test/u.jpg'])
    const other = await prisma.material.create({
      data: {
        ownerId: beto.user.id, title: 'Otra', course: 'C', career: 'Derecho', cycle: 1, category: 'Libros',
        mode: 'Donacion', condition: 'Usado', description: 'x'.repeat(20),
        images: { create: [{ url: 'https://img.test/u.jpg', publicId: 'u', position: 0 }] },
      },
    })
    expect((await request(app).delete(`/api/materials/${first.body.id}`).set(auth(ana.token))).status).toBe(204)
    expect(removed).toEqual([])
    expect(other.id).toBeTruthy()
  })
})
