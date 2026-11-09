/**
 * Inicia un PostgreSQL embebido solo para las pruebas (puerto 5434, datos temporales)
 * y aplica las migraciones. No necesita `npm run db`.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 5434
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-pg-test-'))
let pg: EmbeddedPostgres | undefined

export async function setup() {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('ecoestudiante_test')
  const url = `postgresql://postgres:postgres@localhost:${PORT}/ecoestudiante_test`
  process.env.DATABASE_URL = url
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
}

export async function teardown() {
  await pg?.stop()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
