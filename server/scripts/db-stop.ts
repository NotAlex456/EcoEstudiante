/**
 * Detiene el PostgreSQL de desarrollo si quedó abierto (por ejemplo, al cerrar la terminal
 * sin Ctrl+C): `npm run db:stop`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const dataDir = path.resolve(import.meta.dirname, '..', '.pg-data')
const require = createRequire(import.meta.url)
const binDir = path.join(path.dirname(require.resolve(`@embedded-postgres/${process.platform}-${process.arch}/package.json`)), 'native', 'bin')
const pgCtl = path.join(binDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')

if (!fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
  console.log('PostgreSQL de desarrollo no está en ejecución.')
} else {
  execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' })
}
