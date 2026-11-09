/**
 * Trae datos del servidor a la caché local (el store). Las pantallas siguen leyendo con
 * `useStore`; aquí solo se actualiza lo que se guardó la última vez.
 */
import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { getState, updateCache } from './store'
import type { Material, SavedSearch, State, User } from './types'

export type OwnerDto = { id: string; name: string; career: string; cycle: number; rating: { value: number; count: number } }

export type MaterialDto = Omit<Material, 'createdAt'> & { createdAt: string; owner: OwnerDto }

export type ReviewDto = { authorName: string; stars: number; comment: string; materialTitle: string; createdAt: string }

export type PublicUserDto = OwnerDto & { createdAt: string; reviews: ReviewDto[]; materials: MaterialDto[] }

type SavedSearchDto = { id: string; query: string; category: string; mode: string; createdAt: string }

export function fromMaterialDto({ owner: _owner, createdAt, exchangeFor, ...rest }: MaterialDto): Material {
  return { ...rest, ...(exchangeFor ? { exchangeFor } : {}), createdAt: Date.parse(createdAt) }
}

/** Upsert de usuarios del servidor, conservando lo que la caché ya sabía (p. ej. el correo propio). */
function withUsers(s: State, owners: OwnerDto[]): User[] {
  const byId = new Map(s.users.map((u) => [u.id, u]))
  for (const o of owners) {
    const known = byId.get(o.id)
    byId.set(o.id, { email: '', verified: true, createdAt: 0, ...known, ...o })
  }
  return [...byId.values()]
}

/** Upsert de materiales en la caché. */
function withMaterials(s: State, materials: Material[]): Material[] {
  const byId = new Map(s.materials.map((m) => [m.id, m]))
  for (const m of materials) byId.set(m.id, m)
  return [...byId.values()]
}

/** Un material sigue en la caché si un chat o un acuerdo local lo usa (si no, esa pantalla se rompería). */
const inUse = (s: State, id: string) =>
  s.conversations.some((c) => c.materialId === id) || s.agreements.some((a) => a.materialId === id)

export function adoptMaterials(dtos: MaterialDto[]) {
  updateCache((s) => ({
    ...s,
    users: withUsers(s, dtos.map((d) => d.owner)),
    materials: withMaterials(s, dtos.map(fromMaterialDto)),
  }))
}

/** Todas las páginas de Explorar; quita de la caché los ajenos que ya no se listan. */
export async function loadMaterials() {
  const all: MaterialDto[] = []
  for (let page = 1; ; page++) {
    const res = await api<{ items: MaterialDto[]; hasMore: boolean }>('GET', `/materials?page=${page}`)
    all.push(...res.items)
    if (!res.hasMore || page >= 50) break
  }
  const listed = new Set(all.map((m) => m.id))
  updateCache((s) => ({
    ...s,
    users: withUsers(s, all.map((d) => d.owner)),
    materials: withMaterials(s, all.map(fromMaterialDto)).filter(
      (m) =>
        listed.has(m.id) ||
        m.ownerId === s.sessionUserId ||
        !(m.status === 'Disponible' || m.status === 'Reservado') ||
        inUse(s, m.id),
    ),
  }))
}

/** Un material por id. Si ya no existe (404), sale de la caché salvo que un chat o acuerdo lo use. */
export async function loadMaterial(id: string): Promise<'ok' | 'missing'> {
  try {
    adoptMaterials([await api<MaterialDto>('GET', `/materials/${encodeURIComponent(id)}`)])
    return 'ok'
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      updateCache((s) => (inUse(s, id) ? s : { ...s, materials: s.materials.filter((m) => m.id !== id) }))
      return 'missing'
    }
    throw error
  }
}

/** Perfil público: guarda al usuario y sus materiales en la caché y devuelve sus reseñas. */
export async function loadProfile(id: string): Promise<PublicUserDto | null> {
  try {
    const profile = await api<PublicUserDto>('GET', `/users/${encodeURIComponent(id)}`)
    adoptMaterials(profile.materials)
    updateCache((s) => ({ ...s, users: withUsers(s, [profile]) }))
    return profile
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Mis publicaciones, mis guardados y mis búsquedas guardadas. */
export async function loadActivity() {
  const me = getState().sessionUserId
  if (!me) return
  const [mine, saved, searches] = await Promise.all([
    api<MaterialDto[]>('GET', '/users/me/materials'),
    api<MaterialDto[]>('GET', '/saved'),
    api<SavedSearchDto[]>('GET', '/saved-searches'),
  ])
  const mineIds = new Set(mine.map((m) => m.id))
  adoptMaterials([...mine, ...saved])
  updateCache((s) => ({
    ...s,
    // Mis materiales que el servidor ya no devuelve (eliminados) salen de la caché.
    materials: s.materials.filter((m) => m.ownerId !== me || mineIds.has(m.id) || inUse(s, m.id)),
    saved: { ...s.saved, [me]: saved.map((m) => m.id) },
    savedSearches: [
      ...s.savedSearches.filter((x) => x.userId !== me),
      ...searches.map((x): SavedSearch => ({ id: x.id, userId: me, query: x.query, category: x.category, mode: x.mode, at: Date.parse(x.createdAt) })),
    ],
  }))
}

/** Al abrir la app o iniciar sesión. Un fallo de red deja la caché como estaba. */
export function syncAll() {
  return Promise.allSettled([loadMaterials(), loadActivity()])
}

/**
 * Recarga desde el servidor al montar la pantalla (y cuando cambian las dependencias).
 * Mientras tanto la pantalla muestra lo que ya hay en caché; `loading` sirve para el primer uso.
 */
export function useRefresh<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; result?: T }>({ loading: true })
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    load()
      .then((result) => !cancelled && setState({ loading: false, result }))
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })))
    return () => {
      cancelled = true
    }
  }, deps)
  return state
}
