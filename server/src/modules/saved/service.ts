import { prisma } from '../../db'
import { AppError } from '../../errors'
import { materialInclude, toMaterialDtos, type MaterialDto } from '../materials/dto'
import { materialNotFound } from '../materials/service'

export type SavedSearchDto = { id: string; query: string; category: string; mode: string; createdAt: string }

/* ---------- materiales guardados ---------- */

export async function listSaved(userId: string): Promise<MaterialDto[]> {
  const rows = await prisma.savedMaterial.findMany({
    // Pausados ajenos no se muestran (igual que en GET /materials/:id).
    where: {
      userId,
      material: {
        OR: [{ status: { notIn: ['Pausado', 'Eliminado'] } }, { status: 'Pausado', ownerId: userId }],
        owner: { blockedAt: null },
      },
    },
    include: { material: { include: materialInclude } },
    orderBy: { createdAt: 'desc' },
  })
  return toMaterialDtos(rows.map((r) => r.material))
}

export async function save(userId: string, materialId: string) {
  const material = await prisma.material.findUnique({ where: { id: materialId }, select: { status: true, ownerId: true } })
  if (!material || material.status === 'Eliminado' || (material.status === 'Pausado' && material.ownerId !== userId))
    throw materialNotFound()
  await prisma.savedMaterial.upsert({
    where: { userId_materialId: { userId, materialId } },
    update: {},
    create: { userId, materialId },
  })
}

export async function unsave(userId: string, materialId: string) {
  await prisma.savedMaterial.deleteMany({ where: { userId, materialId } })
}

/* ---------- búsquedas guardadas ---------- */

const toSearchDto = (s: { id: string; query: string; category: string; mode: string; createdAt: Date }): SavedSearchDto => ({
  id: s.id,
  query: s.query,
  category: s.category,
  mode: s.mode,
  createdAt: s.createdAt.toISOString(),
})

export async function listSearches(userId: string): Promise<SavedSearchDto[]> {
  const rows = await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return rows.map(toSearchDto)
}

/** Devuelve [búsqueda, creada]; una idéntica a otra existente no se duplica. */
export async function addSearch(userId: string, input: { query: string; category: string; mode: string }) {
  const existing = await prisma.savedSearch.findFirst({ where: { userId, ...input } })
  if (existing) return [toSearchDto(existing), false] as const
  return [toSearchDto(await prisma.savedSearch.create({ data: { userId, ...input } })), true] as const
}

export async function removeSearch(userId: string, id: string) {
  const { count } = await prisma.savedSearch.deleteMany({ where: { id, userId } })
  if (!count) throw new AppError(404, 'SEARCH_NOT_FOUND', 'Esta búsqueda guardada ya no existe.')
}
