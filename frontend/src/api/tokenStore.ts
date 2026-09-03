import type { User } from './types'

const ACCESS_TOKEN_KEY = 'accessToken'
const AUTH_USER_KEY = 'authUser'
let inMemoryFallback: string | null = null
let inMemoryUserFallback: User | null = null

export type TokenChangeListener = (token: string | null) => void
const listeners = new Set<TokenChangeListener>()

function notifyListeners(token: string | null): void {
  for (const listener of listeners) {
    try {
      listener(token)
    } catch {
      // Ignore listener error
    }
  }
}

export const tokenStore = {
  getToken(): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(ACCESS_TOKEN_KEY)
      }
    } catch {
      // Ignore localStorage error
    }
    return inMemoryFallback
  },
  setToken(token: string | null): void {
    inMemoryFallback = token
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (token) {
          localStorage.setItem(ACCESS_TOKEN_KEY, token)
        } else {
          localStorage.removeItem(ACCESS_TOKEN_KEY)
        }
      }
    } catch {
      // Ignore localStorage error
    }
    notifyListeners(token)
  },
  getUser(): User | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(AUTH_USER_KEY)
        return raw ? (JSON.parse(raw) as User) : null
      }
    } catch {
      // Ignore localStorage error
    }
    return inMemoryUserFallback
  },
  setUser(user: User | null): void {
    inMemoryUserFallback = user
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (user) {
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
        } else {
          localStorage.removeItem(AUTH_USER_KEY)
        }
      }
    } catch {
      // Ignore localStorage error
    }
  },
  clearToken(): void {
    inMemoryFallback = null
    inMemoryUserFallback = null
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
        localStorage.removeItem(AUTH_USER_KEY)
      }
    } catch {
      // Ignore localStorage error
    }
    notifyListeners(null)
  },
  subscribe(listener: TokenChangeListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}


