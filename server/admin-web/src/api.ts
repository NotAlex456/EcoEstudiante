/** Cliente de la API para el panel: mismo origen (/api) y sesión solo en esta pestaña. */

const TOKEN_KEY = 'eco-admin-token'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message)
  }
}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (token: string | null) =>
  token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY)

let onSessionLost = () => {}
/** Se llama si el servidor responde 401 o 403: la sesión ya no sirve para el panel. */
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn)

export async function api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión.', 0, 'NETWORK')
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const error = new ApiError(data?.error?.message ?? 'Ocurrió un error inesperado.', res.status, data?.error?.code ?? 'ERROR')
    if ((res.status === 401 || res.status === 403) && path !== '/auth/login') onSessionLost()
    throw error
  }
  return data as T
}

export type Owner = { id: string; name: string; email: string; blocked: boolean; deleted?: boolean; rating: { value: number; count: number } }
export type AdminMaterial = {
  id: string
  title: string
  category: string
  course: string
  status: 'Disponible' | 'Reservado' | 'Entregado' | 'Pausado' | 'Eliminado'
  price: number
  mode: string
  images: string[]
  createdAt: string
  moderatedAt: string | null
  owner: Owner
}
export type AdminReport = {
  id: string
  reason: string
  detail: string
  createdAt: string
  resolvedAt: string | null
  resolution: 'hidden' | 'dismissed' | null
  material: AdminMaterial
  reporter: { id: string; name: string; email: string }
}
export type AdminUser = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  role: 'student' | 'admin'
  blocked: boolean
  /** Cuenta eliminada por su dueño: name y email son los originales. */
  deleted: boolean
  deletedAt: string | null
  createdAt: string
  materials: number
  rating: { value: number; count: number }
}
export type Stats = { students: number; activeMaterials: number; completedAgreements: number; pendingReports: number }
export type LogEntry = { id: string; action: string; targetId: string; reason: string | null; createdAt: string; admin: { id: string; name: string } }
export type Page<T> = { items: T[]; hasMore: boolean }
