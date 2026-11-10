import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import { makeApp, registerAndVerify, resetDb } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const app = makeApp()
let token: string
const report = (body: object, auth = true) => {
  const req = request(app).post('/api/reports')
  return (auth ? req.set('Authorization', `Bearer ${token}`) : req).send(body)
}
const valid = { materialId: 'm-1', reason: 'Precio abusivo o engañoso', detail: 'Cuesta el doble que en la librería.' }

describe('reportes', () => {
  beforeEach(async () => {
    await resetDb()
    await seed(prisma)
    token = (await registerAndVerify(app)).token
  })

  it('guarda el reporte una sola vez por usuario y material', async () => {
    const first = await report(valid)
    expect(first.status).toBe(201)
    expect(first.body).toEqual({ ok: true })
    expect((await report(valid)).status).toBe(200)
    expect(await prisma.report.count()).toBe(1)
  })

  it('valida el motivo, el material y la sesión', async () => {
    expect((await report({ ...valid, reason: 'Me cae mal' })).status).toBe(400)
    expect((await report({ ...valid, materialId: 'no-existe' })).status).toBe(404)
    expect((await report(valid, false)).status).toBe(401)
  })

  it('no permite reportar una publicación propia', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { isBot: false } })
    await prisma.material.update({ where: { id: 'm-1' }, data: { ownerId: me.id } })
    const res = await report(valid)
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'OWN_MATERIAL', message: 'No puedes reportar tu propia publicación.' })
  })
})
