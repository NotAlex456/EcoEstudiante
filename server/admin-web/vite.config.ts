import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

/** Panel de administración: se compila a server/dist-admin y Express lo sirve en /admin. */
export default defineConfig({
  root: import.meta.dirname,
  base: '/admin/',
  plugins: [react()],
  build: { outDir: path.join(import.meta.dirname, '..', 'dist-admin'), emptyOutDir: true },
  // En desarrollo (npm run dev:admin) las llamadas a /api van al servidor local.
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000' } },
})
