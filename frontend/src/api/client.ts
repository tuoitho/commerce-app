import { ApiError, toApiError, type ApiErrorDetail } from './error'
import { tokenStore } from './tokenStore'

export interface Session {
  user: { id: string; email: string }
  accessToken: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

const int64Keys = new Set(['stockQuantity', 'quantity', 'totalUnits'])
const int64Pattern = /^-?(?:0|[1-9][0-9]*)$/

function quoteInt64Values(text: string): string {
  let output = ''
  let index = 0
  while (index < text.length) {
    if (text[index] !== '"') {
      output += text[index++]
      continue
    }
    const start = index
    index++
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2
      } else if (text[index++] === '"') {
        break
      }
    }
    const rawString = text.slice(start, index)
    let key: string | null = null
    try {
      key = JSON.parse(rawString) as string
    } catch {
      key = null
    }
    let cursor = index
    while (/\s/.test(text[cursor] ?? '')) cursor++
    if (!key || !int64Keys.has(key) || text[cursor] !== ':') {
      output += rawString
      continue
    }
    cursor++
    while (/\s/.test(text[cursor] ?? '')) cursor++
    const valueStart = cursor
    if (text[cursor] === '-') cursor++
    while (/[0-9]/.test(text[cursor] ?? '')) cursor++
    const value = text.slice(valueStart, cursor)
    if (!int64Pattern.test(value)) {
      output += rawString
      continue
    }
    output += `${rawString}${text.slice(index, valueStart)}"${value}"`
    index = cursor
  }
  return output
}

function normalizeInt64(value: unknown): bigint {
  if (typeof value !== 'string' || !int64Pattern.test(value)) throw new Error('invalid int64 JSON value')
  const parsed = BigInt(value)
  if (parsed < -(1n << 63n) || parsed > (1n << 63n) - 1n) throw new Error('int64 JSON value out of range')
  return parsed
}

function normalizeInt64Fields(value: unknown, key?: string): unknown {
  if (key && int64Keys.has(key)) return normalizeInt64(value)
  if (Array.isArray(value)) return value.map((entry) => normalizeInt64Fields(entry))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, normalizeInt64Fields(entry, name)]))
  }
  return value
}

export function parseApiJson(text: string): unknown {
  return normalizeInt64Fields(JSON.parse(quoteInt64Values(text)))
}

export function serializeApiJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) throw new Error('unsafe numeric request value')
    return String(value)
  }
  if (Array.isArray(value)) return `[${value.map((entry) => entry === undefined ? 'null' : serializeApiJson(entry)).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).map(([key, entry]) => `${JSON.stringify(key)}:${serializeApiJson(entry)}`).join(',')}}`
  }
  return 'null'
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  patch<T>(path: string, body?: unknown): Promise<T>
  delete<T>(path: string, body?: unknown): Promise<T>
  setRefreshFailureHandler(handler: (() => void) | null): void
}

interface ClientStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const defaultStorage: ClientStorage = {
  getItem: (key) => key === 'access_token' ? tokenStore.get() : localStorage.getItem(key),
  setItem: (key, value) => key === 'access_token' ? tokenStore.set(value) : localStorage.setItem(key, value),
  removeItem: (key) => key === 'access_token' ? tokenStore.set(null) : localStorage.removeItem(key),
}

/** Hook for the auth layer: called when a refresh attempt fails. */
export function setRefreshFailureHandler(handler: (() => void) | null): void {
  api.setRefreshFailureHandler(handler)
}

async function parseResponse(resp: Response): Promise<unknown> {
  if (resp.status === 204) return null
  const text = await resp.text()
  if (!text) return null
  return parseApiJson(text)
}

export function createApiClient(options: { fetch?: typeof fetch; storage?: ClientStorage } = {}): ApiClient {
  const requestFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const storage = options.storage ?? defaultStorage
  let onRefreshFailure: (() => void) | null = null
  let refreshing: Promise<boolean> | null = null

  const refreshAccessToken = async (): Promise<boolean> => {
    if (refreshing) return refreshing
    refreshing = (async () => {
      try {
        const resp = await requestFetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        })
        if (!resp.ok) return false
        const body = (await parseResponse(resp)) as { accessToken?: string } | null
        if (!body?.accessToken) return false
        storage.setItem('access_token', body.accessToken)
        return true
      } catch {
        return false
      }
    })()
    try { return await refreshing } finally { refreshing = null }
  }

  const request = async <T>(path: string, options: RequestOptions = {}, retryOn401 = true): Promise<T> => {
  const { method = 'GET', body, headers } = options
  const resp = await requestFetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(storage.getItem('access_token') ? { Authorization: `Bearer ${storage.getItem('access_token')}` } : {}),
      ...headers,
    },
     ...(body !== undefined ? { body: serializeApiJson(body) } : {}),
  })

  if (resp.status === 401 && retryOn401 && storage.getItem('access_token')) {
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

  return {
    get: <T>(path: string, options: RequestOptions = {}) => request<T>(path, options),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
    setRefreshFailureHandler: (handler) => { onRefreshFailure = handler },
  }
}

export const api = createApiClient()

export async function restoreSession(): Promise<Session | null> {
  const resp = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!resp.ok) return null
  const body = (await parseResponse(resp)) as Session | null
  if (!body?.accessToken) return null
  tokenStore.set(body.accessToken)
  return body
}

export { ApiError }
export type { ApiErrorDetail }
