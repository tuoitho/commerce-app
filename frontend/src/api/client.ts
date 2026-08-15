import { ApiError, type ApiErrorResponse } from './types'
import { tokenStore } from './tokenStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  skipAuthRefresh?: boolean
}

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }
  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) {
        tokenStore.clearToken()
        return null
      }
      const data = await res.json()
      if (data.accessToken) {
        tokenStore.setToken(data.accessToken)
        return data.accessToken
      }
      tokenStore.clearToken()
      return null
    } catch {
      tokenStore.clearToken()
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers = {}, skipAuthRefresh = false, ...rest } = options

  const formattedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${BASE_URL}${formattedPath}`

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }

  const token = tokenStore.getToken()
  if (token && !requestHeaders['Authorization']) {
    requestHeaders['Authorization'] = `Bearer ${token}`
  }

  const fetchOptions: RequestInit = {
    ...rest,
    headers: requestHeaders,
    credentials: 'include',
  }

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body)
  }

  let response = await fetch(url, fetchOptions)

  // Handle 401 one-time refresh retry if unauthenticated
  const isAuthRoute = formattedPath.startsWith('/auth/login') ||
                      formattedPath.startsWith('/auth/register') ||
                      formattedPath.startsWith('/auth/refresh')

  if (response.status === 401 && !skipAuthRefresh && !isAuthRoute) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      requestHeaders['Authorization'] = `Bearer ${newToken}`
      fetchOptions.headers = requestHeaders
      response = await fetch(url, fetchOptions)
    }
  }

  if (!response.ok) {
    let errorDetail = { code: 'unknown_error', message: `Request failed with status ${response.status}` }
    try {
      const errorJson: ApiErrorResponse = await response.json()
      if (errorJson?.error) {
        errorDetail = errorJson.error
      }
    } catch {
      // Body not JSON
    }
    throw new ApiError(response.status, errorDetail)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}
