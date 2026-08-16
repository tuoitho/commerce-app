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
})
