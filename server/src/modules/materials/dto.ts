import type { Material, MaterialImage, MaterialStatus, User } from '@prisma/client'
import { prisma } from '../../db'
import { conditionLabel, modeLabel, type ConditionLabel, type ModeLabel } from '../../enums'

export type OwnerDto = {
  id: string
  name: string
  career: string
  cycle: number
  rating: { value: number; count: number }
  /** La cuenta fue eliminada: se muestra como "Usuario eliminado" y no se le puede escribir. */
  deleted?: boolean
}

export type MaterialDto = {
  id: string
  ownerId: string
  title: string
  course: string
  career: string
  cycle: number
  category: Material['category']
  mode: ModeLabel
  price: number
  exchangeFor?: string
  condition: ConditionLabel
  description: string
  images: string[]
  status: MaterialStatus
  /** Oculta por un administrador (el dueño no puede reactivarla ni editarla). */
  moderated: boolean
  createdAt: string
  owner: OwnerDto
}

export type MaterialWithRelations = Material & { images: MaterialImage[]; owner: User }

/** Incluir siempre esto al leer materiales que se van a devolver. */
export const materialInclude = { images: { orderBy: { position: 'asc' as const } }, owner: true }

/** Reputación de varios usuarios en una sola consulta. */
export async function ratingsOf(userIds: string[]) {
  const groups = await prisma.review.groupBy({
    by: ['targetId'],
    where: { targetId: { in: userIds } },
    _avg: { stars: true },
    _count: { _all: true },
  })
  return new Map(
    groups.map((g) => [g.targetId, { value: Math.round((g._avg.stars ?? 0) * 10) / 10, count: g._count._all }]),
  )
}

export async function toMaterialDtos(materials: MaterialWithRelations[]): Promise<MaterialDto[]> {
  const ratings = await ratingsOf([...new Set(materials.map((m) => m.ownerId))])
  return materials.map((m) => ({
    id: m.id,
    ownerId: m.ownerId,
    title: m.title,
    course: m.course,
    career: m.career,
    cycle: m.cycle,
    category: m.category,
    mode: modeLabel(m.mode),
    price: m.price,
    ...(m.exchangeFor ? { exchangeFor: m.exchangeFor } : {}),
    condition: conditionLabel(m.condition),
    description: m.description,
    images: m.images.map((i) => i.url),
    status: m.status,
    moderated: Boolean(m.moderatedAt),
    createdAt: m.createdAt.toISOString(),
    owner: {
      id: m.owner.id,
      name: m.owner.name,
      career: m.owner.career,
      cycle: m.owner.cycle,
      rating: ratings.get(m.ownerId) ?? { value: 0, count: 0 },
    },
  }))
}

export const toMaterialDto = async (material: MaterialWithRelations) => (await toMaterialDtos([material]))[0]
