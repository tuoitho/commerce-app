import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { favoritesApi } from '@/api/favorites'
import type { FavoriteProduct } from '@/types/favorite'
import { useAuth } from './AuthContext'

export interface FavoritesContextValue {
  items: FavoriteProduct[]
  favoriteIds: ReadonlySet<string>
  isLoading: boolean
  loadError: string | null
  isPending: (productId: string) => boolean
  refresh: () => Promise<void>
  add: (productId: string) => Promise<void>
  remove: (productId: string) => Promise<void>
  toggle: (productId: string) => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const [items, setItems] = useState<FavoriteProduct[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const activeUserIdRef = useRef<string | null>(user?.id ?? null)
  const fetchGenRef = useRef<number>(0)

  // Derived Set of favorite product IDs
  const favoriteIds = useMemo<ReadonlySet<string>>(
    () => new Set((items || []).map((item) => item.id)),
    [items]
  )

  const isPending = useCallback(
    (productId: string): boolean => pendingIds.has(productId),
    [pendingIds]
  )

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setItems([])
      setLoadError(null)
      setIsLoading(false)
      return
    }

    const currentGen = ++fetchGenRef.current
    const currentUserId = user.id
    setIsLoading(true)
    setLoadError(null)

    try {
      const res = await favoritesApi.list()
      if (fetchGenRef.current === currentGen && activeUserIdRef.current === currentUserId) {
        setItems(Array.isArray(res) ? res : [])
        setLoadError(null)
      }
    } catch (err: unknown) {
      if (fetchGenRef.current === currentGen && activeUserIdRef.current === currentUserId) {
        setItems([])
        const message =
          err instanceof Error ? err.message : 'Không thể tải danh sách yêu thích'
        setLoadError(message)
      }
    } finally {
      if (fetchGenRef.current === currentGen && activeUserIdRef.current === currentUserId) {
        setIsLoading(false)
      }
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    activeUserIdRef.current = user?.id ?? null
    fetchGenRef.current++

    if (isAuthLoading) {
      return
    }

    if (isAuthenticated && user) {
      void refresh()
    } else {
      setItems([])
      setLoadError(null)
      setIsLoading(false)
      setPendingIds(new Set())
    }
  }, [user, isAuthenticated, isAuthLoading, refresh])

  const add = useCallback(
    async (productId: string): Promise<void> => {
      if (pendingIds.has(productId) || !isAuthenticated || !user) {
        return
      }

      const currentUserId = user.id
      setPendingIds((prev) => new Set(prev).add(productId))

      try {
        const res = await favoritesApi.add(productId)
        if (activeUserIdRef.current === currentUserId) {
          setItems(Array.isArray(res) ? res : [])
        }
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(productId)
          return next
        })
      }
    },
    [pendingIds, isAuthenticated, user]
  )

  const remove = useCallback(
    async (productId: string): Promise<void> => {
      if (pendingIds.has(productId) || !isAuthenticated || !user) {
        return
      }

      const currentUserId = user.id
      setPendingIds((prev) => new Set(prev).add(productId))

      try {
        const res = await favoritesApi.remove(productId)
        if (activeUserIdRef.current === currentUserId) {
          setItems(Array.isArray(res) ? res : [])
        }
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(productId)
          return next
        })
      }
    },
    [pendingIds, isAuthenticated, user]
  )

  const toggle = useCallback(
    async (productId: string): Promise<void> => {
      if (favoriteIds.has(productId)) {
        await remove(productId)
      } else {
        await add(productId)
      }
    },
    [favoriteIds, add, remove]
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({
      items,
      favoriteIds,
      isLoading,
      loadError,
      isPending,
      refresh,
      add,
      remove,
      toggle,
    }),
    [items, favoriteIds, isLoading, loadError, isPending, refresh, add, remove, toggle]
  )

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider')
  }
  return context
}
