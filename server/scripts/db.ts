/**
 * PostgreSQL embebido para desarrollo: `npm run db`.
 * Guarda los datos en server/.pg-data y escucha en el puerto 5433.
 */
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(import.meta.dirname, '..', '.pg-data')
const port = 5433
const isNew = !fs.existsSync(dataDir)

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  autoRehydrateSymlinks: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
})

if (isNew) await pg.initialise()
await pg.start()

const client = pg.getPgClient()
await client.connect()
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'ecoestudiante'")
if (!rowCount) await pg.createDatabase('ecoestudiante')
await client.end()

console.log(`PostgreSQL listo en el puerto ${port} (Ctrl+C para detener)`)

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
