import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createOrderItemReview, updateOrderItemReview, getProductReviews } from './reviews'
import * as client from './client'
import type { Review, ProductReviewsResponse } from './types'

describe('reviews API module', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('createOrderItemReview calls apiClient with POST and FormData', async () => {
    const mockReview: Review = {
      id: 'rev-1',
      orderItemId: 'item-1',
      rating: 5,
      comment: 'Great product!',
      editCount: 0,
      media: [],
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
      edited: false,
      canEdit: true,
    }

    const apiClientSpy = vi.spyOn(client, 'apiClient').mockResolvedValue(mockReview)

    const fakeImage = new File(['image-content'], 'pic.jpg', { type: 'image/jpeg' })
    const result = await createOrderItemReview('order-1', 'item-1', {
      rating: 5,
      comment: 'Great product!',
      images: [fakeImage],
    })

    expect(result).toEqual(mockReview)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/orders/order-1/items/item-1/review',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    )

    const passedBody = apiClientSpy.mock.calls[0][1]?.body as FormData
    expect(passedBody.get('rating')).toBe('5')
    expect(passedBody.get('comment')).toBe('Great product!')
    expect(passedBody.get('images')).toBe(fakeImage)
  })

  it('updateOrderItemReview calls apiClient with PUT and FormData including retainedMediaIds', async () => {
    const mockReview: Review = {
      id: 'rev-1',
      orderItemId: 'item-1',
      rating: 4,
      comment: 'Updated comment',
      editCount: 1,
      media: [],
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T01:00:00Z',
      edited: true,
      canEdit: false,
    }

    const apiClientSpy = vi.spyOn(client, 'apiClient').mockResolvedValue(mockReview)

    const result = await updateOrderItemReview('order-1', 'item-1', {
      rating: 4,
      comment: 'Updated comment',
      retainedMediaIds: ['med-1', 'med-2'],
    })

    expect(result).toEqual(mockReview)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/orders/order-1/items/item-1/review',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(FormData),
      })
    )

    const passedBody = apiClientSpy.mock.calls[0][1]?.body as FormData
    expect(passedBody.get('rating')).toBe('4')
    expect(passedBody.get('comment')).toBe('Updated comment')
    expect(passedBody.getAll('retainedMediaIds')).toEqual(['med-1', 'med-2'])
  })

  it('getProductReviews calls apiClientWithMeta with query params', async () => {
    const mockResponse: client.ApiResponseWithMeta<ProductReviewsResponse> = {
      data: {
        summary: {
          totalReviews: 1,
          averageRating: '5.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
        },
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            comment: 'Love it',
            reviewer: { maskedEmail: 'u***@domain.com' },
            purchase: { model: 'Black 128GB', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
          },
        ],
      },
      message: 'Lấy danh sách đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
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

    const spy = vi.spyOn(client, 'apiClientWithMeta').mockResolvedValue(mockResponse)

    const result = await getProductReviews('prod-1', { page: 2, limit: 5 })
    expect(result).toEqual(mockResponse)
    expect(spy).toHaveBeenCalledWith('/products/prod-1/reviews?page=2&limit=5')
  })
})
