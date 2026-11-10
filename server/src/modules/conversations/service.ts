import { Prisma } from '@prisma/client'
import { scheduleBotReply } from '../../bots/schedule'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import { materialInclude } from '../materials/dto'
import { materialNotFound } from '../materials/service'
import { toConversationDtos, toMessageDto, type ConversationDto, type MessageDto } from './dto'

const PAGE = 50

export const conversationNotFound = () => new AppError(404, 'CONVERSATION_NOT_FOUND', 'Esta conversación ya no existe.')

const include = {
  material: { include: materialInclude },
  buyer: true,
  seller: true,
  messages: { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], take: 1 },
}

const firstName = (name: string) => name.split(' ')[0]
const preview = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text)

/** Conversación en la que participa `userId`; si no participa o no existe, 404 (sin revelar cuál). */
async function participating(conversationId: string, userId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } })
  if (!c || (c.buyerId !== userId && c.sellerId !== userId)) throw conversationNotFound()
  return c
}

async function dtoFor(conversationId: string, userId: string) {
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include })
  return (await toConversationDtos([row], userId))[0]
}

export type ConversationService = ReturnType<typeof conversationService>

export function conversationService(hub: Hub) {
  /** La conversación existente del comprador sobre el material, o una nueva. */
  async function open(materialId: string, buyerId: string): Promise<{ conversation: ConversationDto; created: boolean }> {
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { ownerId: true, status: true } })
    if (!material) throw materialNotFound()
    if (material.ownerId === buyerId) throw new AppError(400, 'OWN_MATERIAL', 'Es tu propia publicación.')
    const existing = await prisma.conversation.findUnique({ where: { materialId_buyerId: { materialId, buyerId } } })
    if (existing) return { conversation: await dtoFor(existing.id, buyerId), created: false }
    if (material.status !== 'Disponible' && material.status !== 'Reservado') throw materialNotFound()
    try {
      const created = await prisma.conversation.create({ data: { materialId, buyerId, sellerId: material.ownerId } })
      return { conversation: await dtoFor(created.id, buyerId), created: true }
    } catch (error) {
      // Dos "Contactar" a la vez: la otra petición ya la creó.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await prisma.conversation.findUniqueOrThrow({ where: { materialId_buyerId: { materialId, buyerId } } })
        return { conversation: await dtoFor(row.id, buyerId), created: false }
      }
      throw error
    }
  }

  async function list(userId: string): Promise<ConversationDto[]> {
    const rows = await prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include,
      orderBy: { lastMessageAt: 'desc' },
    })
    return toConversationDtos(rows, userId)
  }

  /** Hasta 50 mensajes anteriores a `before` (o los últimos), del más viejo al más nuevo. */
  async function messages(conversationId: string, userId: string, before?: Date): Promise<MessageDto[]> {
    await participating(conversationId, userId)
    const rows = await prisma.message.findMany({
      where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE,
    })
    return rows.reverse().map(toMessageDto)
  }

  /**
   * Envía un mensaje: lo guarda, lo emite a ambos, avisa al otro y, si es un bot, le programa la respuesta.
   * `quiet`: mensajes que acompañan a otra acción (propuesta, confirmación) que ya tiene su propio aviso.
   */
  async function sendMessage(conversationId: string, senderId: string, text: string, opts: { quiet?: boolean } = {}): Promise<MessageDto> {
    const c = await participating(conversationId, senderId)
    const isBuyer = c.buyerId === senderId
    const otherId = isBuyer ? c.sellerId : c.buyerId
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data: { conversationId, senderId, text } })
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt, ...(isBuyer ? { buyerReadAt: created.createdAt } : { sellerReadAt: created.createdAt }) },
      })
      return created
    })
    const dto = toMessageDto(message)
    for (const userId of [c.buyerId, c.sellerId]) hub.realtime.emitToUser(userId, 'message:new', { conversationId, message: dto })

    if (opts.quiet) return dto
    const [sender, other] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { name: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: otherId }, select: { isBot: true } }),
    ])
    await hub.notifier.notify(otherId, {
      category: 'mensajes',
      link: `#/chat/${conversationId}`,
      text: `${firstName(sender.name)} te escribió: “${preview(text)}”`,
    })
    if (other.isBot) await scheduleBotReply(hub.config, conversationId, otherId)
    return dto
  }

  async function markRead(conversationId: string, userId: string) {
    const c = await participating(conversationId, userId)
    const readAt = new Date()
    await prisma.conversation.update({
      where: { id: conversationId },
      data: c.buyerId === userId ? { buyerReadAt: readAt } : { sellerReadAt: readAt },
    })
    const otherId = c.buyerId === userId ? c.sellerId : c.buyerId
    hub.realtime.emitToUser(otherId, 'conversation:read', { conversationId, userId, readAt: readAt.toISOString() })
  }

  return { open, list, messages, sendMessage, markRead }
}
