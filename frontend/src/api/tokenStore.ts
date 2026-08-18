const ACCESS_TOKEN_KEY = 'accessToken'
let inMemoryFallback: string | null = null

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
  },
}

