import { describe, it, expect, beforeEach, vi } from 'vitest'
import { favoritesApi } from './favorites'
import type { FavoriteProduct } from '@/types/favorite'

describe('favoritesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

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
    {
      id: 'prod-uuid-3',
      name: 'Aura Phone Old (Deleted)',
      model: 'AP-10',
      brand: 'Aura',
      category: { id: 'cat-1', name: 'Điện thoại' },
      primaryImageUrl: '',
      availability: 'deleted',
      minPriceVnd: null,
      maxPriceVnd: null,
      inStock: null,
    },
  ]

  it('list() calls GET /favorites and returns unwrapped FavoriteProduct array with nullability intact', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: mockFavorites,
      error: null,
      meta: { timestamp: '2026-08-24T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.list()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain('/favorites')
    expect(calledOptions?.method).toBeUndefined() // default GET
    expect(result).toEqual(mockFavorites)
    expect(result[0].availability).toBe('active')
    expect(result[0].minPriceVnd).toBe('15000000')
    expect(result[1].availability).toBe('unavailable')
    expect(result[1].minPriceVnd).toBeNull()
    expect(result[2].availability).toBe('deleted')
    expect(result[2].inStock).toBeNull()
  })

  it('add(productId) calls PUT /favorites/:productId without body and returns updated list', async () => {
    const updatedList = [mockFavorites[0]]
    const mockResponse = {
      success: true,
      message: 'Đã thêm sản phẩm vào danh sách yêu thích',
      data: updatedList,
      error: null,
      meta: { timestamp: '2026-08-24T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.add('prod-uuid-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain('/favorites/prod-uuid-1')
    expect(calledOptions?.method).toBe('PUT')
    expect(calledOptions?.body).toBeUndefined()
    expect(result).toEqual(updatedList)
  })

  it('remove(productId) calls DELETE /favorites/:productId without body and returns updated list', async () => {
    const emptyList: FavoriteProduct[] = []
    const mockResponse = {
      success: true,
      message: 'Đã xóa sản phẩm khỏi danh sách yêu thích',
      data: emptyList,
      error: null,
      meta: { timestamp: '2026-08-24T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.remove('prod-uuid-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain('/favorites/prod-uuid-1')
    expect(calledOptions?.method).toBe('DELETE')
    expect(calledOptions?.body).toBeUndefined()
    expect(result).toEqual(emptyList)
  })
})
