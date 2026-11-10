import { z } from 'zod'
import { career, cycle, name } from '../auth/schemas'

export const notificationPrefsSchema = z
  .object({
    push: z.boolean(),
    quietNight: z.boolean(),
    categories: z
      .object({ mensajes: z.boolean(), acuerdos: z.boolean(), busquedas: z.boolean(), cuenta: z.boolean() })
      .strict(),
  })
  .strict()

export const updateMeSchema = z
  .object({
    name: name.optional(),
    career: career.optional(),
    cycle: cycle.optional(),
    notificationPrefs: notificationPrefsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Envía al menos un dato para actualizar.')

export type UpdateMeInput = z.infer<typeof updateMeSchema>

export const deleteMeSchema = z.object({ password: z.string().min(1, 'Escribe tu contraseña.').max(200) }).strict()
