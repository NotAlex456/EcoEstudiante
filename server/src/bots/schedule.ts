import type { BotJobKind, Prisma } from '@prisma/client'
import type { Config } from '../config'
import { prisma } from '../db'

/** Momento al azar entre `min` y `max` segundos desde ahora. */
const dueIn = (min: number, max: number) => new Date(Date.now() + (min + Math.random() * (max - min)) * 1000)

async function schedule(config: Config, kind: BotJobKind, payload: Prisma.InputJsonObject, dueAt: Date) {
  if (!config.botsEnabled) return
  await prisma.botJob.create({ data: { kind, payload, dueAt } })
}

/** El bot responde en la conversación dentro de 3 a 8 s. */
export const scheduleBotReply = (config: Config, conversationId: string, botId: string) =>
  schedule(config, 'reply', { conversationId, botId }, dueIn(3, 8))

/** El bot vendedor confirma el acuerdo dentro de 10 a 20 s. */
export const scheduleBotConfirm = (config: Config, agreementId: string) =>
  schedule(config, 'confirm_agreement', { agreementId }, dueIn(10, 20))

/** Un bot se interesa en un material recién publicado dentro de 30 a 60 s. */
export const scheduleBuyerInterest = (config: Config, materialId: string) =>
  schedule(config, 'buyer_interest', { materialId }, dueIn(30, 60))
