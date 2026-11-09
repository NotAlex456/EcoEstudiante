import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db'
import { resetDb } from './helpers'

const user = (email: string) =>
  prisma.user.create({ data: { name: 'Ana Torres', email, career: 'Contabilidad', cycle: 2, passwordHash: 'x' } })

describe('base de datos', () => {
  beforeEach(resetDb)

  it('crea un usuario con preferencias por defecto', async () => {
    const u = await user('ana@upsjb.edu.pe')
    expect(u.verified).toBe(false)
    expect(u.isBot).toBe(false)
    expect(u.notificationPrefs).toEqual({
      push: true,
      quietNight: false,
      categories: { mensajes: true, acuerdos: true, busquedas: true, cuenta: true },
    })
  })

  it('no permite dos conversaciones del mismo comprador por material', async () => {
    const seller = await user('vende@upsjb.edu.pe')
    const buyer = await user('compra@upsjb.edu.pe')
    const material = await prisma.material.create({
      data: {
        ownerId: seller.id, title: 'Cálculo', course: 'Cálculo I', career: 'Ingeniería de Sistemas', cycle: 1,
        category: 'Libros', mode: 'Donacion', price: 0, condition: 'ComoNuevo', description: 'Libro',
      },
    })
    const data = { materialId: material.id, buyerId: buyer.id, sellerId: seller.id }
    await prisma.conversation.create({ data })
    await expect(prisma.conversation.create({ data })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('resetDb deja las tablas vacías', async () => {
    await user('ana@upsjb.edu.pe')
    await resetDb()
    expect(await prisma.user.count()).toBe(0)
  })
})
