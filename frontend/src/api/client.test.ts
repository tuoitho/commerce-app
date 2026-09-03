import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiClient, apiClientWithMeta } from './client'
import { ApiError } from './types'
import { tokenStore } from './tokenStore'

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    tokenStore.clearToken()
  })

  it('unwraps data from successful envelope response', async () => {
    const mockResponse = {
      success: true,
      message: 'OK',
      data: [{ id: '1', name: 'Product 1' }],
      error: null,
      meta: { timestamp: '2026-08-16T00:00:00.000Z' },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })
    )

    const result = await apiClient<{ id: string; name: string }[]>('/products')
    expect(result).toEqual([{ id: '1', name: 'Product 1' }])
  })

  it('returns full envelope metadata with apiClientWithMeta', async () => {
    const mockResponse = {
      success: true,
      message: 'Success Message',
      data: { id: '123' },
      error: null,
      meta: {
        timestamp: '2026-08-16T00:00:00.000Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 50,
          totalPages: 5,
          hasNext: true,
          hasPrev: false,
        },
      },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })
    )

    const result = await apiClientWithMeta<{ id: string }>('/products')
    expect(result.data).toEqual({ id: '123' })
    expect(result.message).toBe('Success Message')
    expect(result.meta.pagination?.total).toBe(50)
  })

  it('handles 204 No Content as empty object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      })
    )

    const result = await apiClient('/auth/logout', { method: 'POST' })
    expect(result).toEqual({})
  })

  it('throws ApiError on validation failure with field errors', async () => {
    const mockErrorResponse = {
      success: false,
      message: 'validation failed',
      data: null,
      error: {
        code: 'validation_error',
        message: 'validation failed',
        fields: { email: 'invalid email' },
      },
      meta: { timestamp: '2026-08-16T00:00:00.000Z' },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse,
      })
    )

    await expect(apiClient('/auth/register', { method: 'POST' })).rejects.toThrow(ApiError)

    try {
      await apiClient('/auth/register', { method: 'POST' })
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(400)
      expect(apiErr.code).toBe('validation_error')
      expect(apiErr.message).toBe('validation failed')
      expect(apiErr.fields?.email).toBe('invalid email')
      expect(apiErr.isValidationError()).toBe(true)
      expect(apiErr.isBusinessError()).toBe(false)
    }
  })

  it('throws ApiError on business logic failure (e.g. out of stock)', async () => {
    const mockErrorResponse = {
      success: false,
      message: 'variant is out of stock',
      data: null,
      error: {
        code: 'out_of_stock',
        message: 'variant is out of stock',
      },
      meta: { timestamp: '2026-08-16T00:00:00.000Z' },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => mockErrorResponse,
      })
    )

    try {
      await apiClient('/cart/items', { method: 'POST' })
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(409)
      expect(apiErr.code).toBe('out_of_stock')
      expect(apiErr.message).toBe('variant is out of stock')
      expect(apiErr.fields).toBeUndefined()
      expect(apiErr.isValidationError()).toBe(false)
      expect(apiErr.isBusinessError()).toBe(true)
    }
  })

  it('sends FormData without Content-Type application/json header', async () => {
    const mockResponse = {
      success: true,
      message: 'OK',
      data: { id: 'rev-1', rating: 5 },
      error: null,
      meta: { timestamp: '2026-08-16T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const formData = new FormData()
    formData.append('rating', '5')
    formData.append('comment', 'Good')

    const result = await apiClient('/orders/1/items/2/review', {
      method: 'POST',
      body: formData,
    })

    expect(result).toEqual({ id: 'rev-1', rating: 5 })
    expect(fetchMock).toHaveBeenCalledOnce()
    const callArgs = fetchMock.mock.calls[0]
    const headers = callArgs[1].headers
    expect(headers['Content-Type']).toBeUndefined()
    expect(callArgs[1].body).toBe(formData)
  })

  it('retries once without Authorization header when retryWithoutAuthOnRefreshFailure is true and 401 refresh fails', async () => {
    tokenStore.setToken('expired-token')

    const anonymousSuccess = {
      success: true,
      message: 'OK',
      data: { reviews: [], summary: { totalReviews: 0, averageRating: '0.0', ratingCounts: {} } },
      error: null,
      meta: { timestamp: '2026-08-28T00:00:00.000Z' },
    }

    const fetchMock = vi.fn()
      // First call to /products/1/reviews returns 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'invalid_token', message: 'Token expired' },
        }),
      })
      // Second call is /auth/refresh which fails with 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'unauthorized', message: 'Refresh token expired' },
        }),
      })
      // Third call is retrying /products/1/reviews without Authorization header
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => anonymousSuccess,
      })

    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient('/products/1/reviews', {
      retryWithoutAuthOnRefreshFailure: true,
    })

    expect(result).toEqual(anonymousSuccess.data)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Call 1: initial request with Authorization
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe('Bearer expired-token')

    // Call 2: refresh request
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh')

    // Call 3: retry without Authorization
    expect(fetchMock.mock.calls[2][1].headers['Authorization']).toBeUndefined()

    // Token store cleared
    expect(tokenStore.getToken()).toBeNull()
  })

  it('does not retry without Authorization header when retryWithoutAuthOnRefreshFailure is not enabled (e.g. PUT) and throws 401', async () => {
    tokenStore.setToken('expired-token')

    const fetchMock = vi.fn()
      // First call to PUT /reviews/1/helpfulness returns 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'invalid_token', message: 'Token expired' },
        }),
      })
      // Second call is /auth/refresh which fails
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'unauthorized', message: 'Refresh token expired' },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiClient('/reviews/1/helpfulness', {
        method: 'PUT',
        body: { vote: 'helpful' },
      })
    ).rejects.toThrow(ApiError)

    // Only 2 calls: initial and refresh
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(tokenStore.getToken()).toBeNull()
  })
})

