import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { SEED_MATERIALS, SEED_REVIEWS } from '../../shared/seed-data'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import { resetDb } from './helpers'

const counts = async () => ({
  bots: await prisma.user.count({ where: { isBot: true, verified: true } }),
  materials: await prisma.material.count(),
  images: await prisma.materialImage.count(),
  reviews: await prisma.review.count(),
})

describe('seed', () => {
  beforeEach(resetDb)

  it('siembra 6 bots verificados, sus materiales y reseñas', async () => {
    await seed(prisma)
    expect(await counts()).toEqual({
      bots: 6,
      materials: SEED_MATERIALS.length,
      images: SEED_MATERIALS.reduce((n, m) => n + m.images.length, 0),
      reviews: Object.values(SEED_REVIEWS).flat().length,
    })
    const m1 = await prisma.material.findUniqueOrThrow({ where: { id: 'm-1' } })
    expect(m1.ownerId).toBe(SEED_MATERIALS[0].ownerId)
    const reserved = SEED_MATERIALS.find((m) => m.status === 'Reservado')!
    expect((await prisma.material.findUniqueOrThrow({ where: { id: reserved.id } })).status).toBe('Reservado')
  })

  it('volver a sembrar no pisa lo que cambió en uso (Render reinicia y siembra en cada arranque)', async () => {
    await seed(prisma)
    await prisma.material.update({ where: { id: 'm-1' }, data: { status: 'Entregado' } })
    const imageIds = (await prisma.materialImage.findMany({ where: { materialId: 'm-1' }, select: { id: true } })).map((i) => i.id)
    const bot = await prisma.user.findUniqueOrThrow({ where: { id: SEED_MATERIALS[0].ownerId } })
    await seed(prisma)
    expect((await prisma.material.findUniqueOrThrow({ where: { id: 'm-1' } })).status).toBe('Entregado')
    expect((await prisma.materialImage.findMany({ where: { materialId: 'm-1' }, select: { id: true } })).map((i) => i.id)).toEqual(imageIds)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bot.id } })).passwordHash).toBe(bot.passwordHash)
  })

  it('es idempotente', async () => {
    await seed(prisma)
    const first = await counts()
    await seed(prisma)
    expect(await counts()).toEqual(first)
  })

  it('la contraseña de un bot no sirve vacía', async () => {
    await seed(prisma)
    const bot = await prisma.user.findUniqueOrThrow({ where: { id: 'u-maria' } })
    expect(await bcrypt.compare('', bot.passwordHash)).toBe(false)
  })
})
