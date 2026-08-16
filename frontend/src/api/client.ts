import { ApiError, type ApiResponseEnvelope, type ApiResponseMeta, type ApiErrorDetail } from './types'
import { tokenStore } from './tokenStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  skipAuthRefresh?: boolean
}

export interface ApiResponseWithMeta<T> {
  data: T
  meta: ApiResponseMeta
  message: string
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
      const token = data?.data?.accessToken || data?.accessToken
      if (token) {
        tokenStore.setToken(token)
        return token
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

export async function fetchEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiResponseEnvelope<T>> {
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

  if (response.status === 204) {
    return {
      success: true,
      message: '',
      data: {} as T,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
      },
    }
  }

  let json: ApiResponseEnvelope<T> | null = null
  try {
    json = await response.json()
  } catch {
    // Body not JSON
  }

  if (!response.ok || (json && json.success === false)) {
    let errorDetail: ApiErrorDetail = {
      code: 'unknown_error',
      message: `Request failed with status ${response.status}`,
    }
    let message: string | undefined

    if (json?.error) {
      errorDetail = json.error
      message = json.message || json.error.message
    } else if (json?.message) {
      errorDetail = { code: 'unknown_error', message: json.message }
      message = json.message
    }

    throw new ApiError(response.status, errorDetail, message)
  }

  if (!json) {
    throw new ApiError(response.status, {
      code: 'invalid_response',
      message: 'Invalid JSON response from server',
    })
  }

  return json
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = await fetchEnvelope<T>(path, options)
  return envelope.data as T
}

export async function apiClientWithMeta<T>(path: string, options: RequestOptions = {}): Promise<ApiResponseWithMeta<T>> {
  const envelope = await fetchEnvelope<T>(path, options)
  return {
    data: envelope.data as T,
    meta: envelope.meta,
    message: envelope.message,
  }
}
