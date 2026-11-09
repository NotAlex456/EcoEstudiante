/**
 * Detiene el PostgreSQL de desarrollo si quedó abierto (por ejemplo, al cerrar la terminal
 * sin Ctrl+C): `npm run db:stop`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(import.meta.dirname, '..', '.pg-data')
const platform = process.platform === 'win32' ? 'windows' : process.platform
const binDir = path.resolve(import.meta.dirname, '..', 'node_modules', '@embedded-postgres', `${platform}-${process.arch}`, 'native', 'bin')
const pgCtl = path.join(binDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')

if (!fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
  console.log('PostgreSQL de desarrollo no está en ejecución.')
} else {
  execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' })
}
