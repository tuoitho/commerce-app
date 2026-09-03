import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createOrderItemReview,
  updateOrderItemReview,
  getProductReviews,
  getUserReviews,
  setReviewHelpfulness,
  setReplyHelpfulness,
} from './reviews'
import * as client from './client'
import type { Review, ProductReviewsResponse, UserReviewsResponse } from './types'

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
            helpfulness: {
              helpfulCount: 0,
              unhelpfulCount: 0,
              viewerVote: null,
            },
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
    expect(spy).toHaveBeenCalledWith('/products/prod-1/reviews?page=2&limit=5', {
      retryWithoutAuthOnRefreshFailure: true,
    })
  })

  it('setReviewHelpfulness calls apiClient with PUT /reviews/{reviewId}/helpfulness and vote payload', async () => {
    const mockState = {
      helpfulCount: 5,
      unhelpfulCount: 1,
      viewerVote: 'helpful' as const,
    }

    const spy = vi.spyOn(client, 'apiClient').mockResolvedValue(mockState)

    const result = await setReviewHelpfulness('rev-123', 'helpful')
    expect(result).toEqual(mockState)
    expect(spy).toHaveBeenCalledWith('/reviews/rev-123/helpfulness', {
      method: 'PUT',
      body: { vote: 'helpful' },
    })

    await setReviewHelpfulness('rev-123', null)
    expect(spy).toHaveBeenCalledWith('/reviews/rev-123/helpfulness', {
      method: 'PUT',
      body: { vote: null },
    })
  })

  it('setReplyHelpfulness calls apiClient with PUT /review-replies/{replyId}/helpfulness and vote payload', async () => {
    const mockState = {
      helpfulCount: 2,
      unhelpfulCount: 0,
      viewerVote: 'unhelpful' as const,
    }

    const spy = vi.spyOn(client, 'apiClient').mockResolvedValue(mockState)

    const result = await setReplyHelpfulness('rep-456', 'unhelpful')
    expect(result).toEqual(mockState)
    expect(spy).toHaveBeenCalledWith('/review-replies/rep-456/helpfulness', {
      method: 'PUT',
      body: { vote: 'unhelpful' },
    })
  })

  it('getUserReviews calls apiClientWithMeta with query params', async () => {
    const mockResponse: client.ApiResponseWithMeta<UserReviewsResponse> = {
      data: {
        reviews: [
          {
            id: 'rev-1',
            orderItemId: 'item-1',
            order: { id: 'ord-1', createdAt: '2026-08-28T00:00:00Z' },
            product: {
              id: 'prod-1',
              name: 'iPhone 15 Pro',
              brandName: 'Apple',
              model: 'Natural Titanium',
              imageUrl: 'https://example.com/img.jpg',
              options: [],
            },
            rating: 5,
            comment: 'Great phone',
            editCount: 0,
            canEdit: true,
            edited: false,
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            updatedAt: '2026-08-28T00:00:00Z',
          },
        ],
      },
      message: 'Lấy lịch sử đánh giá thành công',
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

    const result = await getUserReviews({ rating: 5, page: 2, limit: 10 })
    expect(result).toEqual(mockResponse)
    expect(spy).toHaveBeenCalledWith('/reviews/me?rating=5&page=2&limit=10')
  })
})

