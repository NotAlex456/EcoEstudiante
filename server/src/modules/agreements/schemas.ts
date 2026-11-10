import { z } from 'zod'
import { SAFE_POINTS } from '../../../../shared/constants'

const places = SAFE_POINTS.map((p) => p.name) as [string, ...string[]]

export const proposeSchema = z
  .object({
    materialId: z.string().min(1),
    place: z.enum(places, 'Elige uno de los puntos seguros del campus.'),
    date: z.string(),
    time: z.string(),
    note: z.string().trim().max(300, 'La nota puede tener hasta 300 caracteres.').optional(),
  })
  .strict()

export const reviewSchema = z
  .object({
    stars: z.number().int().min(1, 'Elige de 1 a 5 estrellas.').max(5, 'Elige de 1 a 5 estrellas.'),
    comment: z.string().trim().max(500, 'El comentario puede tener hasta 500 caracteres.'),
  })
  .strict()

export type ProposeInput = z.infer<typeof proposeSchema>
