import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOrderItemReview, editOwnedReview, getOwnedReview, listProductReviews } from './reviews'
import { tokenStore } from './tokenStore'

describe('Reviews API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    tokenStore.clearToken()
  })

  it('createOrderItemReview sends multipart FormData with payload and files', async () => {
    tokenStore.setToken('test-token')

    const mockReview = {
      id: 'rev-1',
      rating: 5,
      comment: 'Tuyệt vời',
      media: [],
      authorLabel: 'Khách hàng đã mua hàng',
      verifiedPurchase: true,
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: async () => ({
        success: true,
        message: 'Tạo đánh giá thành công',
        data: mockReview,
        error: null,
        meta: { timestamp: '2026-08-28T00:00:00Z' },
      }),
    } as unknown as Response)

    const file = new File(['test image content'], 'image.jpg', { type: 'image/jpeg' })
    const result = await createOrderItemReview('order-1', 'item-1', { rating: 5, comment: 'Tuyệt vời' }, [file])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toContain('/orders/order-1/items/item-1/review')
    expect(options?.method).toBe('POST')
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    })
    const reqHeaders = (options?.headers || {}) as Record<string, string>
    expect(reqHeaders['Content-Type']).toBeUndefined()
    expect(options?.body).toBeInstanceOf(FormData)
    expect(result).toEqual(mockReview)
  })

  it('getOwnedReview sends GET request and returns review', async () => {
    tokenStore.setToken('test-token')
    const mockReview = {
      id: 'rev-1',
      rating: 4,
      comment: 'Khá tốt',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: mockReview,
        error: null,
        meta: { timestamp: '2026-08-28T00:00:00Z' },
      }),
    } as unknown as Response)

    const res = await getOwnedReview('rev-1')
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/reviews/rev-1', expect.objectContaining({ method: 'GET' }))
    expect(res).toEqual(mockReview)
  })

  it('editOwnedReview sends PUT request with preserved and uploaded media', async () => {
    tokenStore.setToken('test-token')
    const mockUpdatedReview = {
      id: 'rev-1',
      rating: 5,
      comment: 'Cập nhật',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: mockUpdatedReview,
        error: null,
        meta: { timestamp: '2026-08-28T00:00:00Z' },
      }),
    } as unknown as Response)

    const newFile = new File(['new video content'], 'video.mp4', { type: 'video/mp4' })
    const res = await editOwnedReview('rev-1', { rating: 5, comment: 'Cập nhật', existingMediaIds: ['med-1'] }, [newFile])

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/reviews/rev-1', expect.objectContaining({ method: 'PUT' }))
    expect(res).toEqual(mockUpdatedReview)
  })

  it('listProductReviews sends GET request with page & limit pagination params', async () => {
    const mockList = [
      { id: 'rev-1', rating: 5, comment: 'Hay' },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: mockList,
        message: 'Danh sách đánh giá sản phẩm',
        error: null,
        meta: {
          timestamp: '2026-08-28T00:00:00Z',
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        },
      }),
    } as unknown as Response)

    const res = await listProductReviews('prod-1', 1, 10)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/products/prod-1/reviews?page=1&limit=10', expect.objectContaining({ method: 'GET' }))
    expect(res.data).toEqual(mockList)
    expect(res.meta.pagination?.total).toBe(1)
  })
})
