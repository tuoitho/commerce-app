import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'
import { ApiError, type User } from '@/api/types'

export interface AuthContextType {
  user: User | null
  role?: string | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const token = tokenStore.getToken()
    if (!token) return null
    return tokenStore.getUser()
  })
  const [accessToken, setAccessToken] = useState<string | null>(() => tokenStore.getToken())
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(tokenStore.getToken()))

  // Subscribe to token changes across the application in the same tab
  useEffect(() => {
    const unsubscribe = tokenStore.subscribe((token) => {
      if (!token) {
        setUser(null)
        setAccessToken(null)
      } else {
        setAccessToken(token)
      }
    })
    return unsubscribe
  }, [])

  // Restore session from localStorage on initial app load
  useEffect(() => {
    let isMounted = true
    async function restoreSession() {
      const existingToken = tokenStore.getToken()
      if (!existingToken) {
        if (isMounted) {
          setUser(null)
          setAccessToken(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const currentUser = await authApi.getMe()
        if (isMounted) {
          if (currentUser && currentUser.role !== 'admin') {
            setUser(currentUser)
            tokenStore.setUser(currentUser)
            setAccessToken(existingToken)
          } else {
            setUser(null)
            tokenStore.setUser(null)
            setAccessToken(null)
            tokenStore.clearToken()
          }
        }
      } catch {
        // Token might be expired, attempt refresh once or clear
        try {
          const session = await authApi.refresh()
          if (isMounted) {
            if (session?.user && session.user.role !== 'admin') {
              setUser(session.user)
              tokenStore.setUser(session.user)
              setAccessToken(session.accessToken)
              tokenStore.setToken(session.accessToken)
            } else {
              setUser(null)
              tokenStore.setUser(null)
              setAccessToken(null)
              tokenStore.clearToken()
            }
          }
        } catch {
          if (isMounted) {
            setUser(null)
            tokenStore.setUser(null)
            setAccessToken(null)
            tokenStore.clearToken()
          }
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
    if (!session?.user || session.user.role === 'admin') {
      tokenStore.clearToken()
      setUser(null)
      setAccessToken(null)
      throw new ApiError(403, {
        code: 'forbidden',
        message: 'Tài khoản quản trị không thể đăng nhập vào trang khách hàng',
      })
    }
    setUser(session.user)
    tokenStore.setUser(session.user)
    setAccessToken(session.accessToken)
    tokenStore.setToken(session.accessToken)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const session = await authApi.register(email, password)
    if (!session?.user || session.user.role === 'admin') {
      tokenStore.clearToken()
      setUser(null)
      setAccessToken(null)
      throw new ApiError(403, {
        code: 'forbidden',
        message: 'Tài khoản quản trị không thể đăng nhập vào trang khách hàng',
      })
    }
    setUser(session.user)
    tokenStore.setUser(session.user)
    setAccessToken(session.accessToken)
    tokenStore.setToken(session.accessToken)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      tokenStore.setUser(null)
      setAccessToken(null)
      tokenStore.clearToken()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        accessToken,
        isAuthenticated: Boolean(user && user.role !== 'admin'),
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
