import { Prisma, type AgreementStatus, type MaterialStatus } from '@prisma/client'
import { formatDate, formatTime } from '../../../../shared/format'
import { scheduleBotConfirm } from '../../bots/schedule'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import { conversationService } from '../conversations/service'
import { emitMaterialUpdated, materialNotFound } from '../materials/service'
import { toAgreementDto, type AgreementDto } from './dto'
import { checkSchedule } from './rules'
import type { ProposeInput } from './schemas'

const notFound = () => new AppError(404, 'AGREEMENT_NOT_FOUND', 'No encontramos este acuerdo.')
const forbidden = () => new AppError(403, 'FORBIDDEN', 'Esta acción le corresponde a la otra persona.')
const invalidTransition = () =>
  new AppError(409, 'INVALID_TRANSITION', 'Este acuerdo ya cambió de estado. Actualiza la pantalla.')
const agreementActive = () => new AppError(409, 'AGREEMENT_ACTIVE', 'Ya hay una entrega en curso para este material.')
const unavailable = () => new AppError(409, 'MATERIAL_UNAVAILABLE', 'Este material ya no está disponible.')

const firstName = (name: string) => name.split(' ')[0]
const ACTIVE: AgreementStatus[] = ['Pendiente', 'Confirmado']

/** Error de Postgres al serializar transacciones concurrentes (o de unicidad): se trata como conflicto. */
const isConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')

export type AgreementService = ReturnType<typeof agreementService>

export function agreementService(hub: Hub) {
  const conversations = conversationService(hub)

  async function load(id: string) {
    return prisma.agreement.findUniqueOrThrow({ where: { id }, include: { review: true, material: { select: { title: true } } } })
  }

  /** Acuerdo en el que participa `userId`; si no, 404. */
  async function participating(id: string, userId: string) {
    const a = await prisma.agreement.findUnique({ where: { id } })
    if (!a || (a.buyerId !== userId && a.sellerId !== userId)) throw notFound()
    return a
  }

  /** Avisa el acuerdo (y el material, si cambió) por socket. */
  async function broadcast(id: string, materialStatus?: MaterialStatus) {
    const agreement = await load(id)
    const dto = toAgreementDto(agreement)
    for (const userId of [agreement.buyerId, agreement.sellerId]) hub.realtime.emitToUser(userId, 'agreement:updated', { agreement: dto })
    if (materialStatus) await emitMaterialUpdated(hub.realtime, agreement.materialId, materialStatus)
    return { dto, agreement }
  }

  const nameOf = async (userId: string) =>
    firstName((await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } })).name)

  /**
   * Cambia el estado del acuerdo de forma atómica (solo si sigue en `from`) y, opcionalmente,
   * el del material. Si otra petición ya lo cambió, responde 409.
   */
  async function transition(
    id: string,
    from: AgreementStatus[],
    to: AgreementStatus,
    material?: { from: MaterialStatus[]; to: MaterialStatus; required: boolean },
  ) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.agreement.updateMany({ where: { id, status: { in: from } }, data: { status: to } })
      if (!changed.count) throw invalidTransition()
      if (!material) return
      const { materialId } = await tx.agreement.findUniqueOrThrow({ where: { id }, select: { materialId: true } })
      const moved = await tx.material.updateMany({ where: { id: materialId, status: { in: material.from } }, data: { status: material.to } })
      if (!moved.count && material.required) throw unavailable()
    })
  }

  async function propose(buyerId: string, input: ProposeInput): Promise<AgreementDto> {
    const scheduleError = checkSchedule(input.date, input.time)
    if (scheduleError) throw new AppError(400, 'VALIDATION', scheduleError)
    const material = await prisma.material.findUnique({ where: { id: input.materialId } })
    if (!material || material.status === 'Eliminado' || (material.status === 'Pausado' && material.ownerId !== buyerId))
      throw materialNotFound()
    if (material.ownerId === buyerId) throw new AppError(400, 'OWN_MATERIAL', 'Es tu propia publicación.')

    // Serializable: si dos compradores proponen a la vez, solo una transacción puede confirmar.
    let created
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const current = await tx.material.findUniqueOrThrow({ where: { id: input.materialId }, select: { status: true } })
          const active = await tx.agreement.count({ where: { materialId: input.materialId, status: { in: ACTIVE } } })
          if (current.status !== 'Disponible') throw unavailable()
          if (active) throw agreementActive()
          return tx.agreement.create({
            data: {
              materialId: input.materialId,
              buyerId,
              sellerId: material.ownerId,
              place: input.place,
              date: input.date,
              time: input.time,
              note: input.note || null,
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      if (isConflict(error)) throw agreementActive()
      throw error
    }

    const { conversation } = await conversations.open(input.materialId, buyerId)
    const note = created.note ? ` Nota: ${created.note}` : ''
    await conversations.sendMessage(
      conversation.id,
      buyerId,
      `📍 Propuesta de entrega: ${created.place}, ${formatDate(created.date)} a las ${formatTime(created.time)}.${note}`,
      { quiet: true },
    )
    await hub.notifier.notify(created.sellerId, {
      category: 'acuerdos',
      link: `#/acuerdo/${created.id}`,
      text: `${await nameOf(buyerId)} propuso entregar “${material.title}” en ${created.place}.`,
    })
    const seller = await prisma.user.findUniqueOrThrow({ where: { id: created.sellerId }, select: { isBot: true } })
    if (seller.isBot) await scheduleBotConfirm(hub.config, created.id)
    return (await broadcast(created.id)).dto
  }

  async function confirm(id: string, userId: string): Promise<AgreementDto> {
    const a = await participating(id, userId)
    if (a.sellerId !== userId) throw forbidden()
    await transition(id, ['Pendiente'], 'Confirmado', { from: ['Disponible'], to: 'Reservado', required: true })
    const { dto, agreement } = await broadcast(id, 'Reservado')
    await hub.notifier.notify(a.buyerId, {
      category: 'acuerdos',
      link: `#/acuerdo/${id}`,
      text: `${await nameOf(userId)} confirmó la entrega en ${agreement.place}.`,
    })
    return dto
  }

  async function cancel(id: string, userId: string): Promise<AgreementDto> {
    const a = await participating(id, userId)
    const material = await prisma.material.findUniqueOrThrow({ where: { id: a.materialId }, select: { status: true } })
    await transition(id, ACTIVE, 'Cancelado', { from: ['Reservado'], to: 'Disponible', required: false })
    const freed = a.status === 'Confirmado' && material.status === 'Reservado'
    const { dto, agreement } = await broadcast(id, freed ? 'Disponible' : undefined)
    await hub.notifier.notify(a.buyerId === userId ? a.sellerId : a.buyerId, {
      category: 'acuerdos',
      link: `#/acuerdo/${id}`,
      text: `${await nameOf(userId)} canceló la entrega de “${agreement.material.title}”.`,
    })
    return dto
  }

  async function complete(id: string, userId: string): Promise<AgreementDto> {
    const a = await participating(id, userId)
    if (a.buyerId !== userId) throw forbidden()
    await transition(id, ['Confirmado'], 'Completado', { from: ['Reservado', 'Disponible'], to: 'Entregado', required: false })
    const { dto, agreement } = await broadcast(id, 'Entregado')
    await hub.notifier.notify(a.sellerId, {
      category: 'acuerdos',
      link: `#/acuerdo/${id}`,
      text: `${await nameOf(userId)} confirmó que recibió “${agreement.material.title}”.`,
    })
    return dto
  }

  async function review(id: string, userId: string, input: { stars: number; comment: string }): Promise<AgreementDto> {
    const a = await participating(id, userId)
    if (a.buyerId !== userId) throw forbidden()
    if (a.status !== 'Completado') throw invalidTransition()
    const [author, material] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      prisma.material.findUniqueOrThrow({ where: { id: a.materialId }, select: { title: true } }),
    ])
    try {
      await prisma.review.create({
        data: {
          agreementId: id,
          authorId: userId,
          authorName: author.name,
          targetId: a.sellerId,
          stars: input.stars,
          comment: input.comment,
          materialTitle: material.title,
        },
      })
    } catch (error) {
      if (isConflict(error)) throw new AppError(409, 'ALREADY_REVIEWED', 'Ya valoraste esta entrega.')
      throw error
    }
    return (await broadcast(id)).dto
  }

  /** Acuerdos que otra acción ya canceló (p. ej. borrar el material): se emiten y se avisa a la otra persona. */
  /**
   * Acuerdos que otra acción ya canceló: se emiten y se avisa. Si lo hizo el dueño (borrar), avisa a la otra
   * persona; si fue la moderación, avisa al comprador (el vendedor ya recibe el aviso de la moderación).
   */
  async function announceCancelled(ids: string[], actorId: string, opts: { byModeration?: boolean } = {}) {
    for (const id of ids) {
      const { agreement } = await broadcast(id)
      const title = agreement.material.title
      await hub.notifier.notify(agreement.buyerId === actorId ? agreement.sellerId : agreement.buyerId, {
        category: 'acuerdos',
        link: `#/acuerdo/${id}`,
        text: opts.byModeration
          ? `La entrega de “${title}” se canceló porque un administrador ocultó la publicación.`
          : `${await nameOf(actorId)} canceló la entrega de “${title}”.`,
      })
    }
  }

  async function list(userId: string): Promise<AgreementDto[]> {
    const rows = await prisma.agreement.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: { review: true },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(toAgreementDto)
  }

  return { propose, confirm, cancel, complete, review, list, announceCancelled }
}
