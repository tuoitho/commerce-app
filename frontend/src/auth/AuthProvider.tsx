import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import * as authApi from '../api/auth'
import * as client from '../api/client'
import { tokenStore } from '../api/tokenStore'
import type { Session, User } from '../api/auth'

interface AuthContextValue {
  user: User | null
  accessToken: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(tokenStore.get())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (tokenStore.get()) {
      authApi
        .fetchMe()
        .then((restoredUser) => {
          if (!cancelled) setUser(restoredUser)
        })
        .catch(() => {
          if (!cancelled) {
            tokenStore.set(null)
            setAccessToken(null)
            setUser(null)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return
    }
    client
      .restoreSession()
      .then((session: Session | null) => {
        if (cancelled) return
        if (session) {
          setAccessToken(session.accessToken)
          setUser(session.user)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    client.setRefreshFailureHandler(() => {
      tokenStore.set(null)
      setAccessToken(null)
      setUser(null)
    })
    return () => client.setRefreshFailureHandler(null)
  }, [])

  const applySession = useCallback((session: Session) => {
    tokenStore.set(session.accessToken)
    setAccessToken(session.accessToken)
    setUser(session.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.login(email, password))
    },
    [applySession],
  )

  const register = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.register(email, password))
    },
    [applySession],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      tokenStore.set(null)
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
