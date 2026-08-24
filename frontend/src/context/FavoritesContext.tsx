import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { favoritesApi } from '@/api/favorites'
import { useAuth } from './AuthContext'

export interface FavoriteStateContract {
  productId: string
  isFavorite: boolean
}

export interface FavoriteMutationContract {
  productId: string
  nextState: boolean
}

export type FavoriteMutationOutcomeContract =
  | { kind: 'confirmed'; state: FavoriteStateContract }
  | { kind: 'failed'; restoredState: boolean; error: unknown }
  | { kind: 'coalesced'; optimisticState: boolean }

export interface FavoritesSessionContract {
  resolveIsFavorite(productId: string, serverValue: boolean): boolean
  isPending(productId: string): boolean
  mutate(input: FavoriteMutationContract): Promise<FavoriteMutationOutcomeContract>
}

export interface FavoritesContextType extends FavoritesSessionContract {}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const prevUserIdRef = useRef<string | null>(userId)

  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})

  // Clear all overrides and pending state when authenticated user changes or logs out
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId
      setOverrides({})
      setPending({})
    }
  }, [userId])

  const resolveIsFavorite = useCallback(
    (productId: string, serverValue: boolean): boolean => {
      if (productId in overrides) {
        return overrides[productId]
      }
      return serverValue
    },
    [overrides]
  )

  const isPending = useCallback(
    (productId: string): boolean => {
      return Boolean(pending[productId])
    },
    [pending]
  )

  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const overridesRef = useRef(overrides)
  overridesRef.current = overrides

  const mutate = useCallback(
    async (input: FavoriteMutationContract): Promise<FavoriteMutationOutcomeContract> => {
      const { productId, nextState } = input

      // Duplicate coalescing: if already pending, resolve immediately as coalesced
      if (pendingRef.current[productId]) {
        const currentOptimistic =
          productId in overridesRef.current ? overridesRef.current[productId] : nextState
        return {
          kind: 'coalesced',
          optimisticState: currentOptimistic,
        }
      }

      // Determine previous state
      const hadOverride = productId in overridesRef.current
      const previousOverrideVal = overridesRef.current[productId]
      const previousState = hadOverride ? previousOverrideVal : !nextState

      // Set pending and optimistic override
      setPending((prev) => ({ ...prev, [productId]: true }))
      setOverrides((prev) => ({ ...prev, [productId]: nextState }))

      try {
        const res = nextState
          ? await favoritesApi.addFavorite(productId)
          : await favoritesApi.removeFavorite(productId)

        setOverrides((prev) => ({ ...prev, [productId]: res.isFavorite }))
        setPending((prev) => {
          const next = { ...prev }
          delete next[productId]
          return next
        })

        return {
          kind: 'confirmed',
          state: {
            productId: res.productId || productId,
            isFavorite: res.isFavorite,
          },
        }
      } catch (error) {
        // Rollback
        setOverrides((prev) => {
          const next = { ...prev }
          if (hadOverride) {
            next[productId] = previousOverrideVal
          } else {
            delete next[productId]
          }
          return next
        })
        setPending((prev) => {
          const next = { ...prev }
          delete next[productId]
          return next
        })

        return {
          kind: 'failed',
          restoredState: previousState,
          error,
        }
      }
    },
    []
  )

  return (
    <FavoritesContext.Provider
      value={{
        resolveIsFavorite,
        isPending,
        mutate,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

const defaultFavoritesContext: FavoritesContextType = {
  resolveIsFavorite: (_id: string, serverValue: boolean) => serverValue,
  isPending: (_id: string) => false,
  mutate: async () => ({ kind: 'coalesced', optimisticState: false }),
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  return context || defaultFavoritesContext
}
