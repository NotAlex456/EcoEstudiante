import type { BotJob } from '@prisma/client'
import { BOT_CONFIRMATION, buyerReply, interestMessage, simulatedReply } from '../../../shared/bot-replies'
import { prisma } from '../db'
import { modeLabel } from '../enums'
import type { Hub } from '../hub'
import { agreementService } from '../modules/agreements/service'
import { conversationService } from '../modules/conversations/service'

type Payload = Record<string, string>

/** Ejecuta un trabajo. Si ya no aplica (material o acuerdo cambiaron), no hace nada. */
async function run(job: BotJob, hub: Hub) {
  const payload = job.payload as Payload
  const conversations = conversationService(hub)

  if (job.kind === 'reply') {
    const c = await prisma.conversation.findUnique({ where: { id: payload.conversationId }, include: { material: true } })
    if (!c) return
    const botId = payload.botId
    if (c.sellerId === botId) {
      const lastHuman = await prisma.message.findFirst({
        where: { conversationId: c.id, senderId: { not: botId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      if (!lastHuman) return
      const text = simulatedReply(lastHuman.text, { ...c.material, mode: modeLabel(c.material.mode) })
      await conversations.sendMessage(c.id, botId, text)
    } else {
      const sent = await prisma.message.count({ where: { conversationId: c.id, senderId: botId } })
      await conversations.sendMessage(c.id, botId, buyerReply(sent))
    }
    return
  }

  if (job.kind === 'confirm_agreement') {
    const agreement = await prisma.agreement.findUnique({ where: { id: payload.agreementId } })
    if (!agreement || agreement.status !== 'Pendiente') return
    await agreementService(hub).confirm(agreement.id, agreement.sellerId)
    const c = await prisma.conversation.findUnique({
      where: { materialId_buyerId: { materialId: agreement.materialId, buyerId: agreement.buyerId } },
    })
    if (c) await conversations.sendMessage(c.id, agreement.sellerId, BOT_CONFIRMATION, { quiet: true })
    return
  }

  // buyer_interest
  const material = await prisma.material.findUnique({ where: { id: payload.materialId } })
  if (!material || material.status !== 'Disponible') return
  const bots = await prisma.user.findMany({ where: { isBot: true, id: { not: material.ownerId } }, select: { id: true } })
  if (!bots.length) return
  const bot = bots[Math.floor(Math.random() * bots.length)]
  const { conversation } = await conversations.open(material.id, bot.id)
  await conversations.sendMessage(conversation.id, bot.id, interestMessage({ title: material.title, mode: modeLabel(material.mode) }))
}

/**
 * Ejecuta los trabajos vencidos. Cada uno se reserva (doneAt) ANTES de ejecutarse, así nunca
 * se repite aunque falle o haya dos workers. Devuelve cuántos ejecutó.
 */
export async function runDueJobs(now: Date, hub: Hub): Promise<number> {
  const due = await prisma.botJob.findMany({ where: { doneAt: null, dueAt: { lte: now } }, orderBy: { dueAt: 'asc' } })
  let ran = 0
  for (const job of due) {
    const claimed = await prisma.botJob.updateMany({ where: { id: job.id, doneAt: null }, data: { doneAt: now } })
    if (!claimed.count) continue
    ran++
    try {
      await run(job, hub)
    } catch (error) {
      console.error(`Trabajo de bot ${job.kind} ${job.id} falló:`, error)
    }
  }
  return ran
}
