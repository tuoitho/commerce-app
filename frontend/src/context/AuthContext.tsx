import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'
import type { User } from '@/api/types'

interface AuthContextType {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Restore session via httpOnly refresh cookie on initial app load
  useEffect(() => {
    let isMounted = true
    async function restoreSession() {
      try {
        const session = await authApi.refresh()
        if (isMounted && session?.user) {
          setUser(session.user)
          setAccessToken(session.accessToken)
          tokenStore.setToken(session.accessToken)
        }
      } catch {
        // No active session
        if (isMounted) {
          setUser(null)
          setAccessToken(null)
          tokenStore.clearToken()
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()
    return () => {
      isMounted = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password)
    setUser(session.user)
    setAccessToken(session.accessToken)
    tokenStore.setToken(session.accessToken)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const session = await authApi.register(email, password)
    setUser(session.user)
    setAccessToken(session.accessToken)
    tokenStore.setToken(session.accessToken)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setAccessToken(null)
      tokenStore.clearToken()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
