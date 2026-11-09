import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import { makeApp, registerAndVerify, resetDb } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const app = makeApp()
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
let ana: { token: string }
let beto: { token: string }

beforeEach(async () => {
  await resetDb()
  await seed(prisma)
  ana = await registerAndVerify(app)
  beto = await registerAndVerify(app, { email: 'beto.rojas@upsjb.edu.pe' })
})

describe('materiales guardados', () => {
  const save = (id: string) => request(app).put(`/api/saved/${id}`).set(auth(ana.token))
  const unsave = (id: string) => request(app).delete(`/api/saved/${id}`).set(auth(ana.token))
  const saved = () => request(app).get('/api/saved').set(auth(ana.token))

  it('guarda y quita de forma idempotente', async () => {
    expect((await save('m-1')).status).toBe(204)
    expect((await save('m-1')).status).toBe(204)
    expect((await save('m-2')).status).toBe(204)
    expect((await saved()).body.map((m: { id: string }) => m.id).sort()).toEqual(['m-1', 'm-2'])
    expect((await unsave('m-1')).status).toBe(204)
    expect((await unsave('m-1')).status).toBe(204)
    expect((await saved()).body.map((m: { id: string }) => m.id)).toEqual(['m-2'])
  })

  it('no mezcla los guardados de otro usuario y no lista los eliminados', async () => {
    await save('m-1')
    await save('m-2')
    await prisma.material.update({ where: { id: 'm-2' }, data: { status: 'Eliminado' } })
    expect((await request(app).get('/api/saved').set(auth(beto.token))).body).toEqual([])
    expect((await saved()).body.map((m: { id: string }) => m.id)).toEqual(['m-1'])
  })

  it('guardar un material inexistente responde 404 y sin sesión 401', async () => {
    expect((await save('no-existe')).status).toBe(404)
    expect((await request(app).put('/api/saved/m-1')).status).toBe(401)
  })
})

describe('búsquedas guardadas', () => {
  const post = (token: string, body: object) => request(app).post('/api/saved-searches').set(auth(token)).send(body)
  const search = { query: 'física', category: 'Todos', mode: 'Todos' }

  it('crea, lista y no duplica búsquedas idénticas', async () => {
    const first = await post(ana.token, search)
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject(search)
    const again = await post(ana.token, search)
    expect(again.status).toBe(200)
    expect(again.body.id).toBe(first.body.id)
    const res = await request(app).get('/api/saved-searches').set(auth(ana.token))
    expect(res.body).toHaveLength(1)
  })

  it('valida categoría y modalidad', async () => {
    expect((await post(ana.token, { ...search, category: 'Juguetes' })).status).toBe(400)
    expect((await post(ana.token, { ...search, mode: 'Alquiler' })).status).toBe(400)
    expect((await post(ana.token, { ...search, category: 'Libros', mode: 'Donación' })).status).toBe(201)
  })

  it('solo el dueño puede borrar su búsqueda', async () => {
    const { body } = await post(ana.token, search)
    expect((await request(app).delete(`/api/saved-searches/${body.id}`).set(auth(beto.token))).status).toBe(404)
    expect((await request(app).delete(`/api/saved-searches/${body.id}`).set(auth(ana.token))).status).toBe(204)
    expect((await request(app).get('/api/saved-searches').set(auth(ana.token))).body).toEqual([])
  })
})

describe('materiales pausados en guardados y reportes', () => {
  const pause = () => prisma.material.update({ where: { id: 'm-1' }, data: { status: 'Pausado' } })

  it('un material pausado ajeno no aparece en mis guardados ni se puede guardar', async () => {
    await request(app).put('/api/saved/m-1').set(auth(ana.token))
    await pause()
    expect((await request(app).get('/api/saved').set(auth(ana.token))).body).toEqual([])
    expect((await request(app).put('/api/saved/m-1').set(auth(beto.token))).status).toBe(404)
  })

  it('el dueño sí ve su material pausado en sus guardados', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { email: 'ana.torres@upsjb.edu.pe' } })
    await prisma.material.update({ where: { id: 'm-1' }, data: { ownerId: me.id } })
    await request(app).put('/api/saved/m-1').set(auth(ana.token))
    await pause()
    expect((await request(app).get('/api/saved').set(auth(ana.token))).body.map((m: { id: string }) => m.id)).toEqual(['m-1'])
  })

  it('reportar un material pausado ajeno responde 404', async () => {
    await pause()
    const res = await request(app).post('/api/reports').set(auth(ana.token)).send({ materialId: 'm-1', reason: 'Otro motivo', detail: '' })
    expect(res.status).toBe(404)
  })
})
