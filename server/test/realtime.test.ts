import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createRealtime, type Realtime } from '../src/realtime/socket'
import { registerAndVerify, resetDb, testConfig } from './helpers'

const config = testConfig()
let server: http.Server
let realtime: Realtime
let url: string
const sockets: Socket[] = []

const open = (token?: string) => {
  const socket = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true })
  sockets.push(socket)
  return socket
}
const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
  })
const rejected = (socket: Socket) =>
  new Promise<string>((resolve) => socket.once('connect_error', (error) => resolve(error.message)))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  server = http.createServer()
  realtime = createRealtime(server, config)
  server.on('request', createApp(config, { realtime }))
  await new Promise<void>((r) => server.listen(0, r))
  url = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  sockets.forEach((s) => s.disconnect())
  await realtime.close()
  await new Promise((r) => server.close(r))
})

beforeEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect())
  await resetDb()
})

describe('Socket.IO', () => {
  it('rechaza la conexión sin token', async () => {
    expect(await rejected(open())).toBe('UNAUTHENTICATED')
  })

  it('rechaza un token inválido', async () => {
    expect(await rejected(open('no-es-un-token'))).toBe('UNAUTHENTICATED')
  })

  it('conecta con token válido y entrega eventos solo a su usuario', async () => {
    const app = createApp(config, { realtime })
    const ana = await registerAndVerify(app)
    const beto = await registerAndVerify(app, { email: 'beto.diaz@upsjb.edu.pe', name: 'Beto Díaz' })
    const sa = open(ana.token)
    const sb = open(beto.token)
    await Promise.all([connected(sa), connected(sb)])
    expect(await realtime.isOnline(ana.user.id)).toBe(true)

    const got: { a: unknown[]; b: unknown[] } = { a: [], b: [] }
    sa.on('notification:new', (p) => got.a.push(p))
    sb.on('notification:new', (p) => got.b.push(p))
    realtime.emitToUser(ana.user.id, 'notification:new', { hola: 1 })
    await wait(200)
    expect(got.a).toEqual([{ hola: 1 }])
    expect(got.b).toEqual([])

    sa.disconnect()
    await wait(200)
    expect(await realtime.isOnline(ana.user.id)).toBe(false)
  })
})
