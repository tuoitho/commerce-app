import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductReviewsSection } from './ProductReviewsSection'
import * as reviewsApi from '@/api/reviews'
import type { ProductReviewsResponse, ApiResponseMeta } from '@/api/types'

type MockReviewsEnvelope = {
  data: ProductReviewsResponse
  meta: ApiResponseMeta
  message: string
}

describe('ProductReviewsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when product has 0 reviews', async () => {
    const emptyResponse: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 0,
          averageRating: '0.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        },
        reviews: [],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(emptyResponse)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào cho sản phẩm này')).toBeInTheDocument()
      expect(screen.getByText('0.0')).toBeInTheDocument()
      expect(screen.getByText(/Dựa trên/i)).toBeInTheDocument()
    })
  })

  it('renders reviews, rating breakdown, verified purchase badge, and media', async () => {
    const populatedResponse: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 2,
          averageRating: '4.5',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
        },
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            comment: 'Điện thoại xài rất mượt, camera nét căng',
            reviewer: { maskedEmail: 'n***@gmail.com' },
            purchase: {
              model: 'Titan Tự Nhiên 256GB',
              options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
            },
            media: [
              {
                id: 'med-1',
                type: 'image',
                url: 'https://example.com/img1.jpg',
                mimeType: 'image/jpeg',
                position: 0,
              },
              {
                id: 'med-2',
                type: 'video',
                url: 'https://example.com/vid1.mp4',
                mimeType: 'video/mp4',
                position: 1,
              },
            ],
            createdAt: '2026-08-28T00:00:00Z',
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    }

    const onSummaryLoaded = vi.fn()
    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(populatedResponse)

    render(<ProductReviewsSection productId="prod-1" onSummaryLoaded={onSummaryLoaded} />)

    await waitFor(() => {
      expect(screen.getByText('4.5')).toBeInTheDocument()
      expect(screen.getByText(/Dựa trên/i)).toBeInTheDocument()
      expect(screen.getByText('n***@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('Đã mua tại AuraPhone')).toBeInTheDocument()
      expect(screen.getByText('Điện thoại xài rất mượt, camera nét căng')).toBeInTheDocument()
      expect(screen.getByText('Phân loại:')).toBeInTheDocument()
      expect(screen.getByText('Titan Tự Nhiên 256GB')).toBeInTheDocument()
    })

    expect(onSummaryLoaded).toHaveBeenCalledWith(populatedResponse.data.summary)

    // Verify image thumbnail and video player
    const imgThumbnail = screen.getByRole('button', { name: 'Ảnh đánh giá của khách hàng' })
    expect(imgThumbnail).toBeInTheDocument()

    // Click to expand image
    fireEvent.click(imgThumbnail)
    expect(screen.getByRole('dialog', { name: 'Xem ảnh phóng to' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }))

    // Video tag verification
    const videoElem = document.querySelector('video')
    expect(videoElem).toBeInTheDocument()
    expect(videoElem).toHaveAttribute('controls')
    expect(videoElem).toHaveAttribute('preload', 'metadata')
  })

  it('handles pagination correctly when multiple pages exist', async () => {
    const page1Response: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 15,
          averageRating: '5.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 15 },
        },
        reviews: [
          {
            id: 'rev-page-1',
            rating: 5,
            comment: 'Review on Page 1',
            reviewer: { maskedEmail: 'u1***@gmail.com' },
            purchase: { model: 'Model A', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 15, totalPages: 2, hasNext: true, hasPrev: false },
      },
    }

    const page2Response: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 15,
          averageRating: '5.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 15 },
        },
        reviews: [
          {
            id: 'rev-page-2',
            rating: 5,
            comment: 'Review on Page 2',
            reviewer: { maskedEmail: 'u2***@gmail.com' },
            purchase: { model: 'Model B', options: [] },
            media: [],
            createdAt: '2026-08-27T00:00:00Z',
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2, hasNext: false, hasPrev: true },
      },
    }

    const apiSpy = vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(page1Response)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Review on Page 1')).toBeInTheDocument()
    })

    // Click next page
    apiSpy.mockResolvedValue(page2Response)
    const nextBtn = screen.getByRole('button', { name: /Sau/i })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith('prod-1', { page: 2, limit: 10 })
      expect(screen.getByText('Review on Page 2')).toBeInTheDocument()
    })
  })

  it('renders independent error state with retry affordance on API failure', async () => {
    const apiSpy = vi.spyOn(reviewsApi, 'getProductReviews').mockRejectedValueOnce(new Error('Network error'))

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Không thể tải đánh giá sản phẩm. Vui lòng thử lại.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
    })

    // Retry
    const successResponse: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 1,
          averageRating: '5.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
        },
        reviews: [],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
    }
    apiSpy.mockResolvedValue(successResponse)

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.queryByText('Không thể tải đánh giá sản phẩm. Vui lòng thử lại.')).not.toBeInTheDocument()
    })
  })
})
