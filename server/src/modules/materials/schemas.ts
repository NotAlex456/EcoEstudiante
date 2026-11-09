import { z } from 'zod'
import { CAREERS, CATEGORIES, CONDITIONS, MODES } from '../../../../shared/constants'

const career = z.enum(CAREERS as [string, ...string[]], 'Elige una carrera de la lista.')
const category = z.enum(CATEGORIES, 'Elige una categoría de la lista.')
const mode = z.enum(MODES, 'Elige venta, intercambio o donación.')
const condition = z.enum(CONDITIONS, 'Elige el estado del material.')
const cycle = z.number().int().min(1, 'El ciclo va del 1 al 10.').max(10, 'El ciclo va del 1 al 10.')

/** Datos de una publicación. `images` se valida contra el almacenamiento en el servicio. */
export const materialSchema = z
  .object({
    title: z.string().trim().min(5, 'Escribe un título de al menos 5 caracteres.').max(100),
    course: z.string().trim().min(1, 'Indica el curso.').max(80),
    career,
    cycle,
    category,
    mode,
    price: z.number().int('El precio debe ser un número entero.').min(0),
    exchangeFor: z.string().trim().max(120).optional(),
    condition,
    description: z.string().trim().min(20, 'Describe el material en al menos 20 caracteres.').max(1000),
    images: z.array(z.string().url()).min(1, 'Agrega al menos una foto.').max(5, 'Puedes usar hasta 5 fotos.'),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.mode === 'Venta' && (m.price < 1 || m.price > 1000))
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'El precio de venta va de S/ 1 a S/ 1000.' })
  })

export type MaterialInput = z.infer<typeof materialSchema>

const optionalText = z.string().trim().optional().transform((v) => v || undefined)
const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return undefined
      const n = Number(v)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `Debe ser un número entre ${min} y ${max}.` })
        return z.NEVER
      }
      return n
    })

export const listQuerySchema = z.object({
  q: optionalText,
  category: category.optional(),
  mode: mode.optional(),
  career: career.optional(),
  cycle: optionalNumber(1, 10),
  condition: condition.optional(),
  maxPrice: optionalNumber(0, 100000),
  page: optionalNumber(1, 100000).transform((v) => v ?? 1),
})

export type ListQuery = z.infer<typeof listQuerySchema>
