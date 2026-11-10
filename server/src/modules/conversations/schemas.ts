import { z } from 'zod'

export const openSchema = z.object({ materialId: z.string().min(1) }).strict()

export const messageSchema = z
  .object({ text: z.string().trim().min(1, 'Escribe un mensaje.').max(1000, 'El mensaje puede tener hasta 1000 caracteres.') })
  .strict()
