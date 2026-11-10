import type { Conversation, Message, User } from '@prisma/client'
import { prisma } from '../../db'
import { ratingsOf, toMaterialDtos, type MaterialDto, type MaterialWithRelations, type OwnerDto } from '../materials/dto'

export type MessageDto = { id: string; conversationId: string; senderId: string; text: string; createdAt: string }

export type ConversationDto = {
  id: string
  materialId: string
  buyerId: string
  sellerId: string
  buyerReadAt: string | null
  sellerReadAt: string | null
  lastMessageAt: string
  lastMessage: MessageDto | null
  unread: number
  material: MaterialDto
  other: OwnerDto
}

export type ConversationWithRelations = Conversation & {
  material: MaterialWithRelations
  buyer: User
  seller: User
  messages: Message[]
}

export const toMessageDto = (m: Message): MessageDto => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  text: m.text,
  createdAt: m.createdAt.toISOString(),
})

/** Mensajes del otro posteriores a mi última lectura. */
function unreadFor(c: Conversation, userId: string) {
  const readAt = c.buyerId === userId ? c.buyerReadAt : c.sellerReadAt
  return prisma.message.count({
    where: { conversationId: c.id, senderId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
  })
}

/** Convierte conversaciones vistas por `userId` (el otro participante va en `other`). */
export async function toConversationDtos(rows: ConversationWithRelations[], userId: string): Promise<ConversationDto[]> {
  const others = rows.map((c) => (c.buyerId === userId ? c.seller : c.buyer))
  const [materials, ratings, unread] = await Promise.all([
    toMaterialDtos(rows.map((c) => c.material)),
    ratingsOf([...new Set(others.map((u) => u.id))]),
    Promise.all(rows.map((c) => unreadFor(c, userId))),
  ])
  return rows.map((c, i) => ({
    id: c.id,
    materialId: c.materialId,
    buyerId: c.buyerId,
    sellerId: c.sellerId,
    buyerReadAt: c.buyerReadAt?.toISOString() ?? null,
    sellerReadAt: c.sellerReadAt?.toISOString() ?? null,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessage: c.messages[0] ? toMessageDto(c.messages[0]) : null,
    unread: unread[i],
    material: materials[i],
    other: {
      id: others[i].id,
      name: others[i].name,
      career: others[i].career,
      cycle: others[i].cycle,
      rating: ratings.get(others[i].id) ?? { value: 0, count: 0 },
    },
  }))
}
