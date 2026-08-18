import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ApiError } from './types'
import { tokenStore } from './tokenStore'
import { apiClient, apiClientWithMeta, fetchEnvelope } from './client'

describe('ApiError', () => {
  it('instantiates with status, code, message and fields', () => {
    const err = new ApiError(400, {
      code: 'validation_error',
      message: 'Dữ liệu không hợp lệ',
      fields: { email: 'Email không đúng định dạng' },
    })

    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(400)
    expect(err.code).toBe('validation_error')
    expect(err.message).toBe('Dữ liệu không hợp lệ')
    expect(err.fields).toEqual({ email: 'Email không đúng định dạng' })
    expect(err.isValidationError()).toBe(true)
    expect(err.isBusinessError()).toBe(false)
  })

  it('identifies business errors correctly', () => {
    const err = new ApiError(403, {
      code: 'forbidden',
      message: 'Tài khoản không có quyền truy cập trang quản trị',
    })

    expect(err.status).toBe(403)
    expect(err.code).toBe('forbidden')
    expect(err.isValidationError()).toBe(false)
    expect(err.isBusinessError()).toBe(true)
  })

  it('identifies 500 server errors as not business errors', () => {
    const err = new ApiError(500, {
      code: 'internal',
      message: 'Lỗi máy chủ',
    })

    expect(err.status).toBe(500)
    expect(err.isValidationError()).toBe(false)
    expect(err.isBusinessError()).toBe(false)
  })
})

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clearToken()
  })

  it('gets, sets, and clears tokens', () => {
    expect(tokenStore.getToken()).toBeNull()
    tokenStore.setToken('test-admin-jwt-token')
    expect(tokenStore.getToken()).toBe('test-admin-jwt-token')
    tokenStore.clearToken()
    expect(tokenStore.getToken()).toBeNull()
  })
})

describe('API Client', () => {
  beforeEach(() => {
    tokenStore.clearToken()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unwraps data payload on success 200 response', async () => {
    const mockResponse = {
      success: true,
      message: 'Thành công',
      data: { id: 'prod-1', name: 'iPhone 15' },
      error: null,
      meta: { timestamp: '2026-08-16T00:00:00Z' },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await apiClient<{ id: string; name: string }>('/admin/products/prod-1')
    expect(result).toEqual({ id: 'prod-1', name: 'iPhone 15' })
  })

  it('unwraps data with meta when using apiClientWithMeta', async () => {
    const mockResponse = {
      success: true,
      message: 'Danh sách sản phẩm',
      data: [{ id: 'prod-1' }],
      error: null,
      meta: {
        timestamp: '2026-08-16T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await apiClientWithMeta<Array<{ id: string }>>('/admin/products')
    expect(result.data).toEqual([{ id: 'prod-1' }])
    expect(result.meta.pagination?.total).toBe(1)
    expect(result.message).toBe('Danh sách sản phẩm')
  })

  it('attaches Authorization header when tokenStore has token', async () => {
    tokenStore.setToken('bearer-token-123')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          message: '',
          data: { id: 'admin-1' },
          error: null,
          meta: { timestamp: '2026-08-16T00:00:00Z' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await apiClient('/auth/me')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callArgs = fetchSpy.mock.calls[0]
    const options = callArgs[1] as RequestInit
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer bearer-token-123')
  })

  it('handles 204 No Content responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    const envelope = await fetchEnvelope('/admin/products/1', { method: 'DELETE' })
    expect(envelope.success).toBe(true)
  })

  it('throws ApiError on HTTP error status with parsed envelope error', async () => {
    const errorBody = {
      success: false,
      message: 'Không tìm thấy sản phẩm',
      data: null,
      error: {
        code: 'not_found',
        message: 'Không tìm thấy sản phẩm',
      },
      meta: { timestamp: '2026-08-16T00:00:00Z' },
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(errorBody), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(apiClient('/admin/products/non-existent')).rejects.toThrow('Không tìm thấy sản phẩm')
  })

  it('handles 401 error and attempts refresh, retrying on success', async () => {
    tokenStore.setToken('expired-token')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // First call -> 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message: 'Token hết hạn',
            data: null,
            error: { code: 'unauthorized', message: 'Token hết hạn' },
            meta: { timestamp: '2026-08-16T00:00:00Z' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // Refresh call -> 200 with new token
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: '',
            data: { accessToken: 'fresh-token', user: { id: '1', email: 'admin@test.com', role: 'admin' } },
            error: null,
            meta: { timestamp: '2026-08-16T00:00:00Z' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // Retried original call -> 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: '',
            data: { id: 'admin-1' },
            error: null,
            meta: { timestamp: '2026-08-16T00:00:00Z' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

    const result = await apiClient<{ id: string }>('/auth/me')
    expect(result).toEqual({ id: 'admin-1' })
    expect(tokenStore.getToken()).toBe('fresh-token')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('clears token and throws ApiError if 401 refresh fails', async () => {
    tokenStore.setToken('expired-token')

    vi.spyOn(globalThis, 'fetch')
      // First call -> 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message: 'Unauthorized',
            data: null,
            error: { code: 'unauthorized', message: 'Unauthorized' },
            meta: { timestamp: '2026-08-16T00:00:00Z' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // Refresh call -> 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid refresh token',
            data: null,
            error: { code: 'invalid_token', message: 'Invalid refresh token' },
            meta: { timestamp: '2026-08-16T00:00:00Z' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )

    await expect(apiClient('/admin/products')).rejects.toThrow()
    expect(tokenStore.getToken()).toBeNull()
  })
})
