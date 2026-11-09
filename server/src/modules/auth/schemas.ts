import { z } from 'zod'
import { CAREERS, INSTITUTIONAL_EMAIL } from '../../../../shared/constants'

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .regex(INSTITUTIONAL_EMAIL, 'Usa tu correo institucional (nombre.apellido@upsjb.edu.pe).')

export const name = z.string().trim().min(3, 'Escribe tu nombre y apellido.').max(80)
export const career = z.enum(CAREERS as [string, ...string[]], 'Elige una carrera de la lista.')
export const cycle = z.number().int().min(1, 'El ciclo va del 1 al 10.').max(10, 'El ciclo va del 1 al 10.')

export const registerSchema = z
  .object({
    name,
    email,
    career,
    cycle,
    password: z.string().min(8, 'Usa al menos 8 caracteres.').max(72, 'Usa como máximo 72 caracteres.'),
  })
  .strict()

export const verifySchema = z.object({ userId: z.string().min(1), code: z.string().trim().min(1) }).strict()

export const resendSchema = z.object({ userId: z.string().min(1) }).strict()

export const loginSchema = z
  .object({ email: z.string().trim().toLowerCase().min(1), password: z.string().min(1, 'Escribe tu contraseña.') })
  .strict()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
