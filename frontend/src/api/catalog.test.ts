import { describe, it, expect, beforeEach, vi } from 'vitest'
import { catalogApi } from './catalog'

describe('catalogApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listBrands calls /brands and returns string array', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: ['Apple', 'Samsung', 'Xiaomi'],
      error: null,
      meta: { timestamp: '2026-08-18T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const brands = await catalogApi.listBrands()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/brands'),
      expect.anything()
    )
    expect(brands).toEqual(['Apple', 'Samsung', 'Xiaomi'])
  })

  it('listProducts builds URL with brand parameters correctly', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: [],
      error: null,
      meta: { timestamp: '2026-08-18T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    // Single brand as string
    await catalogApi.listProducts({ brand: 'Apple' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/products?brand=Apple'),
      expect.anything()
    )

    // Multiple brands as array
    await catalogApi.listProducts({ brand: ['Apple', 'Xiaomi'] })
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
    expect(lastUrl).toContain('brand=Apple')
    expect(lastUrl).toContain('brand=Xiaomi')
  })

  it('listProductsWithMeta includes brand and returns pagination', async () => {
    const mockResponse = {
      success: true,
      message: '',
      data: [],
      error: null,
      meta: {
        timestamp: '2026-08-18T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 6,
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

    const result = await catalogApi.listProductsWithMeta({ brand: ['Samsung'] })
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/products?brand=Samsung'),
      expect.anything()
    )
    expect(result.data).toEqual([])
    expect(result.meta.pagination?.limit).toBe(6)
  })
})
