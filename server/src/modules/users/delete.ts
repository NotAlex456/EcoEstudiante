import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import { agreementService } from '../agreements/service'

export const DELETED_NAME = 'Usuario eliminado'
export const deletedEmailFor = (id: string) => `eliminado-${id}@eliminado.invalid`

/**
 * Eliminar mi cuenta. Reutiliza el bloqueo (`blockedAt` ya oculta publicaciones y perfil y corta la sesión) y además:
 * guarda el nombre y correo reales solo para el panel, libera el correo, borra los datos personales y cancela los
 * acuerdos en curso avisando a la otra persona. Chats, acuerdos terminados y reseñas quedan con "Usuario eliminado".
 */
export function deleteAccountService(hub: Hub) {
  const agreements = agreementService(hub)

  async function deleteAccount(userId: string, password: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (!(await bcrypt.compare(password, user.passwordHash)))
      throw new AppError(403, 'INVALID_PASSWORD', 'La contraseña no es correcta.')

    const now = new Date()
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10)
    // Lectura y escritura en la misma transacción (Serializable): si la otra persona completa o confirma la entrega
    // justo en ese momento, una de las dos operaciones falla en vez de dejar datos inconsistentes.
    const cancelled = await prisma
      .$transaction(
      async (tx) => {
        const active = await tx.agreement.findMany({
          where: { status: { in: ['Pendiente', 'Confirmado'] }, OR: [{ buyerId: userId }, { sellerId: userId }] },
          select: { id: true, materialId: true, status: true },
        })
        await tx.user.update({
          where: { id: userId },
          data: {
            deletedAt: now,
            blockedAt: now,
            deletedName: user.name,
            deletedEmail: user.email,
            name: DELETED_NAME,
            email: deletedEmailFor(userId),
            passwordHash,
            tokenVersion: { increment: 1 },
          },
        })
        await tx.review.updateMany({ where: { authorId: userId }, data: { authorName: DELETED_NAME } })
        await tx.savedMaterial.deleteMany({ where: { OR: [{ userId }, { material: { ownerId: userId } }] } })
        await tx.savedSearch.deleteMany({ where: { userId } })
        await tx.notification.deleteMany({ where: { userId } })
        await tx.deviceToken.deleteMany({ where: { userId } })
        await tx.emailCode.deleteMany({ where: { userId } })
        await tx.agreement.updateMany({
          where: { id: { in: active.map((a) => a.id) }, status: { in: ['Pendiente', 'Confirmado'] } },
          data: { status: 'Cancelado' },
        })
        // Un material reservado por una entrega cancelada vuelve a estar disponible.
        await tx.material.updateMany({
          where: { id: { in: active.filter((a) => a.status === 'Confirmado').map((a) => a.materialId) }, status: 'Reservado' },
          data: { status: 'Disponible' },
        })
        await tx.moderationLog.create({ data: { adminId: userId, action: 'delete_account', targetId: userId } })
        return active.map((a) => a.id)
      },
      { isolationLevel: 'Serializable' },
      )
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
          throw new AppError(409, 'TRY_AGAIN', 'Una de tus entregas cambió justo ahora. Inténtalo de nuevo.')
        throw error
      })
    hub.realtime.disconnectUser(userId)
    await agreements.announceCancelled(cancelled, userId, { byDeletion: true })
  }

  return { deleteAccount }
}
