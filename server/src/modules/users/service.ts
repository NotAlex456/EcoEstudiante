import { prisma } from '../../db'
import { AppError } from '../../errors'
import { materialInclude, toMaterialDtos, type MaterialDto } from '../materials/dto'
import { toMe, type MeDto } from './dto'
import type { UpdateMeInput } from './schemas'

export type PublicUserDto = {
  id: string
  name: string
  career: string
  cycle: number
  createdAt: string
  rating: { value: number; count: number }
  reviews: { authorName: string; stars: number; comment: string; materialTitle: string; createdAt: string }[]
  /** Sus materiales disponibles. */
  materials: MaterialDto[]
}

const userNotFound = () => new AppError(404, 'USER_NOT_FOUND', 'Este estudiante no existe.')

/** Reputación: promedio de estrellas recibidas, redondeado a un decimal. */
export async function userRating(userId: string) {
  const agg = await prisma.review.aggregate({ where: { targetId: userId }, _avg: { stars: true }, _count: true })
  return { value: agg._count ? Math.round((agg._avg.stars ?? 0) * 10) / 10 : 0, count: agg._count }
}

export async function getMe(userId: string): Promise<MeDto> {
  return toMe(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<MeDto> {
  return toMe(await prisma.user.update({ where: { id: userId }, data: input }))
}

export async function getPublicUser(id: string): Promise<PublicUserDto> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user?.verified) throw userNotFound()
  const [reviews, materials] = await Promise.all([
    prisma.review.findMany({ where: { targetId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.material.findMany({ where: { ownerId: id, status: 'Disponible' }, include: materialInclude, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    id: user.id,
    name: user.name,
    career: user.career,
    cycle: user.cycle,
    createdAt: user.createdAt.toISOString(),
    rating: await userRating(id),
    materials: await toMaterialDtos(materials),
    reviews: reviews.map((r) => ({
      authorName: r.authorName,
      stars: r.stars,
      comment: r.comment,
      materialTitle: r.materialTitle,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
