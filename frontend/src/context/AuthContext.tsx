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
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

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
            setAccessToken(existingToken)
          } else {
            setUser(null)
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
              setAccessToken(session.accessToken)
              tokenStore.setToken(session.accessToken)
            } else {
              setUser(null)
              setAccessToken(null)
              tokenStore.clearToken()
            }
          }
        } catch {
          if (isMounted) {
            setUser(null)
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

const defaultAuthContext: AuthContextType = {
  user: null,
  role: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
}

export function useAuth() {
  const context = useContext(AuthContext)
  return context || defaultAuthContext
}
