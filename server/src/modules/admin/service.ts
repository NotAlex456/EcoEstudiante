import type { MaterialStatus, ModerationAction, Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { AppError } from '../../errors'
import type { Hub } from '../../hub'
import type { ImageStorage } from '../../integrations/images'
import { agreementService } from '../agreements/service'
import { materialInclude, ratingsOf, toMaterialDtos, type MaterialDto, type MaterialWithRelations, type OwnerDto } from '../materials/dto'
import { emitMaterialUpdated, materialNotFound, removeAsAdmin } from '../materials/service'

const PAGE = 20

export type AdminMaterialDto = MaterialDto & { moderatedAt: string | null; owner: OwnerDto & { email: string; blocked: boolean; deleted: boolean } }
export type AdminReportDto = {
  id: string
  reason: string
  detail: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  material: AdminMaterialDto
  reporter: { id: string; name: string; email: string }
}
export type AdminUserDto = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  role: 'student' | 'admin'
  blocked: boolean
  /** Cuenta eliminada por su dueño: `name` y `email` son los originales (solo el panel los ve). */
  deleted: boolean
  deletedAt: string | null
  createdAt: string
  materials: number
  rating: { value: number; count: number }
}

const reportNotFound = () => new AppError(404, 'REPORT_NOT_FOUND', 'Este reporte ya no existe.')
const userNotFound = () => new AppError(404, 'USER_NOT_FOUND', 'Este estudiante no existe.')

/** Nombre y correo reales: los de una cuenta eliminada quedan en deletedName/deletedEmail. */
const realIdentity = (u: { name: string; email: string; deletedName: string | null; deletedEmail: string | null }) => ({
  name: u.deletedName ?? u.name,
  email: u.deletedEmail ?? u.email,
})

async function toAdminMaterials(rows: MaterialWithRelations[]): Promise<AdminMaterialDto[]> {
  const dtos = await toMaterialDtos(rows)
  return dtos.map((dto, i) => ({
    ...dto,
    moderatedAt: rows[i].moderatedAt?.toISOString() ?? null,
    owner: { ...dto.owner, ...realIdentity(rows[i].owner), blocked: Boolean(rows[i].owner.blockedAt), deleted: Boolean(rows[i].owner.deletedAt) },
  }))
}

export function adminService(hub: Hub, images: ImageStorage) {
  const agreements = agreementService(hub)

  const log = (adminId: string, action: ModerationAction, targetId: string, reason?: string) =>
    prisma.moderationLog.create({ data: { adminId, action, targetId, reason: reason?.trim() || null } })

  async function stats() {
    const [students, activeMaterials, completedAgreements, pendingReports] = await Promise.all([
      prisma.user.count({ where: { isBot: false, verified: true, deletedAt: null } }),
      prisma.material.count({ where: { status: { in: ['Disponible', 'Reservado'] } } }),
      prisma.agreement.count({ where: { status: 'Completado' } }),
      prisma.report.count({ where: { resolvedAt: null } }),
    ])
    return { students, activeMaterials, completedAgreements, pendingReports }
  }

  async function materials(query: { q?: string; status?: string; page: number }) {
    const where: Prisma.MaterialWhereInput = {
      ...(query.status ? { status: query.status as MaterialStatus } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { category: { contains: query.q, mode: 'insensitive' } },
              { owner: { name: { contains: query.q, mode: 'insensitive' } } },
              { owner: { deletedName: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const rows = await prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * PAGE,
      take: PAGE + 1,
    })
    return { items: await toAdminMaterials(rows.slice(0, PAGE)), hasMore: rows.length > PAGE }
  }

  /** Oculta (Pausado + moderatedAt), cancela sus entregas en curso y avisa al dueño y a los compradores. */
  async function hideMaterial(adminId: string, id: string, reason?: string) {
    const material = await prisma.material.findUnique({ where: { id } })
    if (!material || material.status === 'Eliminado') throw materialNotFound()
    if (material.moderatedAt) throw new AppError(409, 'ALREADY_HIDDEN', 'Esta publicación ya está oculta.')
    // Una publicación entregada ya no se ofrece: ocultarla (y luego restaurarla) la volvería a listar.
    if (material.status === 'Entregado')
      throw new AppError(409, 'NOT_HIDEABLE', 'Esta publicación ya se entregó; no hace falta ocultarla.')
    const active = await prisma.agreement.findMany({
      where: { materialId: id, status: { in: ['Pendiente', 'Confirmado'] } },
      select: { id: true },
    })
    await prisma.$transaction([
      prisma.material.update({ where: { id }, data: { status: 'Pausado', moderatedAt: new Date() } }),
      prisma.agreement.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: 'Cancelado' } }),
    ])
    await agreements.announceCancelled(active.map((a) => a.id), adminId, { byModeration: true })
    const why = reason?.trim() ? ` Motivo: ${reason.trim()}` : ''
    await hub.notifier.notify(material.ownerId, {
      category: 'cuenta',
      link: '#/actividad/publicaciones',
      text: `Un administrador ocultó tu publicación “${material.title}”.${why}`,
    })
    await emitMaterialUpdated(hub.realtime, id, 'Pausado')
    await log(adminId, 'hide_material', id, reason)
  }

  async function restoreMaterial(adminId: string, id: string) {
    const material = await prisma.material.findUnique({ where: { id } })
    if (!material || material.status === 'Eliminado') throw materialNotFound()
    // Solo se restaura lo que ocultó un administrador (no lo que pausó su dueño).
    if (!material.moderatedAt) throw new AppError(409, 'NOT_MODERATED', 'Esta publicación no fue ocultada por un administrador.')
    await prisma.material.update({ where: { id }, data: { status: 'Disponible', moderatedAt: null } })
    await emitMaterialUpdated(hub.realtime, id, 'Disponible')
    await log(adminId, 'restore_material', id)
  }

  async function deleteMaterial(adminId: string, id: string, reason?: string) {
    const cancelled = await removeAsAdmin(id, images)
    await agreements.announceCancelled(cancelled, adminId, { byModeration: true })
    await emitMaterialUpdated(hub.realtime, id, 'Eliminado')
    await log(adminId, 'delete_material', id, reason)
  }

  async function reports(status: 'pending' | 'resolved'): Promise<AdminReportDto[]> {
    const rows = await prisma.report.findMany({
      where: { resolvedAt: status === 'pending' ? null : { not: null } },
      include: { material: { include: materialInclude }, user: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    const mats = await toAdminMaterials(rows.map((r) => r.material))
    return rows.map((r, i) => ({
      id: r.id,
      reason: r.reason,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolution: r.resolution,
      material: mats[i],
      reporter: { id: r.user.id, ...realIdentity(r.user) },
    }))
  }

  /** hidden: oculta la publicación y resuelve todos sus reportes pendientes. dismissed: solo este reporte. */
  async function resolveReport(adminId: string, reportId: string, action: 'hidden' | 'dismissed') {
    const report = await prisma.report.findUnique({ where: { id: reportId }, include: { material: true } })
    if (!report) throw reportNotFound()
    if (action === 'dismissed') {
      await prisma.report.update({ where: { id: reportId }, data: { resolvedAt: new Date(), resolution: 'dismissed' } })
      await log(adminId, 'dismiss_report', reportId)
      return
    }
    const hideable = !report.material.moderatedAt && !['Eliminado', 'Entregado'].includes(report.material.status)
    if (hideable) await hideMaterial(adminId, report.materialId, `Reporte: ${report.reason}`)
    await prisma.report.updateMany({
      where: { materialId: report.materialId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: 'hidden' },
    })
  }

  async function users(query: { q?: string; page: number }): Promise<{ items: AdminUserDto[]; hasMore: boolean }> {
    const rows = await prisma.user.findMany({
      where: {
        isBot: false,
        verified: true,
        ...(query.q
          ? {
              OR: (['name', 'email', 'deletedName', 'deletedEmail'] as const).map((field) => ({
                [field]: { contains: query.q, mode: 'insensitive' as const },
              })),
            }
          : {}),
      },
      include: { _count: { select: { materials: { where: { status: { not: 'Eliminado' } } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * PAGE,
      take: PAGE + 1,
    })
    const page = rows.slice(0, PAGE)
    const ratings = await ratingsOf(page.map((u) => u.id))
    return {
      items: page.map((u) => ({
        id: u.id,
        ...realIdentity(u),
        career: u.career,
        cycle: u.cycle,
        role: u.role,
        blocked: Boolean(u.blockedAt),
        deleted: Boolean(u.deletedAt),
        deletedAt: u.deletedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        materials: u._count.materials,
        rating: ratings.get(u.id) ?? { value: 0, count: 0 },
      })),
      hasMore: rows.length > PAGE,
    }
  }

  /** Bloquea: no puede entrar, sus sesiones y su conexión en vivo se cortan y sus publicaciones se ocultan. */
  async function blockUser(adminId: string, userId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.isBot) throw userNotFound()
    if (user.id === adminId || hub.config.adminEmails.includes(user.email.toLowerCase()))
      throw new AppError(409, 'CANNOT_BLOCK', 'No puedes bloquear tu propia cuenta ni la de otro administrador.')
    const active = await prisma.agreement.findMany({
      where: { status: { in: ['Pendiente', 'Confirmado'] }, OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { id: true, materialId: true, status: true },
    })
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { blockedAt: new Date(), tokenVersion: { increment: 1 } } }),
      prisma.agreement.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: 'Cancelado' } }),
      // Un material reservado por una entrega cancelada vuelve a estar disponible.
      prisma.material.updateMany({
        where: { id: { in: active.filter((a) => a.status === 'Confirmado').map((a) => a.materialId) }, status: 'Reservado' },
        data: { status: 'Disponible' },
      }),
    ])
    hub.realtime.disconnectUser(userId)
    // Avisa a la otra persona de cada entrega (el bloqueado ya no puede entrar).
    await agreements.announceCancelled(active.map((a) => a.id), userId, { byModeration: true })
    await log(adminId, 'block_user', userId, reason)
  }

  async function unblockUser(adminId: string, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.isBot) throw userNotFound()
    if (user.deletedAt) throw new AppError(409, 'ACCOUNT_DELETED', 'Esta cuenta fue eliminada: no se puede desbloquear.')
    await prisma.user.update({ where: { id: userId }, data: { blockedAt: null } })
    await log(adminId, 'unblock_user', userId)
  }

  async function moderationLog() {
    const rows = await prisma.moderationLog.findMany({
      include: { admin: { select: { id: true, name: true, email: true, deletedName: true, deletedEmail: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    })
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetId: r.targetId,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      // Nombre real aunque la cuenta (de un estudiante o de un admin) se haya eliminado después.
      admin: { id: r.admin.id, name: realIdentity(r.admin).name },
    }))
  }

  return { stats, materials, hideMaterial, restoreMaterial, deleteMaterial, reports, resolveReport, users, blockUser, unblockUser, moderationLog }
}
