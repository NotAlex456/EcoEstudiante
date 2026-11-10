import type { MaterialStatus, Prisma } from '@prisma/client'
import { CATEGORIES } from '../../../../shared/constants'
import { matchesSearch } from '../../../../shared/search'
import { prisma } from '../../db'
import { toCondition, toMode } from '../../enums'
import { AppError } from '../../errors'
import type { ImageStorage } from '../../integrations/images'
import { scheduleBuyerInterest } from '../../bots/schedule'
import type { Hub } from '../../hub'
import type { Notifier } from '../../notify/notify'
import type { Realtime } from '../../realtime/socket'
import { materialInclude, toMaterialDto, toMaterialDtos, type MaterialDto } from './dto'
import type { ListQuery, MaterialInput } from './schemas'

export const PAGE_SIZE = 20

export const materialNotFound = () => new AppError(404, 'MATERIAL_NOT_FOUND', 'Esta publicación ya no existe.')

const badImages = () =>
  new AppError(400, 'VALIDATION', 'Revisa los datos enviados.', { fields: { images: 'Usa fotos subidas desde la app.' } })

/**
 * Cada foto nueva debe ser de nuestro almacenamiento, haberla subido ESTE usuario y no estar
 * en otra publicación. Las fotos que el material ya tenía se pueden conservar.
 */
async function checkImages(userId: string, urls: string[], images: ImageStorage, existing: string[] = []) {
  const fresh = [...new Set(urls.filter((url) => !existing.includes(url)))]
  if (fresh.length !== urls.filter((url) => !existing.includes(url)).length) throw badImages()
  if (!fresh.length) return
  if (fresh.some((url) => !images.owns(url))) throw badImages()
  const [mine, inUse] = await Promise.all([
    prisma.upload.count({ where: { url: { in: fresh }, uploaderId: userId } }),
    prisma.materialImage.count({ where: { url: { in: fresh } } }),
  ])
  if (mine !== fresh.length || inUse > 0) throw badImages()
}

/** Borra del almacenamiento las fotos que ya ninguna publicación usa. */
async function removeUnused(urls: string[], images: ImageStorage) {
  for (const url of new Set(urls)) {
    if (await prisma.materialImage.count({ where: { url } })) continue
    await prisma.upload.deleteMany({ where: { url } })
    await images.remove(url)
  }
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

export async function create(ownerId: string, input: MaterialInput, images: ImageStorage, hub: Hub): Promise<MaterialDto> {
  await checkImages(ownerId, input.images, images)
  const material = await prisma.material.create({
    data: {
      ...dataFrom(input),
      ownerId,
      images: { create: input.images.map((url, position) => ({ url, publicId: url, position })) },
    },
    include: materialInclude,
  })
  await notifySavedSearches(material.id, ownerId, input, hub.notifier)
  // Como en la app de siempre: algún estudiante simulado se interesa en lo recién publicado.
  await scheduleBuyerInterest(hub.config, material.id)
  return toMaterialDto(material)
}

/** Avisa a otros usuarios cuyas búsquedas guardadas coinciden con el material nuevo. */
async function notifySavedSearches(materialId: string, ownerId: string, input: MaterialInput, notifier: Notifier) {
  const searches = await prisma.savedSearch.findMany({ where: { userId: { not: ownerId } } })
  const matching = searches.filter((s) => matchesSearch(input, s))
  const notified = new Set<string>()
  for (const s of matching) {
    if (notified.has(s.userId)) continue
    notified.add(s.userId)
    await notifier.notify(s.userId, {
      category: 'busquedas',
      link: `#/material/${materialId}`,
      text: `Nuevo material para tu búsqueda “${s.query || s.category}”: ${input.title}`,
    })
  }
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
  await checkImages(userId, input.images, images, previous)
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
  await removeUnused(previous.filter((url) => !input.images.includes(url)), images)
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
  // Con una entrega en curso, el acuerdo manda: primero hay que cancelarla o completarla.
  const active = await prisma.agreement.count({ where: { materialId: id, status: { in: ['Pendiente', 'Confirmado'] } } })
  if (active)
    throw new AppError(409, 'AGREEMENT_ACTIVE', 'Tienes una entrega en curso para este material. Cancélala o complétala primero.')
  // Solo si nadie lo cambió entretanto (p. ej. una confirmación que llegó a la vez).
  const changed = await prisma.material.updateMany({ where: { id, status: current.status }, data: { status } })
  if (!changed.count) throw new AppError(409, 'INVALID_TRANSITION', 'La publicación cambió de estado. Actualiza la pantalla.')
  return toMaterialDto(await prisma.material.findUniqueOrThrow({ where: { id }, include: materialInclude }))
}

/**
 * Sin chats ni acuerdos: se borra de verdad. Con historial: pasa a Eliminado (para no romper
 * chats ni reseñas) y se cancelan sus acuerdos activos. En ambos casos se borran sus fotos.
 */
export async function remove(id: string, userId: string, images: ImageStorage): Promise<string[]> {
  const current = await ownedMaterial(id, userId)
  const active = await prisma.agreement.findMany({
    where: { materialId: id, status: { in: ['Pendiente', 'Confirmado'] } },
    select: { id: true },
  })
  const [conversations, agreements] = await Promise.all([
    prisma.conversation.count({ where: { materialId: id } }),
    prisma.agreement.count({ where: { materialId: id } }),
  ])
  if (conversations || agreements) {
    await prisma.$transaction([
      prisma.material.update({ where: { id }, data: { status: 'Eliminado' } }),
      prisma.materialImage.deleteMany({ where: { materialId: id } }),
      prisma.agreement.updateMany({
        where: { materialId: id, status: { in: ['Pendiente', 'Confirmado'] } },
        data: { status: 'Cancelado' },
      }),
    ])
  } else {
    await prisma.material.delete({ where: { id } })
  }
  await removeUnused(current.images.map((i) => i.url), images)
  // Acuerdos que se cancelaron: la ruta los avisa a la otra persona.
  return active.map((a) => a.id)
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

/** Avisa el nuevo estado de un material al dueño y a quienes conversan sobre él. */
export async function emitMaterialUpdated(realtime: Realtime, materialId: string, status: MaterialStatus) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { ownerId: true, conversations: { select: { buyerId: true } } },
  })
  if (!material) return
  const users = new Set([material.ownerId, ...material.conversations.map((c) => c.buyerId)])
  for (const userId of users) realtime.emitToUser(userId, 'material:updated', { materialId, status })
}
