import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { seed } from '../prisma/seed'
import { prisma } from '../src/db'
import { authHeader as auth, fakeRealtime, insertMaterial, makeApp, registerAndVerify, resetDb, validRegistration } from './helpers'

type Who = Awaited<ReturnType<typeof registerAndVerify>>
let realtime: ReturnType<typeof fakeRealtime>
let app: ReturnType<typeof makeApp>
let ana: Who, beto: Who, carla: Who
let materialId: string

function futureDate() {
  const d = new Date(Date.now() + 2 * 86_400_000)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

beforeEach(async () => {
  await resetDb()
  realtime = fakeRealtime()
  app = makeApp({ adminEmails: [validRegistration.email] }, { realtime })
  ana = await registerAndVerify(app) // administradora
  beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
  carla = await registerAndVerify(app, { email: 'carla.ruiz@upsjb.edu.pe', name: 'Carla Ruiz' })
  materialId = (await insertMaterial(beto.user.id, { title: 'Libro de Anatomía' })).id
})

const admin = (method: 'get' | 'post' | 'delete', path: string, who: Who = ana) =>
  request(app)[method](`/api/admin${path}`).set(auth(who.token))

describe('acceso al panel', () => {
  it('un estudiante recibe 403 en todas las rutas de administración', async () => {
    const routes: ['get' | 'post' | 'delete', string][] = [
      ['get', '/stats'], ['get', '/materials'], ['post', `/materials/${materialId}/hide`], ['post', `/materials/${materialId}/restore`],
      ['delete', `/materials/${materialId}`], ['get', '/reports'], ['post', '/reports/x/resolve'], ['get', '/users'],
      ['post', `/users/${beto.user.id}/block`], ['post', `/users/${beto.user.id}/unblock`], ['get', '/log'],
    ]
    for (const [method, path] of routes) {
      const res = await admin(method, path, carla).send({ action: 'dismissed' })
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.error.message).toBe('No tienes acceso al panel de administración.')
    }
  })

  it('stats cuenta estudiantes, publicaciones activas, entregas y reportes pendientes', async () => {
    await request(app).post('/api/reports').set(auth(carla.token)).send({ materialId, reason: 'Contenido inadecuado', detail: '' })
    const res = await admin('get', '/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ students: 3, activeMaterials: 1, completedAgreements: 0, pendingReports: 1 })
  })
})

describe('moderar publicaciones', () => {
  it('ocultar pausa el material, cancela su entrega en curso, avisa y queda registrado', async () => {
    const proposal = await request(app).post('/api/agreements').set(auth(carla.token))
      .send({ materialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    await request(app).post(`/api/agreements/${proposal.body.id}/confirm`).set(auth(beto.token))

    const res = await admin('post', `/materials/${materialId}/hide`).send({ reason: 'Foto engañosa' })
    expect(res.status).toBe(200)
    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } })
    expect(material.status).toBe('Pausado')
    expect(material.moderatedAt).not.toBeNull()
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: proposal.body.id } })).status).toBe('Cancelado')
    expect(await prisma.notification.findFirst({ where: { userId: beto.user.id, text: { contains: 'Un administrador ocultó' } } })).not.toBeNull()
    expect(await prisma.notification.findFirst({ where: { userId: carla.user.id, text: { contains: 'canceló' } } })).not.toBeNull()
    expect(await prisma.moderationLog.findFirst({ where: { action: 'hide_material', targetId: materialId } })).toMatchObject({
      adminId: ana.user.id,
      reason: 'Foto engañosa',
    })
  })

  it('el dueño no puede reactivar ni editar lo oculto, pero sí eliminarlo', async () => {
    await admin('post', `/materials/${materialId}/hide`).send({})
    const reactivate = await request(app).patch(`/api/materials/${materialId}/status`).set(auth(beto.token)).send({ status: 'Disponible' })
    expect(reactivate.status).toBe(409)
    expect(reactivate.body.error.code).toBe('MODERATED')
    const mine = await request(app).get('/api/users/me/materials').set(auth(beto.token))
    expect(mine.body[0]).toMatchObject({ id: materialId, moderated: true })
    expect((await request(app).delete(`/api/materials/${materialId}`).set(auth(beto.token))).status).toBe(204)
  })

  it('restaurar vuelve a Disponible y limpia la moderación', async () => {
    await admin('post', `/materials/${materialId}/hide`).send({})
    expect((await admin('post', `/materials/${materialId}/restore`).send({})).status).toBe(200)
    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } })
    expect(material).toMatchObject({ status: 'Disponible', moderatedAt: null })
  })

  it('eliminar sin ser el dueño y listar eliminados', async () => {
    expect((await admin('delete', `/materials/${materialId}`)).status).toBe(204)
    expect(await prisma.material.findUnique({ where: { id: materialId } })).toBeNull()
    const other = await insertMaterial(beto.user.id, { status: 'Eliminado' })
    const list = await admin('get', '/materials?status=Eliminado')
    expect(list.body.items.map((m: { id: string }) => m.id)).toEqual([other.id])
  })
})

describe('reportes', () => {
  it('resolver con "hidden" oculta y resuelve todos los reportes del material; "dismissed" solo uno', async () => {
    const dana = await registerAndVerify(app, { email: 'dana.leon@upsjb.edu.pe', name: 'Dana León' })
    for (const who of [carla, dana])
      await request(app).post('/api/reports').set(auth(who.token)).send({ materialId, reason: 'Contenido inadecuado', detail: 'x' })
    const pending = await admin('get', '/reports?status=pending')
    expect(pending.body).toHaveLength(2)
    expect(pending.body[0]).toMatchObject({ material: { id: materialId }, reporter: { email: expect.any(String) } })

    const other = await insertMaterial(beto.user.id)
    await request(app).post('/api/reports').set(auth(carla.token)).send({ materialId: other.id, reason: 'Posible estafa o suplantación', detail: '' })
    const otherReport = await prisma.report.findFirstOrThrow({ where: { materialId: other.id } })
    expect((await admin('post', `/reports/${otherReport.id}/resolve`).send({ action: 'dismissed' })).status).toBe(200)
    expect((await prisma.material.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('Disponible')

    expect((await admin('post', `/reports/${pending.body[0].id}/resolve`).send({ action: 'hidden' })).status).toBe(200)
    expect(await prisma.report.count({ where: { materialId, resolvedAt: null } })).toBe(0)
    expect((await prisma.material.findUniqueOrThrow({ where: { id: materialId } })).status).toBe('Pausado')
    expect((await admin('get', '/reports?status=resolved')).body).toHaveLength(3)
  })
})

describe('usuarios', () => {
  it('bloquear oculta sus publicaciones a los demás y corta su conexión; desbloquear lo revierte', async () => {
    await request(app).put(`/api/saved/${materialId}`).set(auth(carla.token))
    expect((await admin('post', `/users/${beto.user.id}/block`).send({})).status).toBe(200)
    expect(realtime.disconnected).toContain(beto.user.id)
    expect((await request(app).get('/api/materials')).body.items).toEqual([])
    expect((await request(app).get(`/api/materials/${materialId}`)).status).toBe(404)
    expect((await request(app).get('/api/saved').set(auth(carla.token))).body).toEqual([])
    expect((await request(app).get(`/api/users/${beto.user.id}`)).status).toBe(404)
    expect((await request(app).get('/api/auth/me').set(auth(beto.token))).status).toBe(401)

    expect((await admin('post', `/users/${beto.user.id}/unblock`).send({})).status).toBe(200)
    expect((await request(app).get('/api/materials')).body.items).toHaveLength(1)
    const actions = (await admin('get', '/log')).body.map((l: { action: string }) => l.action)
    expect(actions).toEqual(['unblock_user', 'block_user'])
  })

  it('no se puede bloquear a uno mismo ni a otro administrador', async () => {
    expect((await admin('post', `/users/${ana.user.id}/block`).send({})).status).toBe(409)
    // Beto también es administrador (está en ADMIN_EMAILS): no se lo puede bloquear.
    const twoAdmins = makeApp({ adminEmails: [validRegistration.email, beto.user.email] }, { realtime })
    await prisma.user.update({ where: { id: beto.user.id }, data: { role: 'admin' } })
    expect((await request(twoAdmins).post(`/api/admin/users/${beto.user.id}/block`).set(auth(ana.token)).send({})).status).toBe(409)
  })

  it('la lista de usuarios no incluye bots', async () => {
    await seed(prisma)
    const res = await admin('get', '/users')
    expect(res.body.items.map((u: { email: string }) => u.email).sort()).toEqual(
      [ana, beto, carla].map((w) => w.user.email).sort(),
    )
    expect(res.body.items[0]).toEqual(expect.objectContaining({ blocked: false, role: expect.any(String), materials: expect.any(Number) }))
  })
})

describe('correcciones de la revisión final', () => {
  it('sacar un correo de ADMIN_EMAILS corta el acceso de su sesión vigente', async () => {
    const withoutList = makeApp({ adminEmails: [] }, { realtime })
    const res = await request(withoutList).get('/api/admin/stats').set(auth(ana.token))
    expect(res.status).toBe(403)
  })

  it('no se puede ocultar una publicación entregada ni restaurar una que no fue moderada', async () => {
    const delivered = await insertMaterial(beto.user.id, { status: 'Entregado' })
    const hide = await admin('post', `/materials/${delivered.id}/hide`).send({})
    expect(hide.status).toBe(409)
    await prisma.material.update({ where: { id: materialId }, data: { status: 'Pausado' } }) // pausada por su dueño
    const restore = await admin('post', `/materials/${materialId}/restore`).send({})
    expect(restore.status).toBe(409)
    expect((await prisma.material.findUniqueOrThrow({ where: { id: materialId } })).status).toBe('Pausado')
  })

  it('con el dueño bloqueado no se puede abrir un chat ni proponer una entrega', async () => {
    await admin('post', `/users/${beto.user.id}/block`).send({})
    expect((await request(app).post('/api/conversations').set(auth(carla.token)).send({ materialId })).status).toBe(404)
    const proposal = await request(app).post('/api/agreements').set(auth(carla.token))
      .send({ materialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    expect(proposal.status).toBe(404)
  })

  it('bloquear cancela sus entregas en curso y avisa a la otra persona', async () => {
    const proposal = await request(app).post('/api/agreements').set(auth(carla.token))
      .send({ materialId, place: 'Biblioteca central', date: futureDate(), time: '12:30' })
    await admin('post', `/users/${beto.user.id}/block`).send({})
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: proposal.body.id } })).status).toBe('Cancelado')
    expect(await prisma.notification.findFirst({ where: { userId: carla.user.id, text: { contains: 'se canceló' } } })).not.toBeNull()
  })
})

describe('cuentas eliminadas en el panel', () => {
  const deleteBeto = () => request(app).delete('/api/users/me').set(auth(beto.token)).send({ password: validRegistration.password })

  it('la lista de usuarios muestra la cuenta eliminada con su nombre y correo originales', async () => {
    await deleteBeto()
    const res = await admin('get', '/users?q=beto.diaz')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ id: beto.user.id, deleted: true, name: 'Beto Díaz', email: 'beto.diaz@upsjb.edu.pe' })
    expect(res.body.items[0].deletedAt).toEqual(expect.any(String))
  })

  it('no se puede desbloquear una cuenta eliminada', async () => {
    await deleteBeto()
    const res = await admin('post', `/users/${beto.user.id}/unblock`).send({})
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ACCOUNT_DELETED')
  })

  it('el resumen no cuenta las cuentas eliminadas', async () => {
    const before = (await admin('get', '/stats')).body.students
    await deleteBeto()
    expect((await admin('get', '/stats')).body.students).toBe(before - 1)
  })

  it('sus publicaciones siguen en el panel con el dueño real', async () => {
    await deleteBeto()
    const res = await admin('get', '/materials')
    const item = res.body.items.find((m: { id: string }) => m.id === materialId)
    expect(item.owner).toMatchObject({ name: 'Beto Díaz', email: 'beto.diaz@upsjb.edu.pe', deleted: true })
  })
})
