const ACCESS_TOKEN_KEY = 'accessToken'
let inMemoryFallback: string | null = null

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
  clearToken(): void {
    inMemoryFallback = null
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
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

