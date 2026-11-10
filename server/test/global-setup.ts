/**
 * Inicia un PostgreSQL embebido solo para las pruebas (puerto libre al azar, datos temporales)
 * y aplica las migraciones. No necesita `npm run db`.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

let pg: EmbeddedPostgres | undefined
let dataDir: string | undefined

/** Pide al sistema un puerto TCP libre, para no chocar con otra instancia que haya quedado abierta. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })

export async function setup() {
  const port = await freePort()
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-pg-test-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('ecoestudiante_test')
  const url = `postgresql://postgres:postgres@localhost:${port}/ecoestudiante_test`
  process.env.DATABASE_URL = url
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
}

export async function teardown() {
  await pg?.stop()
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
}
