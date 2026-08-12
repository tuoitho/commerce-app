import { ApiError, toApiError, type ApiErrorDetail } from './error'
import { tokenStore } from './tokenStore'

export interface Session {
  user: { id: string; email: string }
  accessToken: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

let onRefreshFailure: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

/** Hook for the auth layer: called when a refresh attempt fails. */
export function setRefreshFailureHandler(handler: (() => void) | null): void {
  onRefreshFailure = handler
}

async function parseResponse(resp: Response): Promise<unknown> {
  if (resp.status === 204) return null
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!resp.ok) return false
      const body = (await parseResponse(resp)) as { accessToken?: string } | null
      if (!body?.accessToken) return false
      tokenStore.set(body.accessToken)
      return true
    } catch {
      return false
    }
  })()
  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

/**
 * Explicit session restore: calls the refresh endpoint and returns the session
 * if a refresh cookie exists. Returns null when no session can be restored.
 * Used by the auth provider on mount; does not trigger the 401 retry path.
 */
export async function restoreSession(): Promise<Session | null> {
  const resp = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!resp.ok) return null
  const body = (await parseResponse(resp)) as Session | null
  if (!body?.accessToken) return null
  tokenStore.set(body.accessToken)
  return body
}

async function request<T>(path: string, options: RequestOptions = {}, retryOn401 = true): Promise<T> {
  const { method = 'GET', body, headers } = options
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (resp.status === 401 && retryOn401 && tokenStore.get()) {
    const ok = await refreshAccessToken()
    if (ok) {
      return request<T>(path, options, false)
    }
    onRefreshFailure?.()
  }

  const data = await parseResponse(resp)
  if (!resp.ok) {
    throw toApiError(resp.status, data)
  }
  return data as T
}

export const api = {
  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, options)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body })
  },
}

export { ApiError }
export type { ApiErrorDetail }