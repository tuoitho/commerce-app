import { describe, it, expect, beforeEach, vi } from 'vitest'
import { favoritesApi } from './favorites'

describe('favoritesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listFavorites calls /favorites with default page=1 and limit=12', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: [],
      error: null,
      meta: {
        timestamp: '2026-08-24T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.listFavorites()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/favorites?page=1&limit=12'),
      expect.anything()
    )
    expect(result.data).toEqual([])
    expect(result.meta.pagination?.limit).toBe(12)
  })

  it('listFavorites calls /favorites with custom page and limit', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: [],
      error: null,
      meta: {
        timestamp: '2026-08-24T00:00:00.000Z',
        pagination: {
          page: 2,
          limit: 12,
          total: 15,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.listFavorites(2, 12)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/favorites?page=2&limit=12'),
      expect.anything()
    )
    expect(result.meta.pagination?.page).toBe(2)
  })

  it('addFavorite calls PUT /favorites/{productId}', async () => {
    const mockResponse = {
      success: true,
      message: 'Đã thêm sản phẩm vào yêu thích',
      data: {
        productId: 'prod-123',
        isFavorite: true,
      },
      error: null,
      meta: { timestamp: '2026-08-24T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.addFavorite('prod-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/favorites/prod-123'),
      expect.objectContaining({
        method: 'PUT',
      })
    )
    expect(result).toEqual({ productId: 'prod-123', isFavorite: true })
  })

  it('removeFavorite calls DELETE /favorites/{productId}', async () => {
    const mockResponse = {
      success: true,
      message: 'Đã bỏ sản phẩm khỏi yêu thích',
      data: {
        productId: 'prod-123',
        isFavorite: false,
      },
      error: null,
      meta: { timestamp: '2026-08-24T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await favoritesApi.removeFavorite('prod-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/favorites/prod-123'),
      expect.objectContaining({
        method: 'DELETE',
      })
    )
    expect(result).toEqual({ productId: 'prod-123', isFavorite: false })
  })
})
