import type { Hub } from '../hub'
import { runDueJobs } from './jobs'

/** Revisa los trabajos de bots cada `intervalMs`. Devuelve una función para detenerlo. */
export function startBotWorker(hub: Hub, intervalMs = 5000): () => void {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await runDueJobs(new Date(), hub)
    } catch (error) {
      console.error('Worker de bots:', error)
    } finally {
      running = false
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
