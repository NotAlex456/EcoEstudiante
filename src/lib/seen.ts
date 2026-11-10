/**
 * Qué acuerdos ya vio el usuario en este celular (para el número de Actividad). Se guarda en localStorage por
 * usuario y avisa a la interfaz cuando cambia. El cálculo vive en shared/activity.ts.
 */
import { useSyncExternalStore } from 'react'
import { markSeen, type Seen } from '../../shared/activity'

const keyFor = (userId: string) => `eco-agreements-seen:${userId}`
const cache = new Map<string, Seen>()
const listeners = new Set<() => void>()

function read(userId: string): Seen {
  const cached = cache.get(userId)
  if (cached) return cached
  let seen: Seen | null = null
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (raw) seen = JSON.parse(raw) as Seen
  } catch {
    // almacenamiento no disponible o dañado: se empieza de nuevo
  }
  // Primer uso (o reinstalación): solo cuenta lo que cambie desde ahora.
  if (!seen || typeof seen.since !== 'number' || typeof seen.at !== 'object') seen = { since: Date.now(), at: {} }
  write(userId, seen, false)
  return seen
}

function write(userId: string, seen: Seen, notify = true) {
  cache.set(userId, seen)
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(seen))
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  if (notify) listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** El registro de "visto" del usuario; la interfaz se actualiza al marcar acuerdos. */
export function useSeenAgreements(userId: string): Seen {
  return useSyncExternalStore(subscribe, () => read(userId))
}

/** Marca acuerdos como vistos en su versión actual (al abrir la pestaña Acuerdos o un acuerdo). */
export function markAgreementsSeen(userId: string, agreements: { id: string; updatedAt: number }[]) {
  const current = read(userId)
  if (agreements.every((a) => (current.at[a.id] ?? current.since) >= a.updatedAt)) return
  write(userId, markSeen(current, agreements))
}

/** Olvida el registro (al eliminar la cuenta). */
export function forgetSeen(userId: string) {
  cache.delete(userId)
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // nada que borrar
  }
}
