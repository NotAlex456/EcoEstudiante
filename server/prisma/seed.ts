/**
 * Datos iniciales: estudiantes simulados (bots), sus materiales y reseñas.
 * Idempotente: se puede ejecutar varias veces (`npx prisma db seed`).
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DAY, SEED_MATERIALS, SEED_REVIEWS, SEED_USERS } from '../../shared/seed-data'
import { toCondition, toMode } from '../src/enums'

export async function seed(prisma: PrismaClient) {
  const now = Date.now()

  for (const u of SEED_USERS) {
    const data = { name: u.name, email: u.email, career: u.career, cycle: u.cycle, verified: true, isBot: true }
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
    await prisma.user.upsert({ where: { id: u.id }, update: data, create: { id: u.id, ...data, passwordHash } })
  }

  for (const { id, daysAgo, images, ...m } of SEED_MATERIALS) {
    const data = {
      ownerId: m.ownerId,
      title: m.title,
      course: m.course,
      career: m.career,
      cycle: m.cycle,
      category: m.category,
      mode: toMode(m.mode),
      price: m.price,
      exchangeFor: m.exchangeFor ?? null,
      condition: toCondition(m.condition),
      description: m.description,
      status: m.status,
    }
    await prisma.material.upsert({
      where: { id },
      update: data,
      create: { id, ...data, createdAt: new Date(now - daysAgo * DAY) },
    })
    await prisma.materialImage.deleteMany({ where: { materialId: id } })
    await prisma.materialImage.createMany({
      data: images.map((url, position) => ({ materialId: id, url, publicId: `seed:${id}:${position}`, position })),
    })
  }

  await prisma.review.deleteMany({ where: { agreementId: null, authorId: null } })
  await prisma.review.createMany({
    data: Object.entries(SEED_REVIEWS).flatMap(([targetId, reviews]) =>
      reviews.map((r) => ({
        targetId,
        authorName: r.author,
        stars: r.stars,
        comment: r.comment,
        materialTitle: r.material,
        createdAt: new Date(now - r.daysAgo * DAY),
      })),
    ),
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient()
  seed(prisma)
    .then(() => console.log('Datos de ejemplo cargados.'))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
