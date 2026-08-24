import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FavoritesProvider, useFavorites } from './FavoritesContext'
import { useAuth, type AuthContextType } from './AuthContext'
import { favoritesApi } from '@/api/favorites'
import type { FavoriteProduct } from '@/types/favorite'

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}))

const mockFavorites: FavoriteProduct[] = [
  {
    id: 'prod-uuid-1',
    name: 'Aura Phone Pro',
    model: 'AP-100',
    brand: 'Aura',
    category: { id: 'cat-1', name: 'Điện thoại' },
    primaryImageUrl: 'https://cdn.example.com/img1.jpg',
    availability: 'active',
    minPriceVnd: '15000000',
    maxPriceVnd: '20000000',
    inStock: true,
  },
  {
    id: 'prod-uuid-2',
    name: 'Aura Phone Mini (Unavailable)',
    model: 'AP-50',
    brand: 'Aura',
    category: { id: 'cat-1', name: 'Điện thoại' },
    primaryImageUrl: '',
    availability: 'unavailable',
    minPriceVnd: null,
    maxPriceVnd: null,
    inStock: null,
  },
]

describe('FavoritesContext', () => {
  const defaultAuthValue: AuthContextType = {
    user: { id: 'user-1', email: 'customer@example.com', role: 'customer' },
    role: 'customer',
    accessToken: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuthValue })
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <FavoritesProvider>{children}</FavoritesProvider>
  )

  it('throws error when useFavorites is used outside FavoritesProvider', () => {
    expect(() => {
      renderHook(() => useFavorites())
    }).toThrow('useFavorites must be used within a FavoritesProvider')
  })

  it('does not load favorites when unauthenticated (guest) and keeps state empty', async () => {
    vi.mocked(useAuth).mockReturnValue({
      ...defaultAuthValue,
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    expect(favoritesApi.list).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
    expect(result.current.favoriteIds.size).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadError).toBeNull()
  })

  it('does not load favorites while auth session is restoring (isLoading: true)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      ...defaultAuthValue,
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
    })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    expect(favoritesApi.list).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('loads favorites once after authenticated session is restored and populates items and favoriteIds', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(favoritesApi.list).toHaveBeenCalledTimes(1)
    expect(result.current.items).toEqual(mockFavorites)
    expect(result.current.favoriteIds).toEqual(new Set(['prod-uuid-1', 'prod-uuid-2']))
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
    expect(result.current.favoriteIds.has('prod-uuid-2')).toBe(true)
    expect(result.current.favoriteIds.has('prod-uuid-3')).toBe(false)
    expect(result.current.loadError).toBeNull()
  })

  it('handles favorites list failure with loadError and distinguishes from empty state', async () => {
    vi.mocked(favoritesApi.list).mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.items).toEqual([])
    expect(result.current.favoriteIds.size).toBe(0)
    expect(result.current.loadError).toBe('Network failure')
  })

  it('refresh() reloads favorites and recovers from previous load error', async () => {
    vi.mocked(favoritesApi.list)
      .mockRejectedValueOnce(new Error('Initial failure'))
      .mockResolvedValueOnce(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.loadError).toBe('Initial failure')
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(favoritesApi.list).toHaveBeenCalledTimes(2)
    expect(result.current.items).toEqual(mockFavorites)
    expect(result.current.loadError).toBeNull()
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
  })

  it('add(productId) tracks per-product pending state and replaces items on success', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce([])

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let resolveAdd!: (val: FavoriteProduct[]) => void
    const addPromise = new Promise<FavoriteProduct[]>((resolve) => {
      resolveAdd = resolve
    })
    vi.mocked(favoritesApi.add).mockReturnValueOnce(addPromise)

    expect(result.current.isPending('prod-uuid-1')).toBe(false)

    let addActionPromise: Promise<void>
    act(() => {
      addActionPromise = result.current.add('prod-uuid-1')
    })

    expect(result.current.isPending('prod-uuid-1')).toBe(true)
    expect(result.current.isPending('prod-uuid-2')).toBe(false)

    // Repeated call while pending should not duplicate request
    await act(async () => {
      await result.current.add('prod-uuid-1')
    })
    expect(favoritesApi.add).toHaveBeenCalledTimes(1)

    // Complete add request
    await act(async () => {
      resolveAdd([mockFavorites[0]])
      await addActionPromise
    })

    expect(result.current.isPending('prod-uuid-1')).toBe(false)
    expect(result.current.items).toEqual([mockFavorites[0]])
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
  })

  it('add(productId) retains prior state and throws error on failure', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce([mockFavorites[0]])

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    vi.mocked(favoritesApi.add).mockRejectedValueOnce(new Error('Product not found'))

    let thrownError: unknown
    await act(async () => {
      try {
        await result.current.add('prod-uuid-nonexistent')
      } catch (err) {
        thrownError = err
      }
    })

    expect(thrownError).toBeDefined()
    expect((thrownError as Error).message).toBe('Product not found')
    expect(result.current.isPending('prod-uuid-nonexistent')).toBe(false)
    expect(result.current.items).toEqual([mockFavorites[0]])
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
  })

  it('remove(productId) tracks per-product pending state and replaces items on success', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
    })

    vi.mocked(favoritesApi.remove).mockResolvedValueOnce([mockFavorites[1]])

    await act(async () => {
      await result.current.remove('prod-uuid-1')
    })

    expect(favoritesApi.remove).toHaveBeenCalledWith('prod-uuid-1')
    expect(result.current.items).toEqual([mockFavorites[1]])
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(false)
    expect(result.current.favoriteIds.has('prod-uuid-2')).toBe(true)
  })

  it('remove(productId) retains prior state and throws error on failure', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
    })

    vi.mocked(favoritesApi.remove).mockRejectedValueOnce(new Error('Deletion failed'))

    let thrownError: unknown
    await act(async () => {
      try {
        await result.current.remove('prod-uuid-1')
      } catch (err) {
        thrownError = err
      }
    })

    expect(thrownError).toBeDefined()
    expect(result.current.items).toEqual(mockFavorites)
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
  })

  it('toggle(productId) invokes remove when item is in favoriteIds and add when not', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce([mockFavorites[0]])

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    // Toggle prod-uuid-1 (currently favorite -> should remove)
    vi.mocked(favoritesApi.remove).mockResolvedValueOnce([])
    await act(async () => {
      await result.current.toggle('prod-uuid-1')
    })
    expect(favoritesApi.remove).toHaveBeenCalledWith('prod-uuid-1')
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(false)

    // Toggle prod-uuid-1 again (not favorite -> should add)
    vi.mocked(favoritesApi.add).mockResolvedValueOnce([mockFavorites[0]])
    await act(async () => {
      await result.current.toggle('prod-uuid-1')
    })
    expect(favoritesApi.add).toHaveBeenCalledWith('prod-uuid-1')
    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(true)
  })

  it('synchronizes state across multiple consumers of the provider', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce([mockFavorites[0]])

    const { result } = renderHook(
      () => ({
        consumerA: useFavorites(),
        consumerB: useFavorites(),
      }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.consumerA.items).toHaveLength(1)
      expect(result.current.consumerB.items).toHaveLength(1)
    })

    vi.mocked(favoritesApi.add).mockResolvedValueOnce(mockFavorites)

    await act(async () => {
      await result.current.consumerA.add('prod-uuid-2')
    })

    expect(result.current.consumerA.items).toEqual(mockFavorites)
    expect(result.current.consumerB.items).toEqual(mockFavorites)
    expect(result.current.consumerA.favoriteIds.has('prod-uuid-2')).toBe(true)
    expect(result.current.consumerB.favoriteIds.has('prod-uuid-2')).toBe(true)
  })

  it('clears state immediately on logout / unauthenticated transition', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce(mockFavorites)
    let authState: AuthContextType = { ...defaultAuthValue }
    vi.mocked(useAuth).mockImplementation(() => authState)

    const { result, rerender } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toEqual(mockFavorites)
    })

    // Simulate logout
    authState = {
      ...defaultAuthValue,
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    }

    rerender()

    expect(result.current.items).toEqual([])
    expect(result.current.favoriteIds.size).toBe(0)
    expect(result.current.loadError).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores late/stale list response if user logged out or switched while request was in-flight', async () => {
    let resolveList!: (val: FavoriteProduct[]) => void
    const listPromise = new Promise<FavoriteProduct[]>((resolve) => {
      resolveList = resolve
    })
    vi.mocked(favoritesApi.list).mockReturnValueOnce(listPromise)

    let authState: AuthContextType = {
      ...defaultAuthValue,
      user: { id: 'user-1', email: 'user1@example.com', role: 'customer' },
    }
    vi.mocked(useAuth).mockImplementation(() => authState)

    const { result, rerender } = renderHook(() => useFavorites(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    // User logs out while request in flight
    authState = {
      ...defaultAuthValue,
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    }
    rerender()

    // Request resolves late
    await act(async () => {
      resolveList(mockFavorites)
    })

    // State must remain clean and not be populated by the old user's response
    expect(result.current.items).toEqual([])
    expect(result.current.favoriteIds.size).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('switches favorites when user account changes', async () => {
    vi.mocked(favoritesApi.list).mockResolvedValueOnce([mockFavorites[0]])
    let authState = {
      ...defaultAuthValue,
      user: { id: 'user-1', email: 'user1@example.com', role: 'customer' },
    }
    vi.mocked(useAuth).mockImplementation(() => authState)

    const { result, rerender } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toEqual([mockFavorites[0]])
    })

    const user2Favorites = [mockFavorites[1]]
    vi.mocked(favoritesApi.list).mockResolvedValueOnce(user2Favorites)

    authState = {
      ...defaultAuthValue,
      user: { id: 'user-2', email: 'user2@example.com', role: 'customer' },
    }
    rerender()

    await waitFor(() => {
      expect(result.current.items).toEqual(user2Favorites)
    })

    expect(result.current.favoriteIds.has('prod-uuid-1')).toBe(false)
    expect(result.current.favoriteIds.has('prod-uuid-2')).toBe(true)
  })
})

