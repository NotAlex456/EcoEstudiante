import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { matchesSearch } from '../../shared/search'
import { normalizeCategory } from '../../shared/text'
import { prisma } from '../src/db'
import type { ImageStorage } from '../src/integrations/images'
import { authHeader as auth, insertMaterial, makeApp, registerAndVerify, resetDb } from './helpers'

const images: ImageStorage = {
  mode: 'local',
  owns: (url) => url.startsWith('https://img.test/'),
  save: async () => 'https://img.test/x.jpg',
  remove: async () => {},
}
const app = makeApp({}, { images })

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let ana: Who
let counter = 0

const base = {
  title: 'Bata blanca talla M',
  course: 'Anatomía humana',
  career: 'Medicina Humana',
  cycle: 2,
  category: 'Libros',
  mode: 'Venta',
  price: 20,
  condition: 'Buen estado',
  description: 'Bata en buen estado, usada un semestre.',
}

async function publish(overrides: Record<string, unknown> = {}) {
  const url = `https://img.test/c${++counter}.jpg`
  await prisma.upload.create({ data: { url, uploaderId: ana.user.id } })
  return request(app).post('/api/materials').set(auth(ana.token)).send({ ...base, images: [url], ...overrides })
}

beforeEach(async () => {
  await resetDb()
  ana = await registerAndVerify(app, { career: 'Medicina Humana' })
})

describe('normalizeCategory', () => {
  it('recorta, une espacios y pone mayúscula inicial', () => {
    expect(normalizeCategory('  kit  de LABORATORIO ')).toBe('Kit de laboratorio')
    expect(normalizeCategory('libros')).toBe('Libros')
  })
})

describe('categoría y curso libres', () => {
  it('guarda la categoría normalizada y el curso escrito', async () => {
    const res = await publish({ category: 'bata de laboratorio', course: 'Anatomía humana' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ category: 'Bata de laboratorio', course: 'Anatomía humana' })
  })

  it('rechaza categorías de 1 o de 41 caracteres', async () => {
    expect((await publish({ category: 'a' })).status).toBe(400)
    expect((await publish({ category: 'a'.repeat(41) })).status).toBe(400)
  })

  it('el filtro de categoría no distingue mayúsculas ni tildes', async () => {
    await publish({ category: 'Libros' })
    await publish({ category: 'Electrónica' })
    const libros = await request(app).get('/api/materials?category=LIBROS')
    expect(libros.body.items.map((m: { category: string }) => m.category)).toEqual(['Libros'])
    const elec = await request(app).get(`/api/materials?category=${encodeURIComponent('electronica')}`)
    expect(elec.body.items).toHaveLength(1)
  })

  it('matchesSearch compara la categoría sin mayúsculas ni tildes', () => {
    const material = { title: 'x', course: 'y', category: 'Calculadoras', mode: 'Venta' }
    expect(matchesSearch(material, { query: '', category: 'calculadoras', mode: 'Todos' })).toBe(true)
  })

  it('las sugerencias ordenan las categorías por cantidad y omiten las no disponibles', async () => {
    await publish({ category: 'Uniformes', course: 'Enfermería básica' })
    await publish({ category: 'Uniformes' })
    await publish({ category: 'Libros' })
    await insertMaterial(ana.user.id, { category: 'Oculta', status: 'Pausado' })
    const res = await request(app).get('/api/materials/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.categories).toEqual([
      { name: 'Uniformes', count: 2 },
      { name: 'Libros', count: 1 },
    ])
    expect(res.body.courses).toEqual(expect.arrayContaining(['Anatomía humana', 'Enfermería básica']))
  })
})

describe('carreras de la filial Chincha', () => {
  it('acepta Medicina Humana y rechaza la antigua "Administración"', async () => {
    const ok = await request(app).post('/api/auth/register').send({
      name: 'Luis Paz', email: 'luis.paz@upsjb.edu.pe', career: 'Medicina Humana', cycle: 1, password: 'secreta123',
    })
    expect(ok.status).toBe(201)
    const old = await request(app).post('/api/auth/register').send({
      name: 'Rosa Paz', email: 'rosa.paz@upsjb.edu.pe', career: 'Administración', cycle: 1, password: 'secreta123',
    })
    expect(old.status).toBe(400)
  })
})

describe('búsquedas guardadas con categoría libre', () => {
  it('acepta cualquier categoría de 2 a 40 caracteres', async () => {
    const res = await request(app).post('/api/saved-searches').set(auth(ana.token)).send({ query: '', category: 'Uniformes', mode: 'Todos' })
    expect(res.status).toBe(201)
  })
})
