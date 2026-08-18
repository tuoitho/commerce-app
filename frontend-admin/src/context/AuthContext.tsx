import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'
import { ApiError, type User } from '@/api/types'

export interface AuthContextType {
  user: User | null
  role: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const restoreSession = useCallback(async () => {
    const existingToken = tokenStore.getToken()
    if (!existingToken) {
      tokenStore.clearToken()
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const currentUser = await authApi.getMe()
      if (currentUser && currentUser.role === 'admin') {
        setUser(currentUser)
      } else {
        tokenStore.clearToken()
        setUser(null)
      }
    } catch {
      // Token might be expired, attempt refresh once or clear
      try {
        const res = await authApi.refresh()
        if (res?.user && res.user.role === 'admin') {
          tokenStore.setToken(res.accessToken)
          setUser(res.user)
        } else {
          tokenStore.clearToken()
          setUser(null)
        }
      } catch {
        tokenStore.clearToken()
        setUser(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    if (!res?.user || res.user.role !== 'admin') {
      tokenStore.clearToken()
      setUser(null)
      throw new ApiError(403, {
        code: 'forbidden',
        message: 'Tài khoản không có quyền truy cập trang quản trị',
      })
    }

    tokenStore.setToken(res.accessToken)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore network errors on logout
    } finally {
      tokenStore.clearToken()
      setUser(null)
    }
  }, [])

  const value: AuthContextType = {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user && user.role === 'admin'),
    isLoading,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
