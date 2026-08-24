import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FavoritesProvider, useFavorites } from './FavoritesContext'
import { useAuth } from './AuthContext'
import { favoritesApi } from '@/api/favorites'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
  },
}))

describe('FavoritesContext (FAVORITE-SESSION-STATE)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'cust-1', email: 'cust1@auraphone.vn', role: 'customer' },
      role: 'customer',
      accessToken: 'token-1',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <FavoritesProvider>{children}</FavoritesProvider>
  )

  it('resolves server value when no optimistic override exists (FAVORITE-SESSION-STATE-001)', () => {
    const { result } = renderHook(() => useFavorites(), { wrapper })

    expect(result.current.resolveIsFavorite('prod-1', true)).toBe(true)
    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(false)
    expect(result.current.isPending('prod-1')).toBe(false)
  })

  it('applies optimistic state immediately and confirms on success (FAVORITE-SESSION-STATE-002)', async () => {
    let resolveApi: (val: any) => void
    const apiPromise = new Promise((res) => {
      resolveApi = res
    })
    vi.mocked(favoritesApi.addFavorite).mockReturnValueOnce(apiPromise as any)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    let outcomePromise: Promise<any>
    act(() => {
      outcomePromise = result.current.mutate({ productId: 'prod-1', nextState: true })
    })

    // Immediately pending and resolves true
    expect(result.current.isPending('prod-1')).toBe(true)
    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(true)

    // Complete API request
    await act(async () => {
      resolveApi!({ productId: 'prod-1', isFavorite: true })
      const outcome = await outcomePromise
      expect(outcome).toEqual({
        kind: 'confirmed',
        state: { productId: 'prod-1', isFavorite: true },
      })
    })

    expect(result.current.isPending('prod-1')).toBe(false)
    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(true)
  })

  it('rolls back to previous state on failure and clears pending state (FAVORITE-SESSION-STATE-003)', async () => {
    const error = new Error('Network error')
    vi.mocked(favoritesApi.addFavorite).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    let outcome: any
    await act(async () => {
      outcome = await result.current.mutate({ productId: 'prod-1', nextState: true })
    })

    expect(outcome).toEqual({
      kind: 'failed',
      restoredState: false,
      error,
    })
    expect(result.current.isPending('prod-1')).toBe(false)
    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(false)
  })

  it('coalesces duplicate activation while pending without sending a second API call (FAVORITE-SESSION-STATE-004)', async () => {
    let resolveApi: (val: any) => void
    const apiPromise = new Promise((res) => {
      resolveApi = res
    })
    vi.mocked(favoritesApi.addFavorite).mockReturnValueOnce(apiPromise as any)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    let mutate1: Promise<any>
    act(() => {
      mutate1 = result.current.mutate({ productId: 'prod-1', nextState: true })
    })

    expect(result.current.isPending('prod-1')).toBe(true)
    expect(favoritesApi.addFavorite).toHaveBeenCalledTimes(1)

    // Second call while first is pending
    let outcome2: any
    await act(async () => {
      outcome2 = await result.current.mutate({ productId: 'prod-1', nextState: true })
    })

    expect(outcome2).toEqual({
      kind: 'coalesced',
      optimisticState: true,
    })
    expect(favoritesApi.addFavorite).toHaveBeenCalledTimes(1)

    // Resolve first call
    await act(async () => {
      resolveApi!({ productId: 'prod-1', isFavorite: true })
      await mutate1
    })

    expect(result.current.isPending('prod-1')).toBe(false)
  })

  it('resets overrides and pending state when user logs out or switches customer (FAVORITE-SESSION-STATE-005)', async () => {
    vi.mocked(favoritesApi.addFavorite).mockResolvedValueOnce({
      productId: 'prod-1',
      isFavorite: true,
    })

    let authState = {
      user: { id: 'cust-1', email: 'cust1@auraphone.vn', role: 'customer' } as any,
      role: 'customer' as any,
      accessToken: 'token-1' as string | null,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    }

    vi.mocked(useAuth).mockImplementation(() => authState)

    const { result, rerender } = renderHook(() => useFavorites(), { wrapper })

    await act(async () => {
      await result.current.mutate({ productId: 'prod-1', nextState: true })
    })

    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(true)

    // Customer logs out (user becomes null)
    authState = {
      ...authState,
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
    }
    rerender()

    // Override for C1 is discarded, serverValue false is returned
    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(false)

    // Another customer logs in (cust-2)
    authState = {
      ...authState,
      user: { id: 'cust-2', email: 'cust2@auraphone.vn', role: 'customer' },
      role: 'customer',
      accessToken: 'token-2',
      isAuthenticated: true,
    }
    rerender()

    expect(result.current.resolveIsFavorite('prod-1', false)).toBe(false)
  })
})
