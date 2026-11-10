/**
 * Datos iniciales: estudiantes simulados (bots), sus materiales y reseñas.
 * Solo inserta lo que falta: se ejecuta en cada arranque de producción (Render reinicia al despertar), así que
 * nunca pisa lo que cambió con el uso (un material reservado o entregado, sus fotos, las contraseñas).
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
    const existing = await prisma.user.findUnique({ where: { id: u.id }, select: { id: true } })
    // Nombre y correo se actualizan (así llegan los cambios de los datos de ejemplo); la contraseña solo al crearlo.
    if (existing) await prisma.user.update({ where: { id: u.id }, data })
    else await prisma.user.create({ data: { id: u.id, ...data, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10) } })
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
    if (await prisma.material.findUnique({ where: { id }, select: { id: true } })) continue
    await prisma.material.create({
      data: {
        id,
        ...data,
        createdAt: new Date(now - daysAgo * DAY),
        images: { create: images.map((url, position) => ({ url, publicId: `seed:${id}:${position}`, position })) },
      },
    })
  }

  // Las reseñas de ejemplo (sin acuerdo ni autor) se cargan una sola vez.
  if (await prisma.review.count({ where: { agreementId: null, authorId: null } })) return
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
