/** Cliente HTTP del servidor de EcoEstudiante. */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

const TOKEN_KEY = 'ecoestudiante:token'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const networkError = () => new ApiError('NETWORK', 'No pudimos conectar con el servidor. Revisa tu conexión.', 0)

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // almacenamiento no disponible: la sesión dura lo que la pestaña
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw networkError()
  }

  const data = await res.json().catch(() => null)
  if (res.ok) return data as T

  const { code = 'INTERNAL', message = 'Ocurrió un error inesperado. Inténtalo de nuevo.', ...details } = data?.error ?? {}
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null)
    onUnauthorized()
  }
  throw new ApiError(code, message, res.status, details)
}

/**
 * Espera a que el servidor responda /health. Si tarda más de 1,5 s llama a onSlow
 * (el hosting gratuito "duerme" el servidor) y reintenta cada 3 s hasta 60 s.
 */
export async function waitForServer(onSlow: () => void): Promise<boolean> {
  const deadline = Date.now() + 60_000
  const slowTimer = setTimeout(onSlow, 1500)
  try {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(10_000) })
        if (res.ok) return true
      } catch {
        // servidor apagado o dormido: reintentar
      }
      onSlow()
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    return false
  } finally {
    clearTimeout(slowTimer)
  }
}
