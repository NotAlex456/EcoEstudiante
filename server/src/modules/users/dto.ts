import type { User } from '@prisma/client'

export type NotificationPrefs = {
  push: boolean
  quietNight: boolean
  categories: { mensajes: boolean; acuerdos: boolean; busquedas: boolean; cuenta: boolean }
}

/** Datos del usuario actual (nunca incluye el hash de la contraseña). */
export type MeDto = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  verified: true
  notificationPrefs: NotificationPrefs
  role: 'student' | 'admin'
  createdAt: string
}

export const toMe = (user: User): MeDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  career: user.career,
  cycle: user.cycle,
  verified: true,
  notificationPrefs: user.notificationPrefs as NotificationPrefs,
  role: user.role,
  createdAt: user.createdAt.toISOString(),
})
