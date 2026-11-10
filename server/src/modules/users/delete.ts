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
      throw new AppError(401, 'INVALID_PASSWORD', 'La contraseña no es correcta.')

    const active = await prisma.agreement.findMany({
      where: { status: { in: ['Pendiente', 'Confirmado'] }, OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { id: true, materialId: true, status: true },
    })
    const now = new Date()
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          blockedAt: now,
          deletedName: user.name,
          deletedEmail: user.email,
          name: DELETED_NAME,
          email: deletedEmailFor(userId),
          passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.review.updateMany({ where: { authorId: userId }, data: { authorName: DELETED_NAME } }),
      prisma.savedMaterial.deleteMany({ where: { OR: [{ userId }, { material: { ownerId: userId } }] } }),
      prisma.savedSearch.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.deviceToken.deleteMany({ where: { userId } }),
      prisma.emailCode.deleteMany({ where: { userId } }),
      prisma.agreement.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: 'Cancelado' } }),
      // Un material reservado por una entrega cancelada vuelve a estar disponible.
      prisma.material.updateMany({
        where: { id: { in: active.filter((a) => a.status === 'Confirmado').map((a) => a.materialId) }, status: 'Reservado' },
        data: { status: 'Disponible' },
      }),
      prisma.moderationLog.create({ data: { adminId: userId, action: 'delete_account', targetId: userId } }),
    ])
    hub.realtime.disconnectUser(userId)
    await agreements.announceCancelled(active.map((a) => a.id), userId, { byDeletion: true })
  }

  return { deleteAccount }
}
