import type { Prisma } from '@prisma/client'
import { CATEGORIES } from '../../../../shared/constants'
import { matchesSearch } from '../../../../shared/search'
import { prisma } from '../../db'
import { toCondition, toMode } from '../../enums'
import { AppError } from '../../errors'
import type { ImageStorage } from '../../integrations/images'
import { materialInclude, toMaterialDto, toMaterialDtos, type MaterialDto } from './dto'
import type { ListQuery, MaterialInput } from './schemas'

export const PAGE_SIZE = 20

export const materialNotFound = () => new AppError(404, 'MATERIAL_NOT_FOUND', 'Esta publicación ya no existe.')

const badImages = () =>
  new AppError(400, 'VALIDATION', 'Revisa los datos enviados.', { fields: { images: 'Usa fotos subidas desde la app.' } })

/** Las fotos deben ser del almacenamiento propio o fotos que el material ya tenía. */
function checkImages(urls: string[], images: ImageStorage, existing: string[] = []) {
  if (urls.some((url) => !images.owns(url) && !existing.includes(url))) throw badImages()
}

const dataFrom = (input: MaterialInput) => ({
  title: input.title,
  course: input.course,
  career: input.career,
  cycle: input.cycle,
  category: input.category,
  mode: toMode(input.mode),
  price: input.mode === 'Venta' ? input.price : 0,
  exchangeFor: input.mode === 'Intercambio' ? input.exchangeFor || null : null,
  condition: toCondition(input.condition),
  description: input.description,
})

export async function list(query: ListQuery): Promise<{ items: MaterialDto[]; page: number; hasMore: boolean }> {
  const and: Prisma.MaterialWhereInput[] = [{ status: { in: ['Disponible', 'Reservado'] } }]
  if (query.q) {
    const term = query.q.toLocaleLowerCase()
    const categories = CATEGORIES.filter((c) => c.toLocaleLowerCase().includes(term))
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { course: { contains: query.q, mode: 'insensitive' } },
        ...(categories.length ? [{ category: { in: [...categories] } }] : []),
      ],
    })
  }
  if (query.category) and.push({ category: query.category })
  if (query.mode) and.push({ mode: toMode(query.mode) })
  if (query.career) and.push({ career: query.career })
  if (query.cycle) and.push({ cycle: query.cycle })
  if (query.condition) and.push({ condition: toCondition(query.condition) })
  if (query.maxPrice !== undefined) and.push({ OR: [{ mode: { not: 'Venta' } }, { price: { lte: query.maxPrice } }] })

  const rows = await prisma.material.findMany({
    where: { AND: and },
    include: materialInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: (query.page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  })
  return { items: await toMaterialDtos(rows.slice(0, PAGE_SIZE)), page: query.page, hasMore: rows.length > PAGE_SIZE }
}

/** Pausado: solo el dueño. Eliminado: el dueño y quienes tenían chat sobre él. */
export async function getVisible(id: string, viewerId?: string): Promise<MaterialDto> {
  const material = await prisma.material.findUnique({ where: { id }, include: materialInclude })
  if (!material) throw materialNotFound()
  const isOwner = viewerId === material.ownerId
  if (material.status === 'Pausado' && !isOwner) throw materialNotFound()
  if (material.status === 'Eliminado' && !isOwner) {
    const participant =
      viewerId && (await prisma.conversation.count({ where: { materialId: id, buyerId: viewerId } })) > 0
    if (!participant) throw materialNotFound()
  }
  return toMaterialDto(material)
}

export async function create(ownerId: string, input: MaterialInput, images: ImageStorage): Promise<MaterialDto> {
  checkImages(input.images, images)
  const material = await prisma.material.create({
    data: {
      ...dataFrom(input),
      ownerId,
      images: { create: input.images.map((url, position) => ({ url, publicId: url, position })) },
    },
    include: materialInclude,
  })
  await notifySavedSearches(material.id, ownerId, input)
  return toMaterialDto(material)
}

/** Avisa a otros usuarios cuyas búsquedas guardadas coinciden con el material nuevo. */
async function notifySavedSearches(materialId: string, ownerId: string, input: MaterialInput) {
  const searches = await prisma.savedSearch.findMany({ where: { userId: { not: ownerId } } })
  const matching = searches.filter((s) => matchesSearch(input, s))
  const notified = new Set<string>()
  const data = matching
    .filter((s) => !notified.has(s.userId) && notified.add(s.userId))
    .map((s) => ({
      userId: s.userId,
      category: 'busquedas' as const,
      link: `#/material/${materialId}`,
      text: `Nuevo material para tu búsqueda “${s.query || s.category}”: ${input.title}`,
    }))
  if (data.length) await prisma.notification.createMany({ data })
}

const forbidden = () => new AppError(403, 'FORBIDDEN', 'Solo quien publicó puede modificar este material.')

/** Material modificable por su dueño (no existe o está Eliminado → 404; ajeno → 403). */
async function ownedMaterial(id: string, userId: string) {
  const material = await prisma.material.findUnique({ where: { id }, include: { images: true } })
  if (!material || material.status === 'Eliminado') throw materialNotFound()
  if (material.ownerId !== userId) throw forbidden()
  return material
}

export async function update(id: string, userId: string, input: MaterialInput, images: ImageStorage): Promise<MaterialDto> {
  const current = await ownedMaterial(id, userId)
  const previous = current.images.map((i) => i.url)
  checkImages(input.images, images, previous)
  const material = await prisma.$transaction(async (tx) => {
    await tx.materialImage.deleteMany({ where: { materialId: id } })
    return tx.material.update({
      where: { id },
      data: {
        ...dataFrom(input),
        images: { create: input.images.map((url, position) => ({ url, publicId: url, position })) },
      },
      include: materialInclude,
    })
  })
  await Promise.all(previous.filter((url) => !input.images.includes(url)).map((url) => images.remove(url)))
  return toMaterialDto(material)
}

/** Disponible ↔ Pausado y Disponible/Reservado → Entregado (entregas hechas fuera de la app). */
const ALLOWED: Record<string, string[]> = {
  Disponible: ['Pausado', 'Entregado'],
  Pausado: ['Disponible'],
  Reservado: ['Entregado'],
}

export async function setStatus(id: string, userId: string, status: 'Disponible' | 'Pausado' | 'Entregado') {
  const current = await ownedMaterial(id, userId)
  if (!ALLOWED[current.status]?.includes(status))
    throw new AppError(409, 'INVALID_TRANSITION', 'No se puede cambiar la publicación a ese estado.')
  return toMaterialDto(await prisma.material.update({ where: { id }, data: { status }, include: materialInclude }))
}

/**
 * Sin chats ni acuerdos: se borra de verdad. Con historial: pasa a Eliminado (para no romper
 * chats ni reseñas) y se cancelan sus acuerdos activos. En ambos casos se borran sus fotos.
 */
export async function remove(id: string, userId: string, images: ImageStorage) {
  const current = await ownedMaterial(id, userId)
  const [conversations, agreements] = await Promise.all([
    prisma.conversation.count({ where: { materialId: id } }),
    prisma.agreement.count({ where: { materialId: id } }),
  ])
  if (conversations || agreements) {
    await prisma.$transaction([
      prisma.material.update({ where: { id }, data: { status: 'Eliminado' } }),
      prisma.agreement.updateMany({
        where: { materialId: id, status: { in: ['Pendiente', 'Confirmado'] } },
        data: { status: 'Cancelado' },
      }),
    ])
  } else {
    await prisma.material.delete({ where: { id } })
  }
  await Promise.all(current.images.map((i) => images.remove(i.url)))
}

export async function listMine(userId: string): Promise<MaterialDto[]> {
  const rows = await prisma.material.findMany({
    where: { ownerId: userId, status: { not: 'Eliminado' } },
    include: materialInclude,
    orderBy: { createdAt: 'desc' },
  })
  return toMaterialDtos(rows)
}

export { dataFrom, checkImages }
